import logging

from fastapi import Request
from fastapi.responses import JSONResponse

from src.app.services.runtime import ServiceError

LOGGER = logging.getLogger("uvicorn.error")


def service_error_handler(_: Request, error: Exception) -> JSONResponse:
    service_error = error if isinstance(error, ServiceError) else ServiceError(status_code=500, detail=str(error))
    if service_error.status_code >= 500:
        LOGGER.exception("Service request failed: %s", service_error.detail, exc_info=error)
    return JSONResponse(status_code=service_error.status_code, content={"detail": service_error.detail})


def unexpected_error_handler(_: Request, error: Exception) -> JSONResponse:
    LOGGER.exception("Unhandled request error", exc_info=error)
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})
