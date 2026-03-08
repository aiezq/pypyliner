import {
  NODE_TYPES,
  EDGE_TYPES,
  HANDLE_IDS,
  type GraphNode,
  type GraphEdge,
  type CommandNodeData,
  type VariableNodeData,
  type TerminalNodeData,
} from '../types'
import { substituteVariables } from './variableParser'

export interface ResolvedChain {
  terminalNodeId: string
  terminalId: string | null
  terminalLabel: string
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
): ResolvedChain {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const terminalNode = nodeMap.get(terminalNodeId)

  if (!terminalNode || terminalNode.type !== NODE_TYPES.TERMINAL) {
    throw new Error(`Node ${terminalNodeId} is not a terminal node`)
  }

  const termData = terminalNode.data as TerminalNodeData

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
    terminalLabel: termData.label,
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
): ResolvedChain[] {
  return nodes
    .filter((n) => n.type === NODE_TYPES.TERMINAL)
    .map((n) => resolveChain(n.id, nodes, edges, globalVariables))
}
