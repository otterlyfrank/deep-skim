/**
 * Export summaries as Markdown download or print-friendly PDF (browser print).
 */

export function downloadMarkdown(filename, markdown) {
  downloadTextFile(filename, markdown, 'text/markdown;charset=utf-8', '.md');
}

/**
 * Download plain text (e.g. OCR / native extraction).
 */
export function downloadText(filename, text) {
  downloadTextFile(filename, text ?? '', 'text/plain;charset=utf-8', '.txt');
}

function downloadTextFile(filename, content, mime, defaultExt) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  let name = sanitizeFilename(filename);
  if (!/\.(md|txt|markdown)$/i.test(name)) name += defaultExt;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Open a print window with clean typography for "Save as PDF".
 */
/**
 * @param {string} title
 * @param {string} markdownHtml
 * @param {{ notesHtml?: string }} [opts]
 */
export function exportPdfViaPrint(title, markdownHtml, opts = {}) {
  const w = window.open('', '_blank');
  if (!w) {
    alert('Pop-up blocked — allow pop-ups to export PDF, or use Markdown export.');
    return;
  }
  const notesBlock = opts.notesHtml
    ? `<section class="notes-export"><h2>Reflections &amp; notes</h2>${opts.notesHtml}</section>`
    : '';
  w.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeAttr(title)}</title>
  <style>
    @page { margin: 0.85in; }
    body {
      font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif;
      font-size: 10.5pt;
      line-height: 1.5;
      color: #111;
      max-width: 42rem;
      margin: 0 auto;
      padding: 0.75rem;
    }
    h1 { font-size: 1.55rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.15rem; margin-top: 1.45rem; border-bottom: 1px solid #ccc; padding-bottom: 0.25rem; page-break-after: avoid; }
    h3 { font-size: 1.02rem; margin-top: 1.1rem; page-break-after: avoid; }
    h4 { font-size: 0.98rem; margin-top: 0.9rem; page-break-after: avoid; }
    blockquote {
      margin: 0.8rem 0;
      padding: 0.45rem 0 0.45rem 1rem;
      border-left: 3px solid #444;
      color: #222;
      font-style: italic;
    }
    code {
      font-family: "SF Mono", Menlo, Consolas, "Liberation Mono", ui-monospace, monospace;
      font-size: 0.88em;
    }
    pre, pre.diagram-block, pre code {
      font-family: "SF Mono", Menlo, Consolas, "Liberation Mono", ui-monospace, monospace;
      font-size: 8.5pt;
      line-height: 1.35;
    }
    pre {
      background: #f4f4f4;
      padding: 0.65rem 0.75rem;
      overflow: visible;
      white-space: pre-wrap;
      word-break: break-word;
      border: 1px solid #ddd;
      border-radius: 3px;
      page-break-inside: avoid;
    }
    pre.diagram-block {
      background: #f7f7f5;
      border: 1px solid #ccc;
      font-size: 9pt;
      letter-spacing: 0;
    }
    ul, ol { padding-left: 1.35rem; }
    li { margin: 0.2rem 0; }
    hr { border: none; border-top: 1px solid #ccc; margin: 1.35rem 0; }
    .meta { color: #555; font-size: 0.88rem; margin-bottom: 1.25rem; }
    .notes-export {
      margin-top: 2rem;
      padding-top: 0.5rem;
      border-top: 2px solid #c4a35a;
      page-break-before: auto;
    }
    .notes-export h2 { border-color: #c4a35a; color: #5c4a20; }
    .notes-export p { white-space: pre-wrap; }
    body { font-feature-settings: "liga" 0; }
  </style>
</head>
<body>
  <p class="meta">Deep-skim export · ${new Date().toLocaleString()}</p>
  ${markdownHtml}
  ${notesBlock}
  <script>window.onload = () => { window.print(); };<\/script>
</body>
</html>`);
  w.document.close();
}

/** Build markdown file body including optional personal notes */
export function buildExportMarkdown(title, bodyMd, notes = '') {
  let out = `# ${title}\n\n${bodyMd || ''}`.trim() + '\n';
  const n = (notes || '').trim();
  if (n) {
    out += `\n---\n\n## Reflections & notes\n\n${n}\n`;
  }
  return out;
}

function sanitizeFilename(name) {
  return String(name || 'deep-skim')
    .replace(/[^\w\s\-_.]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'deep-skim';
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/**
 * Format file size for display.
 */
export function formatBytes(n) {
  if (n == null || Number.isNaN(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function weekKey(date = new Date()) {
  // ISO-ish week key YYYY-Www
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
