from pydantic import BaseModel, Field


class PipelineStepPayload(BaseModel):
    label: str = Field(min_length=1, max_length=160)
    command: str = Field(min_length=1, max_length=5000)


class PipelineRunCreatePayload(BaseModel):
    pipeline_name: str = Field(default="Operator pipeline", min_length=1, max_length=200)
    steps: list[PipelineStepPayload] = Field(min_length=1, max_length=200)
