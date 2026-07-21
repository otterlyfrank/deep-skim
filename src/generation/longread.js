/**
 * Core long-read segments: parse model page recommendations,
 * pull real source text by <!-- page N --> markers, attach to skim.
 */

/**
 * Parse recommended reading segments from deep-skim markdown.
 * Accepts patterns like:
 *   - **Pages:** 12–18
 *   - Pages 12-18
 *   - p.12–p.18 / pp. 12-18
 *   - **Range:** 100-120
 *
 * @returns {{ title: string, start: number, end: number, why: string, claimLinks: string }[]}
 */
export function parseRecommendedSegments(markdown) {
  const text = markdown || '';
  const section =
    text.match(/##\s*9\.\s*Core[\s\S]*?(?=##\s*\d+\.|$)/i)?.[0] ||
    text.match(/##\s*8\.\s*What Remains[\s\S]*?(?=##\s*9\.|$)/i)?.[0] ||
    text;

  const segments = [];
  const lines = section.split(/\n/);
  let current = null;

  const flush = () => {
    if (current && current.start != null && current.end != null) {
      segments.push(current);
    }
    current = null;
  };

  for (const line of lines) {
    const range =
      line.match(
        /(?:pages?|pp\.?|p\.?|range)\s*:?\s*(\d+)\s*[–—\-]+\s*(?:p(?:p)?\.?\s*)?(\d+)/i
      ) || line.match(/\b(\d+)\s*[–—\-]\s*(\d+)\b/);

    const titleMatch = line.match(
      /(?:\*\*)?(?:segment|reading|core|assignment|title)\s*(?:\d+)?(?:\*\*)?\s*[:.—-]\s*(.+)/i
    );

    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start > 0 && end >= start && end - start <= 80) {
        // new segment if we already have a range, or start one
        if (current?.start != null) flush();
        current = {
          title: current?.title || `Core reading ${segments.length + 1}`,
          start: Math.min(start, end),
          end: Math.max(start, end),
          why: '',
          claimLinks: '',
        };
      }
    }

    if (titleMatch && !/pages?|pp\.?/i.test(titleMatch[1])) {
      if (!current) {
        current = {
          title: clean(titleMatch[1]),
          start: null,
          end: null,
          why: '',
          claimLinks: '',
        };
      } else if (!current.start) {
        current.title = clean(titleMatch[1]);
      }
    }

    if (current && /why|rationale|core message|purpose/i.test(line)) {
      current.why += (current.why ? ' ' : '') + clean(line.replace(/^[-*]\s*/, ''));
    }
    if (current && /claim|§2|links to/i.test(line)) {
      current.claimLinks += (current.claimLinks ? ' ' : '') + clean(line.replace(/^[-*]\s*/, ''));
    }
  }
  flush();

  // Also scan whole doc for explicit "Core reading" blocks
  if (!segments.length) {
    const blockRe =
      /(?:###?\s*)?(?:Core reading|Reading assignment|Long-read)\s*(\d+)?[:.\s-]*([^\n]*)\n([\s\S]*?)(?=\n###?\s|\n##\s|$)/gi;
    let m;
    while ((m = blockRe.exec(text)) !== null) {
      const body = m[3] || '';
      const r = body.match(/(\d+)\s*[–—\-]\s*(\d+)/);
      if (!r) continue;
      segments.push({
        title: clean(m[2]) || `Core reading ${m[1] || segments.length + 1}`,
        start: Number(r[1]),
        end: Number(r[2]),
        why: clean(body).slice(0, 400),
        claimLinks: '',
      });
    }
  }

  // Deduplicate by range
  const seen = new Set();
  return segments.filter((s) => {
    const k = `${s.start}-${s.end}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return s.end - s.start <= 60; // keep segments readable
  });
}

function clean(s) {
  return String(s || '')
    .replace(/\*\*/g, '')
    .replace(/^[-*]\s*/, '')
    .trim();
}

/**
 * Extract text for page range from extraction that uses <!-- page N --> markers.
 */
export function extractPagesFromSource(sourceText, startPage, endPage) {
  const text = sourceText || '';
  const re = /<!--\s*page\s+(\d+)\s*-->/gi;
  const indices = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    indices.push({ page: Number(m[1]), index: m.index, markerLen: m[0].length });
  }

  if (!indices.length) {
    // No markers: approximate by equal slices if pageCount unknown — return empty
    return {
      text: '',
      found: false,
      note: 'No page markers in extraction; cannot auto-pull long-read text. Open the PDF at the recommended pages.',
    };
  }

  const lo = Math.min(startPage, endPage);
  const hi = Math.max(startPage, endPage);
  const parts = [];

  for (let i = 0; i < indices.length; i++) {
    const { page, index, markerLen } = indices[i];
    if (page < lo || page > hi) continue;
    const end = i + 1 < indices.length ? indices[i + 1].index : text.length;
    const body = text.slice(index + markerLen, end).trim();
    if (body) {
      parts.push(`<!-- page ${page} -->\n${body}`);
    }
  }

  if (!parts.length) {
    // Closest pages if exact range missing
    const pages = indices.map((x) => x.page);
    const minP = Math.min(...pages);
    const maxP = Math.max(...pages);
    return {
      text: '',
      found: false,
      note: `No extract for pages ${lo}–${hi} (extraction has pages ${minP}–${maxP}).`,
    };
  }

  let joined = parts.join('\n\n');
  // Cap enormous pulls (~15 pages of dense text)
  const maxChars = 45_000;
  if (joined.length > maxChars) {
    joined =
      joined.slice(0, maxChars) +
      '\n\n… [long-read extract truncated for storage — open PDF for remainder of range]';
  }

  return { text: joined, found: true, note: null, pages: `${lo}–${hi}` };
}

/**
 * After LLM generation, attach real source long-reads for recommended segments.
 */
export function attachLongReadExtracts(markdown, sourceText, { maxSegments = 4 } = {}) {
  let segments = parseRecommendedSegments(markdown);
  if (!segments.length) {
    // Heuristic fallback: early framing + late argument if page markers exist
    const markers = [...(sourceText || '').matchAll(/<!--\s*page\s+(\d+)\s*-->/gi)].map((x) =>
      Number(x[1])
    );
    if (markers.length >= 8) {
      const min = Math.min(...markers);
      const max = Math.max(...markers);
      const mid = Math.floor((min + max) / 2);
      segments = [
        {
          title: 'Opening / framing (auto)',
          start: min,
          end: Math.min(min + 6, mid - 1),
          why: 'Auto-selected opening band — model did not emit explicit ranges.',
          claimLinks: '',
        },
        {
          title: 'Late argument / close (auto)',
          start: Math.max(mid, max - 8),
          end: max,
          why: 'Auto-selected closing band — model did not emit explicit ranges.',
          claimLinks: '',
        },
      ];
    }
  }

  segments = segments.slice(0, maxSegments);
  if (!segments.length) {
    return { markdown, longReads: [], segments: [] };
  }

  const longReads = [];
  const blocks = [];

  for (const seg of segments) {
    const pulled = extractPagesFromSource(sourceText, seg.start, seg.end);
    longReads.push({ ...seg, ...pulled });
    blocks.push(
      [
        `### ${seg.title}`,
        `- **Pages:** ${seg.start}–${seg.end}`,
        seg.why ? `- **Why this segment:** ${seg.why}` : '',
        seg.claimLinks ? `- **Links:** ${seg.claimLinks}` : '',
        pulled.found
          ? `\n#### Source extract (from your PDF text layer)\n\n${pulled.text}`
          : `\n*${pulled.note || 'Extract unavailable.'}*`,
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  // Remove auto-appended prior long-read section if regenerating
  let base = markdown.replace(/\n## Long-read extracts from source[\s\S]*$/i, '').trimEnd();

  // Ensure §9 recommendations exist or append a short pointer
  if (!/##\s*9\.\s*Core/i.test(base)) {
    base += `\n\n## 9. Core Reading Segments (source long-reads)\n`;
    for (const seg of segments) {
      base += `\n### ${seg.title}\n- **Pages:** ${seg.start}–${seg.end}\n- **Why:** ${seg.why || 'Core message band'}\n`;
    }
  }

  const appendix =
    `\n\n## Long-read extracts from source\n\n` +
    `> These passages are **pulled from your local PDF extraction** for the page ranges recommended above — a real long-read layer beside the notes.\n\n` +
    blocks.join('\n\n---\n\n');

  return {
    markdown: base + appendix,
    longReads,
    segments,
  };
}

/**
 * Multi-week plan for very long works (optional strategy).
 */
export function buildMultiWeekPlan({ pageCount = 0, sourceChars = 0 } = {}) {
  const pages =
    pageCount > 0 ? pageCount : Math.max(1, Math.round((sourceChars || 0) / 2000));

  if (pages < 350) {
    return null; // not needed
  }

  // ~200–280 pages of "attention" per week of deep-skim work
  const pagesPerWeek = pages >= 600 ? 280 : 220;
  const weeks = Math.min(6, Math.max(2, Math.ceil(pages / pagesPerWeek)));
  const band = Math.ceil(pages / weeks);
  const plan = [];
  for (let w = 1; w <= weeks; w++) {
    const start = (w - 1) * band + 1;
    const end = w === weeks ? pages : w * band;
    plan.push({
      week: w,
      start,
      end,
      focus:
        w === 1
          ? 'Framing, method, early claims — establish the spine'
          : w === weeks
            ? 'Late turns, conclusions, full-work stress test + long-reads'
            : 'Development band — mechanisms, cases, mid-book models',
    });
  }
  return { pages, weeks, plan };
}

export function multiWeekPlanMarkdown(plan) {
  if (!plan) return '';
  const lines = [
    `## Multi-week reading strategy (optional)`,
    ``,
    `This source is long (~${plan.pages} pages). Optional plan: **${plan.weeks} weekly deep-skims**, then a final synthesis pass.`,
    ``,
  ];
  for (const w of plan.plan) {
    lines.push(
      `- **Week ${w.week}:** pages **${w.start}–${w.end}** — ${w.focus}`
    );
  }
  lines.push(
    ``,
    `Each week: run deep-skim on that band (or the whole file with multipass; use page ranges as attention priority). Final week: merge notes + core long-reads.`
  );
  return lines.join('\n');
}
