from fastapi import HTTPException

from src.app.services.runtime import ServiceError


def raise_http_error(error: ServiceError) -> None:
    raise HTTPException(status_code=error.status_code, detail=error.detail)
