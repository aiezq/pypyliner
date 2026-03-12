from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

TerminalType = Literal["local", "ssh"]


def _new_terminal_commands() -> list["TerminalCommandPayload"]:
    return []


class TerminalCommandPayload(BaseModel):
    node_id: str = Field(min_length=1, max_length=200)
    label: str = Field(min_length=1, max_length=160)
    original_command: str = Field(min_length=1, max_length=5000)
    resolved_command: str = Field(min_length=1, max_length=5000)


class TerminalExecutionPayload(BaseModel):
    terminal_node_id: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=200)
    terminal_type: TerminalType = "local"
    ssh_connection_name: str | None = Field(default=None, max_length=200)
    ssh_host: str | None = Field(default=None, max_length=200)
    ssh_username: str | None = Field(default=None, max_length=200)
    ssh_password: str | None = Field(default=None, max_length=500)
    ssh_command: str | None = Field(default=None, max_length=5000)
    commands: list[TerminalCommandPayload] = Field(default_factory=_new_terminal_commands, max_length=200)


class TerminalCreatePayload(BaseModel):
    title: str = Field(default="Terminal", min_length=1, max_length=200)
    terminal_type: TerminalType = "local"
    ssh_connection_name: str | None = Field(default=None, max_length=200)
    ssh_host: str | None = Field(default=None, max_length=200)
    ssh_username: str | None = Field(default=None, max_length=200)
    ssh_password: str | None = Field(default=None, max_length=500)
    ssh_command: str | None = Field(default=None, max_length=5000)


class TerminalAppendCommandPayload(BaseModel):
    command: str = Field(min_length=1, max_length=5000)
    label: str | None = Field(default=None, max_length=160)


class TerminalInputPayload(BaseModel):
    data: str = Field(min_length=1, max_length=10000)


class TerminalResizePayload(BaseModel):
    cols: int = Field(ge=20, le=400)
    rows: int = Field(ge=5, le=200)


class SequenceExecutionPayload(BaseModel):
    sequence_node_id: str = Field(min_length=1, max_length=200)
    terminals: list[TerminalExecutionPayload] = Field(min_length=1, max_length=200)
