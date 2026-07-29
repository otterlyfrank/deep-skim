# Deep-Skim

**v1.12** · See [PATCHNOTES.md](PATCHNOTES.md) for release history.

A **local-first** browser app for one high-quality structured deep-skim per week.

It is built for large PDF libraries and a prioritized *To Be Read ASAP* pile: a **substantial condensed reading** (often ~10–20 note-pages for a ~200pp book; ~25–50 for ~500pp), not a thin abstract — structured so the material sticks (active recall + spaced re-test), private by default (IndexedDB, optional local LLM/OCR only).

## Install as an app (recommended)

Deep-Skim is a **Progressive Web App**. No native binary.

Once open over **http://localhost** (or a future public HTTPS URL):

1. **Chrome / Edge** — install icon in the address bar, or menu → **Install Deep-Skim…** / **Install page as app**  
2. **Safari (Mac)** — **File → Add to Dock…**  
3. **iPhone / iPad** — Share → **Add to Home Screen**

That puts Deep-Skim in Applications / Start menu and lets you **pin it to the Dock or taskbar**.

In-app: sidebar **Install app** (when offered) or **Settings → Install Deep-Skim**.

Library data stays in **this browser profile’s IndexedDB**.

## Quick start (local)

Deep-Skim is static ES modules. Serve the folder over HTTP (not `file://`):

```bash
cd deep-skim-v1

# any static server works, e.g.:
./start.sh
# or: python3 -m http.server 8080
# or: npx --yes serve -l 8080
```

Open **http://localhost:8080**, then **Install as app** (above).

1. **Add PDFs** (drag-and-drop, multi-file picker, or **Add folder** — Chromium directory API or Safari/Firefox `webkitdirectory` fallback).
2. Wait for **native extraction** (status → `ready`).
3. Scans: **Force OCR** uses Gemini vision with your free API key (no localhost OCR). Optional local bridge: [docs/ocr-setup.md](docs/ocr-setup.md).
4. Settings → free Gemini (or other LLM).
5. Open a ready document → **Generate deep-skim**.

### Free generation (default)

**Claude Pro and SuperGrok do not power this app** — those are chat subscriptions, not third-party API access.

**Recommended free path — Google Gemini free tier:**

1. Get a free key: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. App → **Settings** → **Use free Gemini** (defaults to `gemini-3.5-flash`)
3. Paste key → acknowledge cloud text → **Save** → **Test connection**
4. Generate a deep-skim from a ready PDF

Also free: **Groq** free tier, **Ollama** (local/private), OpenRouter `:free` models.

**Strong low-cost:** **DeepSeek** (`deepseek-v4-flash` / `pro`) and **Kimi / Moonshot** (long context) — both OpenAI-compatible, often better structure than free Gemini.

Optional paid later: Grok API, OpenAI, Claude via OpenRouter (separate from Claude Pro).

Full guide: **[docs/llm-setup.md](docs/llm-setup.md)**.

### Ollama (local / private)

```bash
ollama pull llama3.2
OLLAMA_ORIGINS="http://localhost:8080,http://127.0.0.1:8080" ollama serve
```

Settings → **Use Ollama**.

### OCR (scans / hard PDFs)

See **[docs/ocr-setup.md](docs/ocr-setup.md)** for Unlimited-OCR and DeepSeek-OCR.

```bash
pip install -r scripts/requirements-ocr.txt
python scripts/ocr_bridge.py --port 8765
```

Default OCR bridge URL in Settings: `http://localhost:8765`.

## What you get per deep-skim

The model is forced into a fixed structure (see [`SYSTEM_PROMPT.md`](SYSTEM_PROMPT.md)):

1. Title + Bibliographic Note  
2. Hierarchical Outline + **Core Claims** (not topic lists)  
3. 4–6 **Verbatim** High-Signal Passages  
4. Mental Models & Diagrammatic Structure  
5. Active-Recall Questions (5–8, with answers)  
6. Connections to Existing Knowledge (personalization hooks)  
7. Dual-Pressure Stress Test  
8. What Remains Unclear / Worth Full Reading  

Edit the prompt in `SYSTEM_PROMPT.md` and keep `src/generation/prompt.js` in sync when iterating.

## Features

| Area | Behavior |
|------|----------|
| Ingestion | Drag-drop, multi-file picker, optional directory walk; ASAP folder name → priority |
| Extraction | pdf.js native text + quality heuristics; OCR bridge fallback; key page figures |
| Storage | IndexedDB: PDFs, extractions, summaries, reviews, settings |
| Generation | Substantial condensed reading; multipass + staged write; long-read page extracts |
| Projects | **Multi-week** long books: weekly page bands only (token-efficient) + final synthesis |
| Export | Markdown + print/PDF with ASCII-safe flow diagrams |
| Reading | Collapsible sections, dark/light, calm typography |
| Recall | Quiz mode with self-grading; due queue of 2–3 older skims |
| Worth reading? | **★ Star** (keep skim) · **Reading List** (promote full PDF) · **Archive** — shelves in the sidebar |
| Export | Markdown download; print dialog → Save as PDF |
| Search | Local full-text over summary markdown + titles/tags |
| Research lenses | Settings: edit keywords that drive §6 Connections (and light relevance bias); optional focus note; restore defaults anytime |

## Architecture

```
src/
  extraction/     # pdf.js pipeline, quality gate, OCR client
  generation/     # system prompt, LLM client, markdown parser
  storage/        # IndexedDB
  lib/            # ingest, export helpers
  ui via app.js   # presentation / SPA shell
  styles.css
scripts/ocr_bridge.py
SYSTEM_PROMPT.md
```

Layers stay separate: **extraction → generation → presentation**, with storage as the local backbone.

## Privacy

- No mandatory backend.
- PDFs and summaries never leave the machine unless **you** point Settings at a remote API.
- Prefer `127.0.0.1` for Ollama and the OCR bridge.

## New-tab / pinned use

Pin the tab, or set your browser’s new-tab extension to `http://localhost:8080` (or wherever you host the static files). The UI is intentionally closer to a reading tool than a dashboard.

## Non-goals

- Full PDF annotation / highlighting  
- Multi-user cloud sync  
- Automatic weekly generation without confirmation  
- Generic “book summary” prose  

## GitHub

```bash
cd ~/deep-skim
# after first push, clone with:
# git clone https://github.com/<you>/deep-skim.git
```

Local data (IndexedDB) is **never** in the git repo — only the app code.

## License

MIT — use and adapt freely for personal research systems. See [LICENSE](LICENSE).
