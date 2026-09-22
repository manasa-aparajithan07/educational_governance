from typing import Optional
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from app.models.user import UserRole


class DepartmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    code: str
    created_at: datetime


class DepartmentCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=150, examples=["Computer Science and Engineering"])
    code: str = Field(..., min_length=2, max_length=20, examples=["CSE"])


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    role: str
    registration_number: Optional[str] = None
    department_id: Optional[int] = None
    department: Optional[DepartmentResponse] = None
    phone: Optional[str] = None
    is_active: bool
    created_at: datetime


class UserCreateRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=255, examples=["Dr. John Doe"])
    email: EmailStr = Field(..., examples=["johndoe@vit.ac.in"])
    password: str = Field(..., min_length=8, max_length=128, examples=["FacultyPass@123"])
    role: UserRole = Field(..., examples=[UserRole.FACULTY])
    registration_number: Optional[str] = Field(None, examples=["FAC-2001"])
    department_id: Optional[int] = Field(None, examples=[1])
    phone: Optional[str] = Field(None, max_length=20, examples=["+919123456780"])


class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=255)
    phone: Optional[str] = Field(None, max_length=20)
    department_id: Optional[int] = None


class AdminUserUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=255)
    email: Optional[EmailStr] = None
    role: Optional[UserRole] = None
    registration_number: Optional[str] = None
    department_id: Optional[int] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None
