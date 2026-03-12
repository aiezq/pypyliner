from __future__ import annotations

import re
from typing import Protocol

MARKER_PREFIX = "__OPH_CMD_DONE__"
ANSI_ESCAPE_PATTERN = re.compile(r"\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))")
CONTROL_CHAR_PATTERN = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
PROMPT_ONLY_PATTERN = re.compile(r"^(?:[\w.@:/~ -]+)?[%#$]\s*$")
PROMPT_PREFIX_PATTERN = re.compile(r"^[\w.@:/~ -]+[%#$>]\s+")
LOCAL_PROMPT_BUFFER_PATTERN = re.compile(r"[\w.@-]+:[\w./~ -]*[%#$>]\s$")


class InteractiveTerminalState(Protocol):
    interactive_input_buffer: str


def split_ssh_interactive_input(terminal: InteractiveTerminalState, data: str) -> tuple[str, bool]:
    passthrough_parts: list[str] = []
    should_switch = False

    for char in data:
        if char in {"\r", "\n"}:
            command = terminal.interactive_input_buffer.strip()
            terminal.interactive_input_buffer = ""
            if command in {"exit", "logout"}:
                should_switch = True
                continue
            passthrough_parts.append(char)
            continue

        if char == "\x7f":
            terminal.interactive_input_buffer = terminal.interactive_input_buffer[:-1]
            passthrough_parts.append(char)
            continue

        if char == "\x03":
            terminal.interactive_input_buffer = ""
            passthrough_parts.append(char)
            continue

        if char == "\x1b":
            passthrough_parts.append(char)
            continue

        if char.isprintable():
            terminal.interactive_input_buffer += char
        passthrough_parts.append(char)

    return ("".join(passthrough_parts), should_switch)


def should_block_local_exit(screen_buffer: str) -> bool:
    normalized = ANSI_ESCAPE_PATTERN.sub("", screen_buffer).replace("\r", "")
    tail = normalized.split("\n")[-1]
    return bool(LOCAL_PROMPT_BUFFER_PATTERN.search(tail))


def split_local_interactive_input(
    terminal: InteractiveTerminalState,
    data: str,
    *,
    block_local_exit: bool,
) -> tuple[str, bool, bool]:
    passthrough_parts: list[str] = []
    should_block = False
    should_refresh_prompt = False

    for char in data:
        if char in {"\r", "\n"}:
            command = terminal.interactive_input_buffer.strip()
            terminal.interactive_input_buffer = ""
            if command in {"exit", "logout"} and block_local_exit:
                should_block = True
                continue
            if command in {"exit", "logout"}:
                should_refresh_prompt = True
            passthrough_parts.append(char)
            continue

        if char == "\x7f":
            terminal.interactive_input_buffer = terminal.interactive_input_buffer[:-1]
            passthrough_parts.append(char)
            continue

        if char == "\x03":
            terminal.interactive_input_buffer = ""
            passthrough_parts.append(char)
            continue

        if char.isprintable():
            terminal.interactive_input_buffer += char
        passthrough_parts.append(char)

    return ("".join(passthrough_parts), should_block, should_refresh_prompt)


def sanitize_terminal_output_line(line: str) -> str | None:
    without_ansi = ANSI_ESCAPE_PATTERN.sub("", line)
    without_backspaces = re.sub(r".\x08", "", without_ansi)
    normalized = CONTROL_CHAR_PATTERN.sub("", without_backspaces).strip()
    if not normalized:
        return None
    if PROMPT_ONLY_PATTERN.match(normalized):
        return None
    if normalized in {"Saving session...", "...completed."}:
        return None
    if normalized.startswith("...saving history..."):
        return None
    return normalized


def should_drop_output_line(
    line: str,
    *,
    current_command_resolved_command: str | None,
) -> bool:
    if line in {'"', "e", "p", "s", "P"}:
        return True
    if line in {"stty echo", "stty -echo"}:
        return True
    if MARKER_PREFIX in line:
        return True
    if line.startswith("printf '\\n__OPH_CMD_DONE__"):
        return True
    if line.startswith(
        ("PROMPT=", "RPROMPT=", "PROMPT2=", "PS1=", "PS2=", "bind 'set enable-bracketed-paste")
    ):
        return True
    if line.startswith(("function fish_prompt", "function fish_right_prompt")):
        return True
    if PROMPT_PREFIX_PATTERN.match(line):
        return True
    if current_command_resolved_command is not None and line == current_command_resolved_command:
        return True
    return False
