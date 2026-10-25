"""
AIClear Unified Runner
Launches both the FastAPI backend and the Next.js frontend concurrently in a single terminal.
Press Ctrl+C to cleanly stop both services.
"""
import sys
import os
import subprocess
import signal
import time
import shutil

ROOT_DIR = os.path.abspath(os.path.dirname(__file__))
FRONTEND_DIR = os.path.join(ROOT_DIR, "frontend")

def find_npm():
    npm_path = shutil.which("npm.cmd" if sys.platform == "win32" else "npm")
    if not npm_path:
        npm_path = "npm.cmd" if sys.platform == "win32" else "npm"
    return npm_path

def main():
    print("=" * 70)
    print("       AICLEAR: INTEGRATED APPLICATION RUNNER (BACKEND + FRONTEND)       ")
    print("=" * 70)
    print(f"Project Directory : {ROOT_DIR}")
    print(f"Backend API       : http://127.0.0.1:8000")
    print(f"API Documentation : http://127.0.0.1:8000/docs")
    print(f"Frontend UI       : http://localhost:3000")
    print("-" * 70)
    print("Press Ctrl+C at any time to shut down both services cleanly.")
    print("=" * 70)
    print()

    # Environment setup
    env = os.environ.copy()
    env["PYTHONPATH"] = ROOT_DIR

    backend_cmd = [sys.executable, "-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", "8000"]
    frontend_cmd = [find_npm(), "run", "dev"]

    procs = []
    try:
        print("[LAUNCHER] Starting FastAPI backend on http://127.0.0.1:8000 ...")
        p_backend = subprocess.Popen(
            backend_cmd,
            cwd=ROOT_DIR,
            env=env
        )
        procs.append(p_backend)

        time.sleep(1.5)

        print("[LAUNCHER] Starting Next.js frontend on http://localhost:3000 ...")
        p_frontend = subprocess.Popen(
            frontend_cmd,
            cwd=FRONTEND_DIR,
            env=env,
            shell=(sys.platform == "win32")
        )
        procs.append(p_frontend)

        # Wait for any process to exit or keyboard interrupt
        while True:
            for p in procs:
                ret = p.poll()
                if ret is not None:
                    print(f"\n[LAUNCHER] A process exited with code {ret}. Shutting down remaining services...")
                    return
            time.sleep(1)

    except KeyboardInterrupt:
        print("\n[LAUNCHER] Shutdown requested (Ctrl+C). Terminating services...")
    finally:
        for p in procs:
            if p.poll() is None:
                try:
                    if sys.platform == "win32":
                        # Terminate entire process tree on Windows
                        subprocess.call(["taskkill", "/F", "/T", "/PID", str(p.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    else:
                        p.terminate()
                except Exception:
                    pass
        print("[LAUNCHER] Both backend and frontend services have been stopped. Clean exit.")

if __name__ == "__main__":
    main()
