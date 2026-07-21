/**
 * PDF ingestion: file picker, drag-drop, optional directory (File System Access API).
 */

import {
  putDocument,
  putPdfBytes,
  putExtraction,
  putFigure,
  updateDocument,
  getSettings,
} from '../storage/db.js';
import { extractDocument } from '../extraction/pdf.js';

/**
 * Ingest one File object into the library and kick off extraction.
 */
export async function ingestFile(file, { priority = 'normal', sourcePath = null, onProgress } = {}) {
  if (!file || !/\.pdf$/i.test(file.name)) {
    throw new Error('Only PDF files are supported');
  }

  const arrayBuffer = await file.arrayBuffer();
  const doc = await putDocument({
    name: file.name,
    title: file.name.replace(/\.pdf$/i, ''),
    fileSize: file.size,
    priority,
    status: 'queued',
    sourcePath,
  });

  await putPdfBytes(doc.id, arrayBuffer);

  // Fire extraction async path
  await runExtraction(doc.id, arrayBuffer, { filename: file.name, onProgress });
  return doc.id;
}

/**
 * Re-run extraction for an existing document.
 */
export async function reextractDocument(documentId, { forceOcr = false, onProgress } = {}) {
  const { getPdfBytes, getDocument } = await import('../storage/db.js');
  const doc = await getDocument(documentId);
  if (!doc) throw new Error('Document not found');
  const ab = await getPdfBytes(documentId);
  if (!ab) throw new Error('PDF bytes missing from local store');
  return runExtraction(documentId, ab, {
    filename: doc.name,
    forceOcr,
    onProgress,
  });
}

async function runExtraction(documentId, arrayBuffer, { filename, forceOcr = false, onProgress } = {}) {
  await updateDocument(documentId, { status: 'extracting', errorMessage: null });
  const settings = await getSettings();

  try {
    const result = await extractDocument(arrayBuffer, {
      filename,
      settings,
      forceOcr,
      onProgress,
    });

    // Persist figure blobs
    for (const f of result.figureBlobs || []) {
      await putFigure(documentId, f.figureId, f.blob, {
        page: f.page,
        caption: f.caption,
      });
    }

    await putExtraction({
      documentId,
      text: result.text,
      markdown: result.markdown,
      method: result.method,
      quality: result.quality,
      qualityScore: result.qualityScore,
      pageTexts: result.pageTexts,
      figures: result.figures,
      stats: result.stats,
    });

    await updateDocument(documentId, {
      status: 'ready',
      title: result.title || filename,
      pageCount: result.pageCount,
      errorMessage: null,
    });

    return result;
  } catch (err) {
    console.error(err);
    await updateDocument(documentId, {
      status: 'error',
      errorMessage: err.message || String(err),
    });
    throw err;
  }
}

/**
 * Open file picker for one or more PDFs.
 */
export async function pickPdfFiles({ multiple = true } = {}) {
  // Prefer File System Access API
  if (window.showOpenFilePicker) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple,
        types: [
          {
            description: 'PDF documents',
            accept: { 'application/pdf': ['.pdf'] },
          },
        ],
      });
      const files = [];
      for (const h of handles) {
        files.push(await h.getFile());
      }
      return files;
    } catch (err) {
      if (err.name === 'AbortError') return [];
      // fall through
    }
  }

  // Fallback: hidden input
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.multiple = multiple;
    input.onchange = () => resolve([...input.files]);
    input.click();
  });
}

/**
 * Folder selection for PDFs.
 * - Chromium: File System Access API (recursive walk)
 * - Safari / Firefox / others: <input webkitdirectory> fallback
 * ASAP-named folders (or path segments) get priority asap.
 */
export async function pickPdfFolder(settings) {
  const asapHint = (settings?.asapFolderHint || 'To Be Read ASAP').toLowerCase();

  // Prefer modern directory picker when available
  if (typeof window.showDirectoryPicker === 'function') {
    try {
      const dirHandle = await window.showDirectoryPicker();
      const found = [];

      async function walk(handle, pathParts, parentIsAsap) {
        const isAsap =
          parentIsAsap ||
          handle.name.toLowerCase().includes(asapHint) ||
          handle.name.toLowerCase().includes('asap');

        for await (const entry of handle.values()) {
          if (entry.kind === 'file' && /\.pdf$/i.test(entry.name)) {
            const file = await entry.getFile();
            found.push({
              file,
              priority: isAsap ? 'asap' : 'normal',
              sourcePath: [...pathParts, entry.name].join('/'),
            });
          } else if (entry.kind === 'directory') {
            await walk(entry, [...pathParts, entry.name], isAsap);
          }
        }
      }

      await walk(dirHandle, [dirHandle.name], false);
      return found;
    } catch (err) {
      if (err?.name === 'AbortError') return [];
      // Fall through to legacy input if permission / API glitch
      console.warn('showDirectoryPicker failed, using webkitdirectory fallback', err);
    }
  }

  // Cross-browser fallback: folder input (works in Safari, Firefox, Chrome)
  return pickPdfFolderViaInput(asapHint);
}

/**
 * Legacy folder picker via webkitdirectory / directory attribute.
 * @returns {Promise<{file: File, priority: string, sourcePath: string}[]>}
 */
function pickPdfFolderViaInput(asapHint) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,application/pdf';
    // Safari + Chrome + Firefox (varying support)
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);

    const cleanup = () => {
      try {
        input.remove();
      } catch {
        /* ignore */
      }
    };

    input.addEventListener('change', () => {
      try {
        const files = [...(input.files || [])];
        const found = [];
        for (const file of files) {
          if (!/\.pdf$/i.test(file.name)) continue;
          const rel = file.webkitRelativePath || file.name;
          const lower = rel.toLowerCase();
          const isAsap =
            lower.includes(asapHint) ||
            lower.split('/').some((seg) => seg.includes('asap'));
          found.push({
            file,
            priority: isAsap ? 'asap' : 'normal',
            sourcePath: rel,
          });
        }
        cleanup();
        resolve(found);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    // Cancel is hard to detect; resolve empty on focus return after a beat
    const onFocus = () => {
      setTimeout(() => {
        if (!input.files?.length) {
          cleanup();
          resolve([]);
        }
      }, 600);
      window.removeEventListener('focus', onFocus);
    };
    window.addEventListener('focus', onFocus);

    try {
      input.click();
    } catch (err) {
      cleanup();
      reject(
        new Error(
          'Could not open a folder picker in this browser. Use Add PDFs and select multiple files instead.'
        )
      );
    }
  });
}

/**
 * Wire drag-and-drop on an element.
 */
export function bindDropZone(el, { onFiles, onError }) {
  const prevent = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  el.addEventListener('dragenter', (e) => {
    prevent(e);
    el.classList.add('is-dragover');
  });
  el.addEventListener('dragover', (e) => {
    prevent(e);
    el.classList.add('is-dragover');
  });
  el.addEventListener('dragleave', (e) => {
    prevent(e);
    el.classList.remove('is-dragover');
  });
  el.addEventListener('drop', async (e) => {
    prevent(e);
    el.classList.remove('is-dragover');
    try {
      const files = [...(e.dataTransfer?.files || [])].filter((f) =>
        /\.pdf$/i.test(f.name)
      );
      if (!files.length) {
        onError?.('Drop PDF files only');
        return;
      }
      await onFiles(files);
    } catch (err) {
      onError?.(err.message);
    }
  });
}
