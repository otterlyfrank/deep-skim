#!/usr/bin/env python3
"""Deep-Skim static server — Cache-Control: no-store so installed PWAs pick up git pulls."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "8080"))
BIND = os.environ.get("DEEPSKIM_BIND", "127.0.0.1")

try:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except Exception:
    pass


def app_version_info() -> dict:
    version = ""
    pkg = ROOT / "package.json"
    if pkg.is_file():
        try:
            version = str(json.loads(pkg.read_text(encoding="utf-8")).get("version") or "")
        except Exception:
            version = ""
    git = ""
    try:
        git = (
            subprocess.check_output(
                ["git", "rev-parse", "--short", "HEAD"],
                cwd=ROOT,
                timeout=1.5,
                stderr=subprocess.DEVNULL,
            )
            .decode("ascii", "replace")
            .strip()
        )
    except Exception:
        git = ""
    return {"ok": True, "name": "deep-skim", "version": version, "git": git}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path in ("/health", "/api/health", "/api/version"):
            raw = json.dumps(app_version_info()).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return
        super().do_GET()


def main() -> None:
    if BIND not in ("127.0.0.1", "localhost", "::1"):
        print("Refusing to bind off localhost.", file=sys.stderr)
        sys.exit(2)
    os.chdir(ROOT)
    httpd = ThreadingHTTPServer((BIND, PORT), Handler)
    print("")
    print("  Deep-Skim")
    print("  Open: http://%s:%s" % (BIND, PORT))
    print("  Stop: Ctrl+C")
    print("")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
