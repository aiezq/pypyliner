from fastapi import Request
from fastapi.responses import JSONResponse

from src.app.services.runtime import ServiceError


def service_error_handler(_: Request, error: Exception) -> JSONResponse:
    service_error = error if isinstance(error, ServiceError) else ServiceError(status_code=500, detail=str(error))
    return JSONResponse(status_code=service_error.status_code, content={"detail": service_error.detail})
