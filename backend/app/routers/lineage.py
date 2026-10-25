from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    ApprovalCase,
    AuditEvent,
    ComplianceResult,
    ComplianceRule,
    DocumentVersion,
    EvidenceDocument,
)
from ..permissions import check_role_permission, get_current_role
from .workspace import get_or_create_default_workspace

router = APIRouter(prefix="/api/cases", tags=["Evidence Lineage"])
READ_ROLES = ["Administrator", "Compliance Officer", "Reviewer"]


def _value(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _node(nodes: list, node_id: str, node_type: str, label: str, **attrs: Any) -> None:
    nodes.append({
        "id": node_id,
        "type": node_type,
        "label": label,
        "data": {key: _value(value) for key, value in attrs.items()},
    })


def _edge(edges: list, source: str, target: str, relation: str) -> None:
    edges.append({
        "id": f"{source}-{relation}-{target}",
        "source": source,
        "target": target,
        "label": relation,
        "type": relation,
    })


@router.get("/{case_id}/lineage")
def get_case_lineage(
    case_id: str,
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role),
):
    """Return a read-only evidence lineage graph for an approval case."""
    check_role_permission(current_role, READ_ROLES, "viewing evidence lineage")
    workspace = get_or_create_default_workspace(db)

    case = (
        db.query(ApprovalCase)
        .filter(
            ApprovalCase.id == case_id,
            ApprovalCase.workspace_id == workspace.id,
        )
        .first()
    )
    if case is None:
        raise HTTPException(status_code=404, detail="Approval case not found.")

    nodes = []
    edges = []

    case_node_id = f"case:{case.id}"
    _node(
        nodes, case_node_id, "case", case.case_reference,
        case_id=case.id,
        workflow_type=case.workflow_type,
        academic_period=case.academic_period,
        status=case.status,
        current_stage=case.current_stage,
        created_at=case.created_at,
        updated_at=case.updated_at,
    )

    documents = (
        db.query(EvidenceDocument)
        .filter(EvidenceDocument.case_id == case.id)
        .order_by(EvidenceDocument.created_at.asc())
        .all()
    )
    document_ids = [doc.id for doc in documents]

    for doc in documents:
        doc_node_id = f"document:{doc.id}"
        _node(
            nodes, doc_node_id, "evidence_document", doc.original_filename,
            document_id=doc.id,
            category=doc.category,
            review_status=doc.review_status,
            version_number=doc.version_number,
            sha256_hash=doc.sha256_hash,
            document_date=doc.document_date,
            expiry_date=doc.expiry_date,
            created_at=doc.created_at,
        )
        _edge(edges, case_node_id, doc_node_id, "has_evidence")

        versions = (
            db.query(DocumentVersion)
            .filter(DocumentVersion.document_id == doc.id)
            .order_by(DocumentVersion.version_number.asc())
            .all()
        )
        for version in versions:
            version_node_id = f"version:{version.id}"
            _node(
                nodes, version_node_id, "document_version",
                f"{version.original_filename} (v{version.version_number})",
                version_id=version.id,
                document_id=version.document_id,
                version_number=version.version_number,
                sha256_hash=version.sha256_hash,
                change_note=version.change_note,
                uploaded_by=version.uploaded_by,
                created_at=version.created_at,
            )
            _edge(edges, doc_node_id, version_node_id, "has_version")

    results = (
        db.query(ComplianceResult)
        .filter(ComplianceResult.case_id == case.id)
        .order_by(ComplianceResult.evaluated_at.asc())
        .all()
    )
    rule_ids = list({result.rule_id for result in results})
    rules_by_id = {}
    if rule_ids:
        rules_by_id = {
            rule.id: rule
            for rule in db.query(ComplianceRule)
            .filter(ComplianceRule.id.in_(rule_ids))
            .all()
        }

    for result in results:
        result_node_id = f"compliance_result:{result.id}"
        _node(
            nodes, result_node_id, "compliance_result", result.status,
            result_id=result.id,
            status=result.status,
            original_status=result.original_status,
            rule_version_snapshot=result.rule_version_snapshot,
            explanation=result.explanation,
            recommended_action=result.recommended_action,
            requires_human_review=result.requires_human_review,
            manual_override=result.manual_override,
            override_reason=result.override_reason,
            overridden_by=result.overridden_by,
            evaluated_at=result.evaluated_at,
        )
        _edge(edges, case_node_id, result_node_id, "has_compliance_result")

        rule = rules_by_id.get(result.rule_id)
        if rule is not None:
            rule_node_id = f"rule:{rule.id}"
            if not any(node["id"] == rule_node_id for node in nodes):
                _node(
                    nodes, rule_node_id, "compliance_rule", rule.title,
                    rule_id=rule.id,
                    rule_key=rule.rule_key,
                    description=rule.description,
                    rule_version=rule.rule_version,
                    official_source_title=rule.official_source_title,
                    official_section_ref=rule.official_section_ref,
                    severity=rule.severity,
                )
            _edge(edges, rule_node_id, result_node_id, "evaluated_by_rule")

    audit_query = db.query(AuditEvent).filter(
        AuditEvent.workspace_id == workspace.id,
        AuditEvent.entity_id.in_([case.id, *document_ids]) if document_ids else AuditEvent.entity_id == case.id,
    )
    audit_events = audit_query.order_by(AuditEvent.created_at.asc()).all()
    for event in audit_events:
        event_node_id = f"audit_event:{event.id}"
        _node(
            nodes, event_node_id, "audit_event", event.action,
            event_id=event.id,
            actor_name=event.actor_name,
            actor_role=event.actor_role,
            entity_type=event.entity_type,
            entity_id=event.entity_id,
            action=event.action,
            details=event.details_json or {},
            created_at=event.created_at,
        )
        related_id = case_node_id if event.entity_id == case.id else f"document:{event.entity_id}"
        _edge(edges, related_id, event_node_id, "recorded_in_audit")

    return {
        "case_id": case.id,
        "case_reference": case.case_reference,
        "nodes": nodes,
        "edges": edges,
        "summary": {
            "documents": len(documents),
            "document_versions": sum(1 for node in nodes if node["type"] == "document_version"),
            "compliance_results": len(results),
            "rules": sum(1 for node in nodes if node["type"] == "compliance_rule"),
            "audit_events": len(audit_events),
            "node_count": len(nodes),
            "edge_count": len(edges),
        },
    }
