from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import settings
from app.models.user import User, Department, RefreshToken, UserRole
from app.schemas.common import ApiResponse
from app.schemas.auth import (
    StudentRegisterRequest,
    LoginRequest,
    TokenResponse,
    RefreshTokenRequest,
    ChangePasswordRequest,
    LogoutRequest
)
from app.schemas.user import UserResponse, UserUpdateRequest
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token
)
from app.core.dependencies import get_current_user
from app.core.exceptions import APIException
from app.core.audit import log_audit, get_client_ip

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=ApiResponse[UserResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Register a new student account"
)
def register_student(
    payload: StudentRegisterRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    # Check if email is already taken
    existing_user = db.query(User).filter(User.email == payload.email).first()
    if existing_user:
        raise APIException(
            status_code=status.HTTP_409_CONFLICT,
            message="An account with this email already exists",
            code="EMAIL_EXISTS",
            details=[{"field": "email", "message": "Email address is already in use"}]
        )

    # Check if registration number is already taken
    existing_reg = db.query(User).filter(User.registration_number == payload.registration_number).first()
    if existing_reg:
        raise APIException(
            status_code=status.HTTP_409_CONFLICT,
            message="Registration number is already registered",
            code="REG_NUMBER_EXISTS",
            details=[{"field": "registration_number", "message": "Registration number is already registered"}]
        )

    # Verify department exists if provided
    if payload.department_id:
        dept = db.query(Department).filter(Department.id == payload.department_id).first()
        if not dept:
            raise APIException(
                status_code=status.HTTP_400_BAD_REQUEST,
                message="Specified department does not exist",
                code="INVALID_DEPARTMENT",
                details=[{"field": "department_id", "message": "Department not found"}]
            )

    new_user = User(
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        full_name=payload.full_name,
        role=UserRole.STUDENT.value,
        registration_number=payload.registration_number,
        department_id=payload.department_id,
        phone=payload.phone,
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Immutable Audit Log
    log_audit(
        db=db,
        user_id=new_user.id,
        action="STUDENT_REGISTER",
        resource="AUTH",
        details={"email": new_user.email, "role": new_user.role, "registration_number": new_user.registration_number},
        ip_address=get_client_ip(request)
    )

    return ApiResponse(
        success=True,
        message="Student account registered successfully",
        data=UserResponse.model_validate(new_user),
        error=None
    )


@router.post(
    "/login",
    response_model=ApiResponse[TokenResponse],
    status_code=status.HTTP_200_OK,
    summary="Authenticate user and receive JWT tokens"
)
def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.email == payload.email,
        User.deleted_at.is_(None)
    ).first()

    if not user or not verify_password(payload.password, user.password_hash):
        log_audit(
            db=db,
            user_id=user.id if user else None,
            action="LOGIN_FAILED",
            resource="AUTH",
            details={"email": payload.email, "reason": "Invalid credentials"},
            ip_address=get_client_ip(request)
        )
        raise APIException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            message="Invalid email or password",
            code="INVALID_CREDENTIALS",
            details="The credentials provided do not match our records"
        )

    if not user.is_active:
        raise APIException(
            status_code=status.HTTP_403_FORBIDDEN,
            message="User account is deactivated",
            code="ACCOUNT_DEACTIVATED",
            details="Your account has been deactivated. Please contact administration."
        )

    # Issue tokens
    access_token = create_access_token(
        subject=user.id,
        role=user.role,
        email=user.email
    )
    refresh_token = create_refresh_token(subject=user.id)

    # Record refresh token in database for revocability and rotation
    db_refresh = RefreshToken(
        user_id=user.id,
        token_hash=refresh_token,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    db.add(db_refresh)
    db.commit()

    log_audit(
        db=db,
        user_id=user.id,
        action="LOGIN_SUCCESS",
        resource="AUTH",
        details={"role": user.role},
        ip_address=get_client_ip(request)
    )

    token_data = TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserResponse.model_validate(user)
    )

    return ApiResponse(
        success=True,
        message="Login successful",
        data=token_data,
        error=None
    )


@router.post(
    "/refresh",
    response_model=ApiResponse[TokenResponse],
    status_code=status.HTTP_200_OK,
    summary="Refresh access token using a valid refresh token"
)
def refresh_token(
    payload: RefreshTokenRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    try:
        token_payload = decode_token(payload.refresh_token)
    except Exception:
        raise APIException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            message="Invalid or expired refresh token",
            code="INVALID_REFRESH_TOKEN"
        )

    if token_payload.get("type") != "refresh":
        raise APIException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            message="Provided token is not a refresh token",
            code="INVALID_TOKEN_TYPE"
        )

    user_id = token_payload.get("sub")
    db_refresh = db.query(RefreshToken).filter(
        RefreshToken.token_hash == payload.refresh_token,
        RefreshToken.revoked_at.is_(None)
    ).first()

    if not db_refresh:
        raise APIException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            message="Refresh token has been revoked or does not exist",
            code="REVOKED_REFRESH_TOKEN"
        )

    user = db.query(User).filter(User.id == int(user_id), User.deleted_at.is_(None)).first()
    if not user or not user.is_active:
        raise APIException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            message="User account no longer active",
            code="USER_INACTIVE"
        )

    # Revoke old refresh token (Token rotation policy)
    db_refresh.revoked_at = datetime.now(timezone.utc)

    # Create new pair
    new_access_token = create_access_token(
        subject=user.id,
        role=user.role,
        email=user.email
    )
    new_refresh_token = create_refresh_token(subject=user.id)

    new_db_refresh = RefreshToken(
        user_id=user.id,
        token_hash=new_refresh_token,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    db.add(new_db_refresh)
    db.commit()

    return ApiResponse(
        success=True,
        message="Token refreshed successfully",
        data=TokenResponse(
            access_token=new_access_token,
            refresh_token=new_refresh_token,
            token_type="bearer",
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=UserResponse.model_validate(user)
        ),
        error=None
    )


@router.post(
    "/logout",
    response_model=ApiResponse[None],
    status_code=status.HTTP_200_OK,
    summary="Log out user and invalidate refresh token"
)
def logout(
    payload: LogoutRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if payload.refresh_token:
        token_entry = db.query(RefreshToken).filter(
            RefreshToken.token_hash == payload.refresh_token,
            RefreshToken.user_id == current_user.id
        ).first()
        if token_entry:
            token_entry.revoked_at = datetime.now(timezone.utc)
            db.commit()

    log_audit(
        db=db,
        user_id=current_user.id,
        action="LOGOUT",
        resource="AUTH",
        details="User logged out successfully",
        ip_address=get_client_ip(request)
    )

    return ApiResponse(
        success=True,
        message="Logged out successfully",
        data=None,
        error=None
    )


@router.get(
    "/me",
    response_model=ApiResponse[UserResponse],
    status_code=status.HTTP_200_OK,
    summary="Retrieve authenticated user profile"
)
def get_my_profile(
    current_user: User = Depends(get_current_user)
):
    return ApiResponse(
        success=True,
        message="Profile retrieved successfully",
        data=UserResponse.model_validate(current_user),
        error=None
    )


@router.put(
    "/me",
    response_model=ApiResponse[UserResponse],
    status_code=status.HTTP_200_OK,
    summary="Update authenticated user profile"
)
def update_my_profile(
    payload: UserUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if payload.full_name is not None:
        current_user.full_name = payload.full_name
    if payload.phone is not None:
        current_user.phone = payload.phone
    if payload.department_id is not None:
        dept = db.query(Department).filter(Department.id == payload.department_id).first()
        if not dept:
            raise APIException(
                status_code=status.HTTP_400_BAD_REQUEST,
                message="Department not found",
                code="INVALID_DEPARTMENT"
            )
        current_user.department_id = payload.department_id

    db.commit()
    db.refresh(current_user)

    log_audit(
        db=db,
        user_id=current_user.id,
        action="UPDATE_PROFILE",
        resource="AUTH",
        details="User updated own profile",
        ip_address=get_client_ip(request)
    )

    return ApiResponse(
        success=True,
        message="Profile updated successfully",
        data=UserResponse.model_validate(current_user),
        error=None
    )


@router.post(
    "/change-password",
    response_model=ApiResponse[None],
    status_code=status.HTTP_200_OK,
    summary="Change authenticated user's password"
)
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            message="Current password is incorrect",
            code="INVALID_CURRENT_PASSWORD",
            details=[{"field": "current_password", "message": "Incorrect password"}]
        )

    if payload.current_password == payload.new_password:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            message="New password must be different from current password",
            code="PASSWORD_REUSE",
            details=[{"field": "new_password", "message": "Password cannot be the same as the current password"}]
        )

    current_user.password_hash = get_password_hash(payload.new_password)

    # Invalidate all existing refresh tokens for security
    db.query(RefreshToken).filter(
        RefreshToken.user_id == current_user.id,
        RefreshToken.revoked_at.is_(None)
    ).update({"revoked_at": datetime.now(timezone.utc)})

    db.commit()

    log_audit(
        db=db,
        user_id=current_user.id,
        action="CHANGE_PASSWORD",
        resource="AUTH",
        details="Password successfully updated; previous tokens revoked",
        ip_address=get_client_ip(request)
    )

    return ApiResponse(
        success=True,
        message="Password changed successfully. Please log in again with your new password.",
        data=None,
        error=None
    )
