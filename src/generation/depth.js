/**
 * Scale deep-skim substance to source size.
 * Target: ~200pp book → 10–20 page read; ~500pp → 25–50 page read.
 *
 * “Page” here ≈ ~350 words of dense reading notes (~2.2k characters).
 */

/**
 * @param {{ pageCount?: number|null, sourceChars?: number }} input
 */
export function estimateDepth({ pageCount = null, sourceChars = 0 } = {}) {
  const pages =
    pageCount && pageCount > 0
      ? Number(pageCount)
      : // rough: ~1800–2200 chars extractable text per PDF page
        Math.max(1, Math.round((sourceChars || 0) / 2000));

  // Target condensed-reading pages (user-facing scale)
  let targetPagesMin;
  let targetPagesMax;
  if (pages <= 40) {
    targetPagesMin = 4;
    targetPagesMax = 8;
  } else if (pages <= 120) {
    targetPagesMin = 8;
    targetPagesMax = 14;
  } else if (pages <= 250) {
    // ~200pp band
    targetPagesMin = 10;
    targetPagesMax = 20;
  } else if (pages <= 400) {
    targetPagesMin = 18;
    targetPagesMax = 32;
  } else {
    // ~500pp+
    targetPagesMin = 25;
    targetPagesMax = 50;
  }

  const targetPagesMid = Math.round((targetPagesMin + targetPagesMax) / 2);
  // ~350 words/page × 6 chars/word ≈ 2100 chars/page of markdown
  const targetCharsMin = targetPagesMin * 2100;
  const targetCharsMax = targetPagesMax * 2100;
  const targetWordsMin = targetPagesMin * 350;
  const targetWordsMax = targetPagesMax * 350;

  // §2 is the bulk of the “reading”
  const topClaims = pages <= 80 ? [8, 12] : pages <= 250 ? [10, 16] : [12, 20];
  const subClaimsPer = pages <= 80 ? [3, 5] : [4, 7];
  const verbatim = pages <= 80 ? [8, 12] : pages <= 250 ? [10, 16] : [12, 20];
  const models = pages <= 80 ? [3, 6] : [4, 8];
  const recallQs = pages <= 80 ? [8, 12] : [10, 14];
  const connectionHooks = [4, 7];

  // prose budget for each major claim block in §2 (words)
  const wordsPerClaimBlock = pages <= 120 ? [120, 220] : pages <= 250 ? [160, 320] : [200, 400];

  return {
    sourcePages: pages,
    targetPagesMin,
    targetPagesMax,
    targetPagesMid,
    targetCharsMin,
    targetCharsMax,
    targetWordsMin,
    targetWordsMax,
    topClaimsMin: topClaims[0],
    topClaimsMax: topClaims[1],
    subClaimsMin: subClaimsPer[0],
    subClaimsMax: subClaimsPer[1],
    verbatimMin: verbatim[0],
    verbatimMax: verbatim[1],
    modelsMin: models[0],
    modelsMax: models[1],
    recallMin: recallQs[0],
    recallMax: recallQs[1],
    hooksMin: connectionHooks[0],
    hooksMax: connectionHooks[1],
    wordsPerClaimMin: wordsPerClaimBlock[0],
    wordsPerClaimMax: wordsPerClaimBlock[1],
    /** Prefer multi-stage write when target is large */
    useStagedWrite: targetPagesMid >= 10 || pages >= 100,
    /** Optional multi-week project for very long monographs */
    multiWeekSuggested: pages >= 350,
    multiWeekLikely: pages >= 550,
    /** How many core PDF long-read bands to recommend / extract */
    coreLongReadSegments: pages <= 80 ? [1, 2] : pages <= 250 ? [2, 3] : [2, 5],
  };
}

/**
 * Injected into system/user prompts so the model hits substance targets.
 */
export function depthBriefMarkdown(depth) {
  const d = depth;
  return `### Condensed-reading depth target (mandatory)

This is **not** an abstract executive summary. It is a **substantial condensed reading** —
a structured substitute for a careful multi-hour skim that the reader can *study*.

| Signal | Target |
|--------|--------|
| Source scale | ~${d.sourcePages} pages (est.) |
| Condensed reading length | **${d.targetPagesMin}–${d.targetPagesMax} pages** of dense notes (~${d.targetWordsMin}–${d.targetWordsMax} words) |
| §2 top-level claims | **${d.topClaimsMin}–${d.topClaimsMax}** (each a real argument) |
| Sub-claims per top claim | **${d.subClaimsMin}–${d.subClaimsMax}** with mechanism / evidence / implication |
| Prose under each top claim | **${d.wordsPerClaimMin}–${d.wordsPerClaimMax} words** (short paragraphs + bullets OK) |
| Verbatim passages (§3) | **${d.verbatimMin}–${d.verbatimMax}** exact quotes with why + location |
| Mental models (§4) | **${d.modelsMin}–${d.modelsMax}** fully specified |
| Active-recall (§5) | **${d.recallMin}–${d.recallMax}** Q/A pairs with **full model answers** (not one-liners) |
| Knowledge hooks (§6) | **${d.hooksMin}–${d.hooksMax}** hooks, each with real tension (not slogans) |
| Core long-read bands (§9) | **${d.coreLongReadSegments[0]}–${d.coreLongReadSegments[1]}** concrete page ranges (4–15pp each) to sit with in the PDF |
| Multi-week plan | ${d.multiWeekSuggested ? (d.multiWeekLikely ? '**Recommended** (very long work)' : 'Optional — offer in §8') : 'Not needed at this scale'} |

**Substance rules**
- Prefer **argument reconstruction** over abstraction: premises → moves → conclusions.
- Include **distinctions, definitions, mechanisms, case evidence, and counter-moves** when present in the source.
- Name **proper terms** from the text; define once; keep using them.
- If a section is short enough to fit in a tweet, it is **too thin** — expand from the source.
- Never invent quotes or page numbers; expand with grounded paraphrase only where quotes are unavailable.`;
}
