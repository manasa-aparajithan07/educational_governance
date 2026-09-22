import math
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app.models.user import User, Department, UserRole
from app.schemas.common import ApiResponse, PaginatedData, PaginationMeta
from app.schemas.user import (
    UserResponse,
    UserCreateRequest,
    AdminUserUpdateRequest
)
from app.core.security import get_password_hash
from app.core.dependencies import get_current_user, require_roles
from app.core.exceptions import APIException
from app.core.audit import log_audit, get_client_ip

router = APIRouter(prefix="/users", tags=["User Management"])


@router.get(
    "",
    response_model=ApiResponse[PaginatedData[UserResponse]],
    status_code=status.HTTP_200_OK,
    summary="List users with pagination and filtering (Admin only)"
)
def list_users(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(10, ge=1, le=100, description="Items per page"),
    role: Optional[UserRole] = Query(None, description="Filter by user role"),
    department_id: Optional[int] = Query(None, description="Filter by department ID"),
    search: Optional[str] = Query(None, description="Search by name, email, or registration number"),
    current_user: User = Depends(require_roles(UserRole.ADMIN.value)),
    db: Session = Depends(get_db)
):
    query = db.query(User).filter(User.deleted_at.is_(None))

    if role:
        query = query.filter(User.role == role.value)
    if department_id:
        query = query.filter(User.department_id == department_id)
    if search:
        search_pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(
                User.full_name.ilike(search_pattern),
                User.email.ilike(search_pattern),
                User.registration_number.ilike(search_pattern)
            )
        )

    total_items = query.count()
    total_pages = math.ceil(total_items / limit) if total_items > 0 else 0
    offset = (page - 1) * limit

    users = query.order_by(User.id.desc()).offset(offset).limit(limit).all()

    items = [UserResponse.model_validate(u) for u in users]

    paginated_data = PaginatedData(
        items=items,
        pagination=PaginationMeta(
            page=page,
            limit=limit,
            totalItems=total_items,
            totalPages=total_pages
        )
    )

    return ApiResponse(
        success=True,
        message="Records retrieved successfully",
        data=paginated_data,
        error=None
    )


@router.post(
    "",
    response_model=ApiResponse[UserResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new user account (Admin only)"
)
def create_user(
    payload: UserCreateRequest,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.ADMIN.value)),
    db: Session = Depends(get_db)
):
    # Check duplicate email
    if db.query(User).filter(User.email == payload.email).first():
        raise APIException(
            status_code=status.HTTP_409_CONFLICT,
            message="User with this email already exists",
            code="EMAIL_EXISTS",
            details=[{"field": "email", "message": "Email address already registered"}]
        )

    # Check duplicate registration number if provided
    if payload.registration_number:
        if db.query(User).filter(User.registration_number == payload.registration_number).first():
            raise APIException(
                status_code=status.HTTP_409_CONFLICT,
                message="Registration number is already in use",
                code="REG_NUMBER_EXISTS",
                details=[{"field": "registration_number", "message": "Registration number already registered"}]
            )

    # Verify department
    if payload.department_id:
        if not db.query(Department).filter(Department.id == payload.department_id).first():
            raise APIException(
                status_code=status.HTTP_400_BAD_REQUEST,
                message="Department not found",
                code="INVALID_DEPARTMENT"
            )

    new_user = User(
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        full_name=payload.full_name,
        role=payload.role.value,
        registration_number=payload.registration_number,
        department_id=payload.department_id,
        phone=payload.phone,
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    log_audit(
        db=db,
        user_id=current_user.id,
        action="USER_CREATE",
        resource="USER",
        details={"created_user_id": new_user.id, "email": new_user.email, "role": new_user.role},
        ip_address=get_client_ip(request)
    )

    return ApiResponse(
        success=True,
        message="User account created successfully",
        data=UserResponse.model_validate(new_user),
        error=None
    )


@router.get(
    "/{user_id}",
    response_model=ApiResponse[UserResponse],
    status_code=status.HTTP_200_OK,
    summary="Get user details by ID"
)
def get_user_by_id(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Enforce role restriction: Students and Faculty can only view their own user account
    if current_user.role != UserRole.ADMIN.value and current_user.id != user_id:
        raise APIException(
            status_code=status.HTTP_403_FORBIDDEN,
            message="Access denied: Cannot view another user's personal academic records",
            code="FORBIDDEN_USER_ACCESS",
            details="You do not have permission to view this user profile"
        )

    user = db.query(User).filter(
        User.id == user_id,
        User.deleted_at.is_(None)
    ).first()

    if not user:
        raise APIException(
            status_code=status.HTTP_404_NOT_FOUND,
            message="User not found",
            code="USER_NOT_FOUND"
        )

    return ApiResponse(
        success=True,
        message="User details retrieved successfully",
        data=UserResponse.model_validate(user),
        error=None
    )


@router.put(
    "/{user_id}",
    response_model=ApiResponse[UserResponse],
    status_code=status.HTTP_200_OK,
    summary="Update user details (Admin only)"
)
def update_user(
    user_id: int,
    payload: AdminUserUpdateRequest,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.ADMIN.value)),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.id == user_id,
        User.deleted_at.is_(None)
    ).first()

    if not user:
        raise APIException(
            status_code=status.HTTP_404_NOT_FOUND,
            message="User not found",
            code="USER_NOT_FOUND"
        )

    if payload.email and payload.email != user.email:
        existing = db.query(User).filter(User.email == payload.email).first()
        if existing:
            raise APIException(
                status_code=status.HTTP_409_CONFLICT,
                message="Email address already registered",
                code="EMAIL_EXISTS"
            )
        user.email = payload.email

    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.role is not None:
        user.role = payload.role.value
    if payload.registration_number is not None:
        user.registration_number = payload.registration_number
    if payload.phone is not None:
        user.phone = payload.phone
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.department_id is not None:
        if not db.query(Department).filter(Department.id == payload.department_id).first():
            raise APIException(
                status_code=status.HTTP_400_BAD_REQUEST,
                message="Department not found",
                code="INVALID_DEPARTMENT"
            )
        user.department_id = payload.department_id

    db.commit()
    db.refresh(user)

    log_audit(
        db=db,
        user_id=current_user.id,
        action="USER_UPDATE",
        resource="USER",
        details={"updated_user_id": user.id, "changes": payload.model_dump(exclude_unset=True)},
        ip_address=get_client_ip(request)
    )

    return ApiResponse(
        success=True,
        message="User updated successfully",
        data=UserResponse.model_validate(user),
        error=None
    )


@router.delete(
    "/{user_id}",
    response_model=ApiResponse[None],
    status_code=status.HTTP_200_OK,
    summary="Soft delete user account (Admin only)"
)
def delete_user(
    user_id: int,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.ADMIN.value)),
    db: Session = Depends(get_db)
):
    if current_user.id == user_id:
        raise APIException(
            status_code=status.HTTP_400_BAD_REQUEST,
            message="Administrators cannot delete their own account",
            code="CANNOT_DELETE_SELF"
        )

    user = db.query(User).filter(
        User.id == user_id,
        User.deleted_at.is_(None)
    ).first()

    if not user:
        raise APIException(
            status_code=status.HTTP_404_NOT_FOUND,
            message="User not found",
            code="USER_NOT_FOUND"
        )

    # Soft deletion
    user.deleted_at = datetime.now(timezone.utc)
    user.is_active = False
    db.commit()

    log_audit(
        db=db,
        user_id=current_user.id,
        action="USER_DELETE",
        resource="USER",
        details={"deleted_user_id": user.id, "email": user.email},
        ip_address=get_client_ip(request)
    )

    return ApiResponse(
        success=True,
        message="User account deactivated and soft-deleted successfully",
        data=None,
        error=None
    )
