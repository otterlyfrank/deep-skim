/**
 * OCR bridge client.
 *
 * Primary local path: HTTP bridge to Unlimited-OCR / DeepSeek-OCR
 * (see docs/ocr-setup.md and scripts/ocr_bridge.py).
 *
 * The browser cannot run 3B vision MoE models reliably via Transformers.js
 * yet for multi-page PDFs; we prefer a thin local Python/vLLM bridge and
 * degrade gracefully when it is unavailable.
 */

/**
 * @param {string} baseUrl
 * @param {object} opts
 * @param {'health'|'ocr'} opts.kind
 */
async function bridgeFetch(baseUrl, path, options = {}) {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 120_000);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OCR bridge ${res.status}: ${text.slice(0, 200)}`);
    }
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkOcrBridge(baseUrl) {
  if (!baseUrl) return { ok: false, reason: 'No OCR bridge URL configured' };
  try {
    const res = await bridgeFetch(baseUrl, '/health', { method: 'GET', timeoutMs: 4000 });
    const data = await res.json();
    return {
      ok: true,
      providers: data.providers || data.models || [],
      message: data.message || 'OCR bridge online',
      raw: data,
    };
  } catch (err) {
    return {
      ok: false,
      reason: err.name === 'AbortError' ? 'OCR bridge timeout' : err.message,
    };
  }
}

/**
 * OCR a multi-page PDF (ArrayBuffer) via the local bridge.
 * @returns {Promise<{ markdown: string, pageMarkdowns: string[], method: string, figures: object[] }>}
 */
export async function ocrPdfViaBridge(baseUrl, arrayBuffer, {
  provider = 'auto',
  filename = 'document.pdf',
  onProgress,
} = {}) {
  onProgress?.({ stage: 'ocr', message: `Sending PDF to OCR bridge (${provider})…` });

  const form = new FormData();
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
  form.append('file', blob, filename);
  form.append('provider', provider);

  // Long timeout: multi-page OCR can take minutes
  const res = await bridgeFetch(baseUrl, '/ocr/pdf', {
    method: 'POST',
    body: form,
    timeoutMs: 30 * 60 * 1000,
    headers: {}, // let browser set multipart boundary
  });

  const data = await res.json();
  onProgress?.({ stage: 'ocr', message: 'OCR complete', percent: 100 });

  return {
    markdown: data.markdown || data.text || '',
    pageMarkdowns: data.pages || data.page_markdowns || [],
    method: data.provider || data.method || provider,
    figures: data.figures || [],
    raw: data,
  };
}

/**
 * OCR individual page images (PNG blobs) — used for selective DeepSeek-OCR on diagram pages.
 */
export async function ocrPagesViaBridge(baseUrl, pages, {
  provider = 'deepseek-ocr',
  onProgress,
} = {}) {
  // pages: [{ pageIndex, blob }]
  const results = [];
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    onProgress?.({
      stage: 'ocr-page',
      message: `OCR page ${p.pageIndex + 1} (${i + 1}/${pages.length})…`,
      percent: Math.round((i / pages.length) * 100),
    });

    const form = new FormData();
    form.append('file', p.blob, `page-${p.pageIndex + 1}.png`);
    form.append('provider', provider);
    form.append('page_index', String(p.pageIndex));

    const res = await bridgeFetch(baseUrl, '/ocr/image', {
      method: 'POST',
      body: form,
      timeoutMs: 10 * 60 * 1000,
      headers: {},
    });
    const data = await res.json();
    results.push({
      pageIndex: p.pageIndex,
      markdown: data.markdown || data.text || '',
      method: data.provider || provider,
    });
  }
  return results;
}
