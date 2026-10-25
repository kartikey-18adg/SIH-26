"""
AIClear Startup Runner
Launches the FastAPI backend server on http://127.0.0.1:8000
"""
import sys
import os

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

import uvicorn
from backend.app.main import app

if __name__ == "__main__":
    print("Starting AIClear Backend on http://127.0.0.1:8000 ...")
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=True)
