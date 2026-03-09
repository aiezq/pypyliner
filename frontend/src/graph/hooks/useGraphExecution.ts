import { useCallback } from 'react'
import { apiRequest } from '../../lib/api'
import { resolveChain } from '../utils/graphResolver'
import { useGraphStore } from '../store/graphStore'
import type { GraphNode, GraphEdge } from '../types'
import type { BackendManualTerminal, SessionStatus } from '../../types'

interface UseGraphExecutionReturn {
  executeTerminalNode: (terminalNodeId: string, isSequence?: boolean) => Promise<void>
}

const TERMINAL_POLL_INTERVAL_MS = 250
const TERMINAL_COMMAND_TIMEOUT_MS = 5 * 60 * 1000

const TERMINAL_COMPLETED_STATUSES: ReadonlySet<SessionStatus> = new Set(['idle', 'success'])
const TERMINAL_FAILED_STATUSES: ReadonlySet<SessionStatus> = new Set(['failed', 'stopped'])

const waitFor = async (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, delayMs)
  })

const waitForTerminalCommandCompletion = async (terminalId: string): Promise<void> => {
  const startedAt = Date.now()

  while (Date.now() - startedAt < TERMINAL_COMMAND_TIMEOUT_MS) {
    let terminal: Pick<BackendManualTerminal, 'id' | 'status'>
    try {
      terminal = await apiRequest<Pick<BackendManualTerminal, 'id' | 'status'>>(
        `/api/terminals/${terminalId}`,
      )
    } catch (error) {
      if (error instanceof Error && error.message === 'Terminal not found') {
        throw new Error(`Terminal ${terminalId} is no longer available`)
      }
      throw error
    }

    if (!terminal) {
      throw new Error(`Terminal ${terminalId} is no longer available`)
    }

    if (TERMINAL_COMPLETED_STATUSES.has(terminal.status)) {
      return
    }

    if (TERMINAL_FAILED_STATUSES.has(terminal.status)) {
      throw new Error(`Terminal ${terminalId} stopped before command completed`)
    }

    await waitFor(TERMINAL_POLL_INTERVAL_MS)
  }

  throw new Error(`Timed out waiting for terminal ${terminalId} to finish command`)
}

/**
 * Hook that resolves a chain from a Terminal node and
 * sends each command sequentially to the backend terminal API.
 */
export function useGraphExecution(): UseGraphExecutionReturn {
  const executeTerminalNode = useCallback(async (terminalNodeId: string, isSequence: boolean = false) => {
    const { nodes, edges, updateNodeData, globalVariables, sshConnections } = useGraphStore.getState()

    const chain = resolveChain(
      terminalNodeId,
      nodes as GraphNode[],
      edges as GraphEdge[],
      globalVariables,
      sshConnections,
    )

    if (
      chain.terminalType === 'ssh' &&
      (!chain.sshUsername?.trim() || !chain.sshHost?.trim() || !chain.sshPassword?.trim())
    ) {
      throw new Error('SSH terminal requires username, host, and password')
    }

    // Validate or create terminal
    let terminalId = chain.terminalId
    if (terminalId) {
      try {
        await apiRequest<Pick<BackendManualTerminal, 'id'>>(`/api/terminals/${terminalId}`)
      } catch (error) {
        if (error instanceof Error && error.message === 'Terminal not found') {
          terminalId = null
        } else {
          throw error
        }
      }
    }

    if (!terminalId) {
      const result = await apiRequest<{ id: string }>('/api/terminals', {
        method: 'POST',
        body: JSON.stringify({
          title: chain.terminalLabel,
          is_sequence: isSequence,
          terminal_type: chain.terminalType,
          ssh_connection_name: chain.sshConnectionName,
          ssh_host: chain.sshHost,
          ssh_username: chain.sshUsername,
          ssh_password: chain.sshPassword,
        }),
      })
      terminalId = result.id
      updateNodeData(terminalNodeId, { terminalId })
      await waitForTerminalCommandCompletion(terminalId)
    }

    // Execute each command in order
    for (const cmd of chain.commands) {
      const trimmedCommand = cmd.resolvedCommand.trim()
      if (!trimmedCommand) {
        continue
      }
      await apiRequest(`/api/terminals/${terminalId}/run`, {
        method: 'POST',
        body: JSON.stringify({ command: trimmedCommand }),
      })
      await waitForTerminalCommandCompletion(terminalId)
    }
  }, [])

  return { executeTerminalNode }
}
