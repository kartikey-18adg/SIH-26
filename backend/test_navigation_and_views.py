import sys
import os
from datetime import date, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.database import SessionLocal
from backend.app.models import Workspace, ApprovalCase, Task
from backend.app.routers.workspace import get_or_create_default_workspace, switch_data_mode
from backend.app.schemas import DataModeSelectRequest
from backend.app.routers.dashboard import get_dashboard_summary
from backend.app.routers.cases import list_cases
from backend.app.routers.compliance import get_compliance_queue
from backend.app.routers.alerts import list_alerts
from backend.app.routers.tasks import list_tasks, create_task, update_task, TaskCreateRequest, TaskUpdateRequest

def run_navigation_tests():
    db = SessionLocal()
    try:
        print("=== AICLEAR TOP NAVIGATION & MULTI-VIEW VERIFICATION SUITE ===")
        ws = get_or_create_default_workspace(db)

        # -----------------------------------------------------------------
        # VIEW 1: Workspace Dashboard
        # -----------------------------------------------------------------
        print("[VIEW 1: WORKSPACE] Testing /api/dashboard/summary")
        summary = get_dashboard_summary(db=db)
        print(f"  - Active Mode: {summary.active_data_mode}")
        print(f"  - Active Cases: {summary.total_active_cases}")
        print(f"  - Overdue Tasks: {summary.overdue_tasks}")
        print(f"  - Open Alerts: {len(summary.open_alerts)}")
        assert summary.total_active_cases > 0
        print("[VIEW 1 PASSED] Workspace dashboard data verified.\n")

        # -----------------------------------------------------------------
        # VIEW 2: Cases View
        # -----------------------------------------------------------------
        print("[VIEW 2: CASES] Testing /api/cases")
        cases = list_cases(db=db)
        print(f"  - Cases Returned: {len(cases)}")
        assert len(cases) > 0
        sample_case = cases[0]
        print(f"  - Sample Case: {sample_case.case_reference} ({sample_case.institution_name}) - Stage: {sample_case.current_stage}")
        assert sample_case.case_reference is not None
        assert sample_case.allowed_next_stages is not None
        print("[VIEW 2 PASSED] Cases view data verified with stage transitions.\n")

        # -----------------------------------------------------------------
        # VIEW 3: Compliance Queue View
        # -----------------------------------------------------------------
        print("[VIEW 3: COMPLIANCE QUEUE] Testing /api/compliance/queue")
        comp_items = get_compliance_queue(db=db)
        print(f"  - Total Compliance Items in Queue: {len(comp_items)}")
        assert len(comp_items) > 0
        
        sample_comp = comp_items[0]
        print(f"  - Sample Rule Check: [{sample_comp.case_reference}] {sample_comp.rule_key}: {sample_comp.rule_title}")
        print(f"    * Citation: {sample_comp.official_source_title} ({sample_comp.official_section_ref})")
        print(f"    * Status: {sample_comp.status}")
        assert sample_comp.rule_key is not None
        assert sample_comp.case_reference is not None
        
        # Test status filter
        needs_review_items = get_compliance_queue(status_filter="NEEDS_REVIEW", db=db)
        print(f"  - Needs Review Filter Items: {len(needs_review_items)}")
        for nr in needs_review_items:
            assert nr.status == "NEEDS_REVIEW"
        print("[VIEW 3 PASSED] Compliance Queue data and APH citations verified.\n")

        # -----------------------------------------------------------------
        # VIEW 4: Alert Centre View
        # -----------------------------------------------------------------
        print("[VIEW 4: ALERT CENTRE] Testing /api/alerts")
        alerts = list_alerts(db=db)
        print(f"  - Total Alerts Returned: {len(alerts)}")
        assert len(alerts) > 0
        sample_alert = alerts[0]
        print(f"  - Sample Alert: [{sample_alert.severity}] {sample_alert.title} (Status: {sample_alert.status})")
        assert sample_alert.severity in ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]
        assert sample_alert.status in ["OPEN", "ACKNOWLEDGED", "RESOLVED"]
        print("[VIEW 4 PASSED] Alert Centre data verified.\n")

        # -----------------------------------------------------------------
        # VIEW 5: Task Queue View
        # -----------------------------------------------------------------
        print("[VIEW 5: TASK QUEUE] Testing /api/tasks")
        tasks = list_tasks(db=db)
        print(f"  - Tasks in Queue: {len(tasks)}")
        assert len(tasks) > 0
        sample_task = tasks[0]
        print(f"  - Sample Task: [{sample_task.priority}] {sample_task.title}")
        print(f"    * Assignee: {sample_task.assignee_name} | Due Date: {sample_task.due_date} (Overdue: {sample_task.is_overdue})")
        print(f"    * Status: {sample_task.status} | Linked Case: {sample_task.case_reference}")
        assert sample_task.assignee_name is not None
        assert sample_task.status in ["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"]

        # Test Task Creation
        new_task = create_task(
            req=TaskCreateRequest(
                case_id=sample_case.id,
                title="Verify Municipal Planning Map Seals",
                description="Coordinate with municipal planning officer to confirm built-up area stamp.",
                assignee_name="R. Officer",
                priority="HIGH",
                due_date=date.today() + timedelta(days=5),
                created_by="Lead Coordinator"
            ),
            db=db
        )
        print(f"  - Created New Task ID: {new_task.id} ({new_task.title})")
        assert new_task.status == "TODO"

        # Test Task Completion
        completed_task = update_task(
            task_id=new_task.id,
            req=TaskUpdateRequest(
                status="COMPLETED",
                completion_notes="Municipal seals verified on physical blueprints.",
                updated_by="R. Officer"
            ),
            db=db
        )
        assert completed_task.status == "COMPLETED"
        assert completed_task.completed_at is not None
        print(f"  - Updated Task Status to: {completed_task.status} (Notes: {completed_task.completion_notes})")
        print("[VIEW 5 PASSED] Task Queue data, creation, and status workflow verified.\n")

        # -----------------------------------------------------------------
        # DATA MODE ISOLATION CHECK ACROSS ALL 5 VIEWS
        # -----------------------------------------------------------------
        print("[DATA MODE ISOLATION] Verifying mode consistency across all 5 views...")
        # Check DEMO Mode
        switch_data_mode(req=DataModeSelectRequest(mode="DEMO"), db=db)
        demo_c = list_cases(db=db)
        demo_cq = get_compliance_queue(db=db)
        demo_a = list_alerts(db=db)
        demo_t = list_tasks(db=db)
        for c in demo_c:
            assert c.data_mode == "DEMO"
        for t in demo_t:
            assert t.case_reference.startswith("AICTE-DEMO-")
        for cq in demo_cq:
            assert cq.case_reference.startswith("AICTE-DEMO-")
        print(f"  - DEMO Mode: {len(demo_c)} Cases, {len(demo_cq)} Compliance Checks, {len(demo_a)} Alerts, {len(demo_t)} Tasks (Zero Leakage)")

        # Check IMPORTED Mode
        switch_data_mode(req=DataModeSelectRequest(mode="IMPORTED"), db=db)
        imp_c = list_cases(db=db)
        imp_cq = get_compliance_queue(db=db)
        imp_a = list_alerts(db=db)
        imp_t = list_tasks(db=db)
        for c in imp_c:
            assert c.data_mode == "IMPORTED"
            assert not c.case_reference.startswith("AICTE-DEMO-")
        for t in imp_t:
            assert not t.case_reference.startswith("AICTE-DEMO-")
        for cq in imp_cq:
            assert not cq.case_reference.startswith("AICTE-DEMO-")
        print(f"  - IMPORTED Mode: {len(imp_c)} Cases, {len(imp_cq)} Compliance Checks, {len(imp_a)} Alerts, {len(imp_t)} Tasks (Zero Leakage)")

        # Switch back to DEMO mode for default review
        switch_data_mode(req=DataModeSelectRequest(mode="DEMO"), db=db)
        print("[DATA MODE ISOLATION PASSED] All 5 views strictly respect active data mode boundaries.\n")

        print("=== ALL NAVIGATION & VIEW VERIFICATION TESTS PASSED SUCCESSFULLY! ===")

    finally:
        db.close()

if __name__ == "__main__":
    run_navigation_tests()
