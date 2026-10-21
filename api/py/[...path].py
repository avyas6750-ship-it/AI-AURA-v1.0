"""Vercel Python serverless function — catch-all route for /api/py/*.

Vercel's Python runtime auto-detects ASGI apps. By exporting `app` as a
module-level variable, Vercel wraps it and routes all requests matching
this file's path (`/api/py/[...path]`) through the FastAPI app.

Architecture:
    Browser → /api/py/segment → Vercel → FastAPI app → response

The FastAPI app is defined in `backend/api.py` and uses relative imports
from `src/` — same code as Render, just exposed as a Vercel serverless function.
"""
import sys
from pathlib import Path

# Ensure the project root is on sys.path so `from src.X import Y` works
# in the serverless function context.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Import the FastAPI app (this also loads the RandomForest model at module
# level, which stays warm between invocations on Vercel's serverless runtime)
from backend.api import app  # noqa: E402

# Export `app` as the ASGI handler — Vercel auto-detects this.
# The variable MUST be named `app` for Vercel's ASGI detection.
