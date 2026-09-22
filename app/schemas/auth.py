from typing import Optional
from pydantic import BaseModel, EmailStr, Field
from app.schemas.user import UserResponse


class StudentRegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=255, examples=["Manasa Aparajithan"])
    email: EmailStr = Field(..., examples=["manasa@vit.ac.in"])
    password: str = Field(..., min_length=8, max_length=128, examples=["SecretPass@123"])
    registration_number: str = Field(..., min_length=3, max_length=50, examples=["25BCE5152"])
    department_id: Optional[int] = Field(None, examples=[1])
    phone: Optional[str] = Field(None, max_length=20, examples=["+919876543210"])


class LoginRequest(BaseModel):
    email: EmailStr = Field(..., examples=["admin@vit.ac.in"])
    password: str = Field(..., examples=["Admin@12345"])


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(..., examples=["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."])


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=8)
    new_password: str = Field(..., min_length=8)


class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = None
