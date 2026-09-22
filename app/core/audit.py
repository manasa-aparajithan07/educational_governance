import json
from typing import Optional, Any
from fastapi import Request
from sqlalchemy.orm import Session
from app.models.audit import AuditLog


def get_client_ip(request: Request) -> str:
    """
    Extracts client IP address respecting X-Forwarded-For if available.
    """
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


def log_audit(
    db: Session,
    user_id: Optional[int],
    action: str,
    resource: str,
    details: Optional[Any] = None,
    ip_address: Optional[str] = None
) -> AuditLog:
    """
    Creates an immutable audit log entry for system actions.
    """
    details_str = None
    if details is not None:
        if isinstance(details, (dict, list)):
            details_str = json.dumps(details)
        else:
            details_str = str(details)

    audit_entry = AuditLog(
        user_id=user_id,
        action=action,
        resource=resource,
        details=details_str,
        ip_address=ip_address
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(audit_entry)
    return audit_entry
