from typing import Generic, TypeVar, Optional, Any, List, Union
from pydantic import BaseModel, Field

T = TypeVar("T")


class ErrorDetail(BaseModel):
    field: Optional[str] = None
    message: str


class ErrorPayload(BaseModel):
    code: str
    details: Union[List[ErrorDetail], str, dict, None] = None


class PaginationMeta(BaseModel):
    page: int = Field(..., examples=[1])
    limit: int = Field(..., examples=[10])
    totalItems: int = Field(..., examples=[100])
    totalPages: int = Field(..., examples=[10])


class PaginatedData(BaseModel, Generic[T]):
    items: List[T]
    pagination: PaginationMeta


class ApiResponse(BaseModel, Generic[T]):
    success: bool = True
    message: str = "Operation completed successfully"
    data: Optional[T] = None
    error: Optional[ErrorPayload] = None


class ApiErrorResponse(BaseModel):
    success: bool = False
    message: str = "Operation failed"
    data: Optional[Any] = None
    error: ErrorPayload
