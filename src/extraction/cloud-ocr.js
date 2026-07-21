/**
 * Cloud OCR via the same OpenAI-compatible vision chat API used for deep-skims
 * (Gemini free tier recommended — no local Unlimited/DeepSeek bridge required).
 */

import { inferProviderId } from '../generation/providers.js';

const OCR_SYSTEM = `You are a precise OCR engine for academic and book pages.
Transcribe ALL readable text on the page in reading order.
Preserve headings, paragraphs, lists, captions, and footnotes.
For diagrams/tables: describe structure briefly, then transcribe any visible labels/numbers.
Output plain text only — no markdown fences, no commentary like "here is the transcription".
If the page is blank or illegible, output [blank or illegible page].`;

/**
 * Can we run cloud OCR with current settings?
 */
export function canUseCloudOcr(settings = {}) {
  const provider = settings.ocrProvider || 'auto';
  if (provider === 'none' || provider === 'local') return false;
  if (!settings.llmApiKey?.trim()) return false;
  if (!settings.llmBaseUrl?.trim()) return false;
  // Vision works well with Gemini OpenAI-compat; other providers may work too
  return true;
}

/**
 * OCR page image blobs with a vision-capable chat model.
 * @param {{ pageIndex: number, blob: Blob }[]} pages
 * @param {object} settings
 */
export async function ocrPagesViaCloud(pages, settings, { onProgress } = {}) {
  const baseUrl = (settings.llmBaseUrl || '').replace(/\/$/, '');
  const apiKey = settings.llmApiKey || '';
  const model = settings.cloudOcrModel || settings.llmModel || 'gemini-3.5-flash';
  const maxPages = Math.min(
    pages.length,
    Number(settings.cloudOcrMaxPages) > 0 ? Number(settings.cloudOcrMaxPages) : 48
  );

  const results = [];
  const slice = pages.slice(0, maxPages);

  for (let i = 0; i < slice.length; i++) {
    const { pageIndex, blob } = slice[i];
    onProgress?.({
      stage: 'ocr',
      message: `Cloud OCR (Gemini)… page ${i + 1}/${slice.length}`,
      percent: Math.round(40 + (i / slice.length) * 40),
    });

    const dataUrl = await blobToDataUrl(blob);
    const text = await visionTranscribePage({
      baseUrl,
      apiKey,
      model,
      dataUrl,
      pageNumber: pageIndex + 1,
    });

    results.push({
      pageIndex,
      markdown: text,
      text,
    });

    // gentle free-tier pacing
    if (i < slice.length - 1) {
      await sleep(settings.cloudOcrDelayMs ?? 350);
    }
  }

  return results;
}

/**
 * Full-document path: render + OCR many pages, return markdown with page markers.
 */
export async function ocrPdfPagesViaCloud(pdf, settings, {
  onProgress,
  renderPageToBlob,
  pageIndices = null,
  scale = 1.6,
} = {}) {
  if (!renderPageToBlob) throw new Error('renderPageToBlob required');
  const n = pdf.numPages;
  let indices = pageIndices;
  if (!indices) {
    const max = Number(settings.cloudOcrMaxPages) > 0 ? Number(settings.cloudOcrMaxPages) : 48;
    if (n <= max) {
      indices = Array.from({ length: n }, (_, i) => i);
    } else {
      // Even sample + first/last for long scans
      indices = samplePageIndices(n, max);
    }
  }

  const pageBlobs = [];
  for (let k = 0; k < indices.length; k++) {
    const idx = indices[k];
    onProgress?.({
      stage: 'ocr',
      message: `Rendering page ${idx + 1} for cloud OCR…`,
      percent: Math.round((k / indices.length) * 35),
    });
    const blob = await renderPageToBlob(pdf, idx + 1, { scale });
    pageBlobs.push({ pageIndex: idx, blob });
  }

  const ocrPages = await ocrPagesViaCloud(pageBlobs, settings, { onProgress });
  const byIndex = new Map(ocrPages.map((p) => [p.pageIndex, p.markdown || '']));

  // Build full page list: OCR where we have it, else empty marker
  const pageTexts = [];
  for (let i = 0; i < n; i++) {
    if (byIndex.has(i)) {
      pageTexts.push(byIndex.get(i));
    } else {
      pageTexts.push(`[page ${i + 1} not cloud-OCR’d — sampled for free-tier limits]`);
    }
  }

  const markdown = pageTexts
    .map((t, i) => `<!-- page ${i + 1} -->\n${t || ''}`)
    .join('\n\n');

  return {
    markdown,
    pageTexts,
    method: 'gemini-vision',
    pagesOcrd: indices.length,
    totalPages: n,
  };
}

async function visionTranscribePage({ baseUrl, apiKey, model, dataUrl, pageNumber }) {
  const url = `${baseUrl}/chat/completions`;
  const headers = {
    'Content-Type': 'application/json',
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const providerId = inferProviderId(baseUrl);
  if (providerId === 'openrouter') {
    headers['HTTP-Referer'] = typeof location !== 'undefined' ? location.origin : 'http://localhost';
    headers['X-Title'] = 'Deep-Skim OCR';
  }

  const body = {
    model,
    temperature: 0.1,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: OCR_SYSTEM },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Transcribe page ${pageNumber} of a PDF completely.`,
          },
          {
            type: 'image_url',
            image_url: { url: dataUrl },
          },
        ],
      },
    ],
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 120_000);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`Cloud OCR timed out on page ${pageNumber}`);
    }
    throw err;
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    // Retry without max_tokens if rejected
    if (res.status === 400 && /max_tokens|max_completion/i.test(errText)) {
      delete body.max_tokens;
      const res2 = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res2.ok) {
        const t2 = await res2.text().catch(() => '');
        throw new Error(`Cloud OCR ${res2.status}: ${t2.slice(0, 300)}`);
      }
      const data2 = await res2.json();
      return extractContent(data2) || `[OCR empty page ${pageNumber}]`;
    }
    throw new Error(
      `Cloud OCR ${res.status}: ${errText.slice(0, 300)}` +
        (res.status === 429
          ? ' — free-tier rate limit; wait or lower cloud OCR max pages.'
          : '')
    );
  }

  const data = await res.json();
  return extractContent(data) || `[OCR empty page ${pageNumber}]`;
}

function extractContent(data) {
  const c = data?.choices?.[0]?.message?.content;
  if (typeof c === 'string') return c.trim();
  if (Array.isArray(c)) {
    return c
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('')
      .trim();
  }
  return (data?.message?.content || data?.response || '').trim();
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

function samplePageIndices(n, max) {
  if (max >= n) return Array.from({ length: n }, (_, i) => i);
  const set = new Set([0, n - 1]);
  const mid = max - 2;
  for (let k = 1; k <= mid; k++) {
    set.add(Math.round((k * (n - 1)) / (mid + 1)));
  }
  return [...set].sort((a, b) => a - b);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
