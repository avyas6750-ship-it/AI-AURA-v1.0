"""Launch FastAPI backend as a fully detached daemon."""
import os
import sys
import subprocess
import time
from pathlib import Path

LOG = Path("/tmp/fastapi.log")
PID_FILE = Path("/tmp/fastapi.pid")

# Kill any prior instance
if PID_FILE.exists():
    try:
        old = int(PID_FILE.read_text().strip())
        os.kill(old, 9)
    except Exception:
        pass
    PID_FILE.unlink(missing_ok=True)

subprocess.run(["pkill", "-9", "-f", "uvicorn"], capture_output=True)
time.sleep(1)

log_fp = open(LOG, "wb", buffering=0)
# Use python -m uvicorn to avoid path issues across venvs
uvicorn_bin = "/home/z/.venv/bin/uvicorn"
if not os.path.exists(uvicorn_bin):
    # Fallback: try ~/.local/bin/uvicorn
    uvicorn_bin = os.path.expanduser("~/.local/bin/uvicorn")
proc = subprocess.Popen(
    [uvicorn_bin, "backend.api:app",
     "--host", "0.0.0.0",
     "--port", "8000",
     "--log-level", "info"],
    stdin=subprocess.DEVNULL,
    stdout=log_fp,
    stderr=subprocess.STDOUT,
    cwd="/home/z/my-project",
    env={**os.environ,
         "PATH": f"/home/z/.venv/bin:{os.environ.get('HOME','')}/.local/bin:{os.environ.get('PATH','')}"},
    start_new_session=True,
    close_fds=True,
)
PID_FILE.write_text(str(proc.pid))
print(f"Launched FastAPI as PID {proc.pid}. Log: {LOG}")

time.sleep(5)
poll = proc.poll()
if poll is None:
    print(f"FastAPI still running after 5s. PID={proc.pid}")
else:
    print(f"FastAPI exited with code {poll}!")
    print("--- log ---")
    print(open(LOG).read())
    sys.exit(1)
