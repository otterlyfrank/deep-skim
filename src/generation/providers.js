/**
 * LLM provider presets — OpenAI-compatible chat endpoints.
 *
 * Free path (no paid API): Gemini free tier, Groq free tier, or Ollama local.
 * Claude Pro / SuperGrok chat subs do NOT include third-party API access.
 */

/**
 * Curated models per provider for the Settings dropdown.
 * First entry is the recommended default (mirrors `model`).
 * Labels may include short guidance; values are API model ids.
 */
export const LLM_PROVIDERS = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini (free tier) — recommended free',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-3.5-flash',
    models: [
      { id: 'gemini-3.5-flash', label: 'gemini-3.5-flash (recommended free)' },
      { id: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite (fast / cheap)' },
      { id: 'gemini-3-flash-preview', label: 'gemini-3-flash-preview' },
      { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash (may block new keys)' },
      { id: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite' },
      { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro (higher quality)' },
      { id: 'gemini-flash-latest', label: 'gemini-flash-latest (alias)' },
    ],
    needsKey: true,
    leavesMachine: true,
    free: true,
    help: 'Free API key from Google AI Studio. Default is gemini-3.5-flash — older ids like gemini-2.5-flash often return 404 for new keys (“no longer available to new users”). Rate limits apply.',
    keyPlaceholder: 'AIza…',
    docsUrl: 'https://aistudio.google.com/apikey',
  },
  groq: {
    id: 'groq',
    label: 'Groq (free tier)',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b-versatile (recommended)' },
      { id: 'llama-3.1-8b-instant', label: 'llama-3.1-8b-instant (fast)' },
      { id: 'gemma2-9b-it', label: 'gemma2-9b-it' },
      { id: 'mixtral-8x7b-32768', label: 'mixtral-8x7b-32768' },
    ],
    needsKey: true,
    leavesMachine: true,
    free: true,
    help: 'Free, very fast open models. Good quality for structured skims; rate-limited. Key at console.groq.com.',
    keyPlaceholder: 'gsk_…',
    docsUrl: 'https://console.groq.com/keys',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek (low-cost · strong reasoning)',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-v4-flash',
    models: [
      { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash (cheap / strong)' },
      { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro (max quality)' },
      { id: 'deepseek-chat', label: 'deepseek-chat (legacy alias)' },
      { id: 'deepseek-reasoner', label: 'deepseek-reasoner' },
    ],
    needsKey: true,
    leavesMachine: true,
    free: false,
    help: 'Excellent for structured claims & stress-tests. OpenAI-compatible; usually very cheap after any platform signup credits. Key: platform.deepseek.com. Try deepseek-v4-pro for max quality.',
    keyPlaceholder: 'sk-…',
    docsUrl: 'https://platform.deepseek.com/api_keys',
  },
  kimi: {
    id: 'kimi',
    label: 'Kimi / Moonshot (long context)',
    baseUrl: 'https://api.moonshot.ai/v1',
    model: 'kimi-k2.5',
    models: [
      { id: 'kimi-k2.5', label: 'kimi-k2.5 (recommended long context)' },
      { id: 'moonshot-v1-128k', label: 'moonshot-v1-128k' },
      { id: 'moonshot-v1-32k', label: 'moonshot-v1-32k' },
      { id: 'moonshot-v1-8k', label: 'moonshot-v1-8k' },
    ],
    needsKey: true,
    leavesMachine: true,
    free: false,
    help: 'Strong long-context reading model (Moonshot). OpenAI-compatible. Good when books are long and you want more of the extract in one pass. Key: platform.kimi.ai / platform.moonshot.ai.',
    keyPlaceholder: 'sk-…',
    docsUrl: 'https://platform.kimi.ai',
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (local · free · private)',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
    models: [
      { id: 'llama3.2', label: 'llama3.2' },
      { id: 'llama3.1', label: 'llama3.1' },
      { id: 'qwen2.5:14b', label: 'qwen2.5:14b (stronger local)' },
      { id: 'mistral', label: 'mistral' },
      { id: 'phi3', label: 'phi3' },
    ],
    needsKey: false,
    leavesMachine: false,
    free: true,
    help: 'Fully free and private. Install Ollama, pull a model, no cloud key. Quality depends on what you run locally. Test connection to list models you have pulled.',
    keyPlaceholder: '(empty)',
    docsUrl: 'https://ollama.com',
  },
  grok: {
    id: 'grok',
    label: 'Grok (xAI) — paid / free credits if available',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-4.5',
    models: [
      { id: 'grok-4.5', label: 'grok-4.5 (recommended)' },
      { id: 'grok-3', label: 'grok-3' },
      { id: 'grok-3-mini', label: 'grok-3-mini' },
      { id: 'grok-2-latest', label: 'grok-2-latest' },
    ],
    needsKey: true,
    leavesMachine: true,
    free: false,
    help: 'Best quality when you have console credits. SuperGrok chat sub does not include this API. Check console.x.ai for any free credits.',
    keyPlaceholder: 'xai-…',
    docsUrl: 'https://console.x.ai',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI (paid)',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1',
    models: [
      { id: 'gpt-4.1', label: 'gpt-4.1' },
      { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
      { id: 'gpt-4o', label: 'gpt-4o' },
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
      { id: 'o4-mini', label: 'o4-mini' },
    ],
    needsKey: true,
    leavesMachine: true,
    free: false,
    help: 'Paid OpenAI chat completions. Extracted text is sent to OpenAI.',
    keyPlaceholder: 'sk-…',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter (Claude paid API · free models too)',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openrouter/free',
    models: [
      { id: 'openrouter/free', label: 'openrouter/free (free router)' },
      { id: 'anthropic/claude-sonnet-4', label: 'anthropic/claude-sonnet-4 (paid)' },
      { id: 'anthropic/claude-3.5-sonnet', label: 'anthropic/claude-3.5-sonnet (paid)' },
      { id: 'google/gemini-2.5-flash', label: 'google/gemini-2.5-flash' },
      { id: 'deepseek/deepseek-chat', label: 'deepseek/deepseek-chat' },
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'meta-llama/llama-3.3-70b-instruct' },
    ],
    needsKey: true,
    leavesMachine: true,
    free: true,
    help: 'Claude via OpenRouter is pay-per-token (Claude Pro sub does not apply). For free, use openrouter/free or other :free models. Key at openrouter.ai/keys.',
    keyPlaceholder: 'sk-or-…',
    docsUrl: 'https://openrouter.ai/keys',
  },
  custom: {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    baseUrl: 'http://localhost:1234/v1',
    model: 'local-model',
    models: [{ id: 'local-model', label: 'local-model' }],
    needsKey: false,
    leavesMachine: null,
    free: null,
    help: 'LM Studio, vLLM, LiteLLM, etc. Point at any /v1 chat endpoint. Use Custom model… to type any id.',
    keyPlaceholder: 'optional',
    docsUrl: null,
  },
};

/** Stable sentinel for “type your own model id” in the dropdown */
export const CUSTOM_MODEL_VALUE = '__custom__';

/**
 * Build <option> list for a provider’s model select.
 * @param {string} providerId
 * @param {string} selectedModel
 * @param {string[]} [extraModels] live models from /models probe
 */
export function modelOptionsHtml(providerId, selectedModel = '', extraModels = []) {
  const p = getProvider(providerId);
  const curated = (p.models || [{ id: p.model, label: p.model }]).map((m) =>
    typeof m === 'string' ? { id: m, label: m } : m
  );
  const seen = new Set(curated.map((m) => m.id));
  const extras = (extraModels || [])
    .filter((id) => id && !seen.has(id))
    .map((id) => ({ id, label: `${id} (from API)` }));
  const all = [...curated, ...extras];
  const selected = selectedModel || p.model;
  const inList = all.some((m) => m.id === selected);
  let html = all
    .map(
      (m) =>
        `<option value="${escapeOpt(m.id)}" ${m.id === selected ? 'selected' : ''}>${escapeOpt(m.label)}</option>`
    )
    .join('');
  if (!inList && selected) {
    html =
      `<option value="${escapeOpt(selected)}" selected>${escapeOpt(selected)} (saved)</option>` + html;
  }
  html += `<option value="${CUSTOM_MODEL_VALUE}" ${!inList && !selected ? 'selected' : ''}>Custom model…</option>`;
  return html;
}

export function getProvider(id) {
  return LLM_PROVIDERS[id] || LLM_PROVIDERS.custom;
}

/**
 * Infer provider from base URL when only URL is stored.
 */
export function inferProviderId(baseUrl = '') {
  const u = (baseUrl || '').toLowerCase();
  if (u.includes('generativelanguage.googleapis.com') || u.includes('googleapis.com/v1beta/openai')) {
    return 'gemini';
  }
  if (u.includes('api.groq.com')) return 'groq';
  if (u.includes('api.deepseek.com')) return 'deepseek';
  if (u.includes('api.moonshot.ai') || u.includes('api.moonshot.cn') || u.includes('api.kimi.ai')) {
    return 'kimi';
  }
  if (u.includes('api.x.ai')) return 'grok';
  if (u.includes('localhost:11434') || u.includes('127.0.0.1:11434')) return 'ollama';
  if (u.includes('api.openai.com')) return 'openai';
  if (u.includes('openrouter.ai')) return 'openrouter';
  return 'custom';
}

export function providerOptionsHtml(selectedId) {
  return Object.values(LLM_PROVIDERS)
    .map(
      (p) =>
        `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${escapeOpt(p.label)}</option>`
    )
    .join('');
}

function escapeOpt(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/** Privacy blurb for the active provider */
export function privacyCopy(providerId) {
  const p = getProvider(providerId);
  if (p.leavesMachine === false) {
    return {
      level: 'local',
      title: 'Private configuration — text stays on this machine',
      body: 'Deep-skim generation runs against a local endpoint. PDFs, extractions, and summaries remain in IndexedDB. Your API key field can stay empty.',
    };
  }
  if (p.leavesMachine === true) {
    const freeNote = p.free
      ? ' This preset targets a free tier (rate limits apply).'
      : ' This preset is typically paid (or free credits if your console offers them).';
    return {
      level: 'cloud',
      title: 'Private configuration — you control what leaves the machine',
      body: `With ${p.label.split('—')[0].trim()}, extracted text (not the PDF file itself) is sent to that provider to generate the deep-skim.${freeNote} Keys stay in this browser’s IndexedDB only. Claude Pro / SuperGrok chat subscriptions do not cover this app.`,
    };
  }
  return {
    level: 'custom',
    title: 'Private configuration — custom endpoint',
    body: 'You chose a custom OpenAI-compatible URL. Whether text leaves this machine depends on that endpoint. Review the URL before generating.',
  };
}
