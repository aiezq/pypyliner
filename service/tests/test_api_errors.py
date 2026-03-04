from __future__ import annotations

import json

from starlette.requests import Request

from src.app.api.errors import service_error_handler
from src.app.services.runtime import ServiceError


def _request() -> Request:
    return Request({"type": "http", "method": "GET", "path": "/"})


def test_service_error_handler_for_service_error():
    response = service_error_handler(_request(), ServiceError(status_code=404, detail="Not found"))
    body = response.body.tobytes() if isinstance(response.body, memoryview) else response.body

    assert response.status_code == 404
    assert json.loads(body) == {"detail": "Not found"}


def test_service_error_handler_for_generic_exception():
    response = service_error_handler(_request(), RuntimeError("boom"))
    body = response.body.tobytes() if isinstance(response.body, memoryview) else response.body

    assert response.status_code == 500
    assert json.loads(body) == {"detail": "boom"}
