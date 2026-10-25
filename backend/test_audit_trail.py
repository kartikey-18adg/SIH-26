"""Focused API tests for the read-only audit trail."""
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.database import Base, get_db
from backend.app.main import app
from backend.app.models import AuditEvent, Workspace


@pytest.fixture()
def client_with_audit_data():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    db = TestingSession()
    ws = Workspace(name="Test Workspace", slug="default", active_data_mode="DEMO", first_run_completed=True)
    other_ws = Workspace(name="Other Workspace", slug="other", active_data_mode="DEMO", first_run_completed=True)
    db.add_all([ws, other_ws])
    db.commit()
    db.refresh(ws)
    db.refresh(other_ws)
    db.add_all([
        AuditEvent(
            workspace_id=ws.id,
            actor_name="Compliance Officer",
            actor_role="Compliance Officer",
            entity_type="CASE",
            entity_id="case-123",
            action="COMPLIANCE_EVALUATED",
            details_json={"result_count": 4},
            created_at=datetime.now(timezone.utc),
        ),
        AuditEvent(
            workspace_id=other_ws.id,
            actor_name="Secret Other Workspace User",
            actor_role="Administrator",
            entity_type="CASE",
            entity_id="private-case",
            action="PRIVATE_EVENT",
            details_json={},
            created_at=datetime.now(timezone.utc),
        ),
    ])
    db.commit()
    db.close()

    def override_get_db():
        session = TestingSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


def test_authorized_role_can_read_workspace_audit_events(client_with_audit_data):
    response = client_with_audit_data.get(
        "/api/audit/events",
        headers={"X-AIClear-Role": "Compliance Officer"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["items"][0]["action"] == "COMPLIANCE_EVALUATED"
    assert payload["items"][0]["details"]["result_count"] == 4
    assert payload["stats"]["total_events"] == 1


def test_coordinator_cannot_read_audit_events(client_with_audit_data):
    response = client_with_audit_data.get(
        "/api/audit/events",
        headers={"X-AIClear-Role": "Institution Coordinator"},
    )
    assert response.status_code == 403


def test_search_filters_audit_events(client_with_audit_data):
    response = client_with_audit_data.get(
        "/api/audit/events?search=case-123",
        headers={"X-AIClear-Role": "Administrator"},
    )
    assert response.status_code == 200
    assert response.json()["total"] == 1
