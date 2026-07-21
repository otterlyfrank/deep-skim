/**
 * Heuristics for native PDF text-layer quality.
 * Decide whether OCR fallback is warranted.
 */

const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
const GARBAGE_RE = /[�]|[\uFFFD]/g;
// Common mojibake / broken encoding patterns
const MOJIBAKE_RE = /Ã.|Â.|â€™|â€œ|â€/g;

/**
 * Score a single page's extracted text.
 * @returns {{ score: number, chars: number, words: number, issues: string[] }}
 */
export function scorePageText(text, pageIndex = 0) {
  const raw = text || '';
  const chars = raw.length;
  const words = raw.trim() ? raw.trim().split(/\s+/).length : 0;
  const issues = [];
  let score = 1;

  if (chars < 40) {
    score -= 0.55;
    issues.push('very_short');
  } else if (chars < 120) {
    score -= 0.25;
    issues.push('short');
  }

  const controlHits = (raw.match(CONTROL_RE) || []).length;
  if (controlHits > 3) {
    score -= 0.3;
    issues.push('control_chars');
  }

  const garbageHits = (raw.match(GARBAGE_RE) || []).length;
  if (garbageHits > 0) {
    score -= Math.min(0.4, garbageHits * 0.05);
    issues.push('replacement_chars');
  }

  const mojibake = (raw.match(MOJIBAKE_RE) || []).length;
  if (mojibake > 5) {
    score -= 0.25;
    issues.push('mojibake');
  }

  // High symbol ratio often means broken encoding or vector-only extraction junk
  const letters = (raw.match(/[A-Za-z\u00C0-\u024F]/g) || []).length;
  const letterRatio = chars ? letters / chars : 0;
  if (chars > 80 && letterRatio < 0.35) {
    score -= 0.35;
    issues.push('low_letter_ratio');
  }

  // Repeated single-character lines (common in bad extractions)
  const lines = raw.split(/\n/).filter(Boolean);
  const singleCharLines = lines.filter((l) => l.trim().length === 1).length;
  if (lines.length > 10 && singleCharLines / lines.length > 0.4) {
    score -= 0.3;
    issues.push('fragmented_lines');
  }

  return {
    pageIndex,
    score: Math.max(0, Math.min(1, score)),
    chars,
    words,
    issues,
  };
}

/**
 * Aggregate document quality from page scores.
 * @returns {{ quality: 'high'|'medium'|'low', qualityScore: number, needsOcr: boolean, pageScores: object[], stats: object }}
 */
export function assessDocumentQuality(pageTexts) {
  const pageScores = pageTexts.map((t, i) => scorePageText(t, i));
  const n = pageScores.length || 1;
  const avg = pageScores.reduce((s, p) => s + p.score, 0) / n;
  const totalChars = pageScores.reduce((s, p) => s + p.chars, 0);
  const emptyPages = pageScores.filter((p) => p.chars < 40).length;
  const emptyRatio = emptyPages / n;

  let quality = 'high';
  if (avg < 0.45 || emptyRatio > 0.5 || totalChars < 200) quality = 'low';
  else if (avg < 0.72 || emptyRatio > 0.25) quality = 'medium';

  const needsOcr = quality === 'low' || (quality === 'medium' && emptyRatio > 0.2);

  return {
    quality,
    qualityScore: Math.round(avg * 1000) / 1000,
    needsOcr,
    pageScores,
    stats: {
      pages: n,
      totalChars,
      emptyPages,
      emptyRatio: Math.round(emptyRatio * 1000) / 1000,
      avgScore: Math.round(avg * 1000) / 1000,
    },
  };
}

/**
 * Detect pages that look chart/diagram heavy (low text, may need DeepSeek-OCR).
 */
export function findDiagramHeavyPages(pageScores, thresholdChars = 180) {
  return pageScores
    .filter((p) => p.chars < thresholdChars || p.issues.includes('low_letter_ratio'))
    .map((p) => p.pageIndex);
}
