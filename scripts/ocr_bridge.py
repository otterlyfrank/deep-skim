#!/usr/bin/env python3
"""
Deep-Skim OCR bridge — thin local HTTP server for Unlimited-OCR / DeepSeek-OCR.

This keeps heavy vision models out of the browser while preserving a local-first
pipeline. The web app posts PDFs/images here and receives Markdown.

Quick start (CPU/GPU machine with the models installed):

  cd deep-skim
  python -m venv .venv && source .venv/bin/activate
  pip install -r scripts/requirements-ocr.txt
  # Optional: install Unlimited-OCR / DeepSeek-OCR per docs/ocr-setup.md
  python scripts/ocr_bridge.py --port 8765

Endpoints:
  GET  /health
  POST /ocr/pdf    multipart: file, provider=auto|unlimited-ocr|deepseek-ocr
  POST /ocr/image  multipart: file, provider=..., page_index=0

If model weights are not installed, the bridge still starts and returns a
clear error so the app can fall back to native PDF text.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
import tempfile
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

# Optional deps — imported lazily inside handlers where possible
try:
    from pypdf import PdfReader
except ImportError:
    try:
        from PyPDF2 import PdfReader  # type: ignore
    except ImportError:
        PdfReader = None  # type: ignore


PROVIDERS_AVAILABLE: list[str] = []
_MODELS: dict = {}


def detect_providers() -> list[str]:
    found = []
    # Environment overrides for custom inference servers (vLLM OpenAI-compatible)
    if os.environ.get("UNLIMITED_OCR_URL"):
        found.append("unlimited-ocr")
    if os.environ.get("DEEPSEEK_OCR_URL"):
        found.append("deepseek-ocr")

    # Local transformers availability (heavy; optional)
    try:
        import transformers  # noqa: F401

        # Presence of package does not mean weights are downloaded.
        # Users set DEEPSEEK_OCR_LOCAL=1 / UNLIMITED_OCR_LOCAL=1 to enable.
        if os.environ.get("UNLIMITED_OCR_LOCAL") == "1":
            found.append("unlimited-ocr")
        if os.environ.get("DEEPSEEK_OCR_LOCAL") == "1":
            found.append("deepseek-ocr")
    except ImportError:
        pass

    # Always expose "stub" for pipeline testing without GPU
    found.append("stub")
    # de-dupe preserve order
    out, seen = [], set()
    for p in found:
        if p not in seen:
            out.append(p)
            seen.add(p)
    return out


def call_openai_vision(base_url: str, model: str, image_bytes: bytes, prompt: str) -> str:
    """Call an OpenAI-compatible multimodal endpoint (vLLM, etc.)."""
    import base64
    import urllib.request

    b64 = base64.b64encode(image_bytes).decode("ascii")
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{b64}"},
                    },
                ],
            }
        ],
        "temperature": 0.0,
        "max_tokens": 8192,
    }
    req = urllib.request.Request(
        base_url.rstrip("/") + "/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=600) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"]


OCR_PROMPT = (
    "Transcribe this document page to structured Markdown. "
    "Preserve reading order, headings, lists, tables, and formulas. "
    "Do not summarize. Output Markdown only."
)


def render_pdf_pages(pdf_bytes: bytes, max_pages: int = 80) -> list[bytes]:
    """Render PDF pages to PNG bytes. Prefers pymupdf; falls back to error."""
    try:
        import fitz  # pymupdf
    except ImportError as e:
        raise RuntimeError(
            "pymupdf is required for PDF rendering. pip install pymupdf"
        ) from e

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages = []
    for i, page in enumerate(doc):
        if i >= max_pages:
            break
        # 150–200 dpi-ish
        mat = fitz.Matrix(2.0, 2.0)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        pages.append(pix.tobytes("png"))
    doc.close()
    return pages


def ocr_image_bytes(image_bytes: bytes, provider: str) -> str:
    provider = resolve_provider(provider)

    if provider == "stub":
        return (
            "<!-- stub OCR — install Unlimited-OCR or DeepSeek-OCR per docs/ocr-setup.md -->\n\n"
            f"(stub transcription; {len(image_bytes)} image bytes received)\n"
        )

    if provider == "unlimited-ocr":
        url = os.environ.get("UNLIMITED_OCR_URL", "http://localhost:8000/v1")
        model = os.environ.get("UNLIMITED_OCR_MODEL", "baidu/Unlimited-OCR")
        if os.environ.get("UNLIMITED_OCR_LOCAL") == "1":
            return ocr_local_transformers(image_bytes, "baidu/Unlimited-OCR")
        return call_openai_vision(url, model, image_bytes, OCR_PROMPT)

    if provider == "deepseek-ocr":
        url = os.environ.get("DEEPSEEK_OCR_URL", "http://localhost:8001/v1")
        model = os.environ.get("DEEPSEEK_OCR_MODEL", "deepseek-ai/DeepSeek-OCR")
        if os.environ.get("DEEPSEEK_OCR_LOCAL") == "1":
            return ocr_local_transformers(image_bytes, "deepseek-ai/DeepSeek-OCR")
        return call_openai_vision(url, model, image_bytes, OCR_PROMPT)

    raise RuntimeError(f"Unknown provider: {provider}")


def ocr_local_transformers(image_bytes: bytes, model_id: str) -> str:
    """
    Best-effort local transformers path. Model APIs differ; this uses a
    generic AutoProcessor + AutoModelForCausalLM generate pattern common to
    recent OCR VLMs. Adjust if your install uses a custom generate helper.
    """
    from PIL import Image
    import torch
    from transformers import AutoModel, AutoTokenizer, AutoProcessor

    key = model_id
    if key not in _MODELS:
        print(f"[ocr_bridge] Loading {model_id} …", flush=True)
        tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
        try:
            processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)
        except Exception:
            processor = None
        model = AutoModel.from_pretrained(
            model_id,
            trust_remote_code=True,
            torch_dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
            device_map="auto" if torch.cuda.is_available() else None,
        )
        if not torch.cuda.is_available():
            model = model.to("cpu")
        model.eval()
        _MODELS[key] = (model, tokenizer, processor)

    model, tokenizer, processor = _MODELS[key]
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    # Prefer model-specific helpers when present (DeepSeek-OCR / Unlimited-OCR)
    if hasattr(model, "infer"):
        # Some OCR repos expose .infer(image, prompt=...)
        try:
            return model.infer(image, prompt=OCR_PROMPT)
        except TypeError:
            return model.infer(image)

    if processor is not None:
        inputs = processor(images=image, text=OCR_PROMPT, return_tensors="pt")
        inputs = {k: v.to(model.device) if hasattr(v, "to") else v for k, v in inputs.items()}
        with torch.no_grad():
            out = model.generate(**inputs, max_new_tokens=4096)
        return processor.batch_decode(out, skip_special_tokens=True)[0]

    raise RuntimeError(
        f"No known inference path for {model_id}. "
        "Run via vLLM and set UNLIMITED_OCR_URL / DEEPSEEK_OCR_URL instead."
    )


def resolve_provider(provider: str) -> str:
    p = (provider or "auto").lower()
    available = detect_providers()
    if p == "auto":
        for pref in ("unlimited-ocr", "deepseek-ocr", "stub"):
            if pref in available:
                return pref
        return "stub"
    if p not in available and p != "stub":
        # Still allow explicit request; ocr_image_bytes may use URL env
        return p
    return p


def ocr_pdf(pdf_bytes: bytes, provider: str) -> dict:
    provider = resolve_provider(provider)
    pages_png = render_pdf_pages(pdf_bytes)
    page_mds = []
    for i, png in enumerate(pages_png):
        print(f"[ocr_bridge] OCR page {i + 1}/{len(pages_png)} via {provider}", flush=True)
        md = ocr_image_bytes(png, provider)
        page_mds.append(f"<!-- page {i + 1} -->\n\n{md.strip()}")
    markdown = "\n\n---\n\n".join(page_mds)
    return {
        "provider": provider,
        "method": provider,
        "markdown": markdown,
        "text": markdown,
        "pages": page_mds,
        "page_markdowns": page_mds,
        "figures": [],
        "page_count": len(pages_png),
    }


# ── Minimal multipart parser (avoid extra deps for form parsing) ──

def parse_multipart(body: bytes, content_type: str) -> dict:
    if "boundary=" not in content_type:
        raise ValueError("multipart boundary missing")
    boundary = content_type.split("boundary=")[1].strip().encode("ascii")
    if boundary.startswith(b'"'):
        boundary = boundary[1:-1]
    parts = body.split(b"--" + boundary)
    fields: dict = {}
    for part in parts:
        if part in (b"", b"--", b"--\r\n", b"\r\n"):
            continue
        if part.startswith(b"--"):
            continue
        if part.startswith(b"\r\n"):
            part = part[2:]
        if part.endswith(b"\r\n"):
            part = part[:-2]
        header_blob, _, data = part.partition(b"\r\n\r\n")
        if data.endswith(b"\r\n"):
            data = data[:-2]
        headers = header_blob.decode("utf-8", errors="replace")
        name = None
        filename = None
        for line in headers.split("\r\n"):
            if line.lower().startswith("content-disposition:"):
                for bit in line.split(";"):
                    bit = bit.strip()
                    if bit.startswith("name="):
                        name = bit.split("=", 1)[1].strip('"')
                    if bit.startswith("filename="):
                        filename = bit.split("=", 1)[1].strip('"')
        if name is None:
            continue
        if filename is not None:
            fields[name] = {"filename": filename, "data": data}
        else:
            fields[name] = data.decode("utf-8", errors="replace")
    return fields


# Origins allowed to call the bridge from a browser (local Deep-Skim only).
ALLOWED_ORIGINS = frozenset(
    {
        "http://127.0.0.1:8080",
        "http://localhost:8080",
        "http://127.0.0.1:8780",
        "http://localhost:8780",
        "null",  # some local file/test contexts
    }
)


class Handler(BaseHTTPRequestHandler):
    server_version = "DeepSkimOCRBridge/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _cors(self):
        origin = self.headers.get("Origin") or ""
        if origin in ALLOWED_ORIGINS or (origin.startswith("http://127.0.0.1:") or origin.startswith("http://localhost:")):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        # No wildcard — random websites cannot use this bridge via CORS
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, X-Deep-Skim-Token",
        )

    def _check_token(self) -> bool:
        expected = os.environ.get("DEEP_SKIM_OCR_TOKEN", "").strip()
        if not expected:
            return True  # open only when no token configured
        got = (self.headers.get("X-Deep-Skim-Token") or "").strip()
        return got == expected

    def _json(self, code: int, obj: dict):
        raw = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if not self._check_token():
            self._json(401, {"error": "unauthorized — set X-Deep-Skim-Token or DEEP_SKIM_OCR_TOKEN"})
            return
        path = urlparse(self.path).path
        if path == "/health":
            providers = detect_providers()
            self._json(
                200,
                {
                    "ok": True,
                    "message": "OCR bridge online",
                    "providers": providers,
                    "models": providers,
                    "auth": bool(os.environ.get("DEEP_SKIM_OCR_TOKEN", "").strip()),
                },
            )
            return
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if not self._check_token():
            self._json(401, {"error": "unauthorized — set X-Deep-Skim-Token or DEEP_SKIM_OCR_TOKEN"})
            return
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length else b""
        ctype = self.headers.get("Content-Type", "")

        try:
            if path == "/ocr/pdf":
                fields = parse_multipart(body, ctype)
                file_field = fields.get("file")
                if not isinstance(file_field, dict):
                    return self._json(400, {"error": "missing file"})
                provider = fields.get("provider", "auto")
                if isinstance(provider, dict):
                    provider = "auto"
                result = ocr_pdf(file_field["data"], str(provider))
                return self._json(200, result)

            if path == "/ocr/image":
                fields = parse_multipart(body, ctype)
                file_field = fields.get("file")
                if not isinstance(file_field, dict):
                    return self._json(400, {"error": "missing file"})
                provider = fields.get("provider", "auto")
                if isinstance(provider, dict):
                    provider = "auto"
                md = ocr_image_bytes(file_field["data"], str(provider))
                return self._json(
                    200,
                    {
                        "markdown": md,
                        "text": md,
                        "provider": resolve_provider(str(provider)),
                    },
                )

            self._json(404, {"error": "not found"})
        except Exception as e:
            traceback.print_exc()
            self._json(500, {"error": str(e)})


def main():
    parser = argparse.ArgumentParser(description="Deep-Skim OCR bridge")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    global PROVIDERS_AVAILABLE
    PROVIDERS_AVAILABLE = detect_providers()
    print(
        f"Deep-Skim OCR bridge on http://{args.host}:{args.port}  providers={PROVIDERS_AVAILABLE}",
        flush=True,
    )
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.", flush=True)


if __name__ == "__main__":
    main()
