/**
 * PWA install helpers — service worker + install prompt + standalone detection.
 */

/** @type {any} */
let deferredPrompt = null;
let swRegistered = false;

const PWA_EVENT = 'deepskim-pwa-change';

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
        <h3 class="pwa-heading">Install Deep-Skim</h3>
        <p class="help">
          One-click install puts Deep-Skim in your Applications folder / Start menu
          and lets you pin it to the Dock or taskbar — no native binary required.
        </p>
        ${
          can
            ? `<button type="button" class="primary" id="pwa-install-btn">Install app</button>`
            : `<p class="help">Use your browser’s install control when it appears, or:</p>
               <ul class="pwa-howto">
                 <li><b>Chrome / Edge (desktop)</b> — menu (⋮) → <i>Install Deep-Skim…</i> / <i>Install page as app</i></li>
                 <li><b>Safari (Mac)</b> — File → <i>Add to Dock…</i></li>
                 <li><b>iPhone / iPad</b> — Share → <i>Add to Home Screen</i></li>
               </ul>
               <button type="button" class="primary" id="pwa-install-btn" hidden>Install app</button>`
        }
        <p class="help" style="margin-top:0.75rem">
          PDFs and skims stay local. Host on HTTPS later for the same Install flow from a public URL.
        </p>
      </section>`;
  }

  if (can) {
    return `<button type="button" class="primary pwa-install-side" id="pwa-install-btn">Install app</button>`;
  }
  return `<p class="pwa-status"><a href="#/settings" data-nav="settings" class="pwa-link">Install as app…</a></p>`;
}

export function wireInstallButtons(root = document) {
  root.querySelectorAll('#pwa-install-btn').forEach((btn) => {
    btn.onclick = async () => {
      const r = await promptInstall();
      if (r.ok) return;
      if (r.reason === 'no-prompt') {
        document.getElementById('pwa-install-card')?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
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
