"""Launch Streamlit as a fully detached daemon that survives parent shell exit.

Uses subprocess.Popen with start_new_session=True (setsid) and redirects
stdin/stdout/stderr to /dev/null + a log file. Writes PID to /tmp/streamlit.pid
so we can later send SIGHUP / SIGTERM.
"""
import os
import sys
import subprocess
import time
from pathlib import Path

LOG = Path("/tmp/streamlit.log")
PID_FILE = Path("/tmp/streamlit.pid")
APP = "/home/z/my-project/app.py"

# Kill any prior instance
if PID_FILE.exists():
    try:
        old = int(PID_FILE.read_text().strip())
        os.kill(old, 9)
    except Exception:
        pass
    PID_FILE.unlink(missing_ok=True)

# Also pkill any stray streamlit processes
subprocess.run(["pkill", "-9", "-f", "streamlit run"], capture_output=True)
time.sleep(1)

log_fp = open(LOG, "wb", buffering=0)
streamlit_bin = os.path.expanduser("~/.local/bin/streamlit")
proc = subprocess.Popen(
    [
        streamlit_bin, "run", APP,
        "--server.port", "8501",
        "--server.address", "0.0.0.0",
        "--server.headless", "true",
        "--server.fileWatcherType", "none",
        "--browser.gatherUsageStats", "false",
    ],
    stdin=subprocess.DEVNULL,
    stdout=log_fp,
    stderr=subprocess.STDOUT,
    cwd="/home/z/my-project",
    env={**os.environ, "PATH": f"{os.environ.get('HOME','')}/.local/bin:{os.environ.get('PATH','')}"},
    start_new_session=True,  # setsid - fully detach into new session
    close_fds=True,
)
PID_FILE.write_text(str(proc.pid))
print(f"Launched Streamlit as PID {proc.pid}. Log: {LOG}")

# Wait briefly to confirm it's running
time.sleep(6)
poll = proc.poll()
if poll is None:
    print(f"Streamlit still running after 6s. PID={proc.pid}")
else:
    print(f"Streamlit exited with code {poll}!")
    print("--- log ---")
    print(open(LOG).read())
    sys.exit(1)
