/**
 * Deep-Skim application controller — presentation layer.
 * Wires storage, extraction, generation, and UI views.
 */

import {
  listDocuments,
  listSummaries,
  getDocument,
  getExtraction,
  getSummary,
  putSummary,
  updateSummary,
  updateDocument,
  deleteDocument,
  deleteSummary,
  getSettings,
  setSettings,
  searchAll,
  getDueReviews,
  putReview,
  scheduleNextReview,
  openDb,
  listProjects,
  getProject,
  getProjectByDocument,
  putProject,
  deleteProject,
  markProjectWeekDone,
  markProjectSynthesisDone,
  resetLocalDatabase,
  healDocumentQueue,
  clearDocumentError,
} from './storage/db.js';
import {
  ingestFile,
  pickPdfFiles,
  pickPdfFolder,
  bindDropZone,
  reextractDocument,
} from './lib/ingest.js';
import { generateDeepSkim, generateStubDeepSkim, checkLlm } from './generation/llm.js';
import { DEFAULT_RESEARCH_LENSES_TEXT } from './generation/prompt.js';
import { markdownToHtml } from './generation/parser.js';
import {
  LLM_PROVIDERS,
  getProvider,
  inferProviderId,
  providerOptionsHtml,
  modelOptionsHtml,
  CUSTOM_MODEL_VALUE,
  privacyCopy,
} from './generation/providers.js';
import {
  planMultiWeekProject,
  projectEligibility,
} from './generation/projects.js';
import { checkOcrBridge } from './extraction/ocr-bridge.js';
import {
  downloadMarkdown,
  downloadText,
  exportPdfViaPrint,
  buildExportMarkdown,
  formatBytes,
  formatDate,
  weekKey,
} from './lib/export.js';
import {
  shellHtml,
  welcomeHtml,
  statsStripHtml,
  parseHash,
  setHash,
  icons,
} from './ui/shell.js';

/** @type {{ view: string, docId?: string, summaryId?: string, projectId?: string, quiz?: object }} */
let state = { view: 'library' };
let settingsCache = null;
let progressToastEl = null;
let progressStartedAt = 0;
let progressTicker = null;
let navigating = false;

// ── Boot ───────────────────────────────────────────────────

export async function boot() {
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML =
      '<div style="padding:2rem;font-family:system-ui;color:#e8e6e3;background:#0e0f11;min-height:100vh"><p style="opacity:0.7">Starting Deep-Skim…</p></div>';
  }
  try {
    await openDb();
    settingsCache = await getSettings();
    applyTheme(settingsCache.theme || 'dark');
    renderShell();
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onHashChange);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMobileNav();
    });
    let { view, params } = parseHash();
    // Don't land on a missing project view after a failed upgrade
    if (view === 'project' || view === 'projects') {
      try {
        const projects = await listProjects();
        if (view === 'project' && params.projectId) {
          const hit = projects.find((p) => p.id === params.projectId);
          if (!hit) {
            view = 'projects';
            params = {};
          }
        }
      } catch {
        view = 'library';
        params = {};
      }
    }
    await healDocumentQueue().catch(() => 0);
    await navigate(view, params, { skipHash: true });
    await maybeShowWeeklyReminder();
    probeServices();
  } catch (err) {
    console.error('boot failed', err);
    showBootError(err);
    throw err;
  }
}

function showBootError(err) {
  const app = document.getElementById('app');
  if (!app) return;
  const msg = err?.message || String(err);
  app.innerHTML = `
    <div style="padding:2rem;font-family:system-ui;max-width:36rem;margin:auto;color:#e8e6e3;background:#0e0f11;min-height:100vh;box-sizing:border-box">
      <h1 style="font-size:1.25rem;color:#e8e6e3;margin-top:0">Deep-Skim failed to start</h1>
      <p id="boot-err-msg" style="color:#c45a5a;white-space:pre-wrap"></p>
      <ol style="color:#9a9690;font-size:0.95rem;line-height:1.55;padding-left:1.2rem">
        <li>Close <strong>every other tab</strong> on <code>localhost:8080</code>.</li>
        <li>Click <strong>Retry</strong>.</li>
        <li>If still stuck, click <strong>Reset local data &amp; reload</strong> (clears PDFs/skims in this browser only).</li>
      </ol>
      <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:1.25rem">
        <button type="button" id="boot-retry" style="padding:0.5rem 1rem;cursor:pointer;background:#c4a35a;border:none;border-radius:4px;font:inherit;color:#111;font-weight:600">Retry</button>
        <button type="button" id="boot-reset" style="padding:0.5rem 1rem;cursor:pointer;background:#1e2128;border:1px solid #c45a5a;border-radius:4px;font:inherit;color:#e8e6e3">Reset local data &amp; reload</button>
      </div>
      <p style="color:#6b6760;font-size:0.85rem;margin-top:1.5rem">Must use http://localhost:8080 (not file://).</p>
    </div>`;
  const msgEl = document.getElementById('boot-err-msg');
  if (msgEl) msgEl.textContent = msg;
  document.getElementById('boot-retry')?.addEventListener('click', () => {
    location.reload();
  });
  document.getElementById('boot-reset')?.addEventListener('click', async () => {
    const btn = document.getElementById('boot-reset');
    if (btn) btn.textContent = 'Resetting…';
    try {
      await resetLocalDatabase();
      location.reload();
    } catch (e) {
      alert(e?.message || String(e));
      if (btn) btn.textContent = 'Reset local data & reload';
    }
  });
}

function onHashChange() {
  if (navigating) return;
  const { view, params } = parseHash();
  navigate(view, params, { skipHash: true });
}

function $(sel, root = document) {
  return root.querySelector(sel);
}

function appRoot() {
  return document.getElementById('app');
}

function applyTheme(theme) {
  const isLight = theme === 'light';
  document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
  const icon = $('#theme-icon');
  const label = $('#theme-label');
  if (icon) icon.innerHTML = isLight ? icons.moon : icons.sun;
  if (label) label.textContent = isLight ? 'Dark mode' : 'Light mode';
}

// ── Shell ──────────────────────────────────────────────────

function renderShell() {
  appRoot().innerHTML = shellHtml();

  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeMobileNav();
      navigate(btn.dataset.nav);
    });
  });

  $('#btn-theme').addEventListener('click', async () => {
    const next = (settingsCache.theme || 'dark') === 'dark' ? 'light' : 'dark';
    settingsCache = await setSettings({ theme: next });
    applyTheme(next);
  });

  $('#btn-menu').addEventListener('click', () => {
    const open = $('#sidebar').classList.toggle('open');
    const bd = $('#sidebar-backdrop');
    if (bd) {
      bd.hidden = !open;
      bd.classList.toggle('show', open);
    }
  });
  $('#sidebar-backdrop').addEventListener('click', closeMobileNav);
  applyTheme(settingsCache.theme || 'dark');
}

function closeMobileNav() {
  $('#sidebar')?.classList.remove('open');
  const bd = $('#sidebar-backdrop');
  if (bd) {
    bd.hidden = true;
    bd.classList.remove('show');
  }
}

function setActiveNav(view) {
  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.nav === view);
  });
}

function setViewChrome(title, subtitle = '') {
  const t = $('#view-title');
  const s = $('#view-sub');
  if (t) t.textContent = title;
  if (s) {
    s.textContent = subtitle;
    s.hidden = !subtitle;
  }
}

async function refreshNavBadges() {
  const [sums, due, docs, projects] = await Promise.all([
    listSummaries(),
    getDueReviews(10),
    listDocuments(),
    listProjects(),
  ]);
  const sc = $('#nav-sum-count');
  const rc = $('#nav-review-count');
  const pc = $('#nav-proj-count');
  if (sc) sc.textContent = String(sums.length);
  if (rc) rc.textContent = String(due.length);
  if (pc) {
    const active = projects.filter((p) => p.status === 'active').length;
    pc.textContent = String(active || projects.length);
  }

  // Weekly meter in sidebar
  settingsCache = settingsCache || (await getSettings());
  const wk = weekKey();
  const used = settingsCache.lastSummaryWeekKey === wk;
  const fill = $('#week-meter-fill');
  const label = $('#week-meter-label');
  if (fill) fill.style.width = used ? '100%' : '12%';
  if (label) {
    label.textContent = used
      ? `${wk} · skim done — review instead`
      : `${wk} · deep-skim slot open`;
  }
  void docs;
}

async function probeServices() {
  const llmDot = $('#dot-llm');
  const ocrDot = $('#dot-ocr');
  try {
    settingsCache = await getSettings();
    const llm = await checkLlm(settingsCache.llmBaseUrl, settingsCache.llmApiKey);
    if (llmDot) {
      llmDot.className = 'dot ' + (llm.ok ? 'ok' : 'err');
      llmDot.title = llm.ok
        ? `LLM connected: ${llm.message}`
        : `LLM offline: ${llm.reason}`;
    }
  } catch {
    if (llmDot) {
      llmDot.className = 'dot err';
      llmDot.title = 'LLM offline';
    }
  }
  // OCR status: green if cloud Gemini OCR available OR local bridge up
  try {
    const { canUseCloudOcr } = await import('./extraction/cloud-ocr.js');
    const cloudOk =
      canUseCloudOcr(settingsCache) &&
      (settingsCache.ocrProvider === 'auto' ||
        settingsCache.ocrProvider === 'gemini' ||
        settingsCache.ocrProvider === 'cloud');
    let localOk = false;
    let localMsg = '';
    if (
      settingsCache.ocrProvider === 'local' ||
      settingsCache.ocrProvider === 'unlimited-ocr' ||
      settingsCache.ocrProvider === 'deepseek-ocr' ||
      settingsCache.ocrProvider === 'auto'
    ) {
      const ocr = await checkOcrBridge(settingsCache.ocrBridgeUrl);
      localOk = ocr.ok;
      localMsg = ocr.ok ? ocr.message : ocr.reason;
    }
    if (ocrDot) {
      if (cloudOk || localOk) {
        ocrDot.className = 'dot ok';
        ocrDot.title = cloudOk
          ? `OCR ready via Gemini API (no local bridge needed)${localOk ? ' · local bridge also up' : ''}`
          : `Local OCR bridge online: ${localMsg}`;
      } else if (settingsCache.ocrProvider === 'none') {
        ocrDot.className = 'dot idle';
        ocrDot.title = 'OCR disabled — native PDF text only';
      } else {
        ocrDot.className = 'dot idle';
        ocrDot.title =
          'OCR: add Gemini API key in Settings for cloud OCR on scans (recommended). Local bridge is optional.';
      }
    }
  } catch {
    if (ocrDot) {
      ocrDot.className = 'dot idle';
      ocrDot.title = 'OCR status unknown';
    }
  }
}

// ── Navigation ─────────────────────────────────────────────

export async function navigate(view, params = {}, { skipHash = false } = {}) {
  navigating = true;
  state = { view, ...params };
  if (!skipHash) setHash(view, params);

  const navKey = ['document', 'generate'].includes(view)
    ? 'library'
    : view === 'summary' || view === 'quiz'
      ? 'summaries'
      : view === 'project'
        ? 'projects'
        : view;
  setActiveNav(navKey);

  const root = $('#view-root');
  const actions = $('#topbar-actions');
  if (actions) actions.innerHTML = '';
  if (root) {
    root.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading…</p></div>`;
  }

  try {
    switch (view) {
      case 'library':
        setViewChrome('Library', 'Queue · extract · generate');
        await renderLibrary(root, actions);
        break;
      case 'document':
        setViewChrome('Document', 'Extraction & generation');
        await renderDocument(root, actions, params.docId);
        break;
      case 'summaries':
        setViewChrome('Summaries', 'Stored deep-skims');
        await renderSummaries(root, actions);
        break;
      case 'summary':
        setViewChrome('Deep-skim', 'Structured reading view');
        await renderSummary(root, actions, params.summaryId);
        break;
      case 'quiz':
        setViewChrome('Active recall', 'Self-grade honestly');
        await renderQuiz(root, actions, params.summaryId);
        break;
      case 'review':
        setViewChrome('Spaced review', '2–3 older skims each week');
        await renderReviewHub(root, actions);
        break;
      case 'projects':
        setViewChrome('Projects', 'Multi-week long books · token-efficient bands');
        await renderProjects(root, actions);
        break;
      case 'project':
        setViewChrome('Project', 'Weekly bands');
        await renderProject(root, actions, params.projectId);
        break;
      case 'search':
        setViewChrome('Search', 'Local library only');
        await renderSearch(root, actions);
        break;
      case 'settings':
        setViewChrome('Settings', 'LLM, OCR, privacy stays local');
        await renderSettings(root, actions);
        break;
      default:
        setViewChrome('Deep-Skim');
        root.innerHTML = '<div class="empty-state"><h3>Unknown view</h3></div>';
    }
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="empty-state"><h3>Something went wrong</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
  await refreshNavBadges();
  navigating = false;
  root?.focus?.({ preventScroll: true });
}

// ── Library ────────────────────────────────────────────────

async function renderLibrary(root, actions) {
  // Auto-clear stale errors / stuck summarizing before paint
  const healed = await healDocumentQueue().catch(() => 0);
  if (healed > 0) {
    toast(`Cleared ${healed} stale queue error(s)`);
  }

  const [docs, sums, due] = await Promise.all([
    listDocuments(),
    listSummaries(),
    getDueReviews(10),
  ]);

  actions.innerHTML = `
    <button type="button" id="btn-add-pdfs">${icons.upload} Add PDFs</button>
    <button type="button" id="btn-add-folder">${icons.folder} Add folder</button>
  `;

  const ready = docs.filter((d) => d.status === 'ready' || d.status === 'summarized').length;
  const asap = docs.filter((d) => d.priority === 'asap').length;

  if (!docs.length) {
    root.innerHTML = `
      <div class="content-wide">
        ${welcomeHtml()}
        <div class="drop-zone drop-zone-compact" id="drop-zone">
          <strong>${icons.pdf} Drop PDFs anywhere in this zone</strong>
          <div class="hint">Files stay in IndexedDB on this device. Nothing is uploaded to a server.</div>
        </div>
      </div>`;
    $('#welcome-add').onclick = () => $('#btn-add-pdfs').click();
    $('#welcome-settings').onclick = () => navigate('settings');
  } else {
    root.innerHTML = `
      <div class="content-wide">
        ${statsStripHtml({
          docs: docs.length,
          ready,
          asap,
          sums: sums.length,
          due: due.length,
        })}
        <div id="weekly-slot"></div>
        <div class="drop-zone" id="drop-zone">
          <strong>${icons.upload} Drop PDFs here</strong>
          <span>or use Add PDFs / Add folder (works in Safari, Chrome, Firefox). Folders named like “To Be Read ASAP” get priority.</span>
          <div class="hint">All data stays local in this browser.</div>
          <div class="drop-actions">
            <button type="button" class="primary" id="btn-drop-add">Choose files</button>
          </div>
        </div>
        <div class="section-head">
          <h3>Reading queue</h3>
          <p>ASAP first · filter · open a card to extract or generate</p>
        </div>
        <div class="library-filters" id="library-filters" role="group" aria-label="Filter queue">
          <button type="button" class="filter-chip active" data-filter="all">All</button>
          <button type="button" class="filter-chip" data-filter="asap">ASAP</button>
          <button type="button" class="filter-chip" data-filter="ready">Ready</button>
          <button type="button" class="filter-chip" data-filter="summarized">Summarized</button>
          <button type="button" class="filter-chip" data-filter="error">Errors</button>
        </div>
        <div class="card-list" id="doc-list"></div>
      </div>
    `;
    await paintWeeklyBanner($('#weekly-slot'));
  }

  const list = $('#doc-list');
  if (list) {
    let filter = 'all';
    const paintList = () => {
      const filtered = docs.filter((d) => {
        if (filter === 'all') return true;
        if (filter === 'asap') return d.priority === 'asap';
        if (filter === 'ready') return d.status === 'ready';
        if (filter === 'summarized') return d.status === 'summarized';
        if (filter === 'error') return d.status === 'error';
        return true;
      });
      list.innerHTML = filtered.length
        ? filtered.map((d) => docCardHtml(d)).join('')
        : `<p class="filter-empty">No documents match this filter.</p>`;
      list.querySelectorAll('[data-open-doc]').forEach((el) => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          navigate('document', { docId: el.dataset.openDoc });
        });
      });
      list.querySelectorAll('[data-del-doc]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('Delete this document and its extractions?')) return;
          await deleteDocument(btn.dataset.delDoc);
          toast('Document deleted');
          navigate('library');
        });
      });
      list.querySelectorAll('[data-prio]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.prio;
          const doc = await getDocument(id);
          const cycle = { normal: 'asap', asap: 'low', low: 'normal' };
          await updateDocument(id, { priority: cycle[doc.priority] || 'normal' });
          navigate('library');
        });
      });
      list.querySelectorAll('[data-gen-doc]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await runGenerate(btn.dataset.genDoc);
        });
      });
      list.querySelectorAll('[data-clear-err]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await clearDocumentError(btn.dataset.clearErr);
          toast('Error cleared');
          navigate('library');
        });
      });
    };
    paintList();
    document.querySelectorAll('#library-filters [data-filter]').forEach((chip) => {
      chip.addEventListener('click', () => {
        filter = chip.dataset.filter;
        document.querySelectorAll('#library-filters [data-filter]').forEach((c) => {
          c.classList.toggle('active', c === chip);
        });
        paintList();
      });
    });
  }

  const addFiles = async (files, defaultPriority = 'normal') => {
    for (const file of files) {
      const p = typeof file === 'object' && file.file ? file : { file, priority: defaultPriority };
      try {
        showProgress('Ingesting ' + p.file.name, 0);
        await ingestFile(p.file, {
          priority: p.priority || defaultPriority,
          sourcePath: p.sourcePath || null,
          onProgress: (ev) => showProgress(ev.message || 'Working…', ev.percent ?? null),
        });
        hideProgress();
        toast(`Ready: ${p.file.name}`);
      } catch (err) {
        hideProgress();
        toast(err.message, true);
      }
    }
    navigate('library');
  };

  const bindAdd = () => {
    const btn = $('#btn-add-pdfs');
    if (btn) {
      btn.onclick = async () => {
        const files = await pickPdfFiles({ multiple: true });
        if (files.length) await addFiles(files);
      };
    }
    const dropAdd = $('#btn-drop-add');
    if (dropAdd) dropAdd.onclick = () => $('#btn-add-pdfs')?.click();
  };
  bindAdd();

  const folderBtn = $('#btn-add-folder');
  if (folderBtn) {
    folderBtn.onclick = async () => {
      try {
        const found = await pickPdfFolder(settingsCache);
        if (!found.length) {
          toast('No PDFs found in folder');
          return;
        }
        await addFiles(found);
      } catch (err) {
        toast(err.message, true);
      }
    };
  }

  const zone = $('#drop-zone');
  if (zone) {
    bindDropZone(zone, {
      onFiles: (files) => addFiles(files),
      onError: (msg) => toast(msg, true),
    });
  }
}

function docCardHtml(d) {
  const statusPill =
    d.status === 'ready'
      ? '<span class="pill ok">ready</span>'
      : d.status === 'error'
        ? '<span class="pill err">error</span>'
        : d.status === 'extracting'
          ? '<span class="pill">extracting</span>'
          : d.status === 'summarized'
            ? '<span class="pill core">summarized</span>'
            : d.status === 'summarizing'
              ? '<span class="pill">summarizing</span>'
              : `<span class="pill">${escapeHtml(d.status)}</span>`;

  return `
    <article class="card clickable" data-open-doc="${d.id}">
      <div class="card-lead">
        <span class="card-icon" aria-hidden="true">${icons.pdf}</span>
        <div>
          <h3>${escapeHtml(d.title || d.name)}</h3>
          <div class="meta">
            ${d.priority === 'asap' ? '<span class="pill asap">ASAP</span>' : d.priority === 'low' ? '<span class="pill low">low</span>' : '<span class="pill">normal</span>'}
            ${statusPill}
            <span>${d.pageCount != null ? d.pageCount + ' pages' : '—'}</span>
            <span>${formatBytes(d.fileSize)}</span>
            <span>${formatDate(d.createdAt)}</span>
            ${
              d.errorMessage
                ? `<span class="doc-error" title="${escapeAttr(d.errorMessage)}">${escapeHtml(shortErr(d.errorMessage))}</span>`
                : ''
            }
          </div>
        </div>
      </div>
      <div class="actions">
        ${
          d.status === 'ready' || d.status === 'summarized'
            ? `<button type="button" class="primary" data-gen-doc="${d.id}" title="Generate deep-skim">Generate</button>`
            : ''
        }
        ${
          d.errorMessage || d.status === 'error' || d.status === 'summarizing'
            ? `<button type="button" class="ghost" data-clear-err="${d.id}" title="Clear error / unstick">Clear error</button>`
            : ''
        }
        <button type="button" data-prio="${d.id}" title="Cycle priority">Priority</button>
        <button type="button" class="danger" data-del-doc="${d.id}">Delete</button>
      </div>
    </article>
  `;
}

function shortErr(msg, n = 90) {
  const s = String(msg || '');
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ── Document detail ────────────────────────────────────────

async function renderDocument(root, actions, docId) {
  const doc = await getDocument(docId);
  if (!doc) {
    root.innerHTML = '<div class="empty-state"><h3>Document not found</h3></div>';
    return;
  }
  const ext = await getExtraction(docId);
  const sums = (await listSummaries()).filter((s) => s.documentId === docId);

  $('#view-title').textContent = doc.title || doc.name;

  const existingProject = await getProjectByDocument(docId);
  const elig = projectEligibility({
    pageCount: doc.pageCount,
    sourceChars: (ext?.text || '').length,
  });

  actions.innerHTML = `
    <button type="button" class="ghost" id="btn-back-lib">← Library</button>
    <button type="button" id="btn-rename-doc">Rename</button>
    <button type="button" id="btn-reextract">Re-extract</button>
    <button type="button" id="btn-force-ocr">Force OCR</button>
    <button type="button" id="btn-dl-extract" ${ext?.text ? '' : 'disabled'} title="Download extracted / OCR text">${icons.download || ''} Extract</button>
    <button type="button" class="primary" id="btn-generate" ${doc.status !== 'ready' && doc.status !== 'summarized' ? 'disabled' : ''}>Generate deep-skim</button>
  `;

  root.innerHTML = `
    <div class="content-narrow">
      <div class="card" style="margin-bottom:1.25rem">
        <div>
          <h3>${escapeHtml(doc.title || doc.name)}</h3>
          <div class="meta">
            <span class="pill ${doc.priority === 'asap' ? 'asap' : ''}">${escapeHtml(doc.priority)}</span>
            <span class="pill">${escapeHtml(doc.status)}</span>
            <span>${doc.pageCount ?? '—'} pages</span>
            <span>${formatBytes(doc.fileSize)}</span>
            <span class="file-orig" title="Original filename">${escapeHtml(doc.name)}</span>
            ${ext ? `<span>extract: ${escapeHtml(ext.method)} · ${escapeHtml(ext.quality)}</span>` : '<span>no extraction yet</span>'}
            ${doc.sourcePath ? `<span>${escapeHtml(doc.sourcePath)}</span>` : ''}
          </div>
        </div>
      </div>

      ${
        elig.pages >= 120 && (doc.status === 'ready' || doc.status === 'summarized')
          ? `<div class="banner project-banner" style="margin-bottom:1.25rem">
              <p><strong>Multi-week project</strong> — ${escapeHtml(elig.reason)}
              Only one week’s pages are sent to the model (token-efficient).</p>
              <div style="display:flex;gap:0.4rem;flex-wrap:wrap">
                ${
                  existingProject
                    ? `<button type="button" class="primary" id="btn-open-project">Open project (${existingProject.weeks} weeks)</button>`
                    : `<button type="button" class="primary" id="btn-start-project">${elig.recommended ? 'Start multi-week project' : 'Start multi-week (optional)'}</button>`
                }
              </div>
            </div>`
          : ''
      }

      ${
        ext
          ? `<details class="section" open>
              <summary>Extracted text preview</summary>
              <div class="section-body">
                <p style="color:var(--text-muted);font-family:var(--font-sans);font-size:0.85rem;display:flex;flex-wrap:wrap;gap:0.5rem 1rem;align-items:center">
                  <span>${(ext.text || '').length.toLocaleString()} characters · method <strong>${escapeHtml(ext.method || 'native')}</strong> · quality ${escapeHtml(String(ext.qualityScore ?? ext.quality ?? '—'))}</span>
                  <button type="button" class="ghost" id="btn-dl-extract-txt" style="font-size:0.85rem">Download .txt</button>
                  <button type="button" class="ghost" id="btn-dl-extract-md" style="font-size:0.85rem">Download .md</button>
                </p>
                <pre style="white-space:pre-wrap;font-family:var(--font-mono);font-size:0.82rem;max-height:20rem;overflow:auto;background:var(--bg);padding:0.75rem;border-radius:var(--radius-sm)">${escapeHtml((ext.text || '').slice(0, 8000))}${(ext.text || '').length > 8000 ? '\n\n…' : ''}</pre>
              </div>
            </details>`
          : '<p class="empty-state">Extraction not available.</p>'
      }

      <h3 style="font-family:var(--font-serif);margin:1.75rem 0 0.75rem">Summaries for this document</h3>
      ${
        sums.length
          ? `<div class="card-list">${sums
              .map(
                (s) => `
            <article class="card clickable" data-open-sum="${s.id}">
              <div>
                <h3>${escapeHtml(s.title)}</h3>
                <div class="meta">
                  <span class="pill ${s.status === 'core' ? 'core' : ''}">${escapeHtml(s.status)}</span>
                  <span>${formatDate(s.createdAt)}</span>
                  <span>${escapeHtml(s.model || 'model n/a')}</span>
                </div>
              </div>
            </article>`
              )
              .join('')}</div>`
          : '<p style="color:var(--text-muted)">None yet. Generate a deep-skim when ready (aim for one per week).</p>'
      }
    </div>
  `;

  const downloadExtraction = (asMd) => {
    if (!ext?.text) {
      toast('No extracted text yet', true);
      return;
    }
    const base = (doc.title || doc.name || 'extract').replace(/\.pdf$/i, '');
    const method = ext.method || 'native';
    if (asMd) {
      const md = `# ${doc.title || doc.name}\n\n- **Source file:** ${doc.name}\n- **Extraction:** ${method}\n- **Quality:** ${ext.quality ?? '—'} (${ext.qualityScore ?? 'n/a'})\n- **Characters:** ${(ext.text || '').length}\n- **Pages:** ${doc.pageCount ?? '—'}\n\n---\n\n${ext.markdown || ext.text}\n`;
      downloadMarkdown(`${base}-extract-${method}`, md);
    } else {
      const header = `Deep-Skim extraction\nTitle: ${doc.title || doc.name}\nFile: ${doc.name}\nMethod: ${method}\nQuality: ${ext.quality ?? '—'} (${ext.qualityScore ?? 'n/a'})\nPages: ${doc.pageCount ?? '—'}\n\n---\n\n`;
      downloadText(`${base}-extract-${method}`, header + (ext.text || ''));
    }
    toast(asMd ? 'Extracted text downloaded (.md)' : 'Extracted text downloaded (.txt)');
  };

  $('#btn-back-lib').onclick = () => navigate('library');
  $('#btn-dl-extract')?.addEventListener('click', () => downloadExtraction(false));
  $('#btn-dl-extract-txt')?.addEventListener('click', () => downloadExtraction(false));
  $('#btn-dl-extract-md')?.addEventListener('click', () => downloadExtraction(true));
  $('#btn-rename-doc').onclick = async () => {
    const next = prompt('Display title for this PDF:', doc.title || doc.name || '');
    if (next == null) return;
    const title = next.trim();
    if (!title) {
      toast('Title cannot be empty', true);
      return;
    }
    await updateDocument(docId, { title });
    toast('Renamed');
    navigate('document', { docId });
  };
  root.querySelectorAll('[data-open-sum]').forEach((el) => {
    el.addEventListener('click', () => navigate('summary', { summaryId: el.dataset.openSum }));
  });
  $('#btn-open-project')?.addEventListener('click', () =>
    navigate('project', { projectId: existingProject.id })
  );
  $('#btn-start-project')?.addEventListener('click', () => createProjectForDoc(docId));

  const runExtract = async (forceOcr) => {
    try {
      showProgress(forceOcr ? 'OCR extraction…' : 'Re-extracting…', 0);
      await reextractDocument(docId, {
        forceOcr,
        onProgress: (ev) => showProgress(ev.message || '…', ev.percent ?? null),
      });
      hideProgress();
      toast('Extraction updated');
      navigate('document', { docId });
    } catch (err) {
      hideProgress();
      toast(err.message, true);
    }
  };

  $('#btn-reextract').onclick = () => runExtract(false);
  $('#btn-force-ocr').onclick = () => runExtract(true);
  $('#btn-generate').onclick = () => runGenerate(docId);
}

/**
 * @param {string} docId
 * @param {{ weekScope?: object, synthesis?: object, projectId?: string, skipWeeklyGate?: boolean }} [opts]
 */
async function runGenerate(docId, opts = {}) {
  const doc = await getDocument(docId);
  const ext = await getExtraction(docId);
  if (!doc || !ext) {
    toast('Document or extraction missing', true);
    return;
  }

  // Soft gate: one ISO-week skim (skip for multi-week project installments? keep — user can confirm)
  settingsCache = await getSettings();
  const wk = weekKey();
  if (!opts.skipWeeklyGate && settingsCache.lastSummaryWeekKey === wk) {
    const ok = confirm(
      'You already generated a deep-skim this ISO week. The design goal is one high-quality skim per week.\n\nGenerate another anyway?'
    );
    if (!ok) return;
  }

  // Nudge long books into multi-week instead of full-book multipass
  if (!opts.weekScope && !opts.synthesis) {
    const elig = projectEligibility({
      pageCount: doc.pageCount,
      sourceChars: (ext.text || '').length,
    });
    const existing = await getProjectByDocument(docId);
    if (elig.recommended && !existing) {
      const choice = confirm(
        `This looks long (~${elig.pages} pages).\n\n` +
          `OK = start a multi-week project (only one page band per week → saves tokens)\n` +
          `Cancel = generate a single full deep-skim anyway`
      );
      if (choice) {
        await createProjectForDoc(docId);
        return;
      }
    } else if (existing && existing.status === 'active') {
      const goProject = confirm(
        `A multi-week project already exists for this book.\n\nOK = open project and run the next week\nCancel = full-book generate anyway`
      );
      if (goProject) {
        navigate('project', { projectId: existing.id });
        return;
      }
    }
  }

  await updateDocument(docId, { status: 'summarizing', errorMessage: null });
  showProgress(
    opts.weekScope
      ? `Week ${opts.weekScope.week}: generating band pp. ${opts.weekScope.start}–${opts.weekScope.end}…`
      : opts.synthesis
        ? 'Synthesizing multi-week project…'
        : 'Generating deep-skim…',
    null
  );

  try {
    settingsCache = await getSettings();
    let result;
    try {
      result = await generateDeepSkim({
        extraction: ext,
        document: doc,
        settings: settingsCache,
        onProgress: (ev) => showProgress(ev.message || 'Generating…', ev.percent ?? null),
        weekScope: opts.weekScope || null,
        synthesis: opts.synthesis || null,
      });
    } catch (llmErr) {
      console.warn('LLM failed, offering stub', llmErr);
      const msg = llmErr?.message || String(llmErr);
      if (/no longer available to new users|NOT_FOUND|Model id is wrong|LLM error 404/i.test(msg)) {
        alert(
          `Deep-skim generation failed (API key is fine — model is not).\n\n${msg.slice(0, 600)}\n\nFix: Settings → Model → gemini-3.5-flash → Save → Generate again.`
        );
        throw llmErr;
      }
      if (/429|quota|rate.?limit|RESOURCE_EXHAUSTED|timed out/i.test(msg)) {
        alert(
          `Generate stopped (quota, rate limit, or timeout — often free-tier limits, not a brick).\n\n${msg.slice(0, 700)}\n\n` +
            `Try: wait a few minutes · switch to gemini-3.1-flash-lite · multi-week band · lower max map passes.`
        );
        throw llmErr;
      }
      const useStub = confirm(
        `LLM call failed:\n${msg}\n\nGenerate a local stub summary so you can still use the UI?`
      );
      if (!useStub) throw llmErr;
      const stub = generateStubDeepSkim({
        document: doc,
        extraction: ext,
        settings: settingsCache,
      });
      result = {
        title: stub.title,
        markdown: stub.markdown,
        sections: stub.sections,
        questions: stub.questions,
        model: 'stub-offline',
      };
    }

    const tags = [];
    if (doc.priority === 'asap') tags.push('asap');
    if (result.multipass) tags.push('multipass');
    if (result.mapChunks) tags.push(`maps×${result.mapChunks}`);
    if (result.longReadSegments?.length) tags.push(`long-reads×${result.longReadSegments.length}`);
    if (opts.weekScope) tags.push(`week-${opts.weekScope.week}`, 'multi-week');
    if (result.isSynthesis || opts.synthesis) tags.push('synthesis', 'multi-week');

    const summary = await putSummary({
      documentId: docId,
      title: result.title,
      markdown: result.markdown,
      sections: result.sections,
      questions: result.questions,
      model: result.model,
      status: 'inbox',
      tags,
      projectId: opts.projectId || null,
      projectWeek: opts.weekScope?.week ?? null,
      projectWeekStart: opts.weekScope?.start ?? null,
      projectWeekEnd: opts.weekScope?.end ?? null,
      isSynthesis: !!(result.isSynthesis || opts.synthesis),
    });

    if (opts.projectId && opts.weekScope) {
      await markProjectWeekDone(opts.projectId, opts.weekScope.week, summary.id);
    }
    if (opts.projectId && opts.synthesis) {
      await markProjectSynthesisDone(opts.projectId, summary.id);
    }

    await updateDocument(docId, { status: 'summarized' });
    await setSettings({ lastSummaryWeekKey: weekKey(), lastWeeklyPromptAt: Date.now() });
    settingsCache = await getSettings();
    hideProgress();
    const depthHint = result.depth
      ? ` · ~${result.depth.targetPagesMin}–${result.depth.targetPagesMax}p notes`
      : '';
    const lr = result.longReadSegments?.length
      ? ` · ${result.longReadSegments.length} long-read band(s)`
      : '';
    toast(
      opts.weekScope
        ? `Week ${opts.weekScope.week} saved (pp. ${opts.weekScope.start}–${opts.weekScope.end})${depthHint}`
        : opts.synthesis
          ? `Project synthesis saved${depthHint}`
          : result.multipass
            ? `Substantial skim saved (multipass · ${result.mapChunks} maps${depthHint}${lr})`
            : `Deep-skim saved${depthHint}${lr}`
    );
    if (opts.projectId && !opts.synthesis) {
      navigate('project', { projectId: opts.projectId });
    } else {
      navigate('summary', { summaryId: summary.id });
    }
  } catch (err) {
    hideProgress();
    await updateDocument(docId, { status: 'ready', errorMessage: err.message });
    toast(err.message, true);
    if (opts.projectId) navigate('project', { projectId: opts.projectId });
    else navigate('document', { docId });
  }
}

async function createProjectForDoc(docId) {
  const doc = await getDocument(docId);
  const ext = await getExtraction(docId);
  if (!doc || !ext) {
    toast('Document or extraction missing', true);
    return;
  }
  const existing = await getProjectByDocument(docId);
  if (existing) {
    navigate('project', { projectId: existing.id });
    return;
  }
  settingsCache = await getSettings();
  const ppw = settingsCache.projectPagesPerWeek || 200;
  const planned = planMultiWeekProject({
    pageCount: doc.pageCount,
    sourceChars: (ext.text || '').length,
    pagesPerWeek: ppw,
    force: true,
  });
  if (!planned) {
    toast('Could not plan multi-week project', true);
    return;
  }
  const project = await putProject({
    documentId: docId,
    title: doc.title || doc.name,
    pages: planned.pages,
    weeks: planned.weeks,
    pagesPerWeek: planned.pagesPerWeek,
    plan: planned.plan,
    synthesis: planned.synthesis,
    status: 'active',
  });
  toast(`Multi-week project: ${planned.weeks} weeks · ~${planned.pagesPerWeek} pp/week`);
  navigate('project', { projectId: project.id });
}

// ── Multi-week projects ────────────────────────────────────

async function renderProjects(root, actions) {
  const projects = await listProjects();
  actions.innerHTML = `<button type="button" class="ghost" id="btn-proj-lib">← Library</button>`;
  $('#btn-proj-lib').onclick = () => navigate('library');

  if (!projects.length) {
    root.innerHTML = `<div class="empty-state">
      <h3>No multi-week projects yet</h3>
      <p>Open a long PDF (≈200+ pages) → <strong>Start multi-week project</strong>. Each week only that page band is sent to the model.</p>
      <button type="button" class="primary" id="btn-empty-lib2">Open library</button>
    </div>`;
    $('#btn-empty-lib2').onclick = () => navigate('library');
    return;
  }

  root.innerHTML = `<div class="content-narrow">
    <p style="color:var(--text-muted);margin-top:0">Long books as weekly page bands — saves tokens vs full multipass every time.</p>
    <div class="card-list">
      ${projects
        .map((p) => {
          const done = (p.plan || []).filter((w) => w.status === 'done').length;
          return `
        <article class="card clickable" data-open-proj="${p.id}">
          <div>
            <h3>${escapeHtml(p.title)}</h3>
            <div class="meta">
              <span class="pill ${p.status === 'completed' ? 'core' : 'asap'}">${escapeHtml(p.status)}</span>
              <span>${p.pages} pages</span>
              <span>${done}/${p.weeks} weeks</span>
              <span>${p.synthesis?.status === 'done' ? 'synthesis done' : p.synthesis?.status === 'ready' ? 'synthesis ready' : 'in progress'}</span>
            </div>
          </div>
        </article>`;
        })
        .join('')}
    </div>
  </div>`;

  root.querySelectorAll('[data-open-proj]').forEach((el) => {
    el.onclick = () => navigate('project', { projectId: el.dataset.openProj });
  });
}

async function renderProject(root, actions, projectId) {
  const project = await getProject(projectId);
  if (!project) {
    root.innerHTML = '<div class="empty-state"><h3>Project not found</h3></div>';
    return;
  }
  const doc = await getDocument(project.documentId);
  const done = (project.plan || []).filter((w) => w.status === 'done').length;
  const next = (project.plan || []).find((w) => w.status === 'pending');

  $('#view-title').textContent = project.title;
  actions.innerHTML = `
    <button type="button" class="ghost" id="btn-back-proj">← Projects</button>
    <button type="button" id="btn-proj-doc">Document</button>
    <button type="button" class="danger" id="btn-del-proj">Delete project</button>
  `;

  root.innerHTML = `
    <div class="content-narrow">
      <div class="card" style="margin-bottom:1rem">
        <div>
          <h3>Multi-week plan</h3>
          <div class="meta">
            <span class="pill asap">${escapeHtml(project.status)}</span>
            <span>~${project.pages} pages</span>
            <span>${project.weeks} weeks</span>
            <span>~${project.pagesPerWeek} pp/week</span>
            <span>${done}/${project.weeks} complete</span>
          </div>
          <p style="color:var(--text-muted);font-size:0.9rem;margin:0.75rem 0 0">
            Each week sends <strong>only that page band</strong> to the model — not the whole book. After all weeks: optional synthesis from weekly notes (still no full re-ingest).
          </p>
        </div>
      </div>

      ${
        next
          ? `<div class="banner" style="margin-bottom:1rem">
              <p><strong>Up next: Week ${next.week}</strong> — pages <strong>${next.start}–${next.end}</strong> (${next.pageCount || next.end - next.start + 1} pp). ${escapeHtml(next.focus)}</p>
              <button type="button" class="primary" id="btn-run-next-week">Generate week ${next.week}</button>
            </div>`
          : project.synthesis?.status === 'ready'
            ? `<div class="banner" style="margin-bottom:1rem">
                <p><strong>All weeks done.</strong> Run a final synthesis from weekly skims (token-efficient — no full PDF re-send).</p>
                <button type="button" class="primary" id="btn-run-synthesis">Generate full synthesis</button>
              </div>`
            : project.synthesis?.status === 'done'
              ? `<div class="banner" style="margin-bottom:1rem">
                  <p>Project complete. Open the synthesis summary anytime.</p>
                  ${project.synthesis.summaryId ? `<button type="button" class="primary" id="btn-open-synth">Open synthesis</button>` : ''}
                </div>`
              : ''
      }

      <div class="section-head"><h3>Weeks</h3><p>Generate in order or jump to a pending week</p></div>
      <div class="card-list">
        ${(project.plan || [])
          .map((w) => {
            const st =
              w.status === 'done'
                ? '<span class="pill ok">done</span>'
                : w.status === 'skipped'
                  ? '<span class="pill low">skipped</span>'
                  : '<span class="pill">pending</span>';
            return `
          <article class="card">
            <div>
              <h3>Week ${w.week}: pp. ${w.start}–${w.end}</h3>
              <div class="meta">
                ${st}
                <span>${w.pageCount || w.end - w.start + 1} pages</span>
                <span>${escapeHtml(w.focus || '')}</span>
              </div>
            </div>
            <div class="actions">
              ${
                w.summaryId
                  ? `<button type="button" data-open-sum="${w.summaryId}">Open skim</button>`
                  : `<button type="button" class="primary" data-run-week="${w.week}">Generate</button>`
              }
            </div>
          </article>`;
          })
          .join('')}
      </div>

      ${
        project.synthesis?.status === 'ready' || project.synthesis?.status === 'done'
          ? `<div class="section-head" style="margin-top:1.5rem"><h3>Synthesis</h3></div>
             <div class="card-list">
               <article class="card">
                 <div>
                   <h3>Full-work synthesis</h3>
                   <div class="meta"><span class="pill">${escapeHtml(project.synthesis.status)}</span></div>
                 </div>
                 <div class="actions">
                   ${
                     project.synthesis.summaryId
                       ? `<button type="button" data-open-sum="${project.synthesis.summaryId}">Open</button>`
                       : `<button type="button" class="primary" id="btn-run-synthesis-2">Generate</button>`
                   }
                 </div>
               </article>
             </div>`
          : ''
      }
    </div>
  `;

  $('#btn-back-proj').onclick = () => navigate('projects');
  $('#btn-proj-doc').onclick = () => navigate('document', { docId: project.documentId });
  $('#btn-del-proj').onclick = async () => {
    if (!confirm('Delete this multi-week project? Weekly skims remain in Summaries.')) return;
    await deleteProject(projectId);
    toast('Project deleted');
    navigate('projects');
  };
  $('#btn-run-next-week')?.addEventListener('click', () =>
    runProjectWeek(projectId, next.week)
  );
  $('#btn-run-synthesis')?.addEventListener('click', () => runProjectSynthesis(projectId));
  $('#btn-run-synthesis-2')?.addEventListener('click', () => runProjectSynthesis(projectId));
  $('#btn-open-synth')?.addEventListener('click', () =>
    navigate('summary', { summaryId: project.synthesis.summaryId })
  );
  root.querySelectorAll('[data-run-week]').forEach((btn) => {
    btn.onclick = () => runProjectWeek(projectId, Number(btn.dataset.runWeek));
  });
  root.querySelectorAll('[data-open-sum]').forEach((btn) => {
    btn.onclick = () => navigate('summary', { summaryId: btn.dataset.openSum });
  });
  void doc;
}

async function runProjectWeek(projectId, weekNum) {
  const project = await getProject(projectId);
  if (!project) return;
  const w = (project.plan || []).find((x) => x.week === weekNum);
  if (!w) return;
  if (w.status === 'done' && w.summaryId) {
    if (!confirm('This week is already done. Generate again and replace the link?')) return;
  }
  await runGenerate(project.documentId, {
    projectId,
    skipWeeklyGate: false,
    weekScope: {
      week: w.week,
      totalWeeks: project.weeks,
      start: w.start,
      end: w.end,
      focus: w.focus,
      projectTitle: project.title,
      pages: project.pages,
    },
  });
}

async function runProjectSynthesis(projectId) {
  const project = await getProject(projectId);
  if (!project) return;
  const weeks = [];
  for (const w of project.plan || []) {
    if (w.status !== 'done' || !w.summaryId) {
      toast('Finish all weeks before synthesis', true);
      return;
    }
    const s = await getSummary(w.summaryId);
    weeks.push({
      week: w.week,
      start: w.start,
      end: w.end,
      focus: w.focus,
      markdown: s?.markdown || '',
    });
  }
  await runGenerate(project.documentId, {
    projectId,
    skipWeeklyGate: true,
    synthesis: {
      weeks,
      projectTitle: project.title,
      pages: project.pages,
    },
  });
}

// ── Summaries list ─────────────────────────────────────────

async function renderSummaries(root, actions) {
  const sums = await listSummaries();
  actions.innerHTML = `<button type="button" class="ghost" id="btn-sums-to-lib">← Library</button>`;
  $('#btn-sums-to-lib').onclick = () => navigate('library');

  if (!sums.length) {
    root.innerHTML = `<div class="empty-state">
      <h3>No summaries yet</h3>
      <p>Add a PDF, wait until status is <strong>ready</strong>, then generate one deep-skim (aim for one per week).</p>
      <div class="welcome-actions" style="justify-content:center;margin-top:1.25rem">
        <button type="button" class="primary" id="btn-empty-lib">Open library</button>
        <button type="button" id="btn-empty-settings">Connect free Gemini</button>
      </div>
    </div>`;
    $('#btn-empty-lib').onclick = () => navigate('library');
    $('#btn-empty-settings').onclick = () => navigate('settings');
    return;
  }

  root.innerHTML = `<div class="content-narrow"><div class="card-list">${sums
    .map(
      (s) => `
    <article class="card clickable" data-open-sum="${s.id}">
      <div>
        <h3>${escapeHtml(s.title)}</h3>
        <div class="meta">
          <span class="pill ${s.status === 'core' ? 'core' : s.status === 'archive' ? 'low' : ''}">${escapeHtml(s.status)}</span>
          ${(s.tags || []).map((t) => `<span class="pill">${escapeHtml(t)}</span>`).join('')}
          <span>${formatDate(s.createdAt)}</span>
          <span>${(s.questions || []).length} recall Qs</span>
        </div>
      </div>
      <div class="actions">
        <button type="button" data-quiz="${s.id}">Quiz</button>
      </div>
    </article>`
    )
    .join('')}</div></div>`;

  root.querySelectorAll('[data-open-sum]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      navigate('summary', { summaryId: el.dataset.openSum });
    });
  });
  root.querySelectorAll('[data-quiz]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigate('quiz', { summaryId: btn.dataset.quiz });
    });
  });
}

// ── Summary reader ─────────────────────────────────────────

async function renderSummary(root, actions, summaryId) {
  const s = await getSummary(summaryId);
  if (!s) {
    root.innerHTML = '<div class="empty-state"><h3>Summary not found</h3></div>';
    return;
  }
  const doc = s.documentId ? await getDocument(s.documentId) : null;
  $('#view-title').textContent = 'Deep-skim';

  actions.innerHTML = `
    <button type="button" class="ghost" id="btn-back-sums">← Summaries</button>
    <button type="button" id="btn-expand-all">Expand all</button>
    <button type="button" id="btn-collapse-all">Collapse</button>
    <button type="button" id="btn-quiz">Active recall</button>
    <button type="button" id="btn-export-md">Export MD</button>
    <button type="button" id="btn-export-pdf">Export PDF</button>
    <button type="button" class="danger" id="btn-del-sum">Delete</button>
  `;

  const sections =
    s.sections && s.sections.length
      ? s.sections
      : [{ id: 'body', title: 'Deep-skim', body: s.markdown }];

  root.innerHTML = `
    <article class="reading">
      <header class="reading-header">
        <h1 id="sum-title-display">${escapeHtml(s.title)}</h1>
        <div class="meta" style="display:flex;flex-wrap:wrap;gap:0.5rem;font-size:0.85rem;color:var(--text-muted)">
          <span class="pill ${s.status === 'core' ? 'core' : ''}">${escapeHtml(s.status)}</span>
          <span>${formatDate(s.createdAt)}</span>
          ${doc ? `<span title="Source PDF">${escapeHtml(doc.title || doc.name)}</span>` : ''}
          <span>${escapeHtml(s.model || '')}</span>
          ${(s.tags || []).map((t) => `<span class="pill">${escapeHtml(t)}</span>`).join('')}
        </div>
        <div class="topbar-actions" style="margin-top:0.85rem">
          <button type="button" id="btn-rename-sum">Rename skim</button>
          <button type="button" data-status="core">Mark core</button>
          <button type="button" data-status="archive">Archive</button>
          <button type="button" data-status="promote">Promote to full reading</button>
          <button type="button" data-status="inbox">Inbox</button>
        </div>
      </header>
      <div class="section-stack">
        ${sections
          .map(
            (sec, i) => `
          <details class="section" ${i < 2 ? 'open' : ''}>
            <summary>${escapeHtml(sec.title || sec.heading || 'Section')}</summary>
            <div class="section-body">${markdownToHtml(sec.body || '')}</div>
          </details>`
          )
          .join('')}
      </div>

      <section class="notes-panel" aria-label="Personal reflections">
        <div class="section-head" style="margin-top:1.75rem">
          <h3>Reflections &amp; notes</h3>
          <p>Your thoughts — saved locally and included when you export MD/PDF</p>
        </div>
        <textarea id="sum-notes" class="notes-textarea" rows="8" placeholder="Connections, disagreements, research leads, quotes to chase…">${escapeHtml(s.notes || '')}</textarea>
        <div class="topbar-actions" style="margin-top:0.6rem">
          <button type="button" class="primary" id="btn-save-notes">Save notes</button>
          <span id="notes-saved-hint" class="help" style="margin:0;align-self:center"></span>
        </div>
      </section>
    </article>
  `;

  const getNotes = () => ($('#sum-notes')?.value || '').trim();

  $('#btn-back-sums').onclick = () => navigate('summaries');
  $('#btn-expand-all').onclick = () => {
    root.querySelectorAll('details.section').forEach((d) => {
      d.open = true;
    });
  };
  $('#btn-collapse-all').onclick = () => {
    root.querySelectorAll('details.section').forEach((d) => {
      d.open = false;
    });
  };
  $('#btn-quiz').onclick = () => navigate('quiz', { summaryId });
  $('#btn-rename-sum').onclick = async () => {
    const next = prompt('Rename this deep-skim:', s.title || '');
    if (next == null) return;
    const title = next.trim();
    if (!title) return toast('Title cannot be empty', true);
    await updateSummary(summaryId, { title, notes: getNotes() });
    toast('Renamed');
    navigate('summary', { summaryId });
  };
  $('#btn-save-notes').onclick = async () => {
    await updateSummary(summaryId, { notes: getNotes() });
    const hint = $('#notes-saved-hint');
    if (hint) hint.textContent = 'Saved · will appear in exports';
    toast('Notes saved');
  };
  // Autosave notes on blur
  $('#sum-notes')?.addEventListener('blur', async () => {
    const notes = getNotes();
    if (notes === (s.notes || '').trim()) return;
    await updateSummary(summaryId, { notes });
    const hint = $('#notes-saved-hint');
    if (hint) hint.textContent = 'Autosaved';
  });
  $('#btn-export-md').onclick = async () => {
    // ensure latest notes
    const notes = getNotes();
    if (notes !== (s.notes || '').trim()) await updateSummary(summaryId, { notes });
    const body = buildExportMarkdown(s.title || 'deep-skim', s.markdown, notes);
    downloadMarkdown(s.title || 'deep-skim', body);
  };
  $('#btn-export-pdf').onclick = async () => {
    const notes = getNotes();
    if (notes !== (s.notes || '').trim()) await updateSummary(summaryId, { notes });
    const notesHtml = notes
      ? notes
          .split(/\n\n+/)
          .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
          .join('')
      : '';
    exportPdfViaPrint(s.title, markdownToHtml(s.markdown), {
      notesHtml: notesHtml || null,
    });
  };
  $('#btn-del-sum').onclick = async () => {
    if (!confirm('Delete this summary?')) return;
    await deleteSummary(summaryId);
    toast('Summary deleted');
    navigate('summaries');
  };

  root.querySelectorAll('[data-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const status = btn.dataset.status;
      const tags = new Set(s.tags || []);
      if (status === 'promote') tags.add('full-reading');
      await updateSummary(summaryId, { status, tags: [...tags], notes: getNotes() });
      toast(`Marked as ${status}`);
      navigate('summary', { summaryId });
    });
  });
}

// ── Quiz ───────────────────────────────────────────────────

async function renderQuiz(root, actions, summaryId) {
  const s = await getSummary(summaryId);
  if (!s) {
    root.innerHTML = '<div class="empty-state"><h3>Summary not found</h3></div>';
    return;
  }
  const questions = s.questions || [];
  if (!questions.length) {
    root.innerHTML = `<div class="empty-state"><h3>No active-recall questions</h3><p>This summary has no parsed Q/A pairs.</p>
      <button type="button" id="btn-back">Back</button></div>`;
    $('#btn-back').onclick = () => navigate('summary', { summaryId });
    return;
  }

  $('#view-title').textContent = 'Active recall';
  actions.innerHTML = `<button type="button" class="ghost" id="btn-back-sum">← Summary</button>`;
  $('#btn-back-sum').onclick = () => navigate('summary', { summaryId });

  let index = 0;
  let revealed = false;
  const grades = [];

  const paint = () => {
    const q = questions[index];
    root.innerHTML = `
      <div class="quiz-card">
        <div class="quiz-progress">Question ${index + 1} of ${questions.length}</div>
        <p class="quiz-question">${escapeHtml(q.question)}</p>
        ${
          revealed
            ? `<div class="quiz-answer revealed"><strong>Model answer</strong><br>${escapeHtml(q.answer)}</div>
               <div class="quiz-grades">
                 <button type="button" data-grade="again">Again</button>
                 <button type="button" data-grade="hard">Hard</button>
                 <button type="button" data-grade="good" class="primary">Good</button>
                 <button type="button" data-grade="easy">Easy</button>
               </div>`
            : `<button type="button" class="primary" id="btn-reveal">Reveal answer</button>
               <p style="color:var(--text-faint);font-size:0.85rem;margin-top:1rem">Self-grade honestly after revealing. Spaced review uses your grades.</p>`
        }
      </div>
    `;

    if (!revealed) {
      $('#btn-reveal').onclick = () => {
        revealed = true;
        paint();
      };
    } else {
      root.querySelectorAll('[data-grade]').forEach((btn) => {
        btn.onclick = async () => {
          const grade = btn.dataset.grade;
          grades.push(grade);
          await putReview({
            summaryId,
            questionIndex: q.index ?? index,
            grade,
          });
          if (index + 1 < questions.length) {
            index += 1;
            revealed = false;
            paint();
          } else {
            // Session grade = worst of grades (conservative)
            const order = ['again', 'hard', 'good', 'easy'];
            const worst = grades.reduce(
              (w, g) => (order.indexOf(g) < order.indexOf(w) ? g : w),
              'easy'
            );
            await scheduleNextReview(summaryId, worst);
            root.innerHTML = `
              <div class="quiz-card">
                <div class="quiz-progress">Session complete</div>
                <p class="quiz-question">Nice work. Next review scheduled from grade “${escapeHtml(worst)}”.</p>
                <div class="quiz-grades">
                  <button type="button" class="primary" id="btn-done">Back to summary</button>
                  <button type="button" id="btn-review-hub">Review hub</button>
                </div>
              </div>`;
            $('#btn-done').onclick = () => navigate('summary', { summaryId });
            $('#btn-review-hub').onclick = () => navigate('review');
            refreshNavBadges();
          }
        };
      });
    }
  };

  paint();
}

// ── Review hub ─────────────────────────────────────────────

async function renderReviewHub(root, actions) {
  const due = await getDueReviews(3);
  const all = await listSummaries();
  actions.innerHTML = '';

  root.innerHTML = `
    <div class="content-narrow">
      <p style="color:var(--text-muted);margin-top:0;max-width:36rem">
        Each week, re-test 2–3 older deep-skims. Active recall beats re-reading.
      </p>
      <h3 style="font-family:var(--font-serif)">Due now</h3>
      ${
        due.length
          ? `<div class="card-list">${due
              .map(
                (s) => `
            <article class="card">
              <div>
                <h3>${escapeHtml(s.title)}</h3>
                <div class="meta">
                  <span>last: ${s.lastReviewedAt ? formatDate(s.lastReviewedAt) : 'never'}</span>
                  <span>due: ${formatDate(s.nextReviewAt)}</span>
                </div>
              </div>
              <div class="actions">
                <button type="button" class="primary" data-quiz="${s.id}">Quiz</button>
                <button type="button" data-open="${s.id}">Open</button>
              </div>
            </article>`
              )
              .join('')}</div>`
          : `<p style="color:var(--text-faint)">Nothing due. ${all.length ? 'Come back later or open any summary to quiz early.' : 'Generate summaries first.'}</p>`
      }

      <h3 style="font-family:var(--font-serif);margin-top:2rem">All (by next review)</h3>
      <div class="card-list">
        ${all
          .slice()
          .sort((a, b) => (a.nextReviewAt || 0) - (b.nextReviewAt || 0))
          .map(
            (s) => `
          <article class="card clickable" data-open="${s.id}">
            <div>
              <h3>${escapeHtml(s.title)}</h3>
              <div class="meta">
                <span class="pill">${escapeHtml(s.status)}</span>
                <span>next ${formatDate(s.nextReviewAt)}</span>
                <span>${s.reviewCount || 0} sessions</span>
              </div>
            </div>
          </article>`
          )
          .join('') || '<p class="empty-state">No summaries</p>'}
      </div>
    </div>
  `;

  root.querySelectorAll('[data-quiz]').forEach((btn) => {
    btn.onclick = () => navigate('quiz', { summaryId: btn.dataset.quiz });
  });
  root.querySelectorAll('[data-open]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-quiz]')) return;
      navigate('summary', { summaryId: el.dataset.open });
    });
  });
}

// ── Search ─────────────────────────────────────────────────

async function renderSearch(root) {
  root.innerHTML = `
    <div class="content-narrow">
      <div class="search-box">
        <input type="search" id="search-input" placeholder="Search titles, tags, summary text…" autofocus />
      </div>
      <div id="search-results"></div>
    </div>
  `;

  const input = $('#search-input');
  const out = $('#search-results');
  let timer;

  const run = async () => {
    const q = input.value;
    if (!q.trim()) {
      out.innerHTML = '<p style="color:var(--text-faint)">Type to search local library.</p>';
      return;
    }
    const { documents, summaries } = await searchAll(q);
    out.innerHTML = `
      <h3 style="font-family:var(--font-serif)">Documents (${documents.length})</h3>
      <div class="card-list" style="margin-bottom:1.5rem">
        ${
          documents
            .map(
              (d) => `
          <article class="card clickable" data-doc="${d.id}">
            <div><h3>${escapeHtml(d.title || d.name)}</h3>
            <div class="meta"><span>${escapeHtml(d.status)}</span><span>${escapeHtml(d.priority)}</span></div></div>
          </article>`
            )
            .join('') || '<p style="color:var(--text-faint)">No documents</p>'
        }
      </div>
      <h3 style="font-family:var(--font-serif)">Summaries (${summaries.length})</h3>
      <div class="card-list">
        ${
          summaries
            .map(
              (s) => `
          <article class="card clickable" data-sum="${s.id}">
            <div><h3>${escapeHtml(s.title)}</h3>
            <div class="meta"><span>${formatDate(s.createdAt)}</span></div></div>
          </article>`
            )
            .join('') || '<p style="color:var(--text-faint)">No summaries</p>'
        }
      </div>
    `;
    out.querySelectorAll('[data-doc]').forEach((el) => {
      el.onclick = () => navigate('document', { docId: el.dataset.doc });
    });
    out.querySelectorAll('[data-sum]').forEach((el) => {
      el.onclick = () => navigate('summary', { summaryId: el.dataset.sum });
    });
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(run, 180);
  });
  run();
}

// ── Settings ───────────────────────────────────────────────

async function renderSettings(root, actions) {
  settingsCache = await getSettings();
  // Migrate older installs that only have a URL
  if (!settingsCache.llmProvider) {
    settingsCache.llmProvider = inferProviderId(settingsCache.llmBaseUrl);
  }
  actions.innerHTML = `<button type="button" class="primary" id="btn-save-settings">Save settings</button>`;

  const providerId = settingsCache.llmProvider || 'gemini';
  const privacy = privacyCopy(providerId);

  root.innerHTML = `
    <div class="content-narrow">
      <aside class="privacy-callout privacy-${privacy.level}" id="privacy-callout">
        <p class="privacy-title">${escapeHtml(privacy.title)}</p>
        <p class="privacy-body">${escapeHtml(privacy.body)}</p>
        <ul class="privacy-points">
          <li>PDFs, extractions, quizzes, and summaries stay in <strong>this browser’s IndexedDB</strong>.</li>
          <li>API keys are stored <strong>only locally</strong> (never uploaded to Deep-Skim — there is no Deep-Skim server).</li>
          <li>Cloud generation sends <strong>extracted text</strong> (and the system prompt), not the binary PDF, unless you use a local provider.</li>
          <li>Switch to <strong>Ollama</strong> anytime for air-gapped / sensitive material.</li>
        </ul>
      </aside>

      <form class="settings-form" id="settings-form" onsubmit="return false">
        <fieldset class="settings-block">
          <legend>Deep-skim model</legend>

          <div class="field">
            <label for="llmProvider">Provider</label>
            <select id="llmProvider">
              ${providerOptionsHtml(providerId)}
            </select>
            <div class="help" id="provider-help">${escapeHtml(getProvider(providerId).help)}</div>
          </div>

          <div class="field">
            <label for="llmBaseUrl">Base URL (OpenAI-compatible <code>/v1</code>)</label>
            <input type="url" id="llmBaseUrl" value="${escapeAttr(settingsCache.llmBaseUrl)}" autocomplete="off" />
          </div>

          <div class="field">
            <label for="llmModelSelect">Model</label>
            <select id="llmModelSelect" aria-describedby="model-help">
              ${modelOptionsHtml(providerId, settingsCache.llmModel)}
            </select>
            <input
              type="text"
              id="llmModelCustom"
              class="model-custom-input"
              value="${escapeAttr(settingsCache.llmModel)}"
              placeholder="Type exact model id…"
              autocomplete="off"
              spellcheck="false"
              hidden
            />
            <div class="help" id="model-help">Models for this provider only. Pick from the list, or <strong>Custom model…</strong> to type any id. Test connection may add live models from the API.</div>
          </div>

          <div class="field">
            <label for="llmApiKey">API key</label>
            <div class="key-row">
              <input type="password" id="llmApiKey" value="${escapeAttr(settingsCache.llmApiKey || '')}" autocomplete="off" placeholder="${escapeAttr(getProvider(providerId).keyPlaceholder)}" />
              <button type="button" class="ghost" id="btn-toggle-key" title="Show / hide key">Show</button>
            </div>
            <div class="help" id="key-help">
              ${
                getProvider(providerId).needsKey
                  ? `Required. Create a key at <a href="${getProvider(providerId).docsUrl}" target="_blank" rel="noopener">${escapeHtml(getProvider(providerId).docsUrl || '')}</a>.`
                  : 'Optional for local Ollama / many local servers.'
              }
            </div>
          </div>

          <div class="field" id="cloud-ack-field" ${getProvider(providerId).leavesMachine ? '' : 'hidden'}>
            <label class="check-label">
              <input type="checkbox" id="privacyAckCloud" ${settingsCache.privacyAckCloud ? 'checked' : ''} />
              I understand extracted text is sent to this cloud provider when I generate a deep-skim
            </label>
          </div>

          <div class="field">
            <label for="maxContextChars">Max source characters (single-pass window)</label>
            <input type="number" id="maxContextChars" min="10000" step="1000" value="${settingsCache.maxContextChars || 120000}" />
            <div class="help">Single-pass window / multipass trigger. Long books auto map→reduce, then staged write (§1–2, §3–4, §5–8) for a <strong>substantial condensed reading</strong> (~10–20p notes for a ~200p book; ~25–50p for ~500p).</div>
          </div>

          <div class="field">
            <label class="check-label">
              <input type="checkbox" id="multipassEnabled" ${settingsCache.multipassEnabled !== false ? 'checked' : ''} />
              Multipass for long books (map → staged reduce)
            </label>
            <div class="help">Recommended on. Dense map cards per chunk, then multi-part write for argumentative flesh (not abstract summary). More API calls; free-tier rate limits may apply.</div>
          </div>

          <div class="field multipass-fields" id="multipass-fields">
            <label for="mapChunkChars">Map chunk size (characters)</label>
            <input type="number" id="mapChunkChars" min="20000" step="5000" value="${settingsCache.mapChunkChars || 55000}" />
            <div class="help" style="margin-top:0.65rem">
              <label for="maxMapChunks">Max map passes</label>
            </div>
            <input type="number" id="maxMapChunks" min="2" max="16" step="1" value="${settingsCache.maxMapChunks || 12}" />
            <div class="help">Defaults 55k / 12 maps. Lower max maps if free-tier 429s on huge books.</div>
          </div>

          <div class="field row-actions">
            <button type="button" class="primary" id="btn-test-llm">Test connection</button>
            <button type="button" id="btn-apply-free">Use free Gemini</button>
            <button type="button" class="ghost" id="btn-apply-deepseek">Use DeepSeek</button>
            <button type="button" class="ghost" id="btn-apply-kimi">Use Kimi</button>
            <button type="button" class="ghost" id="btn-apply-ollama">Use Ollama</button>
            <button type="button" class="ghost" id="btn-apply-grok">Use Grok</button>
          </div>
        </fieldset>

        <fieldset class="settings-block">
          <legend>OCR (scans)</legend>
          <p class="help" style="margin-top:0">
            <strong>Default:</strong> Google Gemini vision uses the same API key as deep-skims — no localhost OCR install.
            Native PDF text is always tried first. Local Unlimited/DeepSeek bridge is optional for advanced offline use.
          </p>
          <div class="field">
            <label for="ocrProvider">OCR path</label>
            <select id="ocrProvider">
              ${[
                ['auto', 'Auto — Gemini cloud if key set (recommended)'],
                ['gemini', 'Gemini / cloud vision only'],
                ['local', 'Local bridge only (optional)'],
                ['none', 'Native PDF text only (no OCR)'],
              ]
                .map(
                  ([v, label]) =>
                    `<option value="${v}" ${settingsCache.ocrProvider === v || (v === 'local' && ['unlimited-ocr', 'deepseek-ocr'].includes(settingsCache.ocrProvider)) ? 'selected' : ''}>${label}</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="field">
            <label for="cloudOcrMaxPages">Cloud OCR max pages (free-tier cap)</label>
            <input type="number" id="cloudOcrMaxPages" min="5" max="200" step="1" value="${settingsCache.cloudOcrMaxPages || 48}" />
            <div class="help">Long scans sample evenly up to this many pages to save quota.</div>
          </div>
          <div class="field">
            <label for="ocrBridgeUrl">Local OCR bridge URL (optional)</label>
            <input type="url" id="ocrBridgeUrl" value="${escapeAttr(settingsCache.ocrBridgeUrl)}" />
            <div class="help">Only if you run scripts/ocr_bridge.py — not required for Gemini.</div>
          </div>
          <div class="field">
            <button type="button" id="btn-test-ocr">Test OCR readiness</button>
          </div>
        </fieldset>

        <fieldset class="settings-block">
          <legend>Library</legend>
          <div class="field">
            <label for="asapFolderHint">ASAP folder name hint</label>
            <input type="text" id="asapFolderHint" value="${escapeAttr(settingsCache.asapFolderHint)}" />
          </div>
          <div class="field">
            <label class="check-label">
              <input type="checkbox" id="weeklyReminderEnabled" ${settingsCache.weeklyReminderEnabled ? 'checked' : ''} />
              Show weekly deep-skim reminder
            </label>
          </div>
          <div class="field">
            <label for="projectPagesPerWeek">Multi-week: pages per week (default)</label>
            <input type="number" id="projectPagesPerWeek" min="80" max="400" step="10" value="${settingsCache.projectPagesPerWeek || 200}" />
            <div class="help">Used when creating projects. ~200pp/week is a solid default for substantial skims without re-sending the whole book.</div>
          </div>
        </fieldset>

        <fieldset class="settings-block" id="research-lenses-block">
          <legend>Research lenses</legend>
          <p class="help" style="margin-top:0">
            Customize how deep-skims personalize <strong>§6 Connections</strong> (and light relevance bias elsewhere).
            The structure of the report stays fixed; only the <em>hooks and keywords</em> change.
            Edit anytime — next generate uses the saved set. Stored only in this browser.
          </p>
          <div class="field">
            <label for="researchLensesText">Keywords / lenses (one per line)</label>
            <textarea
              id="researchLensesText"
              class="settings-textarea"
              rows="8"
              spellcheck="false"
              placeholder="e.g.&#10;behavioral economics&#10;institutional design&#10;media archaeology"
            >${escapeHtml(settingsCache.researchLensesText || '')}</textarea>
            <div class="help">Commas also work. Empty → ship defaults restore on save. Clear and type your own stack for a different research practice.</div>
          </div>
          <div class="field">
            <label for="researchFocusNote">Focus note (optional)</label>
            <textarea
              id="researchFocusNote"
              class="settings-textarea"
              rows="3"
              placeholder="e.g. PhD on assemblage theory · SchizoFringe monthly episode prep · comparative institutional history…"
            >${escapeHtml(settingsCache.researchFocusNote || '')}</textarea>
            <div class="help">Short context for the model (project, show, dissertation). Never invents a biography beyond what you write here.</div>
          </div>
          <div class="field row-actions">
            <button type="button" class="ghost" id="btn-reset-lenses">Restore ship defaults</button>
          </div>
        </fieldset>

        <div id="settings-status" class="status-line">Free path: Use free Gemini → paste AI Studio key → Save → Test connection.</div>
      </form>

      <section class="setup-guide">
        <h3>Free path (recommended): Gemini 3.5 Flash</h3>
        <ol>
          <li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio → Get API key</a> (free tier; no paid Grok/Claude API needed).</li>
          <li>Click <strong>Use free Gemini</strong> above (defaults to <code>gemini-3.5-flash</code>).</li>
          <li>Paste the key → tick the cloud note → <strong>Save</strong> → <strong>Test connection</strong>.</li>
          <li>If generate fails with “model no longer available”, pick <code>gemini-3.5-flash</code> or <code>gemini-3.1-flash-lite</code> (not 2.5 for new keys).</li>
          <li>Library → ready PDF → <strong>Generate deep-skim</strong>.</li>
        </ol>
        <p class="help" style="margin-bottom:0.75rem">
          <strong>Claude Pro / Max does not work here.</strong> That sub covers claude.ai and official Claude Code — not third-party apps. Same for SuperGrok vs the Grok API.
          For Claude quality you’d need a separate Anthropic/OpenRouter <em>API</em> balance (paid).
        </p>
        <p class="help">
          Fully offline free: <strong>Use Ollama</strong>. Strong low-cost cloud: <strong>DeepSeek</strong> or <strong>Kimi</strong>
          (often better structure than free Gemini). Details in <code>docs/llm-setup.md</code>.
        </p>
      </section>
    </div>
  `;

  const status = $('#settings-status');
  /** @type {string[]} */
  let liveModels = [];

  const getSelectedModel = () => {
    const sel = $('#llmModelSelect');
    const custom = $('#llmModelCustom');
    if (!sel) return '';
    if (sel.value === CUSTOM_MODEL_VALUE) {
      return (custom?.value || '').trim();
    }
    return sel.value.trim();
  };

  const syncModelCustomVisibility = () => {
    const sel = $('#llmModelSelect');
    const custom = $('#llmModelCustom');
    if (!sel || !custom) return;
    const isCustom = sel.value === CUSTOM_MODEL_VALUE;
    custom.hidden = !isCustom;
    if (isCustom) {
      custom.focus();
      if (!custom.value.trim() && sel.dataset.lastPreset) {
        // keep whatever was typed; no-op
      }
    }
  };

  const rebuildModelSelect = (providerId, preferredModel, extras = liveModels) => {
    const sel = $('#llmModelSelect');
    const custom = $('#llmModelCustom');
    if (!sel) return;
    const p = getProvider(providerId);
    const want = (preferredModel ?? getSelectedModel()) || p.model;
    sel.innerHTML = modelOptionsHtml(providerId, want, extras);
    // If want is not in curated/extras, modelOptionsHtml already added a "(saved)" option
    // and selected it — ensure custom field tracks current value
    if (custom) custom.value = want;
    const matched = [...sel.options].some(
      (o) => o.value === want && o.value !== CUSTOM_MODEL_VALUE
    );
    if (!matched && want) {
      sel.value = want;
      // if browser couldn't select unknown, force custom mode
      if (sel.value !== want) {
        sel.value = CUSTOM_MODEL_VALUE;
        custom.value = want;
      }
    }
    syncModelCustomVisibility();
  };

  const applyProviderFields = (id, { fillDefaults = true } = {}) => {
    const p = getProvider(id);
    $('#provider-help').textContent = p.help;
    if (fillDefaults) {
      $('#llmBaseUrl').value = p.baseUrl;
      $('#llmApiKey').placeholder = p.keyPlaceholder || '';
      liveModels = [];
      rebuildModelSelect(id, p.model, []);
    } else {
      rebuildModelSelect(id, getSelectedModel() || settingsCache.llmModel, liveModels);
    }
    const ack = $('#cloud-ack-field');
    if (ack) ack.hidden = !p.leavesMachine;
    const keyHelp = $('#key-help');
    if (keyHelp) {
      keyHelp.innerHTML = p.needsKey
        ? `Required. Create a key at <a href="${escapeAttr(p.docsUrl || '#')}" target="_blank" rel="noopener">${escapeHtml(p.docsUrl || '')}</a>.`
        : 'Optional for local Ollama / many local servers.';
    }
    // privacy callout
    const priv = privacyCopy(id);
    const callout = $('#privacy-callout');
    if (callout) {
      callout.className = `privacy-callout privacy-${priv.level}`;
      callout.querySelector('.privacy-title').textContent = priv.title;
      callout.querySelector('.privacy-body').textContent = priv.body;
    }
  };

  // Initial custom-field visibility (saved model may be custom-only)
  rebuildModelSelect(providerId, settingsCache.llmModel, []);
  syncModelCustomVisibility();

  $('#llmProvider').addEventListener('change', () => {
    applyProviderFields($('#llmProvider').value, { fillDefaults: true });
  });

  $('#llmModelSelect').addEventListener('change', () => {
    const sel = $('#llmModelSelect');
    const custom = $('#llmModelCustom');
    if (sel.value !== CUSTOM_MODEL_VALUE && custom) {
      custom.value = sel.value;
    }
    syncModelCustomVisibility();
  });

  $('#btn-apply-free').onclick = () => {
    $('#llmProvider').value = 'gemini';
    applyProviderFields('gemini', { fillDefaults: true });
    toast('Free Gemini defaults — paste AI Studio key and Save');
  };

  $('#btn-apply-deepseek').onclick = () => {
    $('#llmProvider').value = 'deepseek';
    applyProviderFields('deepseek', { fillDefaults: true });
    toast('DeepSeek defaults — key from platform.deepseek.com');
  };

  $('#btn-apply-kimi').onclick = () => {
    $('#llmProvider').value = 'kimi';
    applyProviderFields('kimi', { fillDefaults: true });
    toast('Kimi defaults — key from platform.kimi.ai / moonshot');
  };

  $('#btn-apply-ollama').onclick = () => {
    $('#llmProvider').value = 'ollama';
    applyProviderFields('ollama', { fillDefaults: true });
    toast('Ollama defaults — ensure ollama serve is running');
  };

  $('#btn-apply-grok').onclick = () => {
    $('#llmProvider').value = 'grok';
    applyProviderFields('grok', { fillDefaults: true });
    toast('Grok defaults applied — needs console API credits, not SuperGrok alone');
  };

  $('#btn-toggle-key').onclick = () => {
    const input = $('#llmApiKey');
    const btn = $('#btn-toggle-key');
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = 'Hide';
    } else {
      input.type = 'password';
      btn.textContent = 'Show';
    }
  };

  $('#btn-save-settings').onclick = async () => {
    const provider = $('#llmProvider').value;
    const p = getProvider(provider);
    const model = getSelectedModel();
    if (!model) {
      status.textContent = 'Save blocked: choose a model or type a custom model id.';
      status.className = 'status-line err';
      return;
    }
    if (p.leavesMachine && p.needsKey && !$('#llmApiKey').value.trim()) {
      status.textContent = 'Save blocked: paste an API key for this cloud provider.';
      status.className = 'status-line err';
      return;
    }
    if (p.leavesMachine && !$('#privacyAckCloud').checked) {
      status.textContent = 'Save blocked: acknowledge that extracted text is sent to the cloud provider.';
      status.className = 'status-line err';
      return;
    }
    let lensesText = ($('#researchLensesText')?.value || '').trim();
    if (!lensesText) {
      lensesText = DEFAULT_RESEARCH_LENSES_TEXT;
      if ($('#researchLensesText')) $('#researchLensesText').value = lensesText;
    }
    settingsCache = await setSettings({
      llmProvider: provider,
      llmBaseUrl: $('#llmBaseUrl').value.trim(),
      llmModel: model,
      llmApiKey: $('#llmApiKey').value,
      maxContextChars: Number($('#maxContextChars').value) || 120000,
      multipassEnabled: $('#multipassEnabled').checked,
      mapChunkChars: Number($('#mapChunkChars').value) || 55000,
      maxMapChunks: Math.min(16, Math.max(2, Number($('#maxMapChunks').value) || 12)),
      ocrBridgeUrl: $('#ocrBridgeUrl').value.trim(),
      ocrProvider: $('#ocrProvider').value,
      cloudOcrMaxPages: Math.min(200, Math.max(5, Number($('#cloudOcrMaxPages')?.value) || 48)),
      asapFolderHint: $('#asapFolderHint').value.trim(),
      weeklyReminderEnabled: $('#weeklyReminderEnabled').checked,
      projectPagesPerWeek: Math.min(400, Math.max(80, Number($('#projectPagesPerWeek')?.value) || 200)),
      privacyAckCloud: $('#privacyAckCloud').checked,
      researchLensesText: lensesText,
      researchFocusNote: ($('#researchFocusNote')?.value || '').trim(),
    });
    status.textContent = 'Saved locally in IndexedDB.';
    status.className = 'status-line ok';
    toast('Settings saved');
    probeServices();
  };

  const resetLensesBtn = $('#btn-reset-lenses');
  if (resetLensesBtn) {
    resetLensesBtn.onclick = () => {
      if ($('#researchLensesText')) {
        $('#researchLensesText').value = DEFAULT_RESEARCH_LENSES_TEXT;
      }
      toast('Ship default lenses restored in the form — Save to keep');
    };
  }

  $('#btn-test-llm').onclick = async () => {
    status.textContent = 'Testing LLM…';
    status.className = 'status-line';
    const r = await checkLlm($('#llmBaseUrl').value.trim(), $('#llmApiKey').value);
    if (r.ok) {
      const models = r.models || [];
      // Keep dropdown useful: prefer chat-ish ids, cap length
      liveModels = models
        .filter((id) => typeof id === 'string' && id.length < 80)
        .filter((id) => !/embed|tts|whisper|dall|image|audio|moderation/i.test(id))
        .slice(0, 40);
      const current = getSelectedModel();
      rebuildModelSelect($('#llmProvider').value, current, liveModels);
      const sample = liveModels.slice(0, 6).join(', ') || 'n/a';
      status.textContent = `${r.message}. Models in dropdown: ${liveModels.length || 'curated only'}. Sample: ${sample}`;
      status.className = 'status-line ok';
      toast(
        liveModels.length
          ? `LLM OK — ${liveModels.length} models added to dropdown`
          : 'LLM connection OK'
      );
    } else {
      status.textContent = `LLM unreachable: ${r.reason}`;
      status.className = 'status-line err';
    }
    probeServices();
  };

  $('#btn-test-ocr').onclick = async () => {
    status.textContent = 'Checking OCR…';
    status.className = 'status-line';
    const provider = $('#ocrProvider').value;
    const key = $('#llmApiKey').value.trim();
    const base = $('#llmBaseUrl').value.trim();
    const parts = [];

    if (provider !== 'local' && provider !== 'none' && key && base) {
      parts.push('Cloud OCR (Gemini): ready — uses your LLM API key on scanned pages');
    } else if (provider !== 'local' && provider !== 'none') {
      parts.push('Cloud OCR: needs Gemini API key in Settings (same as deep-skim generation)');
    }

    if (provider === 'local' || provider === 'auto') {
      const r = await checkOcrBridge($('#ocrBridgeUrl').value.trim());
      parts.push(
        r.ok
          ? `Local bridge: online (${(r.providers || []).join(', ') || 'ok'})`
          : `Local bridge: offline (${r.reason}) — optional`
      );
    }

    if (provider === 'none') {
      parts.push('OCR disabled — native PDF text only');
    }

    const cloudReady = provider !== 'local' && provider !== 'none' && key && base;
    status.textContent = parts.join(' · ');
    status.className = 'status-line ' + (cloudReady || provider === 'none' ? 'ok' : 'err');
    toast(cloudReady ? 'OCR ready via Gemini' : 'See status line for OCR setup');
    probeServices();
  };

  // silence unused import lint for full map (used via getProvider)
  void LLM_PROVIDERS;
}

// ── Weekly reminder ────────────────────────────────────────

async function maybeShowWeeklyReminder() {
  settingsCache = await getSettings();
  if (!settingsCache.weeklyReminderEnabled) return;
  const wk = weekKey();
  if (settingsCache.lastSummaryWeekKey === wk) return;
  // soft: only show banner on library via paintWeeklyBanner
}

async function paintWeeklyBanner(slot) {
  if (!slot) return;
  settingsCache = await getSettings();
  if (!settingsCache.weeklyReminderEnabled) {
    slot.innerHTML = '';
    return;
  }
  const wk = weekKey();
  if (settingsCache.lastSummaryWeekKey === wk) {
    slot.innerHTML = `
      <div class="banner">
        <p>This week’s deep-skim slot is used (${escapeHtml(wk)}). Review older cards when you can.</p>
        <button type="button" id="btn-go-review">Open review</button>
      </div>`;
    $('#btn-go-review').onclick = () => navigate('review');
    return;
  }

  const docs = await listDocuments();
  const asap = docs.find((d) => d.priority === 'asap' && (d.status === 'ready' || d.status === 'summarized'));
  const ready = asap || docs.find((d) => d.status === 'ready');

  slot.innerHTML = `
    <div class="banner">
      <p><strong>Weekly deep-skim:</strong> no summary generated for ${escapeHtml(wk)} yet.
        ${ready ? `Candidate: ${escapeHtml(ready.title || ready.name)}` : 'Add a ready PDF when you can.'}</p>
      <div style="display:flex;gap:0.4rem">
        ${ready ? `<button type="button" class="primary" id="btn-weekly-gen">Generate from candidate</button>` : ''}
        <button type="button" id="btn-go-lib-docs">Browse library</button>
      </div>
    </div>`;

  if (ready) {
    $('#btn-weekly-gen').onclick = () => navigate('document', { docId: ready.id });
  }
}

// ── Toasts / progress ─────────────────────────────────────

function toast(message, isError = false) {
  const host = $('#toast-host');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 4200);
}

function showProgress(message, percent) {
  const host = $('#toast-host');
  if (!host) return;
  if (!progressToastEl) {
    progressToastEl = document.createElement('div');
    progressToastEl.className = 'toast progress';
    host.appendChild(progressToastEl);
    progressStartedAt = Date.now();
    if (progressTicker) clearInterval(progressTicker);
    progressTicker = setInterval(() => {
      if (!progressToastEl) return;
      const el = progressToastEl.querySelector('[data-elapsed]');
      if (el) el.textContent = formatElapsed(Date.now() - progressStartedAt);
    }, 1000);
  }
  const pct = percent == null ? null : Math.max(0, Math.min(100, percent));
  const elapsed = formatElapsed(Date.now() - (progressStartedAt || Date.now()));
  progressToastEl.innerHTML = `
    <div>${escapeHtml(message)}</div>
    <div class="progress-meta" style="font-size:0.8rem;opacity:0.75;margin-top:0.25rem">
      Elapsed <span data-elapsed>${elapsed}</span>
      ${pct != null ? ` · ${Math.round(pct)}%` : ' · working…'}
      <span style="opacity:0.8"> · free tier can take several minutes per step</span>
    </div>
    ${pct != null ? `<div class="progress-bar"><span style="width:${pct}%"></span></div>` : ''}
  `;
}

function formatElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

function hideProgress() {
  if (progressTicker) {
    clearInterval(progressTicker);
    progressTicker = null;
  }
  progressToastEl?.remove();
  progressToastEl = null;
  progressStartedAt = 0;
}

// ── Utils ──────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
