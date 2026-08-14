# Deep-Skim patch notes

## v1.13.1 — Search and empty filters (2026-08-14)

- `/` jumps to library search
- Empty filter chips offer **Show all** instead of a dead line

## v1.13 — Audit polish (P0–P2)

**Theme:** Complete the Reading List climax, honest privacy, vault backup, mobile shell, and offline extract.

### Added
- **Open original PDF** from document detail, summary, and Reading List cards (blob from IndexedDB)
- **Vault backup** export/import in Settings (optional PDFs + redacted secrets by default)
- **First-run checklist** until LLM + privacy + PDF + ready extract are green
- **⌘K command palette** and mobile bottom nav
- Unit tests: `npm test` (quality, multipass chunk, parser, lenses)
- Vendored **pdf.js** under `public/pdfjs/` for offline/PWA extract
- Support links (Ko-fi + GitHub)

### Changed
- Privacy copy distinguishes “PDF stays local” vs “cloud LLM/OCR sends text/images”
- Cloud privacy ack on first generate (not only settings save)
- Research lens ship defaults → generalist pack
- IA: primary nav Library / Summaries / Review / Settings; shelves under More
- Decision bar after sections (“Done reading?”)
- OCR bridge: localhost CORS only + optional `DEEP_SKIM_OCR_TOKEN` / Settings token
- Cascade-delete document → summaries, reviews, projects
- System fonts first; CSS token fix for shelf chips; unique Projects icon
- Cloud OCR sample note when N of M pages OCR’d

### Security
- API key no longer baked into HTML attributes (set via JS after paint)
- OCR bridge no longer uses `Access-Control-Allow-Origin: *`

---

## v1.12 — Install as app (PWA)

**Theme:** One-click install into Applications / Start menu / Dock / taskbar without a native binary.

### Added
- Progressive Web App: `manifest.webmanifest`, service worker (`sw.js`), 192/512 PNG icons
- **Install app** in the sidebar (when Chromium offers a prompt)
- **Settings → Install Deep-Skim** with Chrome / Edge / Safari / iOS howtos
- README install-first path for public-facing product use

### Notes for builders
- Serve over HTTP(S) — `./start.sh` or any static host; not `file://`
- Network-first SW so local development stays fresh; shell still opens offline after install
- Host on HTTPS later for the same Install flow from a public URL
- Optional OCR bridge / cloud LLM unchanged and still opt-in

---

## v1.11 — Worth reading? (Star + Reading List)

**Theme:** Make the central product question — *Is it worth reading?* — first-class in the UI.

### Added
- **Reading List** sidebar shelf — skims promoted for a full sit-down with the PDF (the epic queue)
- **Starred** sidebar shelf — skims you keep handy without necessarily full-reading the source
- Badge counts on both shelves
- Shelf chips on the Summaries view: **All · Reading List · ★ Starred**
- Decision prompt on each deep-skim: Star vs Promote vs Archive

### Changed
- **Mark core** → **☆ Star / ★ Starred** (toggle; independent of Reading List)
- **Promote to full reading** → **Promote to Reading List** (lands you on the Reading List after promote)
- You can **star and promote** the same skim (notes handy *and* full-book intent)
- §8 model guidance: Archive · Star / keep skim · Promote to Reading List

### Fixed
- Promote decisions had no list to check — status was stored but not navigable
- Legacy **core** status auto-migrates to **starred** on load/save

### Unchanged
- Local-first IndexedDB storage, multipass generation, research lenses, multi-week projects

---

## v1.0 — Initial release
- Library, extraction, deep-skim generation, active recall, export
- Research lenses (customizable §6 hooks)
