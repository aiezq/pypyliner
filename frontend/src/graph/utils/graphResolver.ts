import {
  NODE_TYPES,
  EDGE_TYPES,
  DEFAULT_SSH_COMMAND_TEMPLATE,
  type GraphNode,
  type GraphEdge,
  type CommandNodeData,
  type VariableNodeData,
  type TerminalNodeData,
  type SshTerminalNodeData,
} from '../types'
import type { SshConnectionVariable } from '../../types'
import { substituteVariables } from './variableParser'

export interface ResolvedChain {
  terminalNodeId: string
  terminalId: string | null
  terminalSessionId: string | null
  terminalLabel: string
  terminalType: 'local' | 'ssh'
  sshConnectionId: string | null
  sshConnectionName: string | null
  sshHost: string | null
  sshUsername: string | null
  sshPassword: string | null
  sshCommand: string | null
  commands: ResolvedCommand[]
}

export interface ResolvedCommand {
  nodeId: string
  label: string
  originalCommand: string
  resolvedCommand: string
}

/**
 * Walk backwards from a Terminal node along chaining edges,
 * collect commands in execution order, resolve variables.
 */
export function resolveChain(
  terminalNodeId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
  globalVariables: Record<string, string> = {},
  sshConnections: SshConnectionVariable[] = [],
): ResolvedChain {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const terminalNode = nodeMap.get(terminalNodeId)

  if (
    !terminalNode ||
    (terminalNode.type !== NODE_TYPES.TERMINAL && terminalNode.type !== NODE_TYPES.SSH_TERMINAL)
  ) {
    throw new Error(`Node ${terminalNodeId} is not a terminal node`)
  }

  const isSshTerminal = terminalNode.type === NODE_TYPES.SSH_TERMINAL
  const termData = terminalNode.data as TerminalNodeData | SshTerminalNodeData
  const selectedSshConnection = isSshTerminal
    ? sshConnections.find((connection) => connection.id === termData.connectionId)
    : undefined
  const sshNodeData = isSshTerminal ? (termData as SshTerminalNodeData) : null

  // Build adjacency: which node chains INTO which node
  // chain edge: source chain-out → target chain-in
  const chainIncoming = new Map<string, string>() // target → source
  for (const edge of edges) {
    if (edge.type === EDGE_TYPES.CHAIN) {
      chainIncoming.set(edge.target, edge.source)
    }
  }

  // Walk backwards from terminal
  const commandNodeIds: string[] = []
  let currentId: string | undefined = chainIncoming.get(terminalNodeId)

  const visited = new Set<string>()
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const node = nodeMap.get(currentId)
    if (!node || node.type !== NODE_TYPES.COMMAND) break
    commandNodeIds.unshift(currentId) // prepend → execution order
    currentId = chainIncoming.get(currentId)
  }

  // Resolve variables for each command
  const commands: ResolvedCommand[] = commandNodeIds.map((cmdNodeId) => {
    const cmdNode = nodeMap.get(cmdNodeId)!
    const cmdData = cmdNode.data as CommandNodeData

    // Initialize with global variables (acting as fallbacks)
    const variableValues: Record<string, string> = { ...globalVariables }
    
    // Find variable edges targeting this command node and overwrite globals if present
    for (const edge of edges) {
      if (
        edge.type === EDGE_TYPES.VARIABLE &&
        edge.target === cmdNodeId &&
        edge.targetHandle
      ) {
        // targetHandle is `var-{varName}`
        const varName = edge.targetHandle.replace(/^var-/, '')
        const sourceNode = nodeMap.get(edge.source)
        if (sourceNode && sourceNode.type === NODE_TYPES.VARIABLE) {
          const varData = sourceNode.data as VariableNodeData
          variableValues[varName] = varData.value
        }
      }
    }

    return {
      nodeId: cmdNodeId,
      label: cmdData.label,
      originalCommand: cmdData.command,
      resolvedCommand: substituteVariables(cmdData.command, variableValues),
    }
  })

  return {
    terminalNodeId,
    terminalId: termData.terminalId,
    terminalSessionId: termData.terminalSessionId ?? termData.terminalId,
    terminalLabel: termData.label,
    terminalType: isSshTerminal ? 'ssh' : 'local',
    sshConnectionId: isSshTerminal ? (termData as SshTerminalNodeData).connectionId : null,
    sshConnectionName: selectedSshConnection
      ? `${selectedSshConnection.username}@${selectedSshConnection.host}`
      : null,
    sshHost: isSshTerminal
      ? (selectedSshConnection?.host ?? sshNodeData?.sshHost ?? null)
      : null,
    sshUsername: isSshTerminal
      ? (selectedSshConnection?.username ?? sshNodeData?.sshUsername ?? null)
      : null,
    sshPassword: isSshTerminal
      ? (selectedSshConnection?.password ?? sshNodeData?.sshPassword ?? null)
      : null,
    sshCommand: isSshTerminal
      ? substituteVariables(sshNodeData?.sshCommand?.trim() || DEFAULT_SSH_COMMAND_TEMPLATE, {
          username: selectedSshConnection?.username ?? sshNodeData?.sshUsername ?? '',
          host: selectedSshConnection?.host ?? sshNodeData?.sshHost ?? '',
        })
      : null,
    commands,
  }
}

/**
 * Find all Terminal nodes in the graph and resolve their chains.
 */
export function resolveAllChains(
  nodes: GraphNode[],
  edges: GraphEdge[],
  globalVariables: Record<string, string> = {},
  sshConnections: SshConnectionVariable[] = [],
): ResolvedChain[] {
  return nodes
    .filter((n) => n.type === NODE_TYPES.TERMINAL || n.type === NODE_TYPES.SSH_TERMINAL)
    .map((n) => resolveChain(n.id, nodes, edges, globalVariables, sshConnections))
}
