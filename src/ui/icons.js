/** Inline SVG icons — no external icon font dependency */

/**
 * Final mark: cheeky otter hiding behind a book.
 *
 * Senior pass notes:
 * - Face mostly occluded by the book (only brow, eyes, ears, paws read)
 * - Horizontal head + side ears + whisker tips = otter, not bear
 * - Book is the dominant foreground plane (deep-skim product cue)
 * - Limited palette: gold plate, warm brown, cream pages, single gold spine
 * - Designed to read at ~48–56px app-icon size
 */
export const brandOtterSvg = `
<svg class="brand-otter" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="dsGold" x1="12" y1="4" x2="52" y2="60" gradientUnits="userSpaceOnUse">
      <stop stop-color="#E4C878"/>
      <stop offset="0.5" stop-color="#C4A35A"/>
      <stop offset="1" stop-color="#94742C"/>
    </linearGradient>
  </defs>

  <!-- app plate -->
  <rect class="brand-otter-bg" width="64" height="64" rx="13" fill="url(#dsGold)"/>
  <rect x="1.5" y="1.5" width="61" height="61" rx="11.5" fill="none" stroke="#1a1814" stroke-opacity="0.14" stroke-width="1"/>

  <!-- otter head rising behind book (muzzle intentionally clipped by pages) -->
  <ellipse cx="32" cy="26" rx="17" ry="13" fill="#5E4030"/>
  <!-- side ears (set wide/low — not teddy-top) -->
  <ellipse cx="16.5" cy="20" rx="3.4" ry="4.6" fill="#5E4030"/>
  <ellipse cx="47.5" cy="20" rx="3.4" ry="4.6" fill="#5E4030"/>
  <ellipse cx="16.5" cy="20.3" rx="1.6" ry="2.3" fill="#C4A484" opacity="0.4"/>
  <ellipse cx="47.5" cy="20.3" rx="1.6" ry="2.3" fill="#C4A484" opacity="0.4"/>

  <!-- brow ridge / eyes only (snout tucked under book edge) -->
  <ellipse cx="24.5" cy="23.5" rx="3.1" ry="3.4" fill="#F7F0E6"/>
  <ellipse cx="39.5" cy="23.5" rx="3.1" ry="3.4" fill="#F7F0E6"/>
  <circle cx="25.1" cy="24" r="1.7" fill="#1A1410"/>
  <circle cx="40.1" cy="24" r="1.7" fill="#1A1410"/>
  <circle cx="25.7" cy="23.3" r="0.5" fill="#F7F0E6"/>
  <circle cx="40.7" cy="23.3" r="0.5" fill="#F7F0E6"/>

  <!-- whisker tips only (visible above book) -->
  <path d="M18 28.5c-3.5.2-6.5 1-9 2.2M46 28.5c3.5.2 6.5 1 9 2.2"
    fill="none" stroke="#2A1F18" stroke-width="0.9" stroke-linecap="round" opacity="0.45"/>

  <!-- shoulders / flanks behind book -->
  <ellipse cx="12" cy="44" rx="6" ry="9" fill="#5E4030"/>
  <ellipse cx="52" cy="44" rx="6" ry="9" fill="#5E4030"/>

  <!-- FOREGROUND: open book (covers muzzle) -->
  <path d="M6 33.5c0-1.2.8-2.1 2.3-2.5L30.5 25.2v33.3L8.5 63.2C6.8 63.7 6 62.6 6 61V33.5z" fill="#FBF7EC"/>
  <path d="M58 33.5c0-1.2-.8-2.1-2.3-2.5L33.5 25.2v33.3l22 4.7c1.7.5 2.5-.6 2.5-2.2V33.5z" fill="#F0E8D2"/>
  <!-- gold spine + fold -->
  <path d="M30.5 25.5v33M33.5 25.5v33" stroke="#B8923E" stroke-width="1.7" stroke-linecap="round"/>
  <path d="M32 25.2v33.5" stroke="#2A1F18" stroke-width="1.1" opacity="0.28"/>
  <!-- page texture (sparse) -->
  <path d="M11 37.5h15M11 42h14M11 46.5h15M11 51h13M11 55.5h14" stroke="#A89878" stroke-width="1.15" stroke-linecap="round" opacity="0.45"/>
  <path d="M38 37.5h15M39 42h14M38 46.5h15M40 51h13M39 55.5h14" stroke="#A89878" stroke-width="1.15" stroke-linecap="round" opacity="0.45"/>
  <!-- top edge highlight -->
  <path d="M9 32.8 L30.5 26.2" stroke="#E8D5A0" stroke-width="1.1" opacity="0.75"/>
  <path d="M55 32.8 L33.5 26.2" stroke="#D8C898" stroke-width="1.1" opacity="0.75"/>

  <!-- paws gripping the top of the book -->
  <ellipse cx="22" cy="29.2" rx="4.4" ry="2.8" fill="#5E4030"/>
  <ellipse cx="42" cy="29.2" rx="4.4" ry="2.8" fill="#5E4030"/>
  <!-- toe pads -->
  <circle cx="20.2" cy="28.6" r="0.85" fill="#C4A484" opacity="0.7"/>
  <circle cx="22.2" cy="28.2" r="0.85" fill="#C4A484" opacity="0.7"/>
  <circle cx="24.1" cy="28.7" r="0.85" fill="#C4A484" opacity="0.7"/>
  <circle cx="39.9" cy="28.7" r="0.85" fill="#C4A484" opacity="0.7"/>
  <circle cx="41.8" cy="28.2" r="0.85" fill="#C4A484" opacity="0.7"/>
  <circle cx="43.8" cy="28.6" r="0.85" fill="#C4A484" opacity="0.7"/>
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
};
