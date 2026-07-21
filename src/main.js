/**
 * Entry point — Deep-Skim local-first reading system.
 */
import { boot } from './app.js';

boot().catch((err) => {
  console.error(err);
  // boot() already renders recovery UI; keep a last-resort fallback
  const app = document.getElementById('app');
  if (app && !document.getElementById('boot-retry')) {
    const msg = String(err?.message || err || 'Unknown error');
    app.innerHTML = `<div style="padding:2rem;font-family:system-ui;color:#e8e6e3;background:#0e0f11;min-height:100vh"><h1>Deep-Skim failed to start</h1><p style="color:#c45a5a"></p><p style="color:#9a9690">Close other localhost:8080 tabs, then reload. Or DevTools → Application → Clear site data.</p></div>`;
    const p = app.querySelector('p');
    if (p) p.textContent = msg;
  }
});
