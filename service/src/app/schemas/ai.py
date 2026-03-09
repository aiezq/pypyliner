from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

AIInstallState = Literal["not_installed", "installing", "installed", "failed", "removing"]
AIModelState = Literal["not_installed", "installed", "loading", "ready", "failed"]
AIRuntimeName = Literal["ollama"]
TerminalKind = Literal["local", "ssh"]


class AIModelManifestEntry(BaseModel):
    model_id: str
    display_name: str
    provider: str
    runtime: AIRuntimeName
    install_ref: str
    download_size_bytes: int = Field(ge=0)
    min_ram_gb: int = Field(ge=1)
    recommended_ram_gb: int = Field(ge=1)
    supports_json_mode: bool = True
    license: str
    status: str


class AIModelSummary(AIModelManifestEntry):
    install_state: AIInstallState = "not_installed"
    model_state: AIModelState = "not_installed"
    last_error: str | None = None
    progress_status: str | None = None
    progress_completed_bytes: int | None = Field(default=None, ge=0)
    progress_total_bytes: int | None = Field(default=None, ge=0)
    progress_percent: float | None = Field(default=None, ge=0.0, le=100.0)


class AIModelsResponse(BaseModel):
    runtime_name: AIRuntimeName
    runtime_available: bool
    models: list[AIModelSummary] = Field(default_factory=list)


class AIModelStatusResponse(BaseModel):
    runtime_name: AIRuntimeName
    runtime_available: bool
    model: AIModelSummary


class PipelineDraftVariable(BaseModel):
    name: str
    description: str
    default_value: str | None = None
    required: bool = True

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Variable name cannot be empty.")
        return stripped


class PipelineDraftStep(BaseModel):
    id: str
    label: str
    command: str
    description: str
    uses_variables: list[str] = Field(default_factory=list)
    template_id: str | None = None
    terminal_type: TerminalKind = "local"


class PipelineDraftTargetTerminal(BaseModel):
    type: TerminalKind = "local"
    connection_hint: str | None = None


class PipelineDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    flow_name: str
    summary: str
    assumptions: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    variables: list[PipelineDraftVariable] = Field(default_factory=list)
    steps: list[PipelineDraftStep] = Field(default_factory=list)
    target_terminal: PipelineDraftTargetTerminal
    confidence: float = Field(ge=0.0, le=1.0)


class GeneratePipelineDraftContext(BaseModel):
    command_packs: bool = True


class GeneratePipelineDraftRequest(BaseModel):
    model_id: str
    documentation_text: str = Field(min_length=1)
    mode: Literal["graph"] = "graph"
    context: GeneratePipelineDraftContext = Field(default_factory=GeneratePipelineDraftContext)

    @field_validator("documentation_text")
    @classmethod
    def validate_documentation_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Documentation text cannot be empty.")
        return stripped


class GeneratePipelineDraftResponse(BaseModel):
    draft: PipelineDraft
    warnings: list[str] = Field(default_factory=list)
    install_state: AIInstallState
    model_state: AIModelState
