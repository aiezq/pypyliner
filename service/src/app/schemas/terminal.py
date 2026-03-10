from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ManualTerminalCreatePayload(BaseModel):
    title: str | None = None
    cwd: str | None = None
    command: str | None = None
    is_sequence: bool = False
    terminal_type: Literal["local", "ssh"] = "local"
    ssh_connection_name: str | None = None
    ssh_host: str | None = None
    ssh_username: str | None = None
    ssh_password: str | None = None
    ssh_command: str | None = None

    @model_validator(mode="after")
    def validate_ssh_payload(self) -> "ManualTerminalCreatePayload":
        if self.terminal_type != "ssh":
            return self

        if self.ssh_command and self.ssh_command.strip():
            return self

        missing_fields: list[str] = []
        if not (self.ssh_username and self.ssh_username.strip()):
            missing_fields.append("ssh_username")
        if not (self.ssh_host and self.ssh_host.strip()):
            missing_fields.append("ssh_host")

        if missing_fields:
            joined = ", ".join(missing_fields)
            raise ValueError(f"SSH terminal requires: {joined}")

        return self


class ManualTerminalCommandPayload(BaseModel):
    command: str = Field(min_length=1, max_length=5000)


class ManualTerminalRenamePayload(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class ManualTerminalAutocompletePayload(BaseModel):
    command: str = Field(default="", max_length=5000)
    base_command: str | None = Field(default=None, max_length=5000)
    cycle_index: int | None = Field(default=None, ge=0)
