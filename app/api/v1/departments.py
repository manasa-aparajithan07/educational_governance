from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import Department, UserRole, User
from app.schemas.common import ApiResponse
from app.schemas.user import DepartmentResponse, DepartmentCreateRequest
from app.core.dependencies import require_roles
from app.core.exceptions import APIException

router = APIRouter(prefix="/departments", tags=["Departments"])


@router.get(
    "",
    response_model=ApiResponse[List[DepartmentResponse]],
    status_code=status.HTTP_200_OK,
    summary="List all academic departments"
)
def list_departments(db: Session = Depends(get_db)):
    departments = db.query(Department).order_by(Department.name.asc()).all()
    data = [DepartmentResponse.model_validate(d) for d in departments]
    return ApiResponse(
        success=True,
        message="Departments retrieved successfully",
        data=data,
        error=None
    )


@router.post(
    "",
    response_model=ApiResponse[DepartmentResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new department (Admin only)"
)
def create_department(
    payload: DepartmentCreateRequest,
    current_user: User = Depends(require_roles(UserRole.ADMIN.value)),
    db: Session = Depends(get_db)
):
    if db.query(Department).filter(Department.code == payload.code.upper()).first():
        raise APIException(
            status_code=status.HTTP_409_CONFLICT,
            message="Department code already exists",
            code="DEPARTMENT_CODE_EXISTS"
        )

    dept = Department(name=payload.name, code=payload.code.upper())
    db.add(dept)
    db.commit()
    db.refresh(dept)

    return ApiResponse(
        success=True,
        message="Department created successfully",
        data=DepartmentResponse.model_validate(dept),
        error=None
    )
