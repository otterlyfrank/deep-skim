/**
 * PWA install helpers — service worker + install prompt + standalone detection.
 */

/** @type {any} */
let deferredPrompt = null;
let swRegistered = false;

const PWA_EVENT = 'deepskim-pwa-change';

const INSTALL_ICON = `<svg class="pwa-install-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 3v10.2l3.6-3.6L17 11l-5 5-5-5 1.4-1.4L11 13.2V3h1zm-7 14h14v2H5v-2z"/></svg>`;

export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    // @ts-expect-error iOS Safari
    Boolean(navigator.standalone)
  );
}

export function canPromptInstall() {
  return Boolean(deferredPrompt);
}

export function initPwa() {
  if (location.protocol === 'file:') return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.dispatchEvent(new CustomEvent(PWA_EVENT));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent(PWA_EVENT));
  });

  if ('serviceWorker' in navigator && !swRegistered) {
    swRegistered = true;
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('[Deep-Skim] service worker registration failed', err);
    });
  }
}

export async function promptInstall() {
  if (!deferredPrompt) {
    return { ok: false, reason: 'no-prompt' };
  }
  const evt = deferredPrompt;
  deferredPrompt = null;
  evt.prompt();
  const choice = await evt.userChoice;
  window.dispatchEvent(new CustomEvent(PWA_EVENT));
  return { ok: choice.outcome === 'accepted', reason: choice.outcome };
}

/**
 * @param {'compact' | 'full'} mode
 */
export function installUiHtml(mode = 'compact') {
  if (isStandalone()) {
    if (mode === 'full') {
      return `
        <section class="settings-block pwa-card" id="pwa-install-card">
          <h3 class="pwa-heading">Installed app</h3>
          <p class="help">Deep-Skim is running as a standalone window. Library data stays in this browser profile’s IndexedDB.</p>
        </section>`;
    }
    return `<p class="pwa-status">Installed · standalone</p>`;
  }

  const can = canPromptInstall();
  if (mode === 'full') {
    return `
      <section class="settings-block pwa-card" id="pwa-install-card">
        <div class="pwa-card-head" style="display:flex;gap:0.75rem;align-items:flex-start;margin-bottom:0.75rem">
          <img src="./public/deep-skim-mark.svg" alt="" width="44" height="44" style="border-radius:10px;border:1px solid var(--border,#333);background:#141210" />
          <div>
            <h3 class="pwa-heading" style="margin:0 0 0.25rem">Install Deep-Skim</h3>
            <p class="help" style="margin:0">
              One-click install puts Deep-Skim in Applications / Start menu and on your Dock or taskbar — no native binary required.
            </p>
          </div>
        </div>
        <button type="button" class="primary pwa-install-cta" id="pwa-install-btn">
          ${INSTALL_ICON}
          <span>${can ? 'Install app now' : 'How to install'}</span>
        </button>
        <div class="pwa-howto-wrap" id="pwa-howto" ${can ? 'hidden' : ''}>
          <ul class="pwa-howto">
            <li><b>Chrome / Edge (desktop)</b> — menu (⋮) → <i>Install Deep-Skim…</i> / <i>Install page as app</i></li>
            <li><b>Safari (Mac)</b> — File → <i>Add to Dock…</i></li>
            <li><b>iPhone / iPad</b> — Share → <i>Add to Home Screen</i></li>
          </ul>
          <p class="help" style="margin-top:0.5rem">If the one-click prompt is missing, hard-refresh on http://127.0.0.1 after <code>./start.sh</code>.</p>
        </div>
        ${can ? `<p class="help pwa-ready-hint">Install prompt ready — one click uses Chrome/Edge’s native installer.</p>` : ''}
        <p class="help" style="margin-top:0.75rem">
          PDFs and skims stay local. Host on HTTPS later for the same Install flow from a public URL.
        </p>
      </section>`;
  }

  // compact — always a solid button
  return `
    <button type="button" class="primary pwa-install-side" id="pwa-install-btn" title="${
      can ? 'Install Deep-Skim as an app' : 'Install Deep-Skim — opens how-to'
    }">
      ${INSTALL_ICON}
      <span>${can ? 'Install app' : 'Install as app'}</span>
    </button>`;
}

export function openInstallHelp() {
  const card = document.getElementById('pwa-install-card');
  if (card) {
    const howto = document.getElementById('pwa-howto');
    if (howto) howto.hidden = false;
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    card.classList.add('pwa-card-flash');
    setTimeout(() => card.classList.remove('pwa-card-flash'), 1200);
    return;
  }
  const settings = document.querySelector('[data-nav="settings"]');
  if (settings) {
    settings.click();
    setTimeout(() => {
      const howto = document.getElementById('pwa-howto');
      if (howto) howto.hidden = false;
      document.getElementById('pwa-install-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  } else {
    location.hash = '#/settings';
  }
}

export function wireInstallButtons(root = document) {
  root.querySelectorAll('#pwa-install-btn').forEach((btn) => {
    btn.onclick = async (e) => {
      e.preventDefault();
      const r = await promptInstall();
      if (r.ok) return;
      if (document.getElementById('pwa-install-card')) {
        const howto = document.getElementById('pwa-howto');
        if (howto) howto.hidden = false;
        document.getElementById('pwa-install-card')?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      } else {
        openInstallHelp();
      }
    };
  });
}

/** Refresh compact install slot without full shell rebuild. */
export function refreshInstallSlot() {
  const slot = document.getElementById('pwa-side-slot');
  if (!slot) return;
  slot.innerHTML = installUiHtml('compact');
  wireInstallButtons(slot);
}
