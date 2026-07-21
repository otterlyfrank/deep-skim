# Deep-Skim patch notes

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
