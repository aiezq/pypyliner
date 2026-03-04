from pydantic import BaseModel, Field


class ManualTerminalCreatePayload(BaseModel):
    title: str | None = Field(default=None, max_length=200)


class ManualTerminalCommandPayload(BaseModel):
    command: str = Field(min_length=1, max_length=5000)


class ManualTerminalRenamePayload(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class ManualTerminalAutocompletePayload(BaseModel):
    command: str = Field(default="", max_length=5000)
    base_command: str | None = Field(default=None, max_length=5000)
    cycle_index: int | None = Field(default=None, ge=0)
