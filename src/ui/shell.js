/**
 * Browser chrome: sidebar, topbar, status rail, hash routing helpers.
 */
import { icons, brandOtterSvg } from './icons.js';
import { installUiHtml } from '../pwa.js';

export function shellHtml() {
  return `
    <a class="skip-link" href="#view-root">Skip to content</a>
    <div class="sidebar-backdrop" id="sidebar-backdrop" hidden></div>
    <div class="app-shell">
      <aside class="sidebar" id="sidebar" aria-label="Main navigation">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true" title="Otterly Deep-Skim">${brandOtterSvg}</div>
          <div class="brand-text">
            <h1>Deep-Skim</h1>
            <p>Local-first reading</p>
          </div>
        </div>

        <nav class="nav-primary" aria-label="Primary">
          <button class="nav-btn active" data-nav="library" type="button">
            ${icons.library}<span>Library</span>
          </button>
          <button class="nav-btn" data-nav="summaries" type="button">
            ${icons.summaries}<span>Summaries</span>
            <span class="badge" id="nav-sum-count">0</span>
          </button>
          <button class="nav-btn" data-nav="review" type="button">
            ${icons.review}<span>Review</span>
            <span class="badge" id="nav-review-count">0</span>
          </button>
          <button class="nav-btn" data-nav="settings" type="button">
            ${icons.settings}<span>Settings</span>
          </button>
          <details class="nav-more" id="nav-more">
            <summary class="nav-more-sum">${icons.more || ''}<span>More</span></summary>
            <button class="nav-btn" data-nav="reading-list" type="button" title="Full books worth sitting with">
              ${icons.readingList}<span>Reading List</span>
              <span class="badge" id="nav-reading-count">0</span>
            </button>
            <button class="nav-btn" data-nav="starred" type="button" title="Starred deep-skims to revisit">
              ${icons.star}<span>Starred</span>
              <span class="badge" id="nav-star-count">0</span>
            </button>
            <button class="nav-btn" data-nav="projects" type="button">
              ${icons.projects || icons.library}<span>Projects</span>
              <span class="badge" id="nav-proj-count">0</span>
            </button>
            <button class="nav-btn" data-nav="search" type="button">
              ${icons.search}<span>Search</span>
            </button>
          </details>
        </nav>

        <div class="sidebar-panel">
          <div class="panel-label">This week</div>
          <div class="week-meter" id="week-meter">
            <div class="week-meter-track"><span id="week-meter-fill"></span></div>
            <p id="week-meter-label">Checking…</p>
          </div>
        </div>

        <div class="sidebar-footer">
          <div class="status-rail" id="status-rail" title="Local service status">
            <div class="status-item" data-svc="llm">
              <span class="dot" id="dot-llm"></span>
              <span>LLM</span>
            </div>
            <div class="status-item" data-svc="ocr" title="Optional local OCR for scans">
              <span class="dot idle" id="dot-ocr"></span>
              <span>OCR</span>
            </div>
            <div class="status-item">
              <span class="dot ok"></span>
              <span>Local</span>
            </div>
          </div>
          <div class="pwa-side-slot" id="pwa-side-slot">${installUiHtml('compact')}</div>
          <p class="sidebar-support">
            <a href="https://ko-fi.com/otterlyfrank" target="_blank" rel="noopener">Support on Ko-fi</a>
          </p>
          <button class="ghost theme-toggle" id="btn-theme" type="button" aria-label="Toggle theme">
            <span id="theme-icon">${icons.sun}</span>
            <span id="theme-label">Light mode</span>
          </button>
        </div>
      </aside>

      <div class="main">
        <header class="topbar">
          <button class="menu-toggle ghost icon-btn" id="btn-menu" type="button" aria-label="Open menu" aria-controls="sidebar" aria-expanded="false">
            ${icons.menu}
          </button>
          <div class="topbar-title-wrap">
            <h2 id="view-title">Library</h2>
            <p class="topbar-sub" id="view-sub"></p>
          </div>
          <div class="topbar-actions" id="topbar-actions"></div>
        </header>
        <main class="content" id="view-root" tabindex="-1"></main>
      </div>
    </div>
    <nav class="mobile-nav" aria-label="Primary mobile">
      <button type="button" class="mobile-nav-btn active" data-nav="library"><span aria-hidden="true">⌂</span>Library</button>
      <button type="button" class="mobile-nav-btn" data-nav="summaries"><span aria-hidden="true">▤</span>Skims</button>
      <button type="button" class="mobile-nav-btn" data-nav="review"><span aria-hidden="true">↻</span>Review</button>
      <button type="button" class="mobile-nav-btn" data-nav="settings"><span aria-hidden="true">⚙</span>More</button>
    </nav>
    <div class="toast-host" id="toast-host" aria-live="polite"></div>
  `;
}

export function welcomeHtml() {
  return `
    <section class="welcome">
      <div class="welcome-hero">
        <p class="eyebrow">Personal deep-skim system</p>
        <h2>Read less. Keep more.</h2>
        <p class="lede">
          One high-signal structured skim per week — claims, verbatim passages,
          mental models, active recall, and a dual-pressure stress test.
          Everything stays in this browser.
        </p>
        <div class="welcome-actions">
          <button type="button" class="primary btn-lg" id="welcome-add">
            ${icons.upload} Add your first PDF
          </button>
          <button type="button" class="btn-lg" id="welcome-settings">
            ${icons.settings} Connect free Gemini
          </button>
        </div>
      </div>
      <ol class="welcome-steps">
        <li>
          <span class="step-num">1</span>
          <div>
            <strong>Ingest</strong>
            <p>Drop PDFs or open your ASAP folder. Priority is preserved.</p>
          </div>
        </li>
        <li>
          <span class="step-num">2</span>
          <div>
            <strong>Extract</strong>
            <p>Native text first; free Gemini cloud OCR for scans (optional local bridge for advanced setups).</p>
          </div>
        </li>
        <li>
          <span class="step-num">3</span>
          <div>
            <strong>Deep-skim</strong>
            <p>Generate the structured skim (§1–§9). Star, promote, or quiz later.</p>
          </div>
        </li>
      </ol>
    </section>
  `;
}

export function statsStripHtml({ docs = 0, ready = 0, asap = 0, sums = 0, due = 0 } = {}) {
  return `
    <div class="stats-strip" role="group" aria-label="Library stats">
      <div class="stat"><span class="stat-val">${docs}</span><span class="stat-lbl">Documents</span></div>
      <div class="stat"><span class="stat-val">${ready}</span><span class="stat-lbl">Ready</span></div>
      <div class="stat"><span class="stat-val asap-val">${asap}</span><span class="stat-lbl">ASAP</span></div>
      <div class="stat"><span class="stat-val">${sums}</span><span class="stat-lbl">Summaries</span></div>
      <div class="stat"><span class="stat-val">${due}</span><span class="stat-lbl">Due review</span></div>
    </div>
  `;
}

/** Parse location.hash → { view, params } */
export function parseHash() {
  const raw = (location.hash || '#/library').replace(/^#\/?/, '');
  const [viewPart, query = ''] = raw.split('?');
  const view = viewPart || 'library';
  const params = {};
  if (query) {
    for (const pair of query.split('&')) {
      const [k, v] = pair.split('=');
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
  }
  // path-style: summary/uuid
  const segs = view.split('/').filter(Boolean);
  if (segs[0] === 'document' && segs[1]) return { view: 'document', params: { docId: segs[1] } };
  if (segs[0] === 'summary' && segs[1]) return { view: 'summary', params: { summaryId: segs[1] } };
  if (segs[0] === 'quiz' && segs[1]) return { view: 'quiz', params: { summaryId: segs[1] } };
  if (segs[0] === 'project' && segs[1]) return { view: 'project', params: { projectId: segs[1] } };
  return { view: segs[0] || 'library', params };
}

export function setHash(view, params = {}) {
  let path = view;
  if (view === 'document' && params.docId) path = `document/${params.docId}`;
  else if (view === 'summary' && params.summaryId) path = `summary/${params.summaryId}`;
  else if (view === 'quiz' && params.summaryId) path = `quiz/${params.summaryId}`;
  else if (view === 'project' && params.projectId) path = `project/${params.projectId}`;
  const next = `#/${path}`;
  if (location.hash !== next) {
    history.pushState(null, '', next);
  }
}

export { icons };
