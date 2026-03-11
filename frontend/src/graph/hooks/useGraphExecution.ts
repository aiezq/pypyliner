import { useCallback } from 'react'
import { apiRequest } from '../../lib/api'
import type { SessionStatus } from '../../types'
import { useGraphStore } from '../store/graphStore'
import { resolveChain } from '../utils/graphResolver'

interface UseGraphExecutionReturn {
  executeTerminalNode: (_terminalNodeId: string, _isSequence?: boolean) => Promise<void>
}

interface TerminalExecutionResponse {
  id: string
  terminal_node_id: string
  status: SessionStatus
}

export function useGraphExecution(): UseGraphExecutionReturn {
  const updateNodeData = useGraphStore((state) => state.updateNodeData)
  const setActiveTerminalIds = useGraphStore((state) => state.setActiveTerminalIds)
  const setTerminalStatuses = useGraphStore((state) => state.setTerminalStatuses)

  const executeTerminalNode = useCallback(
    async (terminalNodeId: string): Promise<void> => {
      const {
        nodes,
        edges,
        globalVariables,
        sshConnections,
        activeTerminalIds,
        terminalStatuses,
      } = useGraphStore.getState()
      const resolved = resolveChain(
        terminalNodeId,
        nodes,
        edges,
        globalVariables,
        sshConnections,
      )

      const response = await apiRequest<TerminalExecutionResponse>('/api/terminals/execute', {
        method: 'POST',
        body: JSON.stringify({
          terminal_node_id: resolved.terminalNodeId,
          title: resolved.terminalLabel,
          terminal_type: resolved.terminalType,
          ssh_connection_name: resolved.sshConnectionName,
          ssh_host: resolved.sshHost,
          ssh_username: resolved.sshUsername,
          ssh_password: resolved.sshPassword,
          ssh_command: resolved.sshCommand,
          commands: resolved.commands.map((command) => ({
            node_id: command.nodeId,
            label: command.label,
            original_command: command.originalCommand,
            resolved_command: command.resolvedCommand,
          })),
        }),
      })

      updateNodeData<{ terminalId: string | null }>(terminalNodeId, { terminalId: response.id })
      setActiveTerminalIds(
        activeTerminalIds.includes(response.id) ? activeTerminalIds : [...activeTerminalIds, response.id],
      )
      setTerminalStatuses({
        ...terminalStatuses,
        [response.id]: response.status,
      })
    },
    [setActiveTerminalIds, setTerminalStatuses, updateNodeData],
  )

  return { executeTerminalNode }
}
