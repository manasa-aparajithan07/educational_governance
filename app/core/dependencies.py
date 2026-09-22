from typing import List, Optional
from fastapi import Depends, status, Header, Request
from sqlalchemy.orm import Session
import jwt

from app.database import get_db
from app.models.user import User, UserRole
from app.core.security import decode_token
from app.core.exceptions import APIException


def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> User:
    """
    Extracts and verifies the JWT Bearer access token, returning the authenticated User.
    Enforces active state and checks soft deletion.
    """
    if not authorization:
        raise APIException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            message="Authorization header missing",
            code="UNAUTHORIZED",
            details="Bearer token must be provided in Authorization header"
        )

    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise APIException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            message="Invalid authorization header format",
            code="INVALID_TOKEN_FORMAT",
            details="Header must follow format: 'Bearer <token>'"
        )

    token = parts[1]
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise APIException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            message="Token has expired",
            code="TOKEN_EXPIRED",
            details="Access token has expired. Please refresh your token."
        )
    except jwt.InvalidTokenError:
        raise APIException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            message="Invalid token",
            code="INVALID_TOKEN",
            details="Failed to decode or verify token signature"
        )

    if payload.get("type") != "access":
        raise APIException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            message="Invalid token type",
            code="INVALID_TOKEN_TYPE",
            details="An access token is required for this operation"
        )

    user_id = payload.get("sub")
    if not user_id:
        raise APIException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            message="Invalid token payload",
            code="INVALID_PAYLOAD",
            details="Token does not contain a valid user identifier"
        )

    user = db.query(User).filter(
        User.id == int(user_id),
        User.deleted_at.is_(None)
    ).first()

    if not user:
        raise APIException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            message="User account not found or has been deactivated",
            code="USER_NOT_FOUND"
        )

    if not user.is_active:
        raise APIException(
            status_code=status.HTTP_403_FORBIDDEN,
            message="User account is deactivated",
            code="ACCOUNT_DEACTIVATED",
            details="Please contact system administration to reactivate your account"
        )

    return user


def require_roles(*allowed_roles: str):
    """
    Factory creating a dependency that strictly enforces Role-Based Access Control (RBAC).
    Enforces restrictions at the backend level.
    """
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise APIException(
                status_code=status.HTTP_403_FORBIDDEN,
                message="Access denied: insufficient permissions",
                code="FORBIDDEN",
                details=f"User role '{current_user.role}' is not authorized. Permitted roles: {list(allowed_roles)}"
            )
        return current_user

    return role_checker
