import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import { apiRequest } from '../lib/api'
import { applyRuntimeSocketEvent } from '../lib/runtimeSocketEvents'
import { getErrorMessage, toRunState } from '../lib/mappers'
import type { RuntimeSocketEvent } from '../lib/schemas'
import { useRuntimeSocket } from './useRuntimeSocket'
import type { BackendRun, PipelineStep, RunState } from '../types'

type RuntimeSocketEventContext = Parameters<typeof applyRuntimeSocketEvent>[1]
type RuntimeSocketEventContextFactory = () => Omit<
  RuntimeSocketEventContext,
  'setRun'
>

interface UseRunControllerOptions {
  pipelineName: string
  steps: PipelineStep[]
  setBackendError: Dispatch<SetStateAction<string | null>>
  getSocketEventContext: RuntimeSocketEventContextFactory
  reloadCommandPacks: () => Promise<void>
  reloadPipelineFlows: () => Promise<void>
}

export const useRunController = ({
  pipelineName,
  steps,
  setBackendError,
  getSocketEventContext,
  reloadCommandPacks,
  reloadPipelineFlows,
}: UseRunControllerOptions) => {
  const [run, setRun] = useState<RunState | null>(null)

  const isRunning = run?.status === 'running'

  const applySocketEvent = useCallback((event: RuntimeSocketEvent): void => {
    applyRuntimeSocketEvent(event, {
      setRun,
      ...getSocketEventContext(),
    })
  }, [getSocketEventContext])

  const onRuntimeSocketOpen = useCallback(async (): Promise<void> => {
    setBackendError(null)
    await Promise.all([reloadCommandPacks(), reloadPipelineFlows()])
  }, [reloadCommandPacks, reloadPipelineFlows, setBackendError])

  const onRuntimeSocketOpenError = useCallback((error: unknown): void => {
    setBackendError(getErrorMessage(error))
  }, [setBackendError])

  const onRuntimeSocketErrorMessage = useCallback((message: string): void => {
    setBackendError(message)
  }, [setBackendError])

  const { isSocketConnected } = useRuntimeSocket({
    onEvent: applySocketEvent,
    onOpen: onRuntimeSocketOpen,
    onOpenError: onRuntimeSocketOpenError,
    onErrorMessage: onRuntimeSocketErrorMessage,
  })

  const executePipeline = async (): Promise<void> => {
    if (steps.length === 0 || isRunning) {
      return
    }

    try {
      const payload = {
        pipeline_name: pipelineName,
        steps: steps.map((step) => ({
          label: step.label,
          command: step.command,
        })),
      }
      const createdRun = await apiRequest<BackendRun>('/api/runs', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      const nextRun = toRunState(createdRun)
      setRun(nextRun)
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
    }
  }

  const stopRun = async (): Promise<void> => {
    if (!run) {
      return
    }
    try {
      const updatedRun = await apiRequest<BackendRun>(`/api/runs/${run.id}/stop`, {
        method: 'POST',
      })
      const nextRun = toRunState(updatedRun)
      setRun(nextRun)
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
    }
  }

  return {
    run,
    isRunning,
    isSocketConnected,
    executePipeline,
    stopRun,
  }
}
