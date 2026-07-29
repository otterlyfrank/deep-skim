/**
 * PDF text extraction pipeline.
 * Primary: pdf.js native text layer.
 * Fallback (preferred): cloud vision OCR via Gemini API key (no local bridge).
 * Optional advanced: local Unlimited/DeepSeek OCR bridge.
 */

import { assessDocumentQuality, findDiagramHeavyPages } from './quality.js';
import { checkOcrBridge, ocrPdfViaBridge, ocrPagesViaBridge } from './ocr-bridge.js';
import { canUseCloudOcr, ocrPdfPagesViaCloud, ocrPagesViaCloud } from './cloud-ocr.js';

/** Prefer vendored copy under public/pdfjs for offline / PWA; CDN fallback. */
const PDFJS_LOCAL = new URL('../../public/pdfjs/pdf.min.mjs', import.meta.url).href;
const PDFJS_WORKER_LOCAL = new URL('../../public/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const PDFJS_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

/** @type {any} */
let pdfjsLib = null;

async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  try {
    pdfjsLib = await import(/* @vite-ignore */ PDFJS_LOCAL);
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_LOCAL;
  } catch (err) {
    console.warn('[Deep-Skim] local pdf.js missing — using CDN', err?.message || err);
    pdfjsLib = await import(/* @vite-ignore */ PDFJS_CDN);
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
  }
  return pdfjsLib;
}

function yieldToMain() {
  return new Promise((r) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => r());
    else setTimeout(r, 0);
  });
}

/**
 * Load a PDF document from ArrayBuffer.
 */
export async function loadPdf(arrayBuffer) {
  const pdfjs = await loadPdfJs();
  const data = arrayBuffer instanceof ArrayBuffer ? new Uint8Array(arrayBuffer) : arrayBuffer;
  return pdfjs.getDocument({ data, useSystemFonts: true }).promise;
}

/**
 * Extract native text layer from all pages.
 */
export async function extractNativeText(pdf, { onProgress } = {}) {
  const pageTexts = [];
  const numPages = pdf.numPages;

  for (let i = 1; i <= numPages; i++) {
    onProgress?.({
      stage: 'native',
      message: `Extracting text layer… page ${i}/${numPages}`,
      percent: Math.round(((i - 1) / numPages) * 100),
    });
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = rebuildReadingOrder(content);
    pageTexts.push(text);
    if (i % 4 === 0) await yieldToMain();
  }

  onProgress?.({ stage: 'native', message: 'Native extraction complete', percent: 100 });
  return pageTexts;
}

/**
 * Rebuild approximate reading order from pdf.js text items.
 * Groups by Y-position (lines), then sorts by X within line.
 */
function rebuildReadingOrder(textContent) {
  const items = (textContent.items || []).filter((it) => it.str != null && it.str.length);
  if (!items.length) return '';

  // transform: [scaleX, skewY, skewX, scaleY, tx, ty]
  const enriched = items.map((it) => {
    const t = it.transform || [1, 0, 0, 1, 0, 0];
    return {
      str: it.str,
      x: t[4],
      y: t[5],
      h: Math.abs(t[3]) || it.height || 10,
      hasEOL: !!it.hasEOL,
    };
  });

  // Sort top-to-bottom (pdf y increases upward), then left-to-right
  enriched.sort((a, b) => {
    const yTol = Math.max(a.h, b.h) * 0.5;
    if (Math.abs(a.y - b.y) > yTol) return b.y - a.y;
    return a.x - b.x;
  });

  const lines = [];
  let current = [];
  let lastY = null;
  let lastH = 12;

  for (const it of enriched) {
    if (lastY == null) {
      current.push(it);
      lastY = it.y;
      lastH = it.h;
      continue;
    }
    const yTol = Math.max(lastH, it.h) * 0.55;
    if (Math.abs(it.y - lastY) > yTol) {
      lines.push(joinLine(current));
      current = [it];
    } else {
      current.push(it);
    }
    lastY = it.y;
    lastH = it.h;
    if (it.hasEOL) {
      lines.push(joinLine(current));
      current = [];
      lastY = null;
    }
  }
  if (current.length) lines.push(joinLine(current));

  return lines.filter(Boolean).join('\n');
}

function joinLine(items) {
  if (!items.length) return '';
  let out = items[0].str;
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const cur = items[i];
    const gap = cur.x - (prev.x + (prev.str.length * (prev.h * 0.45)));
    // crude space insertion when items are separated
    if (gap > prev.h * 0.15 || (!prev.str.endsWith(' ') && !cur.str.startsWith(' '))) {
      // only add space if neither side has whitespace at boundary
      if (!/\s$/.test(out) && !/^\s/.test(cur.str)) out += ' ';
    }
    out += cur.str;
  }
  return out.replace(/[ \t]+/g, ' ').trim();
}

/**
 * Render a page to PNG blob (for figure capture / selective OCR).
 */
export async function renderPageToBlob(pdf, pageNumber, { scale = 1.5 } = {}) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

/**
 * Sample key pages as figures (cover + sparse mid-doc pages with low text).
 */
export async function extractKeyFigures(pdf, pageScores, { maxFigures = 6, onProgress } = {}) {
  const candidates = new Set([0]); // cover / first page
  const diagramPages = findDiagramHeavyPages(pageScores);
  for (const p of diagramPages.slice(0, maxFigures - 1)) candidates.add(p);
  // midpoint page
  if (pdf.numPages > 4) candidates.add(Math.floor(pdf.numPages / 2));

  const figures = [];
  const list = [...candidates].sort((a, b) => a - b).slice(0, maxFigures);
  for (let i = 0; i < list.length; i++) {
    const pageIndex = list[i];
    onProgress?.({
      stage: 'figures',
      message: `Capturing figure page ${pageIndex + 1}…`,
      percent: Math.round((i / list.length) * 100),
    });
    try {
      const blob = await renderPageToBlob(pdf, pageIndex + 1, { scale: 1.25 });
      figures.push({
        figureId: `p${pageIndex + 1}`,
        page: pageIndex + 1,
        caption: `Page ${pageIndex + 1} render`,
        blob,
      });
    } catch {
      // non-fatal
    }
  }
  return figures;
}

/**
 * Full extraction pipeline with quality-gated OCR fallback.
 */
export async function extractDocument(arrayBuffer, {
  filename = 'document.pdf',
  settings = {},
  forceOcr = false,
  onProgress,
} = {}) {
  onProgress?.({ stage: 'load', message: 'Loading PDF…', percent: 0 });
  const pdf = await loadPdf(arrayBuffer);
  const pageCount = pdf.numPages;

  // Meta from PDF info dictionary
  let title = filename.replace(/\.pdf$/i, '');
  try {
    const info = await pdf.getMetadata();
    if (info?.info?.Title) title = info.info.Title;
  } catch {
    /* ignore */
  }

  onProgress?.({ stage: 'native', message: 'Extracting native text layer…', percent: 5 });
  const nativePages = await extractNativeText(pdf, { onProgress });
  const assessment = assessDocumentQuality(nativePages);

  let pageTexts = nativePages;
  let method = 'native';
  let markdown = pagesToMarkdown(nativePages);
  let ocrFigures = [];
  /** @type {{ pagesOcrd?: number, totalPages?: number } | null} */
  let ocrSample = null;

  const ocrUrl = settings.ocrBridgeUrl;
  const ocrProvider = settings.ocrProvider || 'auto';
  // auto | gemini | local | none  (unlimited-ocr / deepseek-ocr map to local)
  const shouldOcr =
    forceOcr ||
    (assessment.needsOcr && ocrProvider !== 'none');

  /** @type {boolean} */
  let ocrAttempted = false;

  if (shouldOcr) {
    const preferLocal =
      ocrProvider === 'local' ||
      ocrProvider === 'unlimited-ocr' ||
      ocrProvider === 'deepseek-ocr';
    const preferCloud =
      ocrProvider === 'gemini' ||
      ocrProvider === 'cloud' ||
      ocrProvider === 'auto';

    // 1) Cloud Gemini vision (default for auto) — no localhost setup
    const tryCloud = preferCloud && canUseCloudOcr(settings) && !preferLocal;
    // 2) Local bridge only if explicit local provider, or auto after cloud unavailable
    const tryLocal =
      preferLocal ||
      (ocrProvider === 'auto' && !tryCloud) ||
      (ocrProvider === 'auto' && tryCloud === false);

    let done = false;

    if (tryCloud) {
      ocrAttempted = true;
      try {
        const fullOcr = forceOcr || assessment.quality === 'low';
        if (fullOcr) {
          onProgress?.({
            stage: 'ocr',
            message: 'Cloud OCR via Gemini (no local bridge)…',
            percent: 38,
          });
          const result = await ocrPdfPagesViaCloud(pdf, settings, {
            onProgress,
            renderPageToBlob,
            scale: 1.55,
          });
          if (result.markdown && result.markdown.trim().length > 20) {
            markdown = result.markdown;
            pageTexts = result.pageTexts;
            method = result.method || 'gemini-vision';
            ocrSample = {
              pagesOcrd: result.pagesOcrd,
              totalPages: result.totalPages,
            };
            if (result.pagesOcrd < result.totalPages) {
              onProgress?.({
                stage: 'ocr',
                message: `Cloud OCR sampled ${result.pagesOcrd} of ${result.totalPages} pages (free-tier cap)`,
                percent: 70,
              });
            }
            done = true;
          }
        } else if (assessment.quality === 'medium') {
          const weak = findDiagramHeavyPages(assessment.pageScores);
          if (weak.length) {
            onProgress?.({
              stage: 'ocr',
              message: 'Cloud OCR on weak pages (Gemini)…',
              percent: 42,
            });
            const pageBlobs = [];
            for (const idx of weak.slice(0, Math.min(24, weak.length))) {
              const blob = await renderPageToBlob(pdf, idx + 1, { scale: 1.65 });
              pageBlobs.push({ pageIndex: idx, blob });
            }
            const ocrPages = await ocrPagesViaCloud(pageBlobs, settings, { onProgress });
            const merged = [...nativePages];
            for (const op of ocrPages) {
              if (op.markdown && op.markdown.trim().length > (merged[op.pageIndex] || '').length) {
                merged[op.pageIndex] = op.markdown;
              }
            }
            pageTexts = merged;
            markdown = pagesToMarkdown(merged);
            method = 'hybrid-gemini';
            done = true;
          }
        }
      } catch (err) {
        console.warn('Cloud OCR failed:', err);
        onProgress?.({
          stage: 'ocr',
          message: `Cloud OCR failed (${err.message}); trying other options…`,
          percent: 55,
        });
      }
    }

    // Optional local bridge (advanced / offline vision models)
    if (!done && (preferLocal || ocrProvider === 'auto') && ocrUrl) {
      const ocrToken = settings.ocrBridgeToken || '';
      const health = await checkOcrBridge(ocrUrl, { token: ocrToken });
      if (health.ok) {
        ocrAttempted = true;
        try {
          const fullOcr = forceOcr || assessment.quality === 'low';
          if (fullOcr) {
            onProgress?.({ stage: 'ocr', message: 'Local OCR bridge…', percent: 40 });
            const provider =
              ocrProvider === 'auto' || ocrProvider === 'local'
                ? 'unlimited-ocr'
                : ocrProvider;
            const result = await ocrPdfViaBridge(ocrUrl, arrayBuffer, {
              provider,
              filename,
              onProgress,
              token: ocrToken,
            });
            if (result.markdown && result.markdown.trim().length > markdown.trim().length * 0.5) {
              markdown = result.markdown;
              pageTexts = result.pageMarkdowns.length
                ? result.pageMarkdowns
                : markdown.split(/\n(?=<!--\s*page)/i);
              method = result.method || provider;
              ocrFigures = result.figures || [];
              done = true;
            }
          } else if (assessment.quality === 'medium') {
            const weak = findDiagramHeavyPages(assessment.pageScores);
            if (weak.length) {
              onProgress?.({ stage: 'ocr', message: 'Local selective OCR…', percent: 45 });
              const pageBlobs = [];
              for (const idx of weak.slice(0, 20)) {
                const blob = await renderPageToBlob(pdf, idx + 1, { scale: 1.75 });
                pageBlobs.push({ pageIndex: idx, blob });
              }
              const provider =
                ocrProvider === 'auto' || ocrProvider === 'local'
                  ? 'deepseek-ocr'
                  : ocrProvider;
              const ocrPages = await ocrPagesViaBridge(ocrUrl, pageBlobs, {
                provider,
                onProgress,
                token: ocrToken,
              });
              const merged = [...nativePages];
              for (const op of ocrPages) {
                if (
                  op.markdown &&
                  op.markdown.trim().length > (merged[op.pageIndex] || '').length
                ) {
                  merged[op.pageIndex] = op.markdown;
                }
              }
              pageTexts = merged;
              markdown = pagesToMarkdown(merged);
              method = 'hybrid-local';
              done = true;
            }
          }
        } catch (err) {
          console.warn('OCR bridge failed, keeping native extraction:', err);
          onProgress?.({
            stage: 'ocr',
            message: `Local OCR failed (${err.message}); using native text`,
            percent: 70,
          });
        }
      }
    }

    if (!done && shouldOcr) {
      const why = !canUseCloudOcr(settings)
        ? 'add Gemini API key in Settings for cloud OCR'
        : 'using native text';
      onProgress?.({
        stage: 'ocr',
        message: `OCR skipped or unavailable — ${why}`,
        percent: 70,
      });
    }
  }

  // Re-assess after possible OCR
  const finalAssessment =
    method === 'native' ? assessment : assessDocumentQuality(pageTexts);

  onProgress?.({ stage: 'figures', message: 'Capturing key figures…', percent: 85 });
  const figures = await extractKeyFigures(pdf, finalAssessment.pageScores, {
    maxFigures: 6,
    onProgress,
  });

  // Merge OCR-reported figures metadata
  for (const f of ocrFigures) {
    figures.push({
      figureId: f.id || f.figureId || `ocr-${figures.length}`,
      page: f.page,
      caption: f.caption || f.note || 'OCR figure',
      blob: null,
    });
  }

  onProgress?.({ stage: 'done', message: 'Extraction complete', percent: 100 });

  return {
    title,
    pageCount,
    pageTexts,
    text: pageTexts.join('\n\n'),
    markdown,
    method,
    quality: finalAssessment.quality,
    qualityScore: finalAssessment.qualityScore,
    stats: {
      ...(finalAssessment.stats || {}),
      ...(ocrSample
        ? {
            ocrPagesSampled: ocrSample.pagesOcrd,
            ocrPagesTotal: ocrSample.totalPages,
            ocrSampleNote:
              ocrSample.pagesOcrd < ocrSample.totalPages
                ? `Cloud OCR sampled ${ocrSample.pagesOcrd} of ${ocrSample.totalPages} pages (Settings → cloud OCR max pages)`
                : null,
          }
        : {}),
    },
    figures: figures.map(({ figureId, page, caption }) => ({ figureId, page, caption })),
    figureBlobs: figures.filter((f) => f.blob),
    needsOcr: assessment.needsOcr,
    ocrAttempted,
  };
}

function pagesToMarkdown(pageTexts) {
  return pageTexts
    .map((t, i) => `<!-- page ${i + 1} -->\n\n${(t || '').trim()}`)
    .join('\n\n---\n\n');
}

export { loadPdfJs, checkOcrBridge };
