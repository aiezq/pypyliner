from __future__ import annotations

from pydantic import BaseModel, Field


class TerminalLineResponse(BaseModel):
    id: str
    stream: str
    text: str
    created_at: str


class PipelineSessionResponse(BaseModel):
    id: str
    step_id: str
    title: str
    command: str
    status: str
    exit_code: int | None = None
    lines: list[TerminalLineResponse] = Field(default_factory=list)


class PipelineRunResponse(BaseModel):
    id: str
    pipeline_name: str
    status: str
    started_at: str
    finished_at: str | None = None
    log_file_path: str
    sessions: list[PipelineSessionResponse] = Field(default_factory=list)


class RunsListResponse(BaseModel):
    runs: list[PipelineRunResponse] = Field(default_factory=list)


class HistoryResponse(BaseModel):
    runs: list[PipelineRunResponse] = Field(default_factory=list)


class StateSnapshotResponse(BaseModel):
    runs: list[PipelineRunResponse] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: str
    timestamp: str


class CommandTemplateResponse(BaseModel):
    id: str
    name: str
    command: str
    description: str


class CommandPackResponse(BaseModel):
    pack_id: str
    pack_name: str
    description: str
    file_name: str
    templates: list[CommandTemplateResponse] = Field(default_factory=list)


class CommandPackListResponse(BaseModel):
    packs: list[CommandPackResponse] = Field(default_factory=list)
    templates: list[CommandTemplateResponse] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class CommandTemplateMutationResponse(BaseModel):
    id: str
    name: str
    command: str
    description: str
    pack_id: str
    pack_file: str
    moved_from_pack_id: str | None = None


class CommandTemplateDeleteResponse(BaseModel):
    deleted: bool
    template_id: str
    pack_id: str
    pack_file: str


class CommandPackImportResponse(BaseModel):
    imported: bool
    pack_id: str
    pack_name: str
    file_name: str
    commands_count: int


class PipelineFlowStepResponse(BaseModel):
    type: str
    label: str
    command: str


class PipelineFlowResponse(BaseModel):
    id: str
    flow_name: str
    created_at: str
    updated_at: str
    file_name: str
    steps: list[PipelineFlowStepResponse] = Field(default_factory=list)


class PipelineFlowListResponse(BaseModel):
    flows: list[PipelineFlowResponse] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class PipelineFlowDeleteResponse(BaseModel):
    deleted: bool
    flow_id: str
