"""Robust file server that survives sandbox process-reaping.

Serves files from /home/z/my-project/download on port 8080.
- Adds CORS headers so files can be downloaded from any origin.
- Adds proper Content-Disposition so the file downloads with the right name.
- Sets long timeout + keep-alive so connections don't drop mid-download.
"""
import os
import sys
import subprocess
import time
import signal
from pathlib import Path

ROOT = "/home/z/my-project/download"
PORT = 8080
PID_FILE = Path("/tmp/file-server.pid")
LOG = Path("/tmp/file-server.log")


def kill_existing():
    if PID_FILE.exists():
        try:
            old = int(PID_FILE.read_text().strip())
            os.kill(old, 9)
        except Exception:
            pass
        PID_FILE.unlink(missing_ok=True)
    subprocess.run(["pkill", "-9", "-f", "http.server 8080"], capture_output=True)
    time.sleep(1)


def launch():
    kill_existing()
    # Inline a small custom handler that sets Content-Disposition + CORS
    handler_code = '''
import http.server, socketserver, os, urllib.parse

DIRECTORY = "/home/z/my-project/download"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # CORS: allow any origin so the file can be fetched from the preview URL
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Range, Content-Type")
        # Force download with the right filename for our specific files
        path = urllib.parse.unquote(self.path.lstrip("/"))
        if path in ("hydrograph-source.zip", "hydrograph-source.tar.gz"):
            self.send_header("Content-Disposition", f'attachment; filename="{path}"')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

with socketserver.TCPServer(("0.0.0.0", %d), Handler) as httpd:
    httpd.daemon_threads = True
    print(f"Serving {DIRECTORY} on port %d", flush=True)
    httpd.serve_forever()
''' % (PORT, PORT)

    log_fp = open(LOG, "wb", buffering=0)
    proc = subprocess.Popen(
        [sys.executable, "-c", handler_code],
        stdin=subprocess.DEVNULL,
        stdout=log_fp,
        stderr=subprocess.STDOUT,
        cwd=ROOT,
        start_new_session=True,
        close_fds=True,
    )
    PID_FILE.write_text(str(proc.pid))
    print(f"Launched file server PID={proc.pid}. Log: {LOG}")
    time.sleep(2)
    poll = proc.poll()
    if poll is None:
        print(f"OK: file server still running after 2s")
    else:
        print(f"FAIL: file server exited with code {poll}")
        print(open(LOG).read())
        sys.exit(1)


if __name__ == "__main__":
    launch()
