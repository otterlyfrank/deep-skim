/**
 * LLM generation layer — OpenAI-compatible chat API
 * (Gemini free, DeepSeek, Kimi, Ollama, Grok, etc.)
 *
 * Single-pass for short/medium sources; map-reduce multipass for long books.
 */

import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  buildStagedPartPrompt,
} from './prompt.js';
import { estimateDepth } from './depth.js';
import { parseDeepSkimMarkdown } from './parser.js';
import { inferProviderId } from './providers.js';
import {
  attachLongReadExtracts,
  buildMultiWeekPlan,
  multiWeekPlanMarkdown,
} from './longread.js';
import {
  extractWeekSource,
  weekScopeBrief,
  synthesisScopeBrief,
  buildSynthesisMaterial,
} from './projects.js';
import {
  MULTIPASS_DEFAULTS,
  chunkSourceText,
  MAP_SYSTEM_PROMPT,
  buildMapUserPrompt,
  buildReduceUserPrompt,
  buildReduceMaterial,
  headTailSample,
  shouldUseMultipass,
  sleep,
} from './multipass.js';

/**
 * Smart truncate: keep head + tail + sample of middle section headers.
 */
export function prepareTextForContext(text, maxChars = 120_000) {
  if (!text || text.length <= maxChars) {
    return { text: text || '', truncated: false };
  }

  const headSize = Math.floor(maxChars * 0.55);
  const tailSize = Math.floor(maxChars * 0.30);
  const midBudget = maxChars - headSize - tailSize - 200;

  const head = text.slice(0, headSize);
  const tail = text.slice(-tailSize);
  const mid = text.slice(headSize, -tailSize);

  const chunks = mid.split(/(?=<!--\s*page\s+\d+\s*-->)/i);
  let midSample = '';
  if (chunks.length > 2) {
    const step = Math.max(1, Math.floor(chunks.length / 8));
    for (let i = 0; i < chunks.length && midSample.length < midBudget; i += step) {
      midSample += chunks[i].slice(0, Math.floor(midBudget / 8)) + '\n\n';
    }
  } else {
    midSample = mid.slice(0, midBudget);
  }

  const assembled =
    head +
    '\n\n<!-- … truncated middle (model context limit) … -->\n\n' +
    midSample +
    '\n\n<!-- … end truncation; final pages follow … -->\n\n' +
    tail;

  return { text: assembled.slice(0, maxChars), truncated: true };
}

/**
 * Call OpenAI-compatible /v1/chat/completions
 */
/** Per-request timeout (ms). Long skims use several requests; each must finish. */
const REQUEST_TIMEOUT_MS = 4 * 60 * 1000;

function classifyLlmHttpError(status, errText) {
  const t = errText || '';
  if (status === 401 || status === 403) {
    return ' Check your API key in Settings (Save after pasting).';
  }
  if (
    status === 404 ||
    /no longer available to new users|NOT_FOUND|model.*not found/i.test(t)
  ) {
    return ' Model id blocked/wrong. Settings → gemini-3.5-flash or gemini-3.1-flash-lite → Save.';
  }
  if (
    status === 429 ||
    /RESOURCE_EXHAUSTED|rate.?limit|quota|too many requests|exceeded your current quota/i.test(t)
  ) {
    return (
      ' Free-tier quota or rate limit hit (not necessarily “out of money”). ' +
      'Wait 1–5 minutes, switch to gemini-3.1-flash-lite, lower max map passes, or use a multi-week project band. ' +
      'Check AI Studio usage/quota for your key.'
    );
  }
  if (status === 400 && /context|token|too long|maximum|payload/i.test(t)) {
    return ' Context/payload too large — use multi-week project or lower Max source characters / map chunk size.';
  }
  if (status === 500 || status === 503 || status === 502) {
    return ' Provider glitch — wait a minute and retry.';
  }
  return '';
}

export async function chatCompletion({
  baseUrl,
  apiKey = '',
  model,
  messages,
  temperature = 0.25,
  maxTokens = 16384,
  onProgress,
  retries = 2,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  onProgress?.({
    stage: 'llm',
    message: `Calling ${model}… (up to ${Math.round(timeoutMs / 60000)} min per step)`,
  });

  const headers = {
    'Content-Type': 'application/json',
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const providerId = inferProviderId(baseUrl);
  if (providerId === 'openrouter') {
    headers['HTTP-Referer'] = typeof location !== 'undefined' ? location.origin : 'http://localhost';
    headers['X-Title'] = 'Deep-Skim';
  }

  const body = {
    model,
    messages,
    temperature,
    stream: false,
  };
  if (maxTokens) {
    body.max_tokens = maxTokens;
    body.max_completion_tokens = maxTokens;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      throw new Error(
        `LLM request timed out after ${Math.round(timeoutMs / 1000)}s. ` +
          `Often free-tier slowness or a hung call — retry, use a smaller week band, or flash-lite. ` +
          `If this happens immediately, check network/API status.`
      );
    }
    const msg = err?.message || String(err);
    if (/Failed to fetch|NetworkError|CORS/i.test(msg)) {
      throw new Error(
        `Network/CORS error reaching ${baseUrl}. Cloud providers sometimes block browser calls. ` +
          `Try again, or run a local OpenAI-compatible proxy (see docs/llm-setup.md). Original: ${msg}`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    if (
      res.status === 400 &&
      /max_completion_tokens|max_tokens|unknown field|unsupported/i.test(errText) &&
      (body.max_completion_tokens || body.max_tokens)
    ) {
      onProgress?.({ stage: 'llm', message: 'Retrying without max_tokens (provider quirk)…' });
      return chatCompletion({
        baseUrl,
        apiKey,
        model,
        messages,
        temperature,
        maxTokens: 0,
        onProgress,
        retries,
        timeoutMs,
      });
    }
    if (
      (res.status === 429 || /RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(errText)) &&
      retries > 0
    ) {
      const wait = 8000 * (3 - retries + 1);
      onProgress?.({
        stage: 'llm',
        message: `Quota/rate limit — waiting ${Math.round(wait / 1000)}s then retry (${retries} left)…`,
      });
      await sleep(wait);
      return chatCompletion({
        baseUrl,
        apiKey,
        model,
        messages,
        temperature,
        maxTokens,
        onProgress,
        retries: retries - 1,
        timeoutMs,
      });
    }
    const hint = classifyLlmHttpError(res.status, errText);
    throw new Error(`LLM error ${res.status}: ${errText.slice(0, 450)}${hint}`);
  }

  onProgress?.({ stage: 'llm', message: `Reading response from ${model}…` });
  const data = await res.json();
  const content =
    data.choices?.[0]?.message?.content ||
    data.message?.content ||
    data.response ||
    '';

  if (!content) {
    // Some APIs return empty on soft filter / safety
    throw new Error(
      'LLM returned empty content (filter, safety, or truncated). Retry, shorten the band, or switch model.'
    );
  }
  return { content, raw: data, model: data.model || model };
}

function assertLlmConfigured(settings) {
  if (!settings.llmBaseUrl) {
    throw new Error('No LLM base URL configured. Open Settings and choose a provider.');
  }
  const providerId = settings.llmProvider || inferProviderId(settings.llmBaseUrl);
  if (providerId !== 'ollama' && providerId !== 'custom' && !settings.llmApiKey?.trim()) {
    throw new Error(
      `API key required for ${providerId}. Open Settings → paste your key (stored only in this browser).`
    );
  }
  return providerId;
}

function docMeta(document, extraction) {
  return {
    filename: document.name,
    title: document.title || extraction.title,
    pageCount: document.pageCount ?? extraction.pageCount,
    method: extraction.method,
    quality: extraction.quality,
  };
}

/**
 * Attach local long-read extracts + optional multi-week plan; re-parse.
 */
function finalizeMarkdown(markdown, source, meta, depth, { skipMultiWeekPlan = false } = {}) {
  let md = markdown || '';
  let plan = null;
  if (!skipMultiWeekPlan) {
    plan = buildMultiWeekPlan({
      pageCount: meta.pageCount,
      sourceChars: (source || '').length,
    });
    if (plan && depth?.multiWeekSuggested && !/Multi-week reading strategy/i.test(md)) {
      if (/##\s*8\.\s*What Remains/i.test(md)) {
        md = md.replace(
          /(##\s*8\.\s*What Remains Unclear[^\n]*\n)/i,
          `$1\n${multiWeekPlanMarkdown(plan)}\n\n`
        );
      } else {
        md += `\n\n${multiWeekPlanMarkdown(plan)}`;
      }
    }
  }

  const maxSeg = depth?.coreLongReadSegments?.[1] || 4;
  const { markdown: withLong, segments, longReads } = attachLongReadExtracts(md, source, {
    maxSegments: maxSeg,
  });
  const parsed = parseDeepSkimMarkdown(withLong);
  return {
    title: parsed.title,
    markdown: withLong,
    sections: parsed.sections,
    questions: parsed.questions,
    longReadSegments: segments,
    longReads,
    multiWeek: plan,
  };
}

/**
 * Staged write A/B/C so output can reach book-scale condensed-reading length
 * without blowing a single completion window.
 */
async function stagedCondensedWrite({
  settings,
  meta,
  depth,
  materialLabel,
  material,
  onProgress,
  progressStart = 10,
  progressEnd = 95,
  modeLabel = 'staged',
  scopeBrief = '',
}) {
  const span = progressEnd - progressStart;
  const call = async (part, priorParts, pct) => {
    onProgress?.({
      stage: 'write',
      message: `${modeLabel}: writing part ${part} (substantial)…`,
      percent: pct,
    });
    const user = buildStagedPartPrompt({
      part,
      meta,
      depth,
      materialLabel,
      material,
      priorParts,
      scopeBrief,
    });
    const { content, model } = await chatCompletion({
      baseUrl: settings.llmBaseUrl,
      apiKey: settings.llmApiKey,
      model: settings.llmModel,
      temperature: 0.25,
      maxTokens: 16384,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      retries: MULTIPASS_DEFAULTS.maxRetries,
    });
    return { content: content.trim(), model };
  };

  const a = await call('A', '', progressStart + span * 0.2);
  await sleep(settings.mapDelayMs ?? MULTIPASS_DEFAULTS.mapDelayMs);
  const b = await call('B', a.content, progressStart + span * 0.55);
  await sleep(settings.mapDelayMs ?? MULTIPASS_DEFAULTS.mapDelayMs);
  const c = await call('C', `${a.content}\n\n${b.content}`, progressStart + span * 0.85);

  // Assemble: Part A has # title + §1–2; B has §3–4; C has §5–8
  let markdown = a.content;
  if (!/^##\s*3\./m.test(markdown)) {
    markdown = `${markdown}\n\n${b.content}`;
  } else {
    markdown = `${markdown}\n\n${b.content}`;
  }
  markdown = `${markdown}\n\n${c.content}`;

  // Normalize accidental duplicate H1s from later parts
  markdown = markdown.replace(/\n# [^\n]+\n/g, (m, offset) => (offset > 80 ? '\n' : m));

  return {
    markdown,
    model: a.model || b.model || c.model,
  };
}

/**
 * Single-pass deep-skim (short/medium sources, or multipass disabled).
 * Uses staged A/B/C write when depth target is large.
 */
async function generateDeepSkimSingle({
  extraction,
  document,
  settings,
  onProgress,
  providerId,
  scopeBrief = '',
  weekScope = null,
  longReadSource = null,
}) {
  const maxChars = settings.maxContextChars || 120_000;
  const source = extraction.markdown || extraction.text || '';
  const attachSource = longReadSource || source;
  const { text, truncated } = prepareTextForContext(source, maxChars);
  const meta = docMeta(document, extraction);
  // Depth from week band page count when scoped
  const depthPages =
    weekScope != null
      ? weekScope.end - weekScope.start + 1
      : meta.pageCount;
  const depth = estimateDepth({
    pageCount: depthPages,
    sourceChars: source.length,
  });
  if (weekScope) {
    // Weekly bands still deserve staged substance when large enough
    if (depthPages >= 80) depth.useStagedWrite = true;
  }

  const figureNote =
    (extraction.figures || []).length === 0
      ? ''
      : `\n\nFigures:\n${(extraction.figures || [])
          .map((f, i) => `- ${i + 1}: ${f.caption || f.note || 'image'}`)
          .join('\n')}`;

  const material = `## Extracted text${truncated ? ' (context-window sampled)' : ''}\n---\n${text}\n---${figureNote}`;

  if (!depth.useStagedWrite) {
    onProgress?.({
      stage: 'llm',
      message: `Deep-skim (single-pass) via ${providerId} · ${settings.llmModel}…`,
      percent: 15,
    });
    const user = buildUserPrompt({
      meta,
      text,
      figures: extraction.figures || [],
      truncated,
      depth,
      sourceChars: source.length,
      scopeBrief,
    });
    const { content, model } = await chatCompletion({
      baseUrl: settings.llmBaseUrl,
      apiKey: settings.llmApiKey,
      model: settings.llmModel,
      maxTokens: 16384,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      onProgress,
      retries: MULTIPASS_DEFAULTS.maxRetries,
    });
    onProgress?.({ stage: 'llm', message: 'Attaching core long-read extracts…', percent: 92 });
    const final = finalizeMarkdown(content, attachSource, meta, depth, {
      skipMultiWeekPlan: !!weekScope,
    });
    onProgress?.({ stage: 'llm', message: 'Deep-skim complete', percent: 100 });
    return {
      ...final,
      model,
      truncated,
      multipass: false,
      mapChunks: 0,
      depth,
      weekScope,
    };
  }

  onProgress?.({
    stage: 'llm',
    message: `Substantial skim (~${depth.targetPagesMin}–${depth.targetPagesMax}p target) · staged write…`,
    percent: 8,
  });

  const { markdown, model } = await stagedCondensedWrite({
    settings,
    meta,
    depth,
    materialLabel: truncated ? 'sampled extract' : 'full extract in window',
    material,
    onProgress,
    modeLabel: weekScope
      ? `Week ${weekScope.week} staged · ${providerId}`
      : `Single-pass staged · ${providerId}`,
    scopeBrief,
  });

  onProgress?.({ stage: 'llm', message: 'Attaching core long-read extracts…', percent: 96 });
  const final = finalizeMarkdown(markdown, attachSource, meta, depth, {
    skipMultiWeekPlan: !!weekScope,
  });
  onProgress?.({ stage: 'llm', message: 'Substantial deep-skim complete', percent: 100 });

  return {
    ...final,
    model: `${model} · staged×3`,
    truncated,
    multipass: false,
    mapChunks: 0,
    depth,
    weekScope,
  };
}

/**
 * Map-reduce multipass for long books + staged substantial reduce.
 */
async function generateDeepSkimMultipass({
  extraction,
  document,
  settings,
  onProgress,
  providerId,
  scopeBrief = '',
  weekScope = null,
  longReadSource = null,
}) {
  const source = extraction.markdown || extraction.text || '';
  const attachSource = longReadSource || source;
  const mapChunkChars = settings.mapChunkChars || MULTIPASS_DEFAULTS.mapChunkChars;
  // Week bands: fewer maps needed — save tokens
  const maxMapChunks = weekScope
    ? Math.min(6, settings.maxMapChunks || MULTIPASS_DEFAULTS.maxMapChunks)
    : settings.maxMapChunks || MULTIPASS_DEFAULTS.maxMapChunks;
  const mapDelayMs = settings.mapDelayMs ?? MULTIPASS_DEFAULTS.mapDelayMs;

  const chunks = chunkSourceText(source, {
    chunkChars: mapChunkChars,
    maxChunks: maxMapChunks,
  });

  if (chunks.length <= 1) {
    return generateDeepSkimSingle({
      extraction,
      document,
      settings,
      onProgress,
      providerId,
      scopeBrief,
      weekScope,
      longReadSource: attachSource,
    });
  }

  const meta = docMeta(document, extraction);
  const depthPages =
    weekScope != null ? weekScope.end - weekScope.start + 1 : meta.pageCount;
  const depth = estimateDepth({
    pageCount: depthPages,
    sourceChars: source.length,
  });
  const maps = [];
  const mapSpan = 70;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const pct = Math.round(((i + 0.5) / chunks.length) * mapSpan);
    onProgress?.({
      stage: 'map',
      message: `Multipass map ${chunk.label} · dense card · ${providerId}…`,
      percent: pct,
    });

    const { content } = await chatCompletion({
      baseUrl: settings.llmBaseUrl,
      apiKey: settings.llmApiKey,
      model: settings.llmModel,
      temperature: 0.2,
      maxTokens: 8192,
      messages: [
        { role: 'system', content: MAP_SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            (scopeBrief ? scopeBrief + '\n\n' : '') +
            buildMapUserPrompt({ chunk, meta, depth }),
        },
      ],
      retries: MULTIPASS_DEFAULTS.maxRetries,
    });

    maps.push({ label: chunk.label, content });

    if (i < chunks.length - 1 && mapDelayMs > 0) {
      await sleep(mapDelayMs);
    }
  }

  const material = buildReduceMaterial({
    maps,
    figures: extraction.figures || [],
    headTail: headTailSample(source, 28_000),
    sourceChars: source.length,
    chunkCount: chunks.length,
  });

  onProgress?.({
    stage: 'reduce',
    message: `Substantial reduce (~${depth.targetPagesMin}–${depth.targetPagesMax}p) · ${maps.length} maps…`,
    percent: 72,
  });

  let markdown;
  let model;

  if (depth.useStagedWrite || weekScope) {
    const out = await stagedCondensedWrite({
      settings,
      meta,
      depth,
      materialLabel: 'map cards covering this band',
      material,
      onProgress,
      progressStart: 72,
      progressEnd: 98,
      modeLabel: weekScope
        ? `Week ${weekScope.week} reduce · ${providerId}`
        : `Multipass reduce · ${providerId}`,
      scopeBrief,
    });
    markdown = out.markdown;
    model = `${out.model} · multipass×${chunks.length} · staged×3`;
  } else {
    const reduceUser =
      (scopeBrief ? scopeBrief + '\n\n' : '') +
      buildReduceUserPrompt({
        meta,
        maps,
        figures: extraction.figures || [],
        sourceChars: source.length,
        chunkCount: chunks.length,
        headTailSample: headTailSample(source, 28_000),
        depth,
      });
    const out = await chatCompletion({
      baseUrl: settings.llmBaseUrl,
      apiKey: settings.llmApiKey,
      model: settings.llmModel,
      temperature: 0.25,
      maxTokens: 16384,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: reduceUser },
      ],
      retries: MULTIPASS_DEFAULTS.maxRetries,
    });
    markdown = out.content;
    model = `${out.model} · multipass×${chunks.length}`;
  }

  onProgress?.({
    stage: 'llm',
    message: 'Attaching core long-read extracts from PDF text…',
    percent: 97,
  });
  const final = finalizeMarkdown(markdown, attachSource, meta, depth, {
    skipMultiWeekPlan: !!weekScope,
  });
  onProgress?.({
    stage: 'llm',
    message: `Substantial multipass complete (${chunks.length} maps)`,
    percent: 100,
  });

  return {
    ...final,
    model,
    truncated: false,
    multipass: true,
    mapChunks: chunks.length,
    sourceChars: source.length,
    depth,
    weekScope,
  };
}

/**
 * Generate a full deep-skim from extraction + metadata.
 * Auto multipass when source exceeds maxContextChars (unless disabled).
 *
 * @param {object} [weekScope] multi-week band: { week, totalWeeks, start, end, focus, projectTitle, pages }
 * @param {object} [synthesis] { weeks: [{week,start,end,focus,markdown}], projectTitle, pages }
 */
export async function generateDeepSkim({
  extraction,
  document,
  settings,
  onProgress,
  weekScope = null,
  synthesis = null,
}) {
  const providerId = assertLlmConfigured(settings);
  const fullSource = extraction.markdown || extraction.text || '';

  // ── Synthesis of weekly skims (no full PDF re-send) ──
  if (synthesis?.weeks?.length) {
    const material = buildSynthesisMaterial(synthesis.weeks);
    const scopeBrief = synthesisScopeBrief({
      projectTitle: synthesis.projectTitle,
      pages: synthesis.pages,
      weeks: synthesis.weeks.length,
    });
    const meta = {
      ...docMeta(document, extraction),
      pageCount: synthesis.pages || document.pageCount,
      title: `${document.title || document.name} — Full synthesis`,
    };
    const depth = estimateDepth({
      pageCount: synthesis.pages || document.pageCount,
      sourceChars: material.length,
    });
    // Force staged write for synthesis substance
    depth.useStagedWrite = true;

    onProgress?.({
      stage: 'plan',
      message: `Synthesis from ${synthesis.weeks.length} weekly skims (token-efficient)…`,
      percent: 5,
    });

    const { markdown, model } = await stagedCondensedWrite({
      settings,
      meta,
      depth,
      materialLabel: 'completed weekly deep-skims',
      material,
      onProgress,
      modeLabel: `Synthesis · ${providerId}`,
      scopeBrief,
    });

    // Long-reads: re-pull from full source using §9 ranges in synthesis
    onProgress?.({ stage: 'llm', message: 'Attaching long-reads from full extraction…', percent: 96 });
    const final = finalizeMarkdown(markdown, fullSource, meta, depth);
    return {
      ...final,
      model: `${model} · synthesis×${synthesis.weeks.length}`,
      truncated: false,
      multipass: false,
      mapChunks: 0,
      depth,
      weekScope: null,
      isSynthesis: true,
    };
  }

  // ── Week-scoped band (only this week's pages → saves tokens) ──
  let source = fullSource;
  let scopedExtraction = extraction;
  let scopeBrief = '';
  let activeWeekScope = null;

  if (weekScope?.start != null && weekScope?.end != null) {
    onProgress?.({
      stage: 'plan',
      message: `Week ${weekScope.week}/${weekScope.totalWeeks}: extracting pp. ${weekScope.start}–${weekScope.end} only…`,
      percent: 3,
    });
    const band = extractWeekSource(fullSource, weekScope.start, weekScope.end, {
      maxChars: (settings.maxContextChars || 120_000) * 3,
    });
    if (!band.found || !band.text.trim()) {
      throw new Error(
        band.note ||
          `Could not extract pages ${weekScope.start}–${weekScope.end}. Re-extract the PDF with page markers.`
      );
    }
    source = band.text;
    scopedExtraction = {
      ...extraction,
      text: band.text,
      markdown: band.text,
      // figures optional — keep global figures
    };
    activeWeekScope = weekScope;
    scopeBrief = weekScopeBrief({
      projectTitle: weekScope.projectTitle,
      week: weekScope.week,
      totalWeeks: weekScope.totalWeeks,
      start: weekScope.start,
      end: weekScope.end,
      focus: weekScope.focus,
      pages: weekScope.pages || document.pageCount,
    });
    onProgress?.({
      stage: 'plan',
      message: `Week band ready (${band.charCount.toLocaleString()} chars · ${band.mode}) — generating…`,
      percent: 6,
    });
  }

  const multipass = shouldUseMultipass(source, settings);

  const runOpts = {
    extraction: scopedExtraction,
    document,
    settings,
    onProgress,
    providerId,
    scopeBrief,
    weekScope: activeWeekScope,
    // For long-read attach, prefer full source so §9 can still pull real pages
    longReadSource: fullSource,
  };

  if (multipass) {
    onProgress?.({
      stage: 'plan',
      message: `Source band (${source.length.toLocaleString()} chars) — multipass map→reduce…`,
      percent: 8,
    });
    return generateDeepSkimMultipass(runOpts);
  }

  return generateDeepSkimSingle(runOpts);
}

/**
 * Probe LLM endpoint health / list models (best-effort).
 */
export async function checkLlm(baseUrl, apiKey = '') {
  if (!baseUrl) return { ok: false, reason: 'No LLM base URL' };
  const providerId = inferProviderId(baseUrl);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    if (providerId === 'openrouter') {
      headers['HTTP-Referer'] = typeof location !== 'undefined' ? location.origin : 'http://localhost';
      headers['X-Title'] = 'Deep-Skim';
    }

    const modelsUrl = `${baseUrl.replace(/\/$/, '')}/models`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(modelsUrl, { headers, signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        const models = (data.data || data.models || [])
          .map((m) => m.id || m.name)
          .filter(Boolean);
        return {
          ok: true,
          models,
          message: `${providerId} endpoint reachable`,
          providerId,
        };
      }
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          reason: 'Unauthorized — paste a valid API key and Save',
          providerId,
        };
      }
      if (apiKey && res.status === 404) {
        return {
          ok: true,
          models: [],
          message: 'Endpoint responded (models list unavailable; chat may still work)',
          providerId,
        };
      }
      return { ok: false, reason: `HTTP ${res.status}`, providerId };
    } finally {
      clearTimeout(t);
    }
  } catch (err) {
    try {
      const ollamaBase = baseUrl.replace(/\/v1\/?$/, '');
      const res2 = await fetch(`${ollamaBase}/api/tags`);
      if (res2.ok) {
        const data = await res2.json();
        const models = (data.models || []).map((m) => m.name);
        return { ok: true, models, message: 'Ollama reachable', providerId: 'ollama' };
      }
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      reason: err.name === 'AbortError' ? 'timeout' : err.message,
      providerId,
    };
  }
}

/**
 * Demo / offline stub when no LLM is available.
 */
export function generateStubDeepSkim({ document, extraction }) {
  const title = document.title || document.name || 'Untitled';
  const sample = (extraction.text || '').slice(0, 600).replace(/\n+/g, ' ');
  const markdown = `# ${title}

## 1. Title + Bibliographic Note
- **Title:** ${title}
- **Author(s):** Unknown / not extractable
- **Year / Edition / Source cues:** Not available offline
- **Genre / form:** Unknown
- **Length signal:** ~${document.pageCount ?? '?'} pages
- **Extraction confidence:** ${extraction.quality || 'unknown'} — stub mode (no LLM connected)
- **One-sentence thesis:** *[Connect a local LLM in Settings to generate a real deep-skim.]* Source opens with: “${sample.slice(0, 180)}…”

## 2. Hierarchical Outline + Core Claims
- **I. [Stub]** Configure Ollama or an OpenAI-compatible endpoint, then re-run generation.
  - **I.a** Extracted text is stored locally and ready (${(extraction.text || '').length} characters).
  - **I.b** Method: ${extraction.method || 'native'}; quality: ${extraction.quality || 'n/a'}.

## 3. 4–6 Verbatim High-Signal Passages
> “${sample.slice(0, 280) || 'No text extracted.'}…”

- **Why it matters:** Placeholder excerpt from the start of the extracted text.
- **Location cue:** opening pages

## 4. Mental Models & Diagrammatic Structure
- **Name / label:** Pending full generation
- **Nodes / elements:** —
- **Relations / dynamics:** —
- **What it is used to explain:** Run generation with a live model to reconstruct conceptual structure.
- **Figure reference:** ${(extraction.figures || []).map((f) => f.caption).join('; ') || 'none'}

## 5. Active-Recall Questions
**Q1.** What is the central problem this text appears to address (based on the opening)?
**A1.** Re-read the bibliographic thesis after a real generation; stub cannot answer reliably.

**Q2.** Which extraction method was used for this document?
**A2.** ${extraction.method || 'native'} (quality: ${extraction.quality || 'unknown'}).

**Q3.** Why might OCR be required for this PDF?
**A3.** If native text quality is low or pages are image-only / diagram-heavy.

**Q4.** What local data is stored for this document?
**A4.** PDF bytes, extracted markdown/text, figure renders, and any generated summaries in IndexedDB.

**Q5.** What should you do next to obtain a real deep-skim?
**A5.** Open Settings → Use free Gemini (or Ollama for private), paste key if needed, then Generate deep-skim.

## 6. Connections to Existing Knowledge
**Personalization placeholder — seed for later editing.**

- **Hook:** process philosophy
  - **Tension or resonance:** After real generation, ask how becoming/process is framed (or denied) in the source.
  - **Open question for the reader:** Where does this text sit relative to Whiteheadian / Deleuzian process?
- **Hook:** schizoanalysis
  - **Tension or resonance:** Watch for molar/molecular, desire, and institutional capture once claims are real.
  - **Open question for the reader:** Does the argument reterritorialize or open lines of flight?
- **Hook:** political ontology
  - **Tension or resonance:** Identify what counts as a political entity or force in the text.
  - **Open question for the reader:** What ontology of power is presupposed?

> *Reader note: replace or extend these hooks with your own notes after review.*

## 7. Dual-Pressure Stress Test

### 7a. If the central claims are wrong
- Stub only: re-run after connecting a model; use this section to pressure-test real claims.

### 7b. If the central claims are correct
- Stub only: once generated, force renegotiation of biases here deliberately.

## 8. What Remains Unclear / Worth Full Reading
- Full deep-skim not yet generated (offline stub).
- Extraction is local and ready for generation.
- Explicit recommendation: **Promote to full reading list** if this is ASAP material — with rationale: real summary pending LLM.
`;

  return parseDeepSkimMarkdown(markdown);
}

export { shouldUseMultipass, chunkSourceText } from './multipass.js';
