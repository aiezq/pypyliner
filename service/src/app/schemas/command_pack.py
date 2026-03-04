from pydantic import BaseModel, Field


class CommandTemplateFileItem(BaseModel):
    id: str | None = Field(default=None, max_length=120)
    name: str = Field(min_length=1, max_length=200)
    command: str = Field(min_length=1, max_length=5000)
    description: str = Field(default="", max_length=500)


class CommandPackFilePayload(BaseModel):
    pack_id: str = Field(min_length=1, max_length=100)
    pack_name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=1000)
    commands: list[CommandTemplateFileItem] = Field(min_length=1, max_length=500)


class CommandTemplateCreatePayload(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    command: str = Field(min_length=1, max_length=5000)
    description: str = Field(default="", max_length=500)
    pack_id: str | None = Field(default=None, max_length=100)


class CommandTemplateUpdatePayload(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    command: str | None = Field(default=None, min_length=1, max_length=5000)


class CommandTemplateMovePayload(BaseModel):
    target_pack_id: str = Field(default="custom", min_length=1, max_length=100)


class CommandPackImportPayload(BaseModel):
    file_name: str | None = Field(default=None, max_length=255)
    content: str = Field(min_length=2, max_length=2_000_000)
