from typing import Literal

from pydantic import BaseModel, Field


class PipelineFlowStepPayload(BaseModel):
    type: Literal["template", "custom"] = "custom"
    label: str = Field(default="", max_length=160)
    command: str = Field(default="", max_length=5000)


class PipelineFlowCreatePayload(BaseModel):
    flow_name: str = Field(min_length=1, max_length=200)
    steps: list[PipelineFlowStepPayload] = Field(default_factory=list, max_length=500)


class PipelineFlowFilePayload(BaseModel):
    flow_id: str = Field(min_length=1, max_length=120)
    flow_name: str = Field(min_length=1, max_length=200)
    created_at: str = Field(min_length=1, max_length=80)
    updated_at: str = Field(min_length=1, max_length=80)
    steps: list[PipelineFlowStepPayload] = Field(default_factory=list, max_length=500)
