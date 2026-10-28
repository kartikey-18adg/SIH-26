"""Run the configured AIClear deadline scanners once.

Schedule this command daily with Windows Task Scheduler or cron. It records alerts
and simulated notification-outbox entries; it does not send real email.
"""
import json
from backend.app.database import SessionLocal
from backend.app.routers.workspace import get_or_create_default_workspace
from backend.app.routers.alerts import scan_workspace_alerts_logic
from backend.app.routers.obligations import scan_obligation_deadlines, scan_evc_deadlines

def main():
    db = SessionLocal()
    try:
        workspace = get_or_create_default_workspace(db)
        core = scan_workspace_alerts_logic(db, workspace)
        obligations = scan_obligation_deadlines(db, "Administrator")
        evc = scan_evc_deadlines(db, "Administrator")
        print(json.dumps({
            "workspace": workspace.slug,
            "core_alert_scan": core,
            "obligation_scan": obligations,
            "evc_scan": evc,
            "notification_delivery": "SIMULATED_ONLY"
        }, default=str, indent=2))
    finally:
        db.close()

if __name__ == "__main__":
    main()
