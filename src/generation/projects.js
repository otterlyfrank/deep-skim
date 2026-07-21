/**
 * Multi-week project planning — split long books into weekly page bands
 * so generation only spends tokens on the active week.
 */

/**
 * Build a multi-week plan.
 * @param {{ pageCount?: number, sourceChars?: number, pagesPerWeek?: number, maxWeeks?: number, force?: boolean }} opts
 */
export function planMultiWeekProject({
  pageCount = 0,
  sourceChars = 0,
  pagesPerWeek = 200,
  maxWeeks = 8,
  force = false,
} = {}) {
  const pages =
    pageCount > 0 ? Number(pageCount) : Math.max(1, Math.round((sourceChars || 0) / 2000));

  // Default: only auto-recommend at 200+ pages (token savings worth the process)
  if (!force && pages < 200) {
    return null;
  }

  const ppw = Math.max(80, Math.min(400, pagesPerWeek || 200));
  let weeks = Math.ceil(pages / ppw);
  weeks = Math.min(maxWeeks, Math.max(2, weeks));
  // If forcing a short book into multi-week, still at least 2 bands
  if (force && pages < 200) {
    weeks = Math.min(3, Math.max(2, Math.ceil(pages / Math.max(60, Math.floor(pages / 2)))));
  }

  const band = Math.ceil(pages / weeks);
  const plan = [];
  for (let w = 1; w <= weeks; w++) {
    const start = (w - 1) * band + 1;
    const end = w === weeks ? pages : Math.min(pages, w * band);
    plan.push({
      week: w,
      start,
      end,
      pageCount: end - start + 1,
      status: 'pending', // pending | ready | done | skipped
      summaryId: null,
      focus: weekFocus(w, weeks),
      completedAt: null,
    });
  }

  return {
    pages,
    weeks,
    pagesPerWeek: ppw,
    plan,
    /** Final synthesis after all weeks */
    synthesis: {
      status: 'locked', // locked | ready | done
      summaryId: null,
    },
  };
}

function weekFocus(w, total) {
  if (w === 1) return 'Framing, method, early claims — establish the spine';
  if (w === total) return 'Late turns, conclusions, stress test + core long-reads for this band';
  if (w === total - 1 && total >= 4) return 'Late development — cases, complications, rival moves';
  return 'Development band — mechanisms, evidence, mid-book models';
}

/**
 * Extract full text for a page range (for week-scoped generation).
 * Higher cap than long-read UI appendix — this IS the generation source.
 */
export function extractWeekSource(sourceText, startPage, endPage, { maxChars = 400_000 } = {}) {
  const text = sourceText || '';
  const re = /<!--\s*page\s+(\d+)\s*-->/gi;
  const indices = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    indices.push({ page: Number(m[1]), index: m.index, markerLen: m[0].length });
  }

  const lo = Math.min(startPage, endPage);
  const hi = Math.max(startPage, endPage);

  if (!indices.length) {
    // No markers: slice by proportion of full text
    const total = Math.max(1, hi); // assume end page ≈ total if unknown
    const startRatio = (lo - 1) / total;
    const endRatio = hi / total;
    const a = Math.floor(text.length * startRatio);
    const b = Math.ceil(text.length * endRatio);
    let slice = text.slice(a, b);
    if (slice.length > maxChars) slice = slice.slice(0, maxChars);
    return {
      text: slice,
      found: !!slice.trim(),
      mode: 'proportional',
      note: 'No page markers — used proportional text slice. Re-extract PDF for accurate page bands.',
      start: lo,
      end: hi,
      charCount: slice.length,
    };
  }

  const parts = [];
  for (let i = 0; i < indices.length; i++) {
    const { page, index, markerLen } = indices[i];
    if (page < lo || page > hi) continue;
    const end = i + 1 < indices.length ? indices[i + 1].index : text.length;
    const body = text.slice(index, end); // keep page marker
    if (body.trim()) parts.push(body.trim());
  }

  let joined = parts.join('\n\n');
  let truncated = false;
  if (joined.length > maxChars) {
    joined = joined.slice(0, maxChars) + '\n\n<!-- week band truncated for model context -->\n';
    truncated = true;
  }

  return {
    text: joined,
    found: parts.length > 0,
    mode: 'page-markers',
    note: parts.length
      ? null
      : `No pages ${lo}–${hi} in extraction (markers present).`,
    start: lo,
    end: hi,
    charCount: joined.length,
    truncated,
  };
}

/**
 * Prompt context for a week-scoped deep-skim.
 */
export function weekScopeBrief({ projectTitle, week, totalWeeks, start, end, focus, pages }) {
  return `### Multi-week project scope (token-saving band)

You are deep-skimming **only Week ${week} of ${totalWeeks}** of a longer work.

| Field | Value |
|-------|--------|
| Project | ${projectTitle || 'Multi-week project'} |
| Full work length | ~${pages} pages |
| **This week** | **${week} / ${totalWeeks}** |
| **Page band** | **${start}–${end}** only |
| Focus | ${focus} |

Rules for this week:
1. Treat the provided text as **the entire source for this pass** (do not invent other chapters).
2. Produce a full substantial deep-skim (§1–§9) **for this band**, noting it is a weekly installment.
3. In §1 one-sentence thesis: thesis *of this band* + how it likely sits in the whole work (mark whole-work claims as provisional).
4. §8: what next week should watch for; do not pretend this is the full monograph.
5. §9 long-read ranges must fall **inside ${start}–${end}**.
6. Title the work as: \`[Full title] — Week ${week}/${totalWeeks} (pp. ${start}–${end})\``;
}

/**
 * Synthesis prompt material from completed week summaries.
 */
export function buildSynthesisMaterial(weekSummaries) {
  return weekSummaries
    .map(
      (w, i) =>
        `### Week ${w.week} (pp. ${w.start}–${w.end}) — ${w.focus || ''}\n\n${w.markdown || '(missing)'}`
    )
    .join('\n\n---\n\n');
}

export function synthesisScopeBrief({ projectTitle, pages, weeks }) {
  return `### Multi-week synthesis pass

You are merging **${weeks} weekly deep-skims** of one long work (~${pages} pages) into a single substantial whole-work condensed reading.

Project: ${projectTitle || 'Multi-week project'}

Rules:
1. Source material is the **weekly skims below** (already condensed). Do not invent unread pages.
2. Produce full §1–§9 for the **whole work**, reconciling contradictions across weeks.
3. Prefer claims that survive across bands; flag week-local claims.
4. §9: list the best long-read page bands mentioned across weeks (dedupe).
5. Title: \`[Full title] — Full synthesis (${weeks} weeks)\``;
}

/** Threshold helpers for UI */
export function projectEligibility({ pageCount, sourceChars }) {
  const pages =
    pageCount > 0 ? pageCount : Math.max(0, Math.round((sourceChars || 0) / 2000));
  if (pages >= 350) return { eligible: true, recommended: true, pages, reason: 'Long work — multi-week saves tokens and deepens coverage.' };
  if (pages >= 200) return { eligible: true, recommended: true, pages, reason: 'Good candidate for multi-week (token-efficient weekly bands).' };
  if (pages >= 120) return { eligible: true, recommended: false, pages, reason: 'Optional multi-week if you want slower pacing.' };
  return { eligible: false, recommended: false, pages, reason: 'Short enough for a single deep-skim.' };
}
