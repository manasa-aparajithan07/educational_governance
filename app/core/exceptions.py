from typing import Optional, Any, List, Union
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException


class APIException(Exception):
    """
    Custom exception for standardized API error responses.
    """
    def __init__(
        self,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        message: str = "Operation failed",
        code: str = "OPERATION_FAILED",
        details: Optional[Union[List[dict], str, dict]] = None,
    ):
        self.status_code = status_code
        self.message = message
        self.code = code
        self.details = details
        super().__init__(message)


async def api_exception_handler(request: Request, exc: APIException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "message": exc.message,
            "data": None,
            "error": {
                "code": exc.code,
                "details": exc.details
            }
        }
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    details = []
    for error in exc.errors():
        field_path = ".".join(str(loc) for loc in error.get("loc", []) if loc not in ("body", "query", "path"))
        details.append({
            "field": field_path or "unknown",
            "message": error.get("msg", "Invalid value")
        })

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "success": False,
            "message": "Validation failed",
            "data": None,
            "error": {
                "code": "VALIDATION_ERROR",
                "details": details
            }
        }
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code_map = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        422: "VALIDATION_ERROR",
        500: "INTERNAL_SERVER_ERROR",
        503: "SERVICE_UNAVAILABLE"
    }
    code = code_map.get(exc.status_code, "HTTP_ERROR")
    message = str(exc.detail) if exc.detail else "An HTTP error occurred"

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "message": message,
            "data": None,
            "error": {
                "code": code,
                "details": message
            }
        }
    )


async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    import logging
    logging.getLogger(__name__).exception(f"Unhandled server error: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "message": "An internal server error occurred",
            "data": None,
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "details": "Unexpected error while processing request"
            }
        }
    )
