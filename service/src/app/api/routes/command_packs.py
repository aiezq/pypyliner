from fastapi import APIRouter, Depends

from src.app.deps import get_command_pack_manager
from src.app.schemas.command_pack import (
    CommandPackImportPayload,
    CommandTemplateCreatePayload,
    CommandTemplateMovePayload,
    CommandTemplateUpdatePayload,
)
from src.app.schemas.responses import (
    CommandPackImportResponse,
    CommandPackListResponse,
    CommandTemplateDeleteResponse,
    CommandTemplateMutationResponse,
)
from src.app.services.command_packs import CommandPackManager

router = APIRouter(prefix="/api/command-packs", tags=["command-packs"])


@router.get("", response_model=CommandPackListResponse)
async def list_command_packs(
    manager: CommandPackManager = Depends(get_command_pack_manager),
) -> CommandPackListResponse:
    return CommandPackListResponse.model_validate(manager.list_command_packs())


@router.post("/templates", response_model=CommandTemplateMutationResponse)
async def create_command_template(
    payload: CommandTemplateCreatePayload,
    manager: CommandPackManager = Depends(get_command_pack_manager),
) -> CommandTemplateMutationResponse:
    return CommandTemplateMutationResponse.model_validate(manager.create_template(payload))


@router.patch("/templates/{template_id}", response_model=CommandTemplateMutationResponse)
async def update_command_template(
    template_id: str,
    payload: CommandTemplateUpdatePayload,
    manager: CommandPackManager = Depends(get_command_pack_manager),
) -> CommandTemplateMutationResponse:
    return CommandTemplateMutationResponse.model_validate(manager.update_template(template_id, payload))


@router.delete("/templates/{template_id}", response_model=CommandTemplateDeleteResponse)
async def delete_command_template(
    template_id: str,
    manager: CommandPackManager = Depends(get_command_pack_manager),
) -> CommandTemplateDeleteResponse:
    return CommandTemplateDeleteResponse.model_validate(manager.delete_template(template_id))


@router.post("/templates/{template_id}/move", response_model=CommandTemplateMutationResponse)
async def move_command_template(
    template_id: str,
    payload: CommandTemplateMovePayload,
    manager: CommandPackManager = Depends(get_command_pack_manager),
) -> CommandTemplateMutationResponse:
    return CommandTemplateMutationResponse.model_validate(
        manager.move_template(template_id, payload.target_pack_id)
    )


@router.post("/import", response_model=CommandPackImportResponse)
async def import_command_pack(
    payload: CommandPackImportPayload,
    manager: CommandPackManager = Depends(get_command_pack_manager),
) -> CommandPackImportResponse:
    return CommandPackImportResponse.model_validate(manager.import_pack(payload))
