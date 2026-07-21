# OCR setup

Deep-Skim always tries **native PDF text** first (pdf.js). That covers most born-digital books and papers.

## Recommended: Gemini cloud OCR (no localhost)

If native text is weak (scans, image PDFs), the app can OCR page images using the **same Google Gemini API key** you use for deep-skims.

1. Settings → **Use free Gemini** → paste AI Studio key → Save  
2. **OCR path** = `Auto` or `Gemini / cloud vision only`  
3. Open a scan → Force OCR (or re-extract when quality is low)

No Python bridge, no Unlimited-OCR, no DeepSeek-OCR install.

| Setting | Default | Notes |
|---------|---------|--------|
| OCR path | Auto | Gemini if key set |
| Cloud OCR max pages | 48 | Free-tier cap; long scans are sampled evenly |

Quota: each page is a vision request. Prefer multi-week bands / lower max pages if you hit 429s.

## Optional: local OCR bridge

Only if you want fully offline vision models (Unlimited-OCR / DeepSeek-OCR via vLLM). See git history or `scripts/ocr_bridge.py`.

```bash
pip install -r scripts/requirements-ocr.txt
python scripts/ocr_bridge.py --port 8765
```

Settings → OCR path → **Local bridge only**, URL `http://localhost:8765`.

## When you need nothing

Digital PDFs with a text layer → **Native PDF text only** (OCR path = none). Sidebar OCR stays gray; that is fine.
