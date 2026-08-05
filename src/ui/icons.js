/** Inline SVG icons — no external icon font dependency */

/**
 * Final mark: otter peeking over a continuous open book.
 *
 * Senior pass (gutter fix):
 * - Pages join as one cream spread — soft V fold only, never a black gap
 * - Book is continuous paper with skim lines; spine is light gold not void
 * - Otter face above the book (eyes + snout), gold plate, reads at ~48px
 */
export const brandOtterSvg = `
<svg class="brand-otter" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="dsGold" x1="12" y1="4" x2="52" y2="60" gradientUnits="userSpaceOnUse">
      <stop stop-color="#E4C878"/>
      <stop offset="0.5" stop-color="#C4A35A"/>
      <stop offset="1" stop-color="#94742C"/>
    </linearGradient>
    <linearGradient id="dsPageL" x1="10" y1="32" x2="30" y2="56" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFFCFA"/>
      <stop offset="1" stop-color="#F0E6D4"/>
    </linearGradient>
    <linearGradient id="dsPageR" x1="34" y1="32" x2="54" y2="56" gradientUnits="userSpaceOnUse">
      <stop stop-color="#F8F1E4"/>
      <stop offset="1" stop-color="#E8DCC6"/>
    </linearGradient>
  </defs>

  <!-- app plate -->
  <rect class="brand-otter-bg" width="64" height="64" rx="13" fill="url(#dsGold)"/>
  <rect x="1.5" y="1.5" width="61" height="61" rx="11.5" fill="none" stroke="#1a1814" stroke-opacity="0.14" stroke-width="1"/>

  <!-- otter head -->
  <ellipse cx="32" cy="23" rx="15" ry="12" fill="#5E4030"/>
  <ellipse cx="18" cy="17" rx="3.2" ry="4.2" fill="#5E4030"/>
  <ellipse cx="46" cy="17" rx="3.2" ry="4.2" fill="#5E4030"/>
  <ellipse cx="26" cy="22" rx="4" ry="4.2" fill="#F7F0E6"/>
  <ellipse cx="38" cy="22" rx="4" ry="4.2" fill="#F7F0E6"/>
  <circle cx="26.4" cy="22.4" r="2.1" fill="#1A1410"/>
  <circle cx="38.4" cy="22.4" r="2.1" fill="#1A1410"/>
  <circle cx="27" cy="21.7" r="0.65" fill="#F7F0E6"/>
  <circle cx="39" cy="21.7" r="0.65" fill="#F7F0E6"/>
  <ellipse cx="32" cy="28" rx="5" ry="3" fill="#C4A484"/>
  <path d="M29 29c1.2 1.2 4.8 1.2 6 0" fill="none" stroke="#5E4030" stroke-width="1.1" stroke-linecap="round"/>

  <!-- CONTINUOUS open book (no black gutter) -->
  <path fill="#E8DFC8" d="M10 35 L30.5 30.5 V56 L11.5 58.5 C10.5 58.8 10 58.1 10 57.2 V36 Z"/>
  <path fill="#DDD2B8" d="M54 35 L33.5 30.5 V56 L52.5 58.5 C53.5 58.8 54 58.1 54 57.2 V36 Z"/>
  <path fill="url(#dsPageL)" d="M11.5 34.5 L31 30 L31 55.5 L12.5 57.5 C11.5 57.7 11 57.1 11 56.2 V36 C11 35 11 34.5 11.5 34.5 Z"/>
  <path fill="url(#dsPageR)" d="M52.5 34.5 L33 30 L33 55.5 L51.5 57.5 C52.5 57.7 53 57.1 53 56.2 V36 C53 35 53 34.5 52.5 34.5 Z"/>
  <!-- cream fold only -->
  <path fill="#E0D4BC" d="M30 30.2 H34 V55.8 H30 Z"/>
  <path d="M32 30.5 V55.5" stroke="#B8923E" stroke-width="1.15" opacity="0.55" stroke-linecap="round"/>
  <!-- skim lines -->
  <path d="M15 40h11 M15 44h13 M15 48h10" stroke="#B8954A" stroke-width="1.3" stroke-linecap="round" opacity="0.8"/>
  <path d="M38 40h11 M36 44h13 M39 48h10" stroke="#9A7B35" stroke-width="1.3" stroke-linecap="round" opacity="0.75"/>
</svg>`;

export const icons = {
  library: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 4h4v16H4V4zm6 0h4v16h-4V4zm6 0h4v16h-4V4z"/></svg>`,
  summaries: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 3h14a2 2 0 0 1 2 2v14l-4-3-4 3-4-3-4 3V5a2 2 0 0 1 2-2zm2 4v2h10V7H7zm0 4v2h8v-2H7z"/></svg>`,
  review: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-2.3-5.6L15 9h7V2l-2.5 2.5A9.96 9.96 0 0 0 12 2z"/></svg>`,
  search: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 3a7 7 0 0 1 5.5 11.3l4.1 4.1-1.4 1.4-4.1-4.1A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/></svg>`,
  settings: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zm8.1 2.6-1.2-.3a6.9 6.9 0 0 0-.6-1.4l.7-1.1-1.4-1.4-1.1.7c-.4-.3-.9-.5-1.4-.6l-.3-1.2h-2l-.3 1.2c-.5.1-1 .3-1.4.6l-1.1-.7-1.4 1.4.7 1.1c-.3.4-.5.9-.6 1.4l-1.2.3v2l1.2.3c.1.5.3 1 .6 1.4l-.7 1.1 1.4 1.4 1.1-.7c.4.3.9.5 1.4.6l.3 1.2h2l.3-1.2c.5-.1 1-.3 1.4-.6l1.1.7 1.4-1.4-.7-1.1c.3-.4.5-.9.6-1.4l1.2-.3v-2z"/></svg>`,
  sun: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0-5h1v3h-2V2h1zm0 17h1v3h-2v-3h1zM2 11h3v2H2v-2zm17 0h3v2h-3v-2zM4.2 4.2l1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1zm12.1 12.1 2.1 2.1-1.4 1.4-2.1-2.1 1.4-1.4zM4.2 19.8l2.1-2.1 1.4 1.4-2.1 2.1-1.4-1.4zm12.1-12.1 1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1z"/></svg>`,
  moon: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.5 2.1A9.5 9.5 0 1 0 21.9 15.5 7.5 7.5 0 0 1 15.5 2.1z"/></svg>`,
  upload: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3 6.5 9H10v6h4V9h3.5L12 3zM4 18h16v2H4v-2z"/></svg>`,
  folder: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"/></svg>`,
  spark: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5L12 2z"/></svg>`,
  check: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9.2 16.6 4.8 12.2l1.4-1.4 3 3 8.6-8.6 1.4 1.4-10 10z"/></svg>`,
  menu: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"/></svg>`,
  back: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 6 8 12l6 6 1.4-1.4L10.8 12l4.6-4.6L14 6z"/></svg>`,
  pdf: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 2h8l6 6v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V9h5.5L13 3.5zM8 13h2.2c1.3 0 2.1.7 2.1 1.8S11.5 16.6 10.2 16.6H9.2V19H8v-6zm1.2 1v1.6h.9c.5 0 .8-.3.8-.8s-.3-.8-.8-.8h-.9zm4.1-1H16c1.5 0 2.5.9 2.5 2.3S17.5 17.6 16 17.6h-1.5V19h-1.2v-6zm1.2 1v2.6H16c.8 0 1.3-.5 1.3-1.3s-.5-1.3-1.3-1.3h-.5z"/></svg>`,
  download: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3v10.2l3.6-3.6L17 11l-5 5-5-5 1.4-1.4L11 13.2V3h1zM5 18h14v2H5v-2z"/></svg>`,
  star: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5 14.9 9l6.6.5-5 4.3 1.6 6.4L12 16.8 5.9 20.2 7.5 13.8l-5-4.3L9.1 9 12 2.5z"/></svg>`,
  readingList: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 3h11a2 2 0 0 1 2 2v15l-3.5-2L12 20l-3.5-2L5 20V5a2 2 0 0 1 1-2zm1 3v10.2l2.5-1.4L12 16l2.5-1.2 2.5 1.4V6H7zm1 1h8v2H8V7zm0 3h8v2H8v-2z"/></svg>`,
  projects: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 4h16v3H4V4zm0 5h10v3H4V9zm0 5h16v3H4v-3zm0 5h10v3H4v-3z"/></svg>`,
  more: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg>`,
};
