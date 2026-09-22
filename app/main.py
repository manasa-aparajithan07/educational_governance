import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.database import init_db
from app.api.v1.router import api_v1_router
from app.core.exceptions import (
    APIException,
    api_exception_handler,
    validation_exception_handler,
    http_exception_handler,
    global_exception_handler
)

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing Blockchain Examination System Database...")
    init_db()
    logger.info("Database initialized successfully.")
    yield
    logger.info("Shutting down application...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Decentralized and Tamper-Proof Examination & Grievance Management System Backend",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan
)

# CORS Middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Exception Handlers adhering to strict JSON error envelope
app.add_exception_handler(APIException, api_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(Exception, global_exception_handler)

# Mount API v1 router at /api/v1
app.include_router(api_v1_router, prefix=settings.API_V1_STR)


@app.get("/health", tags=["System"])
def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "fabric_enabled": settings.FABRIC_ENABLED
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.SERVER_HOST,
        port=settings.SERVER_PORT,
        reload=True
    )
