from __future__ import annotations

import logging
import sys
import time
from collections.abc import Awaitable, Callable

import structlog
from fastapi import Request, Response


_logging_configured = False
ACCESS_LOGGER = logging.getLogger("operator_helper.http")


def configure_logging(level: int = logging.INFO) -> None:
    global _logging_configured
    if _logging_configured:
        return

    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.stdlib.add_log_level,
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    _logging_configured = True


async def log_http_request(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    started_at = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - started_at) * 1000
    ACCESS_LOGGER.info(
        '%s %s -> %s %.2fms',
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response
