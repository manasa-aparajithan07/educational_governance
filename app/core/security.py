import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Any, Union
import jwt
import bcrypt
from app.config import settings


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plain password against the stored bcrypt hash.
    """
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """
    Generates a secure bcrypt hash for the provided password.
    Never stores plain-text passwords.
    """
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def create_access_token(
    subject: Union[str, Any],
    role: str,
    email: str,
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Creates a signed JWT access token containing subject (user_id), role, and email.
    """
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode = {
        "sub": str(subject),
        "jti": str(uuid.uuid4()),
        "role": role,
        "email": email,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access"
    }
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def create_refresh_token(
    subject: Union[str, Any],
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Creates a signed JWT refresh token for session rotation.
    """
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    to_encode = {
        "sub": str(subject),
        "jti": str(uuid.uuid4()),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "refresh"
    }
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> dict:
    """
    Decodes and validates a JWT token using the configured secret key.
    """
    return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
