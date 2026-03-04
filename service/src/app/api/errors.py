from fastapi import HTTPException
from typing import Never

from src.app.services.runtime import ServiceError


def raise_http_error(error: ServiceError) -> Never:
    raise HTTPException(status_code=error.status_code, detail=error.detail)
