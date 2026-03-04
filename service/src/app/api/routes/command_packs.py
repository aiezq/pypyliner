from fastapi import APIRouter, Depends

from src.app.api.errors import raise_http_error
from src.app.deps import get_command_pack_manager
from src.app.schemas.command_pack import (
    CommandPackImportPayload,
    CommandTemplateCreatePayload,
    CommandTemplateMovePayload,
    CommandTemplateUpdatePayload,
)
from src.app.services.command_packs import CommandPackManager
from src.app.services.runtime import ServiceError

router = APIRouter(prefix="/api/command-packs", tags=["command-packs"])


@router.get("")
async def list_command_packs(
    manager: CommandPackManager = Depends(get_command_pack_manager),
) -> dict:
    return manager.list_command_packs()


@router.post("/templates")
async def create_command_template(
    payload: CommandTemplateCreatePayload,
    manager: CommandPackManager = Depends(get_command_pack_manager),
) -> dict:
    try:
        return manager.create_template(payload)
    except ServiceError as error:
        raise_http_error(error)


@router.patch("/templates/{template_id}")
async def update_command_template(
    template_id: str,
    payload: CommandTemplateUpdatePayload,
    manager: CommandPackManager = Depends(get_command_pack_manager),
) -> dict:
    try:
        return manager.update_template(template_id, payload)
    except ServiceError as error:
        raise_http_error(error)


@router.delete("/templates/{template_id}")
async def delete_command_template(
    template_id: str,
    manager: CommandPackManager = Depends(get_command_pack_manager),
) -> dict:
    try:
        return manager.delete_template(template_id)
    except ServiceError as error:
        raise_http_error(error)


@router.post("/templates/{template_id}/move")
async def move_command_template(
    template_id: str,
    payload: CommandTemplateMovePayload,
    manager: CommandPackManager = Depends(get_command_pack_manager),
) -> dict:
    try:
        return manager.move_template(template_id, payload.target_pack_id)
    except ServiceError as error:
        raise_http_error(error)


@router.post("/import")
async def import_command_pack(
    payload: CommandPackImportPayload,
    manager: CommandPackManager = Depends(get_command_pack_manager),
) -> dict:
    try:
        return manager.import_pack(payload)
    except ServiceError as error:
        raise_http_error(error)
