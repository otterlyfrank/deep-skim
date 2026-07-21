/**
 * IndexedDB layer — all personal reading data stays local.
 * Stores: documents, extractions, summaries, reviews, settings.
 */

import { DEFAULT_RESEARCH_LENSES_TEXT } from '../generation/prompt.js';

const DB_NAME = 'deep-skim';
const DB_VERSION = 2;

/** @type {IDBDatabase | null} */
let dbInstance = null;
/** When upgrade is blocked, we keep running on older schema */
let projectsViaSettings = false;

function ensureIndex(store, name, keyPath, unique = false) {
  if (!store) return;
  if (!store.indexNames.contains(name)) {
    store.createIndex(name, keyPath, { unique });
  }
}

function attachDb(db) {
  dbInstance = db;
  db.onversionchange = () => {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    dbInstance = null;
  };
  projectsViaSettings = !db.objectStoreNames.contains('projects');
  return db;
}

function openExisting() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME); // current version only — never blocks on upgrade
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    req.onsuccess = () => resolve(attachDb(req.result));
  });
}

function runSchemaUpgrade(db, txn) {
  if (!db.objectStoreNames.contains('documents')) {
    const docs = db.createObjectStore('documents', { keyPath: 'id' });
    ensureIndex(docs, 'priority', 'priority');
    ensureIndex(docs, 'status', 'status');
    ensureIndex(docs, 'createdAt', 'createdAt');
    ensureIndex(docs, 'name', 'name');
  }

  if (!db.objectStoreNames.contains('extractions')) {
    const ext = db.createObjectStore('extractions', { keyPath: 'documentId' });
    ensureIndex(ext, 'createdAt', 'createdAt');
  }

  if (!db.objectStoreNames.contains('summaries')) {
    const sum = db.createObjectStore('summaries', { keyPath: 'id' });
    ensureIndex(sum, 'documentId', 'documentId');
    ensureIndex(sum, 'status', 'status');
    ensureIndex(sum, 'createdAt', 'createdAt');
    ensureIndex(sum, 'nextReviewAt', 'nextReviewAt');
    ensureIndex(sum, 'projectId', 'projectId');
  } else if (txn) {
    try {
      ensureIndex(txn.objectStore('summaries'), 'projectId', 'projectId');
    } catch (e) {
      console.warn('projectId index', e);
    }
  }

  if (!db.objectStoreNames.contains('reviews')) {
    const rev = db.createObjectStore('reviews', { keyPath: 'id' });
    ensureIndex(rev, 'summaryId', 'summaryId');
    ensureIndex(rev, 'createdAt', 'createdAt');
  }

  if (!db.objectStoreNames.contains('settings')) {
    db.createObjectStore('settings', { keyPath: 'key' });
  }

  if (!db.objectStoreNames.contains('blobs')) {
    db.createObjectStore('blobs', { keyPath: 'id' });
  }

  if (!db.objectStoreNames.contains('projects')) {
    const proj = db.createObjectStore('projects', { keyPath: 'id' });
    ensureIndex(proj, 'documentId', 'documentId');
    ensureIndex(proj, 'status', 'status');
    ensureIndex(proj, 'createdAt', 'createdAt');
  }
}

/**
 * Try version upgrade; on block/timeout fall back to existing DB so the app boots.
 */
function tryUpgradeToV2() {
  return new Promise((resolve) => {
    let settled = false;
    const done = (db, mode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ db, mode });
    };

    const timer = setTimeout(() => {
      console.warn('Deep-Skim: upgrade timed out — using existing DB (projects via settings if needed)');
      // Don't leave a hanging upgrade if possible; open existing in parallel path
      openExisting()
        .then((db) => done(db, 'fallback-timeout'))
        .catch(() => done(null, 'fail'));
    }, 2500);

    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      clearTimeout(timer);
      console.warn(err);
      openExisting()
        .then((db) => done(db, 'fallback-throw'))
        .catch(() => done(null, 'fail'));
      return;
    }

    req.onblocked = () => {
      console.warn('Deep-Skim: upgrade blocked by another tab — falling back to current schema');
      // Fall back immediately so UI can load; projects stored in settings until upgrade succeeds later
      openExisting()
        .then((db) => done(db, 'fallback-blocked'))
        .catch(() => done(null, 'fail'));
    };
    req.onerror = () => {
      openExisting()
        .then((db) => done(db, 'fallback-error'))
        .catch(() => done(null, 'fail'));
    };
    req.onupgradeneeded = (event) => {
      try {
        runSchemaUpgrade(event.target.result, event.target.transaction);
      } catch (e) {
        console.error('upgrade schema error', e);
      }
    };
    req.onsuccess = () => {
      done(attachDb(req.result), 'upgraded-or-current');
    };
  });
}

/**
 * Open IndexedDB. Prefer v2 (projects store); if upgrade is blocked, boot on v1.
 */
async function openDb() {
  if (dbInstance) return dbInstance;

  // Fast path: already at v2
  try {
    const existing = await openExisting();
    if (existing.version >= DB_VERSION && existing.objectStoreNames.contains('projects')) {
      return existing;
    }
    // Need upgrade — close before opening with higher version
    try {
      existing.close();
    } catch {
      /* ignore */
    }
    dbInstance = null;
  } catch {
    /* first run */
  }

  const { db, mode } = await tryUpgradeToV2();
  if (!db) {
    throw new Error(
      'Could not open IndexedDB. Close other localhost:8080 tabs, then click Reset local data on the error screen — or clear site data for this origin.'
    );
  }
  if (mode.startsWith('fallback')) {
    projectsViaSettings = !db.objectStoreNames.contains('projects');
    console.info('Deep-Skim DB mode:', mode, 'projectsViaSettings=', projectsViaSettings);
  }
  return db;
}

/**
 * Wipe local Deep-Skim data (recovery from stuck upgrades).
 * Does not delete code — only browser IndexedDB for this origin.
 */
export function resetLocalDatabase() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      try {
        dbInstance.close();
      } catch {
        /* ignore */
      }
      dbInstance = null;
    }
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => {
      projectsViaSettings = false;
      resolve();
    };
    req.onerror = () => reject(req.error || new Error('deleteDatabase failed'));
    req.onblocked = () =>
      reject(
        new Error(
          'Reset blocked — close every other tab on http://localhost:8080, then try again.'
        )
      );
  });
}

function tx(storeNames, mode = 'readonly') {
  return openDb().then((db) => {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    for (const n of names) {
      if (!db.objectStoreNames.contains(n)) {
        throw new Error(`Missing data store “${n}”.`);
      }
    }
    return db.transaction(names, mode);
  });
}

function hasProjectsStore() {
  return dbInstance && dbInstance.objectStoreNames.contains('projects');
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function uuid() {
  return crypto.randomUUID();
}

// ── Documents ──────────────────────────────────────────────

/**
 * @typedef {'asap' | 'normal' | 'low'} Priority
 * @typedef {'queued' | 'extracting' | 'ready' | 'error' | 'summarizing' | 'summarized'} DocStatus
 */

export async function putDocument(doc) {
  const now = Date.now();
  const record = {
    id: doc.id || uuid(),
    name: doc.name || 'Untitled.pdf',
    title: doc.title || doc.name || 'Untitled',
    pageCount: doc.pageCount ?? null,
    fileSize: doc.fileSize ?? 0,
    priority: doc.priority || 'normal', // asap | normal | low
    status: doc.status || 'queued',
    errorMessage: doc.errorMessage || null,
    tags: doc.tags || [],
    sourcePath: doc.sourcePath || null,
    createdAt: doc.createdAt || now,
    updatedAt: now,
  };
  const t = await tx(['documents'], 'readwrite');
  await reqToPromise(t.objectStore('documents').put(record));
  return record;
}

export async function getDocument(id) {
  const t = await tx(['documents']);
  return reqToPromise(t.objectStore('documents').get(id));
}

export async function listDocuments() {
  const t = await tx(['documents']);
  const all = await reqToPromise(t.objectStore('documents').getAll());
  // ASAP first, then normal, then low; within group newest first for queue visibility
  const rank = { asap: 0, normal: 1, low: 2 };
  return all.sort((a, b) => {
    const pr = (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9);
    if (pr !== 0) return pr;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

/**
 * Heal stuck "summarizing" and auto-clear old error banners on the queue.
 * @param {{ errorTtlMs?: number, stuckMs?: number }} [opts]
 * @returns {Promise<number>} number of docs updated
 */
export async function healDocumentQueue(opts = {}) {
  const errorTtlMs = opts.errorTtlMs ?? 6 * 60 * 60 * 1000; // 6h
  const stuckMs = opts.stuckMs ?? 45 * 60 * 1000; // 45m
  const now = Date.now();
  const docs = await listDocuments();
  let n = 0;
  for (const d of docs) {
    const age = now - (d.updatedAt || d.createdAt || 0);
    // Interrupted generate left status stuck
    if (d.status === 'summarizing' && age > stuckMs) {
      await updateDocument(d.id, {
        status: 'ready',
        errorMessage:
          'Previous generate was interrupted or hung. Safe to try again (check free-tier quota if it fails).',
      });
      n += 1;
      continue;
    }
    // Stale error text on otherwise-ready docs
    if (d.errorMessage && d.status === 'ready' && age > errorTtlMs) {
      await updateDocument(d.id, { errorMessage: null });
      n += 1;
      continue;
    }
    // Old hard errors with extract available → back to ready, drop message after TTL
    if (d.status === 'error' && age > errorTtlMs) {
      await updateDocument(d.id, {
        status: 'ready',
        errorMessage: null,
      });
      n += 1;
    }
  }
  return n;
}

export async function clearDocumentError(id) {
  const d = await getDocument(id);
  if (!d) return null;
  const status = d.status === 'error' || d.status === 'summarizing' ? 'ready' : d.status;
  return updateDocument(id, { errorMessage: null, status });
}

export async function updateDocument(id, patch) {
  const existing = await getDocument(id);
  if (!existing) throw new Error(`Document ${id} not found`);
  return putDocument({ ...existing, ...patch, id, updatedAt: Date.now() });
}

export async function deleteDocument(id) {
  const t = await tx(['documents', 'extractions', 'summaries', 'blobs'], 'readwrite');
  await reqToPromise(t.objectStore('documents').delete(id));
  await reqToPromise(t.objectStore('extractions').delete(id));
  // delete related summaries + blobs
  const sums = await reqToPromise(t.objectStore('summaries').index('documentId').getAll(id));
  for (const s of sums) {
    await reqToPromise(t.objectStore('summaries').delete(s.id));
  }
  await reqToPromise(t.objectStore('blobs').delete(`pdf:${id}`));
  // best-effort figure cleanup is by prefix scan in clearFigures
  await clearFiguresForDoc(id);
}

// ── Blobs (PDF + figures) ──────────────────────────────────

export async function putBlob(id, blob, meta = {}) {
  const t = await tx(['blobs'], 'readwrite');
  await reqToPromise(
    t.objectStore('blobs').put({
      id,
      blob,
      mime: blob.type || meta.mime || 'application/octet-stream',
      meta,
      createdAt: Date.now(),
    })
  );
}

export async function getBlob(id) {
  const t = await tx(['blobs']);
  return reqToPromise(t.objectStore('blobs').get(id));
}

export async function putPdfBytes(documentId, arrayBuffer, mime = 'application/pdf') {
  const blob = new Blob([arrayBuffer], { type: mime });
  await putBlob(`pdf:${documentId}`, blob, { kind: 'pdf', documentId });
}

export async function getPdfBytes(documentId) {
  const rec = await getBlob(`pdf:${documentId}`);
  if (!rec) return null;
  return rec.blob.arrayBuffer();
}

export async function putFigure(documentId, figureId, blob, meta = {}) {
  await putBlob(`fig:${documentId}:${figureId}`, blob, {
    kind: 'figure',
    documentId,
    figureId,
    ...meta,
  });
}

export async function listFigures(documentId) {
  const t = await tx(['blobs']);
  const all = await reqToPromise(t.objectStore('blobs').getAll());
  const prefix = `fig:${documentId}:`;
  return all
    .filter((b) => String(b.id).startsWith(prefix))
    .map((b) => ({
      id: b.id,
      figureId: b.meta?.figureId,
      page: b.meta?.page,
      caption: b.meta?.caption,
      blob: b.blob,
      mime: b.mime,
    }));
}

async function clearFiguresForDoc(documentId) {
  const t = await tx(['blobs'], 'readwrite');
  const all = await reqToPromise(t.objectStore('blobs').getAllKeys());
  const prefix = `fig:${documentId}:`;
  for (const key of all) {
    if (String(key).startsWith(prefix)) {
      await reqToPromise(t.objectStore('blobs').delete(key));
    }
  }
}

// ── Extractions ────────────────────────────────────────────

export async function putExtraction(extraction) {
  const record = {
    documentId: extraction.documentId,
    text: extraction.text || '',
    markdown: extraction.markdown || extraction.text || '',
    method: extraction.method || 'native', // native | unlimited-ocr | deepseek-ocr | hybrid
    quality: extraction.quality || 'unknown', // high | medium | low
    qualityScore: extraction.qualityScore ?? null,
    pageTexts: extraction.pageTexts || [],
    figures: extraction.figures || [], // metadata only; blobs separate
    stats: extraction.stats || {},
    createdAt: extraction.createdAt || Date.now(),
  };
  const t = await tx(['extractions'], 'readwrite');
  await reqToPromise(t.objectStore('extractions').put(record));
  return record;
}

export async function getExtraction(documentId) {
  const t = await tx(['extractions']);
  return reqToPromise(t.objectStore('extractions').get(documentId));
}

// ── Summaries ──────────────────────────────────────────────

/**
 * Decision model (Is it worth reading?):
 * - status: inbox | archive | promote (promote = Reading List)
 * - starred: keep the skim handy without necessarily full-reading the PDF
 * Legacy status `core` is normalized to starred=true, status=inbox.
 * @typedef {'inbox' | 'archive' | 'promote' | 'core'} SummaryStatus
 */

function normalizeSummaryFields(summary) {
  let status = summary.status || 'inbox';
  let starred = !!summary.starred;
  // Migrate legacy "Mark core"
  if (status === 'core') {
    starred = true;
    status = 'inbox';
  }
  if (!['inbox', 'archive', 'promote'].includes(status)) {
    status = 'inbox';
  }
  const tags = Array.isArray(summary.tags) ? [...summary.tags] : [];
  if (status === 'promote' && !tags.includes('full-reading')) tags.push('full-reading');
  if (status !== 'promote') {
    const i = tags.indexOf('full-reading');
    if (i >= 0) tags.splice(i, 1);
  }
  return { status, starred, tags };
}

export async function putSummary(summary) {
  const now = Date.now();
  const { status, starred, tags } = normalizeSummaryFields(summary);
  const record = {
    id: summary.id || uuid(),
    documentId: summary.documentId,
    title: summary.title || 'Untitled deep-skim',
    markdown: summary.markdown || '',
    sections: summary.sections || null,
    questions: summary.questions || [],
    /** Personal reflections appended on export */
    notes: summary.notes || '',
    status, // inbox | archive | promote (Reading List)
    starred,
    tags,
    model: summary.model || null,
    projectId: summary.projectId || null,
    projectWeek: summary.projectWeek ?? null,
    projectWeekStart: summary.projectWeekStart ?? null,
    projectWeekEnd: summary.projectWeekEnd ?? null,
    isSynthesis: !!summary.isSynthesis,
    createdAt: summary.createdAt || now,
    updatedAt: now,
    lastReviewedAt: summary.lastReviewedAt || null,
    nextReviewAt: summary.nextReviewAt || now + 7 * 24 * 60 * 60 * 1000,
    reviewCount: summary.reviewCount || 0,
  };
  const t = await tx(['summaries'], 'readwrite');
  await reqToPromise(t.objectStore('summaries').put(record));
  return record;
}

function hydrateSummary(s) {
  if (!s) return s;
  const { status, starred, tags } = normalizeSummaryFields(s);
  return { ...s, status, starred, tags };
}

export async function getSummary(id) {
  const t = await tx(['summaries']);
  return hydrateSummary(await reqToPromise(t.objectStore('summaries').get(id)));
}

export async function listSummaries() {
  const t = await tx(['summaries']);
  const all = await reqToPromise(t.objectStore('summaries').getAll());
  return all
    .map(hydrateSummary)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/** Epic full-reading queue — promote decisions */
export async function listReadingList() {
  const all = await listSummaries();
  return all.filter((s) => s.status === 'promote' || (s.tags || []).includes('full-reading'));
}

/** Starred skims to revisit (independent of Reading List) */
export async function listStarredSummaries() {
  const all = await listSummaries();
  return all.filter((s) => s.starred);
}

export async function updateSummary(id, patch) {
  const existing = await getSummary(id);
  if (!existing) throw new Error(`Summary ${id} not found`);
  return putSummary({ ...existing, ...patch, id, updatedAt: Date.now() });
}

export async function deleteSummary(id) {
  const t = await tx(['summaries', 'reviews'], 'readwrite');
  await reqToPromise(t.objectStore('summaries').delete(id));
  const revs = await reqToPromise(t.objectStore('reviews').index('summaryId').getAll(id));
  for (const r of revs) {
    await reqToPromise(t.objectStore('reviews').delete(r.id));
  }
}

/** Summaries due for spaced re-test (up to `limit`) */
export async function getDueReviews(limit = 3) {
  const all = await listSummaries();
  const now = Date.now();
  return all
    .filter((s) => s.status !== 'archive' && (s.nextReviewAt || 0) <= now)
    .sort((a, b) => (a.nextReviewAt || 0) - (b.nextReviewAt || 0))
    .slice(0, limit);
}

// ── Reviews ────────────────────────────────────────────────

export async function putReview(review) {
  const record = {
    id: review.id || uuid(),
    summaryId: review.summaryId,
    questionIndex: review.questionIndex,
    grade: review.grade, // 'again' | 'hard' | 'good' | 'easy'
    createdAt: review.createdAt || Date.now(),
  };
  const t = await tx(['reviews'], 'readwrite');
  await reqToPromise(t.objectStore('reviews').put(record));
  return record;
}

export async function listReviews(summaryId) {
  const t = await tx(['reviews']);
  return reqToPromise(t.objectStore('reviews').index('summaryId').getAll(summaryId));
}

/**
 * Simple SM-2-ish interval bump after a review session.
 * grade: again=0d, hard=3d, good=7d, easy=14d (multiplied by reviewCount)
 */
export async function scheduleNextReview(summaryId, sessionGrade = 'good') {
  const s = await getSummary(summaryId);
  if (!s) return null;
  const base = { again: 1, hard: 3, good: 7, easy: 14 }[sessionGrade] || 7;
  const mult = Math.min(4, 1 + (s.reviewCount || 0) * 0.5);
  const days = Math.round(base * mult);
  const next = Date.now() + days * 24 * 60 * 60 * 1000;
  return updateSummary(summaryId, {
    lastReviewedAt: Date.now(),
    nextReviewAt: next,
    reviewCount: (s.reviewCount || 0) + 1,
  });
}

// ── Multi-week projects ────────────────────────────────────

/**
 * @typedef {{
 *   week: number,
 *   start: number,
 *   end: number,
 *   pageCount?: number,
 *   status: 'pending'|'done'|'skipped',
 *   summaryId: string|null,
 *   focus: string,
 *   completedAt: number|null
 * }} ProjectWeek
 */

const PROJECTS_SETTINGS_KEY = 'projects_fallback_map';

async function loadProjectsMap() {
  const t = await tx(['settings']);
  const row = await reqToPromise(t.objectStore('settings').get(PROJECTS_SETTINGS_KEY));
  return row?.value && typeof row.value === 'object' ? { ...row.value } : {};
}

async function saveProjectsMap(map) {
  const t = await tx(['settings'], 'readwrite');
  await reqToPromise(t.objectStore('settings').put({ key: PROJECTS_SETTINGS_KEY, value: map }));
}

export async function putProject(project) {
  const now = Date.now();
  const record = {
    id: project.id || uuid(),
    documentId: project.documentId,
    title: project.title || 'Multi-week project',
    pages: project.pages || 0,
    weeks: project.weeks || (project.plan || []).length,
    pagesPerWeek: project.pagesPerWeek || 200,
    plan: project.plan || [],
    synthesis: project.synthesis || { status: 'locked', summaryId: null },
    status: project.status || 'active', // active | completed | archived
    createdAt: project.createdAt || now,
    updatedAt: now,
  };

  await openDb();
  if (hasProjectsStore()) {
    const t = await tx(['projects'], 'readwrite');
    await reqToPromise(t.objectStore('projects').put(record));
    return record;
  }
  const map = await loadProjectsMap();
  map[record.id] = record;
  await saveProjectsMap(map);
  return record;
}

export async function getProject(id) {
  await openDb();
  if (hasProjectsStore()) {
    const t = await tx(['projects']);
    return reqToPromise(t.objectStore('projects').get(id));
  }
  const map = await loadProjectsMap();
  return map[id] || null;
}

export async function listProjects() {
  try {
    await openDb();
    if (hasProjectsStore()) {
      const t = await tx(['projects']);
      const all = await reqToPromise(t.objectStore('projects').getAll());
      return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }
    const map = await loadProjectsMap();
    return Object.values(map).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (err) {
    console.warn('listProjects failed', err);
    return [];
  }
}

export async function getProjectByDocument(documentId) {
  const all = await listProjects();
  return all.find((p) => p.documentId === documentId && p.status !== 'archived') || null;
}

export async function updateProject(id, patch) {
  const existing = await getProject(id);
  if (!existing) throw new Error(`Project ${id} not found`);
  return putProject({ ...existing, ...patch, id, updatedAt: Date.now() });
}

export async function deleteProject(id) {
  await openDb();
  if (hasProjectsStore()) {
    const t = await tx(['projects'], 'readwrite');
    await reqToPromise(t.objectStore('projects').delete(id));
    return;
  }
  const map = await loadProjectsMap();
  delete map[id];
  await saveProjectsMap(map);
}

export async function markProjectWeekDone(projectId, weekNum, summaryId) {
  const p = await getProject(projectId);
  if (!p) throw new Error('Project not found');
  const plan = (p.plan || []).map((w) => {
    if (w.week !== weekNum) return w;
    return {
      ...w,
      status: 'done',
      summaryId,
      completedAt: Date.now(),
    };
  });
  const allDone = plan.every((w) => w.status === 'done' || w.status === 'skipped');
  const synthesis = {
    ...(p.synthesis || {}),
    status: allDone ? 'ready' : 'locked',
  };
  return updateProject(projectId, {
    plan,
    synthesis,
    status: allDone && synthesis.summaryId ? 'completed' : 'active',
  });
}

export async function markProjectSynthesisDone(projectId, summaryId) {
  return updateProject(projectId, {
    synthesis: { status: 'done', summaryId },
    status: 'completed',
  });
}

// ── Settings ───────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  theme: 'dark',
  /**
   * Free-first default: Google Gemini free tier.
   * @type {'gemini'|'groq'|'deepseek'|'kimi'|'ollama'|'grok'|'openai'|'openrouter'|'custom'}
   */
  llmProvider: 'gemini',
  llmBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  llmApiKey: '',
  llmModel: 'gemini-3.5-flash',
  /** Optional local bridge only — default path is Gemini cloud OCR */
  ocrBridgeUrl: 'http://localhost:8765',
  /**
   * auto = Gemini cloud OCR when API key set, else local bridge if up, else native
   * gemini = cloud only · local = bridge only · none = native text only
   */
  ocrProvider: 'auto',
  /** Cap free-tier vision OCR page count (even sample if longer) */
  cloudOcrMaxPages: 48,
  maxContextChars: 120_000,
  /**
   * Long books: map each chunk then reduce into full 8-section skim.
   * Auto when source chars > maxContextChars (unless disabled).
   */
  multipassEnabled: true,
  /** Target source characters per map call (smaller → denser coverage) */
  mapChunkChars: 55_000,
  /** Cap map LLM calls (even sampling if more needed) */
  maxMapChunks: 12,
  asapFolderHint: 'To Be Read ASAP',
  weeklyReminderEnabled: true,
  lastWeeklyPromptAt: null,
  lastSummaryWeekKey: null,
  /** User acknowledged cloud text egress */
  privacyAckCloud: false,
  /** Default pages per week when creating multi-week projects */
  projectPagesPerWeek: 200,
  /**
   * Research lenses / keywords for §6 Connections (and light relevance bias).
   * One per line preferred; commas also work. Editable anytime in Settings.
   */
  researchLensesText: DEFAULT_RESEARCH_LENSES_TEXT,
  /** Optional freeform note: project, dissertation angle, show focus, etc. */
  researchFocusNote: '',
};

export async function getSettings() {
  const t = await tx(['settings']);
  const rows = await reqToPromise(t.objectStore('settings').getAll());
  const map = { ...DEFAULT_SETTINGS };
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export async function setSetting(key, value) {
  const t = await tx(['settings'], 'readwrite');
  await reqToPromise(t.objectStore('settings').put({ key, value }));
}

export async function setSettings(partial) {
  for (const [key, value] of Object.entries(partial)) {
    await setSetting(key, value);
  }
  return getSettings();
}

// ── Search ─────────────────────────────────────────────────

export async function searchAll(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return { documents: [], summaries: [] };
  const [docs, sums] = await Promise.all([listDocuments(), listSummaries()]);
  const documents = docs.filter(
    (d) =>
      (d.name || '').toLowerCase().includes(q) ||
      (d.title || '').toLowerCase().includes(q) ||
      (d.tags || []).some((t) => t.toLowerCase().includes(q))
  );
  const summaries = sums.filter(
    (s) =>
      (s.title || '').toLowerCase().includes(q) ||
      (s.markdown || '').toLowerCase().includes(q) ||
      (s.tags || []).some((t) => t.toLowerCase().includes(q))
  );
  return { documents, summaries };
}

export { uuid, DEFAULT_SETTINGS, openDb };
