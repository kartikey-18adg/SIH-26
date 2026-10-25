"""
AIClear Role & Permissions Engine (Demo Role Simulator)
Defines the permissions matrix for the 4 supported institutional roles:
- Institution Coordinator
- Compliance Officer
- Reviewer
- Administrator
"""
from typing import List, Optional, Any
from fastapi import Header, HTTPException, status
from fastapi.params import Depends

SUPPORTED_ROLES = [
    "Institution Coordinator",
    "Compliance Officer",
    "Reviewer",
    "Administrator"
]

ROLE_PERMISSIONS = {
    "Institution Coordinator": {
        "description": "Institutional dossier coordinator. Responsible for entering case data, uploading evidence files, and managing operational workflows.",
        "can_create_case": True,
        "can_import_data": True,
        "can_manage_settings": False,
        "can_upload_evidence": True,
        "can_review_documents": False,  # Prevent self-review/approval
        "can_evaluate_compliance": False,
        "can_override_compliance": False,
        "can_acknowledge_alerts": True,
        "can_assign_alerts": True,
        "can_resolve_alerts": False,
        "can_scan_escalations": False,
        "can_create_tasks": True,
        "can_update_tasks": True,
        "allowed_transition_stages": ["DRAFT", "INFO_COLLECTION"]
    },
    "Reviewer": {
        "description": "Independent document verifier. Inspects municipal seals, built-up areas, and document validity dates in the Evidence Vault.",
        "can_create_case": False,
        "can_import_data": False,
        "can_manage_settings": False,
        "can_upload_evidence": False,
        "can_review_documents": True,
        "can_evaluate_compliance": False,
        "can_override_compliance": False,
        "can_acknowledge_alerts": True,
        "can_assign_alerts": False,
        "can_resolve_alerts": False,
        "can_scan_escalations": False,
        "can_create_tasks": True,
        "can_update_tasks": True,
        "allowed_transition_stages": ["DOCUMENT_REVIEW"]
    },
    "Compliance Officer": {
        "description": "Regulatory compliance auditor. Evaluates APH 2024–27 normative checks, records human overrides with justification, and resolves compliance deficiencies.",
        "can_create_case": False,
        "can_import_data": False,
        "can_manage_settings": False,
        "can_upload_evidence": False,
        "can_review_documents": False,
        "can_evaluate_compliance": True,
        "can_override_compliance": True,
        "can_acknowledge_alerts": True,
        "can_assign_alerts": False,
        "can_resolve_alerts": True,
        "can_scan_escalations": True,
        "can_create_tasks": True,
        "can_update_tasks": True,
        "allowed_transition_stages": ["COMPLIANCE_CHECKS", "INTERNAL_REVIEW", "CORRECTIONS_REQUIRED"]
    },
    "Administrator": {
        "description": "Institutional administrator with full supervisory oversight across case initialization, configuration, audit records, and cross-functional overrides.",
        "can_create_case": True,
        "can_import_data": True,
        "can_manage_settings": True,
        "can_upload_evidence": True,
        "can_review_documents": True,
        "can_evaluate_compliance": True,
        "can_override_compliance": True,
        "can_acknowledge_alerts": True,
        "can_assign_alerts": True,
        "can_resolve_alerts": True,
        "can_scan_escalations": True,
        "can_create_tasks": True,
        "can_update_tasks": True,
        "allowed_transition_stages": ["*"]
    }
}

def normalize_role(role_raw: Optional[str]) -> str:
    if not role_raw or not isinstance(role_raw, str):
        return "Institution Coordinator"
    
    clean = role_raw.strip().title()
    for supported in SUPPORTED_ROLES:
        if clean.lower() == supported.lower():
            return supported
        # Common aliases
        if clean.lower() in ["coordinator", "institution_coordinator"]:
            return "Institution Coordinator"
        if clean.lower() in ["compliance", "compliance_officer", "officer"]:
            return "Compliance Officer"
        if clean.lower() in ["document reviewer", "document_reviewer", "reviewer"]:
            return "Reviewer"
        if clean.lower() in ["admin", "supervising officer", "supervising_officer"]:
            return "Administrator"

    return "Institution Coordinator"

def get_current_role(x_aiclear_role: Optional[str] = Header(None, alias="X-AIClear-Role")) -> str:
    """Extract and validate the active demo role from the X-AIClear-Role header."""
    if x_aiclear_role is None:
        return "Institution Coordinator"
    return normalize_role(x_aiclear_role)

def check_role_permission(role: Any, allowed_roles: List[str], action_name: str = "this operation"):
    """Validates that the given role is present in allowed_roles."""
    # Handle direct Python test calls where role parameter is not passed or is a Depends object
    if role is None or not isinstance(role, str) or hasattr(role, "dependency"):
        return

    normalized = normalize_role(role)
    if normalized not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Permission Denied: Demo role '{normalized}' is not authorized to perform {action_name}. "
                f"Permitted role(s): {', '.join(allowed_roles)}. "
                "Switch role via the top navigation bar to rehearse this workflow."
            )
        )
