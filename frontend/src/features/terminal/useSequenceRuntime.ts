import { useCallback, useState } from 'react'
import { useGraphStore } from '../../graph/store/graphStore'
import type { BackendSequence } from '../../lib/schemas'
import type { SequenceExecutionViewModel } from '../../types'

const toSequenceExecutionViewModel = (sequence: BackendSequence): SequenceExecutionViewModel => ({
  id: sequence.id,
  sequenceNodeId: sequence.sequence_node_id,
  status: sequence.status,
  currentTerminalIndex: sequence.current_terminal_index,
  createdAt: sequence.created_at,
  startedAt: sequence.started_at,
  finishedAt: sequence.finished_at,
  terminalJobs: sequence.terminal_jobs.map((job) => ({
    terminalNodeId: job.terminal_node_id,
    terminalSessionId: job.terminal_session_id,
    title: job.title,
    terminalType: job.terminal_type,
    status: job.status,
  })),
})

export const useSequenceRuntime = () => {
  const updateNodeData = useGraphStore((state) => state.updateNodeData)
  const syncSequenceRuntimeStore = useGraphStore((state) => state.syncSequenceRuntime)
  const [sequenceExecutions, setSequenceExecutions] = useState<SequenceExecutionViewModel[]>([])

  const syncSequenceNodeRuntime = useCallback(
    (
      sequenceNodeId: string,
      runtime: {
        sequenceId: string | null
        status: SequenceExecutionViewModel['status'] | null
        currentTerminalIndex: number | null
        finishedAt: string | null
      },
    ): void => {
      updateNodeData(sequenceNodeId, runtime)
    },
    [updateNodeData],
  )

  const applySequenceSnapshot = useCallback(
    (sequences: BackendSequence[]): void => {
      const nextSequences = sequences.map(toSequenceExecutionViewModel)
      setSequenceExecutions(nextSequences)
      syncSequenceRuntimeStore(nextSequences)

      const runtimeByNodeId = new Map(
        nextSequences.map((sequence) => [sequence.sequenceNodeId, sequence]),
      )
      const { nodes } = useGraphStore.getState()
      nodes
        .filter((node) => node.type === 'sequence')
        .forEach((node) => {
          const runtime = runtimeByNodeId.get(node.id)
          syncSequenceNodeRuntime(node.id, {
            sequenceId: runtime?.id ?? null,
            status: runtime?.status ?? null,
            currentTerminalIndex: runtime?.currentTerminalIndex ?? null,
            finishedAt: runtime?.finishedAt ?? null,
          })
        })
    },
    [syncSequenceNodeRuntime, syncSequenceRuntimeStore],
  )

  const upsertSequenceExecution = useCallback(
    (sequence: BackendSequence): void => {
      const nextSequence = toSequenceExecutionViewModel(sequence)
      setSequenceExecutions((prev) => {
        const existingIndex = prev.findIndex((item) => item.id === nextSequence.id)
        const nextSequences =
          existingIndex < 0
            ? [nextSequence, ...prev]
            : prev.map((item, index) => (index === existingIndex ? nextSequence : item))
        syncSequenceRuntimeStore(nextSequences)
        return nextSequences
      })
      syncSequenceNodeRuntime(nextSequence.sequenceNodeId, {
        sequenceId: nextSequence.id,
        status: nextSequence.status,
        currentTerminalIndex: nextSequence.currentTerminalIndex,
        finishedAt: nextSequence.finishedAt,
      })
    },
    [syncSequenceNodeRuntime, syncSequenceRuntimeStore],
  )

  const updateSequenceStatus = useCallback(
    ({
      sequence_id,
      sequence_node_id,
      status,
      current_terminal_index,
      finished_at,
    }: {
      sequence_id: string
      sequence_node_id: string
      status: SequenceExecutionViewModel['status']
      current_terminal_index: number | null
      finished_at: string | null
    }): void => {
      setSequenceExecutions((prev) => {
        const nextSequences = prev.map((sequence) =>
          sequence.id === sequence_id
            ? {
                ...sequence,
                status,
                currentTerminalIndex: current_terminal_index,
                finishedAt: finished_at,
              }
            : sequence,
        )
        syncSequenceRuntimeStore(nextSequences)
        return nextSequences
      })
      syncSequenceNodeRuntime(sequence_node_id, {
        sequenceId: sequence_id,
        status,
        currentTerminalIndex: current_terminal_index,
        finishedAt: finished_at,
      })
    },
    [syncSequenceNodeRuntime, syncSequenceRuntimeStore],
  )

  const bindSequenceTerminalSession = useCallback(
    (terminalNodeId: string, terminalSessionId: string, sequenceId: string): void => {
      setSequenceExecutions((prev) => {
        const nextSequences = prev.map((sequence) =>
          sequence.id !== sequenceId
            ? sequence
            : {
                ...sequence,
                terminalJobs: sequence.terminalJobs.map((job) =>
                  job.terminalNodeId === terminalNodeId
                    ? {
                        ...job,
                        terminalSessionId,
                      }
                    : job,
                ),
              },
        )
        syncSequenceRuntimeStore(nextSequences)
        return nextSequences
      })
    },
    [syncSequenceRuntimeStore],
  )

  return {
    sequenceExecutions,
    applySequenceSnapshot,
    upsertSequenceExecution,
    updateSequenceStatus,
    bindSequenceTerminalSession,
  }
}
