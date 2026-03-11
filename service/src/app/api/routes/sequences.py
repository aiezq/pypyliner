from fastapi import APIRouter, Depends

from src.app.deps import get_terminal_runtime
from src.app.schemas.responses import SequenceExecutionResponse, SequencesListResponse
from src.app.schemas.terminal import SequenceExecutionPayload
from src.app.services.terminal_runtime import TerminalRuntimeManager

router = APIRouter(prefix="/api/sequences", tags=["sequences"])


@router.get("", response_model=SequencesListResponse)
async def get_sequences(
    runtime: TerminalRuntimeManager = Depends(get_terminal_runtime),
) -> SequencesListResponse:
    return SequencesListResponse.model_validate({"sequences": runtime.list_sequences()})


@router.get("/{sequence_id}", response_model=SequenceExecutionResponse)
async def get_sequence(
    sequence_id: str,
    runtime: TerminalRuntimeManager = Depends(get_terminal_runtime),
) -> SequenceExecutionResponse:
    return SequenceExecutionResponse.model_validate(runtime.get_sequence(sequence_id))


@router.post("/execute", response_model=SequenceExecutionResponse)
async def execute_sequence(
    payload: SequenceExecutionPayload,
    runtime: TerminalRuntimeManager = Depends(get_terminal_runtime),
) -> SequenceExecutionResponse:
    return SequenceExecutionResponse.model_validate(await runtime.execute_sequence(payload))
