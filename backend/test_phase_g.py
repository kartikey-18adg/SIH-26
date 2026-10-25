import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.database import SessionLocal
from backend.app.models import Workspace, ApprovalCase, Alert, NotificationOutbox, AuditEvent
from backend.app.routers.workspace import get_or_create_default_workspace
from backend.app.routers.alerts import (
    trigger_alert_scan, list_alerts, acknowledge_alert, assign_alert, resolve_alert,
    list_notifications, AlertAcknowledgeRequest, AlertAssignRequest, AlertResolveRequest
)

def run_phase_g_tests():
    db = SessionLocal()
    try:
        print("=== AICLEAR PHASE G VERIFICATION TEST SUITE ===")
        ws = get_or_create_default_workspace(db)
        print(f"[SETUP] Workspace ID: {ws.id}, Active Mode: {ws.active_data_mode}")

        # Test 1: Real-time Escalation Scan & Deterministic Generation
        scan_res = trigger_alert_scan(db=db)
        print(f"[TEST 1] Alert Scan Completed:")
        print(f"  - Scanned Cases: {scan_res.scanned_cases_count}")
        print(f"  - New Alerts Created: {scan_res.new_alerts_created}")
        print(f"  - Alerts Updated: {scan_res.existing_alerts_updated}")
        print(f"  - Total Active Alerts: {scan_res.total_active_alerts}")
        print(f"  - Simulated Notifications Dispatched: {scan_res.notifications_generated}")
        assert scan_res.total_active_alerts > 0, "Expected active alerts to be generated"
        print("[TEST 1 PASSED] Deterministic alert scan executed successfully.\n")

        # Test 2: Composite Deduplication
        # Triggering a second immediate scan should create 0 new alerts because keys match
        second_scan = trigger_alert_scan(db=db)
        print(f"[TEST 2] Second Consecutive Scan (Deduplication Check):")
        print(f"  - New Alerts Created: {second_scan.new_alerts_created}")
        print(f"  - Existing Alerts Updated: {second_scan.existing_alerts_updated}")
        assert second_scan.new_alerts_created == 0, f"Deduplication failed: created {second_scan.new_alerts_created} duplicates"
        print("[TEST 2 PASSED] Composite deduplication key prevented duplicate alerts.\n")

        # Test 3: List & Filter Alerts
        all_alerts = list_alerts(db=db)
        print(f"[TEST 3] Listing alerts across categories:")
        print(f"  - Total Returned: {len(all_alerts)}")
        
        critical_alerts = list_alerts(severity="CRITICAL", db=db)
        print(f"  - CRITICAL Severity Filter: {len(critical_alerts)}")
        for ca in critical_alerts[:3]:
            print(f"     [{ca.severity}] {ca.title} (Key: {ca.alert_key})")
        assert len(critical_alerts) > 0, "Expected at least one critical alert"

        deadline_alerts = list_alerts(category="DEADLINE", db=db)
        print(f"  - DEADLINE Category Filter: {len(deadline_alerts)}")
        print("[TEST 3 PASSED] Multi-criteria alert filtering validated.\n")

        # Test 4: Alert Acknowledge Operation
        target_alert = next(a for a in all_alerts if a.status == "OPEN")
        print(f"[TEST 4] Acknowledging Alert ID: {target_alert.id} ({target_alert.title})")
        ack_res = acknowledge_alert(
            alert_id=target_alert.id,
            req=AlertAcknowledgeRequest(acknowledged_by="Lead Registrar", notes="Acknowledged and flagged for action"),
            db=db
        )
        assert ack_res.status == "ACKNOWLEDGED"
        
        # Verify Audit Log
        ack_audit = db.query(AuditEvent).filter(
            AuditEvent.entity_id == target_alert.id,
            AuditEvent.action == "ALERT_ACKNOWLEDGED"
        ).first()
        assert ack_audit is not None, "Missing audit event for alert acknowledgment"
        print(f"  - New Status: {ack_res.status}")
        print(f"  - Audit Action: {ack_audit.action} by {ack_audit.actor_name}")
        print("[TEST 4 PASSED] Alert acknowledgment & audit record verified.\n")

        # Test 5: Alert Assignment & Simulated Notification Dispatch
        print(f"[TEST 5] Assigning Alert ID: {target_alert.id} to S. Patel")
        assign_res = assign_alert(
            alert_id=target_alert.id,
            req=AlertAssignRequest(
                assigned_to="S. Patel",
                assignee_email="s.patel@engineering.edu.in",
                assigned_by="Head of Compliance"
            ),
            db=db
        )
        assert assign_res.assigned_to == "S. Patel"
        
        # Verify Audit Log
        assign_audit = db.query(AuditEvent).filter(
            AuditEvent.entity_id == target_alert.id,
            AuditEvent.action == "ALERT_ASSIGNED"
        ).first()
        assert assign_audit is not None, "Missing audit event for alert assignment"
        assert assign_audit.details_json["new_assignee"] == "S. Patel"
        print(f"  - Assigned To: {assign_res.assigned_to}")
        print(f"  - Audit Action: {assign_audit.action} (New Assignee: {assign_audit.details_json['new_assignee']})")
        print("[TEST 5 PASSED] Alert assignment and assignee dispatch recorded.\n")

        # Test 6: Alert Resolution with Written Notes
        print(f"[TEST 6] Resolving Alert ID: {target_alert.id}")
        resolve_res = resolve_alert(
            alert_id=target_alert.id,
            req=AlertResolveRequest(
                resolution_notes="Renewed fire safety municipal NOC receipt attached and compliance verified.",
                resolved_by="Safety Director"
            ),
            db=db
        )
        assert resolve_res.status == "RESOLVED"
        assert resolve_res.resolved_at is not None
        assert "Renewed fire safety" in resolve_res.resolution_notes
        
        # Verify Audit Log
        resolve_audit = db.query(AuditEvent).filter(
            AuditEvent.entity_id == target_alert.id,
            AuditEvent.action == "ALERT_RESOLVED"
        ).first()
        assert resolve_audit is not None, "Missing audit event for alert resolution"
        print(f"  - Status: {resolve_res.status}")
        print(f"  - Resolved At: {resolve_res.resolved_at}")
        print(f"  - Resolution Notes: {resolve_res.resolution_notes}")
        print("[TEST 6 PASSED] Alert resolution workflow and notes committed.\n")

        # Test 7: Simulated Notification Outbox Verification
        notifs = list_notifications(limit=10, db=db)
        print(f"[TEST 7] Simulated Notification Outbox Inspection:")
        print(f"  - Total Logged Outbox Messages: {len(notifs)}")
        assert len(notifs) > 0, "No notifications found in outbox"
        for n in notifs[:3]:
            print(f"     [To: {n.recipient_email}] Subject: {n.subject} (Simulated: {n.is_simulated}, Channel: {n.channel})")
            assert n.is_simulated is True, "Notification must be tagged as simulated"
            assert n.channel in ["SIMULATED_EMAIL", "IN_APP"], "Unexpected channel"
        print("[TEST 7 PASSED] Simulated notification outbox operates cleanly with strict non-production markers.\n")

        print("=== ALL PHASE G VERIFICATION TESTS PASSED SUCCESSFULLY! ===")

    finally:
        db.close()

if __name__ == "__main__":
    run_phase_g_tests()
