/**
 * Map-reduce multipass for long sources.
 *
 * Pass A (map): each chunk → substantial claim/quote/model notes
 * Pass B (staged reduce): write §1–2, §3–4, §5–8 then assemble
 */

/** Soft caps so free-tier weekly use stays sane */
export const MULTIPASS_DEFAULTS = {
  enabled: true,
  /** Slightly smaller chunks → more maps → better coverage for substantial reads */
  mapChunkChars: 55_000,
  maxMapChunks: 12,
  mapDelayMs: 450,
  maxRetries: 2,
};

/**
 * Split source into ordered chunks. Prefers <!-- page N --> boundaries.
 */
export function chunkSourceText(text, {
  chunkChars = MULTIPASS_DEFAULTS.mapChunkChars,
  maxChunks = MULTIPASS_DEFAULTS.maxMapChunks,
} = {}) {
  const raw = (text || '').trim();
  if (!raw) return [];

  const pageParts = raw.split(/(?=<!--\s*page\s+\d+\s*-->)/i).filter((p) => p.trim());
  /** @type {string[]} */
  let pieces;

  if (pageParts.length >= 3) {
    pieces = [];
    let buf = '';
    for (const part of pageParts) {
      if (buf.length + part.length > chunkChars && buf.length > chunkChars * 0.35) {
        pieces.push(buf);
        buf = part;
      } else {
        buf += (buf ? '\n' : '') + part;
      }
    }
    if (buf.trim()) pieces.push(buf);
  } else {
    pieces = [];
    for (let i = 0; i < raw.length; i += chunkChars) {
      pieces.push(raw.slice(i, i + chunkChars));
    }
  }

  while (pieces.length > maxChunks) {
    const merged = [];
    const group = Math.ceil(pieces.length / maxChunks);
    for (let i = 0; i < pieces.length; i += group) {
      merged.push(pieces.slice(i, i + group).join('\n\n'));
    }
    pieces = merged;
  }

  const final = [];
  for (const p of pieces) {
    if (p.length <= chunkChars * 1.35) {
      final.push(p);
    } else {
      for (let i = 0; i < p.length; i += chunkChars) {
        final.push(p.slice(i, i + chunkChars));
      }
    }
  }
  while (final.length > maxChunks) {
    const keep = [final[0]];
    const midCount = maxChunks - 2;
    for (let k = 1; k <= midCount; k++) {
      const idx = Math.round((k * (final.length - 1)) / (midCount + 1));
      keep.push(final[idx]);
    }
    keep.push(final[final.length - 1]);
    const seen = new Set();
    final.length = 0;
    for (const c of keep) {
      if (!seen.has(c)) {
        seen.add(c);
        final.push(c);
      }
    }
    break;
  }

  return final.map((t, i) => ({
    index: i + 1,
    total: final.length,
    label: `chunk ${i + 1}/${final.length}`,
    text: t,
  }));
}

export const MAP_SYSTEM_PROMPT = `You extract a **substantial map card** from ONE chunk of a longer work for later condensed-reading merge.

This is not a blurb. Preserve argumentative flesh so a later stage can write a 10–50 page condensed reading.

Rules:
1. Claims only — no topic labels, no fluff.
2. Ground every point in THIS chunk. Mark (inference) when needed.
3. Verbatim quotes must be exact (light ellipsis … ok). Prefer **many** high-signal quotes.
4. Reconstruct mechanisms: how arguments move, not only conclusions.
5. If TOC/index/bibliography noise, say so and extract little.
6. Markdown only. No preamble.

Exact headings:

## Chunk map
- **Position:** opening / early / mid / late / end (best guess)
- **Local thesis:** 2–3 sentences for this chunk
- **Argumentative heat:** what is being fought for or against here

## Core claims in this chunk
For each claim (aim **5–12** if the chunk is dense):

### C[n]. [Full claim sentence]
- **Mechanism:** how the author gets here (2–5 sentences)
- **Supports:** evidence, cases, authorities, distinctions
- **Implications / limits:** what follows; what is assumed
- **Links:** how this continues or revises earlier moves (if visible)

## Verbatim candidates
At least **4–8** quotes when the chunk allows (more if dense):

> "exact quote"

- **Why it matters:** 2–3 sentences
- **Cue:** page/section if visible

## Mental models / frameworks
- **Name:** … | **Elements:** … | **Dynamics:** … | **Used to explain:** …

## Distinctions / definitions worth keeping
- term — definition/use in this chunk

## Local narrative of the chunk
A short continuous reconstruction (150–350 words) of what this chunk *does* argumentatively — not a theme list.

## Gaps / what this chunk cannot settle
- …`;

export function buildMapUserPrompt({ chunk, meta, depth = null }) {
  const depthLine = depth
    ? `Later condensed-reading target: ~${depth.targetPagesMin}–${depth.targetPagesMax} pages of notes for the whole work — make this map dense enough to feed that.`
    : `Make this map dense enough to feed a substantial condensed reading of the whole work.`;

  return `Map this chunk for later merge into a **substantial condensed reading** (not an abstract).

${depthLine}

## Document
- Filename: ${meta.filename || 'unknown'}
- Title hint: ${meta.title || 'unknown'}
- Page count: ${meta.pageCount ?? 'unknown'}
- Chunk: ${chunk.label} (${chunk.index} of ${chunk.total})
- Chunk characters: ${chunk.text.length}

## Chunk text
---
${chunk.text}
---

Output only the map card with the required headings. Prefer over-inclusion of specific claims and quotes over thin abstraction.`;
}

export function formatMapsBlock(maps) {
  return maps
    .map((m, i) => `### Map ${i + 1}/${maps.length} (${m.label || `chunk ${i + 1}`})\n${m.content}`)
    .join('\n\n---\n\n');
}

export function figuresBlock(figures = []) {
  if (!figures.length) return '(No figure captions provided.)';
  return figures
    .map(
      (f, i) =>
        `- Figure ${i + 1}${f.page != null ? ` (p.${f.page})` : ''}: ${f.caption || f.note || 'image'}`
    )
    .join('\n');
}

/**
 * Single-shot reduce (fallback / short multipass).
 */
export function buildReduceUserPrompt({
  meta,
  maps,
  figures = [],
  sourceChars,
  chunkCount,
  headTailSample = '',
  depth,
}) {
  return `You have **map cards** covering a long source in ${chunkCount} sequential chunks (source ~${sourceChars.toLocaleString()} characters). Produce a **substantial condensed reading** — full structured deep-skim §1–§8 — by synthesizing the maps.

This must feel like a **${depth.targetPagesMin}–${depth.targetPagesMax} page** careful reading, not a 2-page abstract.

## Document metadata
- Filename: ${meta.filename || 'unknown'}
- Title hint: ${meta.title || 'unknown'}
- Page count: ${meta.pageCount ?? 'unknown'}
- Extraction method: ${meta.method || 'native'}
- Extraction quality: ${meta.quality || 'unknown'}
- Multipass: YES — maps are the compressed full-source proxy
- Text truncated: no (use maps as coverage)

## Figure / image notes
${figuresBlock(figures)}

## Map cards (primary evidence)
${formatMapsBlock(maps)}

## Optional raw head/tail sample
---
${headTailSample || '(none)'}
---

## Multipass reduce rules
1. §2 is the bulk: full claim blocks with stakes/mechanism/supports/limits across the whole spine.
2. Prefer verbatim from map quote banks; never invent quotes.
3. Deduplicate; keep strongest specific forms; preserve order early→late when possible.
4. Meet depth counts for claims, quotes, models, recall.
5. Exact §1–§8 headings. Markdown only.

Begin the substantial condensed reading now.`;
}

export function headTailSample(text, budget = 28_000) {
  const t = text || '';
  if (t.length <= budget) return t;
  const head = Math.floor(budget * 0.6);
  const tail = budget - head - 80;
  return (
    t.slice(0, head) +
    '\n\n<!-- … middle omitted in raw sample; see map cards … -->\n\n' +
    t.slice(-tail)
  );
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function shouldUseMultipass(sourceText, settings = {}) {
  if (settings.multipassEnabled === false) return false;
  const maxChars = settings.maxContextChars || 120_000;
  return (sourceText || '').length > maxChars;
}

/**
 * Material bundle for staged reduce prompts.
 */
export function buildReduceMaterial({ maps, figures, headTail, sourceChars, chunkCount }) {
  return `## Coverage
- Chunks mapped: ${chunkCount}
- Source characters: ${sourceChars}

## Figures
${figuresBlock(figures)}

## Map cards
${formatMapsBlock(maps)}

## Raw head/tail sample
${headTail || '(none)'}`;
}
