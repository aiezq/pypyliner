import { useCallback } from 'react'
import { apiRequest } from '../../lib/api'
import { useGraphStore } from '../store/graphStore'
import { EDGE_TYPES, NODE_TYPES } from '../types'
import { resolveChain } from '../utils/graphResolver'

interface SequenceExecutionResponse {
  terminal_jobs: Array<{
    terminal_node_id: string
    terminal_session_id: string | null
  }>
}

export function useSequenceExecution() {
  const updateNodeData = useGraphStore((state) => state.updateNodeData)

  const executeSequenceNode = useCallback(async (sequenceNodeId: string) => {
    const { edges, nodes, globalVariables, sshConnections } = useGraphStore.getState()

    const sequenceEdges = edges.filter(
      (edge) => edge.target === sequenceNodeId && edge.type === EDGE_TYPES.SEQUENCE,
    )

    const sortedEdges = [...sequenceEdges].sort((a, b) => {
      const indexA = parseInt(a.targetHandle?.replace('seq-in-', '') || '0', 10)
      const indexB = parseInt(b.targetHandle?.replace('seq-in-', '') || '0', 10)
      return indexA - indexB
    })

    const terminals = sortedEdges.flatMap((edge) => {
      const targetNode = nodes.find((node) => node.id === edge.source)
      if (
        targetNode?.type === NODE_TYPES.TERMINAL ||
        targetNode?.type === NODE_TYPES.SSH_TERMINAL
      ) {
        return [
          resolveChain(
            targetNode.id,
            nodes,
            edges,
            globalVariables,
            sshConnections,
          ),
        ]
      }
      return []
    })

    const response = await apiRequest<SequenceExecutionResponse>('/api/sequences/execute', {
      method: 'POST',
      body: JSON.stringify({
        sequence_node_id: sequenceNodeId,
        terminals: terminals.map((terminal) => ({
          terminal_node_id: terminal.terminalNodeId,
          title: terminal.terminalLabel,
          terminal_type: terminal.terminalType,
          ssh_connection_name: terminal.sshConnectionName,
          ssh_host: terminal.sshHost,
          ssh_username: terminal.sshUsername,
          ssh_password: terminal.sshPassword,
          ssh_command: terminal.sshCommand,
          commands: terminal.commands.map((command) => ({
            node_id: command.nodeId,
            label: command.label,
            original_command: command.originalCommand,
            resolved_command: command.resolvedCommand,
          })),
        })),
      }),
    })

    response.terminal_jobs.forEach((job) => {
      if (!job.terminal_session_id) {
        return
      }
      updateNodeData<{ terminalId: string | null }>(job.terminal_node_id, {
        terminalId: job.terminal_session_id,
      })
    })
  }, [updateNodeData])

  return { executeSequenceNode }
}
