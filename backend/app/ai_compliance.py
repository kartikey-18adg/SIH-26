"""Optional AI-assisted compliance triage.

The deterministic rule engine remains the source of compliance status. This module
only summarizes already-evaluated findings and never changes a result or invents citations.
Configure AICLEAR_AI_API_KEY to enable an OpenAI-compatible chat-completions endpoint.
"""
import json
import os
from typing import Any
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError


def _fallback(case: Any, results: list[Any], reason: str) -> dict[str, Any]:
    attention = [
        r for r in results
        if getattr(r, "status", "") in {
            "NON_COMPLIANT", "EXPIRED_EVIDENCE", "MISSING_EVIDENCE",
            "NEEDS_REVIEW", "UNABLE_TO_DETERMINE"
        }
    ]
    attention.sort(key=lambda r: (
        {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}.get(
            getattr(getattr(r, "rule", None), "severity", "MEDIUM"), 2
        ),
        getattr(r, "rule_key", "")
    ))
    actions = []
    for result in attention[:5]:
        rule = getattr(result, "rule", None)
        actions.append({
            "rule_key": getattr(rule, "rule_key", "UNKNOWN"),
            "title": getattr(rule, "title", "Compliance finding"),
            "status": result.status,
            "action": result.recommended_action or "Request a compliance officer to inspect the evidence.",
            "reason": result.explanation,
            "source": getattr(rule, "official_source_title", None),
            "section": getattr(rule, "official_section_ref", None),
        })
    return {
        "analysis_mode": "RULE_BASED_FALLBACK",
        "model": None,
        "summary": (
            f"{len(attention)} of {len(results)} recorded checks need attention for "
            f"{getattr(case, 'case_reference', 'this case')}. "
            "This is a deterministic triage summary, not an AI-generated assessment."
        ),
        "priority_actions": actions,
        "uncertainty_notes": [
            "No configured AI provider was available; no language-model analysis was performed.",
            "A passing metadata check does not prove a document is authentic or satisfy every applicable norm.",
            "An authorized human reviewer must verify the current official handbook and source documents."
        ],
        "fallback_reason": reason,
    }


def generate_compliance_insights(case: Any, results: list[Any]) -> dict[str, Any]:
    api_key = os.getenv("AICLEAR_AI_API_KEY", "").strip()
    if not api_key:
        return _fallback(case, results, "AICLEAR_AI_API_KEY is not configured.")

    base_url = os.getenv("AICLEAR_AI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    model = os.getenv("AICLEAR_AI_MODEL", "gpt-4o-mini")
    compact_results = []
    for result in results:
        rule = getattr(result, "rule", None)
        compact_results.append({
            "rule_key": getattr(rule, "rule_key", "UNKNOWN"),
            "title": getattr(rule, "title", "Compliance finding"),
            "status": result.status,
            "severity": getattr(rule, "severity", "MEDIUM"),
            "source_type": getattr(rule, "rule_source_type", "UNKNOWN"),
            "source_title": getattr(rule, "official_source_title", None),
            "section_reference": getattr(rule, "official_section_ref", None),
            "rule_version": result.rule_version_snapshot,
            "explanation": result.explanation,
            "recommended_action": result.recommended_action,
            "requires_human_review": bool(result.requires_human_review),
            "manual_override": bool(result.manual_override),
        })

    system_prompt = (
        "You are an administrative compliance-triage assistant. Analyze only the supplied "
        "already-evaluated rule results. Never change, infer, or reclassify a compliance status. "
        "Do not invent legal requirements, citations, dates, documents, or facts. Cite only source "
        "titles and section references present in the input. Treat illustrative/demo rules as non-official. "
        "Do not claim approval or legal certainty. Return strict JSON with keys: summary (string), "
        "priority_actions (array of objects with rule_key, title, status, action, reason, source, section), "
        "uncertainty_notes (array of strings). Prioritize critical/high severity and missing/expired evidence."
    )
    user_payload = {
        "case_reference": getattr(case, "case_reference", "Unknown case"),
        "workflow_type": getattr(case, "workflow_type", "Unknown"),
        "academic_period": getattr(case, "academic_period", "Unknown"),
        "current_stage": getattr(case, "current_stage", "Unknown"),
        "results": compact_results,
    }
    request_body = json.dumps({
        "model": model,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
        ],
    }).encode("utf-8")
    request = Request(
        f"{base_url}/chat/completions",
        data=request_body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
        content = payload["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        valid_actions = []
        known_keys = {item["rule_key"] for item in compact_results}
        for action in parsed.get("priority_actions", [])[:8]:
            if not isinstance(action, dict) or action.get("rule_key") not in known_keys:
                continue
            source_item = next(item for item in compact_results if item["rule_key"] == action["rule_key"])
            # Ground the displayed status and citation in the database, not model output.
            valid_actions.append({
                "rule_key": source_item["rule_key"],
                "title": source_item["title"],
                "status": source_item["status"],
                "action": str(action.get("action") or source_item["recommended_action"] or "Request human review.")[:600],
                "reason": str(action.get("reason") or source_item["explanation"])[:800],
                "source": source_item["source_title"],
                "section": source_item["section_reference"],
            })
        return {
            "analysis_mode": "AI_ASSISTED",
            "model": model,
            "summary": str(parsed.get("summary") or "Review the prioritized findings below.")[:1200],
            "priority_actions": valid_actions,
            "uncertainty_notes": [
                str(note)[:400] for note in parsed.get("uncertainty_notes", [])[:6]
            ] + [
                "AI output is advisory only. The deterministic status and stored citations remain authoritative for this application.",
                "Verify current AICTE requirements and source documents with an authorized human reviewer."
            ],
            "fallback_reason": None,
        }
    except (HTTPError, URLError, TimeoutError, KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as exc:
        return _fallback(case, results, f"AI provider request or response failed ({type(exc).__name__}).")
