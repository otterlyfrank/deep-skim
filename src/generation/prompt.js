/**
 * Deep-skim system prompt — keep in sync with /SYSTEM_PROMPT.md
 * Substantial condensed reading (not abstract executive summary).
 *
 * §6 personalization lenses are user-editable (Settings → Research lenses).
 */

import { depthBriefMarkdown, estimateDepth } from './depth.js';

/**
 * Default research lenses — generalist researcher pack.
 * Users replace/extend these anytime in Settings; stored in IndexedDB.
 * (Older niche defaults are not forced on existing vaults.)
 */
export const DEFAULT_RESEARCH_LENSES_TEXT = [
  'core argument vs evidence',
  'historical / social context',
  'method & epistemology',
  'comparisons to adjacent fields',
  'practical implications',
  'open questions & critiques',
].join('\n');

/**
 * Parse freeform lenses: one per line, or comma / · / ; separated.
 * @param {string|string[]|null|undefined} raw
 * @returns {string[]}
 */
export function parseResearchLenses(raw) {
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  const text = String(raw ?? '').trim();
  if (!text) return [];
  return text
    .split(/[\n,;·•|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s, i, arr) => arr.findIndex((t) => t.toLowerCase() === s.toLowerCase()) === i);
}

/**
 * Normalize personalization from settings (or explicit overrides).
 * @param {object} [settings]
 */
export function resolvePersonalization(settings = {}) {
  const lensesRaw =
    settings.researchLensesText ??
    settings.researchLenses ??
    DEFAULT_RESEARCH_LENSES_TEXT;
  let lenses = parseResearchLenses(lensesRaw);
  if (!lenses.length) {
    lenses = parseResearchLenses(DEFAULT_RESEARCH_LENSES_TEXT);
  }
  const focusNote = String(settings.researchFocusNote || '').trim();
  return { lenses, focusNote };
}

function formatLensesBullets(lenses) {
  return lenses.map((l) => `- ${l}`).join('\n');
}

/**
 * Block injected into user prompts so generation follows the reader's lenses
 * without inventing biography or distorting the source.
 */
export function readerProfileBrief(settings = {}) {
  const { lenses, focusNote } = resolvePersonalization(settings);
  const lines = [
    '## Reader research profile (customizable in Settings)',
    'Use this profile for **§6 Connections** and for light relevance bias only.',
    '**Never invent** the reader’s biography, career, or unpublished views.',
    '**Never warp** the source to fit the lenses — if a lens does not connect honestly, skip it or mark the non-fit.',
    '',
    '### Active research lenses / keywords',
    formatLensesBullets(lenses),
  ];
  if (focusNote) {
    lines.push('', '### Focus note (reader-supplied)', focusNote);
  }
  return lines.join('\n');
}

/**
 * Build the full system prompt with the current user's research lenses.
 * @param {object} [settings]
 */
export function buildSystemPrompt(settings = {}) {
  const { lenses, focusNote } = resolvePersonalization(settings);
  const lensBlock = formatLensesBullets(lenses);
  const focusBlock = focusNote
    ? `\nOptional reader focus note (do not invent beyond this):\n> ${focusNote.replace(/\n+/g, ' ')}`
    : '';

  return `You are a high-signal **condensed reading** partner for a serious independent researcher.

Your job is **not** a blurb, study-guide teaser, abstract, or “key takeaways” card.
Your job is a **structured condensed reading** thorough enough to stand in for a careful multi-hour skim of the source — often on the order of **tens of pages of dense notes** for a book-length work — while still using active-recall and stress-testing so the material sticks.

Think: *reading companion that preserves argumentative flesh*, not *management summary*.

### Non-negotiable rules

1. **No fluff.** No “this book explores…”, no publisher-speak, no morale-boosting filler.
2. **Claims over topics.** Never list themes. State the actual claims, arguments, findings, mechanisms.
3. **Ground every section in the source text.** If unsupported, omit or mark (inference).
4. **Preserve precise terminology** from the source; define jargon briefly on first use; keep using it.
5. **Verbatim passages must be verbatim** (light ellipsis \`…\` allowed). Do not paraphrase §3 quotes.
6. **Active-recall answers must be teachable** — short paragraphs that reconstruct the point, not one-line hints.
7. **If partial / OCR-noisy**, say so under §1 and §8; lower confidence on affected claims.
8. **Output Markdown only**, exact section headings below (numbering + punctuation). Do not add/rename/reorder sections.
9. **Reject topic labels.** If a bullet could fit any book in the genre, rewrite until source-specific.
10. **No invented citations, page numbers, or quotes.**
11. **Substance over compression theater.** Under-length output that stays abstract **fails** the task even if headings are correct.
12. **§2 is the main reading.** Most of the word budget belongs there: claim → supporting moves → evidence cues → implications / limits.
13. **Reader lenses are customizable.** §6 hooks follow the **active research lenses** below. Light relevance bias is allowed; source fidelity always wins.

### Anti-patterns (fail if you do these)

- Abstract summary voice: “The author discusses X and also considers Y.”
- Topic outlines: “I. Introduction · II. Methods · III. Conclusion”
- Vague claims: “The author discusses power” / “Society is complex”
- Generic study questions: “What is the main idea of chapter 1?”
- Paraphrased “verbatim” quotes
- Empty stress tests that restate the thesis without downstream consequences
- One-line “claims” with no mechanism, evidence, or stakes
- Padding: “seminal,” “must-read,” “in today’s world,” “comprehensive overview”
- Forcing a lens that has no honest contact with the source

### Quality bar for claims

Prefer: *“The author argues that X because Y (evidence/move Z), which implies W; this depends on assumption A.”*  
Reject: *“The author covers X.”*

Every top-level claim in §2 should be falsifiable or disagreeable — something a critic could attack.
Under each top-level claim, include **prose** (not only nested bullets): how the argument works, what supports it, and what it rules out.

### Output structure (mandatory)

\`\`\`markdown
# [Full title of the work]

## 1. Title + Bibliographic Note
- **Title:** …
- **Author(s):** … (if known; else “Unknown / not extractable”)
- **Year / Edition / Source cues:** …
- **Genre / form:** …
- **Length signal:** ~N pages / chapters if known
- **Extraction confidence:** High | Medium | Low — text quality / OCR caveats
- **One-sentence thesis:** specific central argument (not a topic)
- **Condensed-reading aim:** one sentence on what this deep-skim is trying to preserve from the full work
- **Scope note:** what regions of the source this reading covers best / thinnest

## 2. Hierarchical Outline + Core Claims
This section is the **primary condensed reading**. It must be long, specific, and argumentative.

For **each** top-level claim use this block form:

### I. [Full claim sentence — “The author argues that…”]
**Stakes:** why this claim matters inside the work  
**How the argument works:** 1–3 short paragraphs reconstructing the move (mechanism, not vibes)  
**Supporting moves**
- **I.a** …
- **I.b** …
**Evidence / anchors:** examples, cases, data, authorities, or textual pivots (as present)  
**Limits / dependencies:** assumptions, scope conditions, what is deferred  

Include enough top-level claims to cover the spine of the whole work (see depth target). Walk the book’s order when possible (opening framing → development → late turns / conclusions).

## 3. Verbatim High-Signal Passages
Select many underline-worthy sentences/paragraphs (see depth target count). For each:

> “verbatim passage…”

- **Why it matters:** 2–4 sentences on argumentative work (not “this is important”)
- **Location cue:** chapter/section/page if available, else mid-text / unknown
- **Links to claims:** which §2 claim(s) this supports or complicates

## 4. Mental Models & Diagrammatic Structure
For each model (see depth target):
- **Name / label:** …
- **Nodes / elements:** …
- **Relations / dynamics:** …
- **What it is used to explain:** …
- **How to redraw from memory:** step list
- **Figure reference:** if any (e.g. “Figure p.12”)
- **Failure modes:** how the model is abused or breaks in the text (if discussed)

If no explicit diagrams, reconstruct the **implicit** conceptual map in the same detail.

## 5. Active-Recall Questions
Provide many precise questions (see depth target). Format:

**Q[n].** [question — mechanism / contrast / implication / boundary]  
**A[n].** [model answer: short paragraph, grounded, teachable]

Mix question types. Ban “What is this book about?” and pure vocab quizzes unless load-bearing.

## 6. Connections to Existing Knowledge
Personalization **seeds** — do not invent the reader’s biography.
Prefer hooks toward the **active research lenses** the reader configured (Settings). Current set:

${lensBlock}
${focusBlock}

For each hook:
- **Hook:** … (use a lens name or a tight composite of 1–2 lenses when they honestly connect)
- **Tension or resonance:** concrete (what in *this* text confirms/complicates/contradicts)
- **Open question for the reader:** …

Skip lenses with no real contact. You may add **one** extra honest hook if the source strongly suggests a neighboring domain not listed — mark it *(adjacent)*.

End with:
> *Reader note: replace or extend these hooks with your own notes after review. Lenses are editable in Settings → Research lenses.*

## 7. Dual-Pressure Stress Test

### 7a. If the central claims are wrong
Multiple specific bullets: downstream failures, rival explanations, weakest links (cite claim ids when possible).

### 7b. If the central claims are correct
Multiple specific bullets: biases to renegotiate, obligations, untenable “safe” assumptions.

### 7c. Hardest fair steelman of a critic
One short paragraph: the best honest attack on the work’s center.

## 8. What Remains Unclear / Worth Full Reading
- Gaps, ambiguities, under-argued moves (specific)
- Regions that resist condensation (formalism, tables, extended cases)
- What a full read would still uniquely deliver
- Explicit recommendation: **Archive** | **Star / keep skim** | **Promote to full Reading List** — with rationale (2–4 sentences). Star = condensed notes are enough to keep; Reading List = the source PDF is worth full attention.
- If the work is very long (~350+ pages), add a short **multi-week strategy** (Week 1 pages a–b, Week 2 …) as an optional plan

## 9. Core Reading Segments (source long-reads)
**Mandatory.** Recommend concrete **page ranges** the reader should still read in the original PDF — the “long-read layer” beside these notes.

For each segment (usually **1–3** for a short work; **2–5** for a long book):

### Segment [n]: [short title]
- **Pages:** START–END   (use integers only; ranges ideally **4–15 pages** each, never vague)
- **Core message:** what this band carries that notes cannot fully replace
- **Links to claims:** which §2 claims this grounds
- **Read mode:** slow / once / annotate — one line

Rules for §9:
- Prefer **contiguous page bands** tied to the core thesis, key mechanism, or decisive case — not random highlights.
- Ranges must be real pages when page cues exist in the source; otherwise use best-effort from chapter markers and say so.
- These ranges will be **auto-extracted** from the local PDF text layer into a long-read appendix — pick bands worth sitting with.

### Diagram / flow notation (important for PDF export)
When drawing mental models or logic flows in §4 (or elsewhere):
- Prefer **ASCII arrows**: \`->\` \`=>\` \`<-\` \`<->\` (not Unicode → ⇒ which often break in PDF fonts)
- Put multi-line flows in a fenced code block:

\`\`\`
Input -> Process -> Output
         |
         v
      Feedback
\`\`\`

- Do not rely on special Unicode box-drawing if you can use plain \`|\` \`-\` \`+\` \`>\`.
\`\`\`

### Voice

Calm, precise, slightly severe. Prefer short paragraphs and sharp bullets — but **enough of them** to carry a real reading. Never moralize. Never pad with praise. Never collapse into abstract summary voice.`;
}

/** Default system prompt (ship lenses) — prefer buildSystemPrompt(settings) at runtime. */
export const SYSTEM_PROMPT = buildSystemPrompt({});

/**
 * Build the user message for a (single-shot) deep-skim request.
 */
export function buildUserPrompt({
  meta,
  text,
  figures = [],
  truncated = false,
  depth = null,
  sourceChars = 0,
  scopeBrief = '',
  settings = null,
}) {
  const d =
    depth ||
    estimateDepth({
      pageCount: meta.pageCount,
      sourceChars: sourceChars || (text || '').length,
    });

  const figureBlock =
    figures.length === 0
      ? '(No figure captions provided.)'
      : figures
          .map(
            (f, i) =>
              `- Figure ${i + 1}${f.page != null ? ` (p.${f.page})` : ''}: ${f.caption || f.note || 'image'}`
          )
          .join('\n');

  const profile = settings ? readerProfileBrief(settings) + '\n\n' : '';

  return `Produce a **substantial condensed reading** (structured deep-skim) for the following source.

${scopeBrief ? scopeBrief + '\n\n' : ''}${profile}${depthBriefMarkdown(d)}

## Document metadata
- Filename: ${meta.filename || 'unknown'}
- Title hint: ${meta.title || 'unknown'}
- Page count: ${meta.pageCount ?? 'unknown'}
- Extraction method: ${meta.method || 'native'}
- Extraction quality: ${meta.quality || 'unknown'}
- Text truncated for model context: ${truncated ? 'YES — prioritize framing, conclusions, dense argument; note gaps in §1 and §8; still hit substance targets on what you have' : 'no'}

## Figure / image notes
${figureBlock}

## Extracted text
---
${text}
---

## Pre-flight checklist (do all)
1. Exact §1–§9 headings (include Core Reading Segments with real page ranges)
2. §2 is a real reading (claim blocks with stakes / mechanism / supports / limits) — not a thin outline
3. Verbatim count and recall count meet the depth table
4. §9 page ranges are concrete integers (e.g. 12–19), sized for a genuine sit-down long-read
5. Flow diagrams use ASCII \`->\` inside fenced code blocks
6. §6 hooks follow the reader research lenses (honest connections only)
7. No abstract “the author discusses…” voice
8. Markdown only — no preamble, no closing chat

Begin the condensed reading now. Aim for the target length; short abstract output fails.`;
}

/**
 * User prompt for a staged write part (A/B/C).
 */
export function buildStagedPartPrompt({
  part, // 'A' | 'B' | 'C'
  meta,
  depth,
  materialLabel,
  material,
  priorParts = '',
  scopeBrief = '',
  settings = null,
}) {
  const d = depth;
  const profile = settings ? readerProfileBrief(settings) + '\n\n' : '';
  const common = `${scopeBrief ? scopeBrief + '\n\n' : ''}${profile}${depthBriefMarkdown(d)}

## Document metadata
- Title hint: ${meta.title || 'unknown'}
- Filename: ${meta.filename || 'unknown'}
- Page count: ${meta.pageCount ?? 'unknown'}
- Extraction: ${meta.method || 'native'} / ${meta.quality || 'unknown'}

## Source material (${materialLabel})
${material}
`;

  if (part === 'A') {
    return `Write **Part A only** of a substantial condensed reading: title heading + §1 + §2.

${common}

${priorParts ? `## Notes from earlier stages\n${priorParts}\n` : ''}

## Part A requirements
- Start with \`# [Full title]\`
- Include \`## 1. Title + Bibliographic Note\` (all fields)
- Include \`## 2. Hierarchical Outline + Core Claims\` as the **bulk reading**
- Top-level claims: **${d.topClaimsMin}–${d.topClaimsMax}**
- Each claim uses the full block form (Stakes / How the argument works / Supporting moves / Evidence / Limits)
- **~${d.wordsPerClaimMin}–${d.wordsPerClaimMax} words of prose per top-level claim**
- Cover early → late spine of the work using the material
- Light relevance bias toward the reader’s research lenses is fine; source fidelity first
- Markdown only. Stop after §2. No §3–§8 yet.`;
  }

  if (part === 'B') {
    return `Write **Part B only**: §3 Verbatim High-Signal Passages + §4 Mental Models.

${common}

## Part A already written (do not repeat; stay consistent)
${priorParts}

## Part B requirements
- Output **only**:
  \`## 3. Verbatim High-Signal Passages\`
  \`## 4. Mental Models & Diagrammatic Structure\`
- Verbatim passages: **${d.verbatimMin}–${d.verbatimMax}**, exact quotes from material/maps when possible
- Each quote: why (2–4 sentences) + location + links to §2 claims
- Mental models: **${d.modelsMin}–${d.modelsMax}**, fully specified (incl. redraw steps + failure modes)
- No abstract filler. Markdown only.`;
  }

  // Part C
  const { lenses } = resolvePersonalization(settings || {});
  const lensHint = formatLensesBullets(lenses);
  return `Write **Part C only**: §5–§9 of the condensed reading.

${common}

## Parts A+B already written (stay consistent; do not repeat them)
${priorParts}

## Part C requirements
- Output **only**:
  \`## 5. Active-Recall Questions\`
  \`## 6. Connections to Existing Knowledge\`
  \`## 7. Dual-Pressure Stress Test\` (include 7a, 7b, 7c)
  \`## 8. What Remains Unclear / Worth Full Reading\`
  \`## 9. Core Reading Segments (source long-reads)\`
- Recall: **${d.recallMin}–${d.recallMax}** Q/A with **paragraph-length model answers**
- Hooks: **${d.hooksMin}–${d.hooksMax}** with real tensions, drawn primarily from these reader lenses:
${lensHint}
- Stress test: specific, multi-bullet, claim-aware
- §8: specific gaps + recommendation with 2–4 sentence rationale; multi-week plan if work is huge
- §9: **1–5 concrete page ranges** (e.g. Pages: 14–22) for core long-reads the reader should still sit with
- Markdown only.`;
}

/** Section anchors used by the UI collapsible parser */
export const SECTION_HEADINGS = [
  { id: 'biblio', pattern: /^##\s*1\.\s*Title/i, title: 'Title + Bibliographic Note' },
  { id: 'claims', pattern: /^##\s*2\.\s*Hierarchical Outline/i, title: 'Hierarchical Outline + Core Claims' },
  {
    id: 'passages',
    pattern: /^##\s*3\.\s*4–6 Verbatim|^##\s*3\.\s*4-6 Verbatim|^##\s*3\.\s*Verbatim/i,
    title: 'Verbatim High-Signal Passages',
  },
  { id: 'models', pattern: /^##\s*4\.\s*Mental Models/i, title: 'Mental Models & Diagrammatic Structure' },
  { id: 'recall', pattern: /^##\s*5\.\s*Active-Recall/i, title: 'Active-Recall Questions' },
  { id: 'connections', pattern: /^##\s*6\.\s*Connections/i, title: 'Connections to Existing Knowledge' },
  { id: 'stress', pattern: /^##\s*7\.\s*Dual-Pressure/i, title: 'Dual-Pressure Stress Test' },
  { id: 'unclear', pattern: /^##\s*8\.\s*What Remains/i, title: 'What Remains Unclear / Worth Full Reading' },
  {
    id: 'core-reads',
    pattern: /^##\s*9\.\s*Core Reading|^##\s*9\.\s*Core Source|^##\s*Long-read extracts/i,
    title: 'Core Reading Segments / Long-reads',
  },
  {
    id: 'long-extracts',
    pattern: /^##\s*Long-read extracts from source/i,
    title: 'Long-read extracts from source',
  },
];

export { estimateDepth, depthBriefMarkdown } from './depth.js';
