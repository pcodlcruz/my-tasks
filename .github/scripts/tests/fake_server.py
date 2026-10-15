"""Stand-in for one deployed environment, used by test-smoke-test.sh.

It serves the API and the web from one address. FAKE_MODE picks the fault to simulate; with
"healthy" every smoke check passes. It prints the port it listens on, then serves until killed.
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

MODE = os.environ.get("FAKE_MODE", "healthy")
VERSION = os.environ.get("FAKE_VERSION", "abc123")
OTHER_API = "https://mytasks-api-other.example.run.app"


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: str, content_type: str = "application/json") -> None:
        payload = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:  # noqa: N802
        port = self.server.server_address[1]
        own_api = f"http://127.0.0.1:{port}"
        if self.path == "/healthz":
            # Like run.app: the frontend of Google answers this path itself, the container
            # never sees it. A smoke test that used it would fail on the real thing.
            self._send(404, "<!DOCTYPE html><title>Error 404 (Not Found)</title>", "text/html")
        elif self.path == "/health":
            version = "other" if MODE == "wrong-version" else VERSION
            self._send(200, json.dumps({"status": "ok", "version": version}))
        elif self.path == "/readyz":
            ready = MODE != "not-ready"
            self._send(200 if ready else 503, json.dumps({"status": "ready"}))
        elif self.path == "/api/v1/tasks":
            self._send(200 if MODE == "anonymous-data" else 401, "{}")
        elif self.path == "/":
            self._send(500 if MODE == "web-down" else 200, "<html></html>", "text/html")
        elif self.path == "/config.js":
            api = {"config-wrong-api": OTHER_API}.get(MODE, own_api)
            extra = f"// {OTHER_API}" if MODE == "config-both" else ""
            self._send(200, f"window.__APP_CONFIG__ = {{ API_BASE_URL: '{api}' }}; {extra}", "text/javascript")
        else:
            self._send(404, "{}")

    def log_message(self, *_: object) -> None:
        return


server = HTTPServer(("127.0.0.1", 0), Handler)
print(server.server_address[1], flush=True)
sys.stdout.close()
server.serve_forever()
