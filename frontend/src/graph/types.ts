import type { Node, Edge } from '@xyflow/react'
import type { SequenceStatus, SshConnectionVariable } from '../types'

// ── Node type identifiers ──────────────────────────────────────────

export const NODE_TYPES = {
  COMMAND: 'command',
  VARIABLE: 'variable',
  TERMINAL: 'terminal',
  SSH_TERMINAL: 'ssh-terminal',
  SEQUENCE: 'sequence',
  GROUP: 'group',
} as const

export type NodeType = (typeof NODE_TYPES)[keyof typeof NODE_TYPES]

// ── Edge type identifiers ──────────────────────────────────────────

export const EDGE_TYPES = {
  CHAIN: 'chain',
  VARIABLE: 'variable',
  SEQUENCE: 'sequence',
} as const

export const DEFAULT_SSH_COMMAND_TEMPLATE = 'ssh -tt {username}@{host}'

export type EdgeType = (typeof EDGE_TYPES)[keyof typeof EDGE_TYPES]

// ── Handle ID conventions ──────────────────────────────────────────

export const HANDLE_IDS = {
  CHAIN_IN: 'chain-in',
  CHAIN_OUT: 'chain-out',
  VARIABLE_OUT: 'variable-out',
  SEQUENCE_OUT: 'sequence-out',
  sequenceIn: (index: number) => `seq-in-${index}`,
  variableIn: (varName: string) => `var-${varName}`,
} as const

// ── Node data payloads ─────────────────────────────────────────────

export interface CommandNodeData {
  label: string
  command: string
  description: string
  /** Auto-parsed from command template {var} placeholders */
  variableNames: string[]
  [key: string]: unknown
}

export interface VariableNodeData {
  label: string
  value: string
  [key: string]: unknown
}

export interface TerminalNodeData {
  label: string
  terminalId: string | null
  terminalSessionId?: string | null
  [key: string]: unknown
}

export interface SshTerminalNodeData {
  label: string
  terminalId: string | null
  terminalSessionId?: string | null
  connectionId: string | null
  sshUsername: string
  sshHost: string
  sshPassword: string
  sshCommand: string
  [key: string]: unknown
}

export interface SequenceNodeData {
  label: string
  sequenceId?: string | null
  status?: SequenceStatus | null
  currentTerminalIndex?: number | null
  finishedAt?: string | null
  [key: string]: unknown
}

export interface GroupPresetData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  [key: string]: unknown
}

// ── Typed node aliases ─────────────────────────────────────────────

export type CommandNode = Node<CommandNodeData, typeof NODE_TYPES.COMMAND>
export type VariableNode = Node<VariableNodeData, typeof NODE_TYPES.VARIABLE>
export type TerminalNode = Node<TerminalNodeData, typeof NODE_TYPES.TERMINAL>
export type SshTerminalNode = Node<SshTerminalNodeData, typeof NODE_TYPES.SSH_TERMINAL>
export type SequenceNode = Node<SequenceNodeData, typeof NODE_TYPES.SEQUENCE>

export type GraphNode = CommandNode | VariableNode | TerminalNode | SshTerminalNode | SequenceNode

// ── Typed edge aliases ─────────────────────────────────────────────

export type ChainEdge = Edge & { type: typeof EDGE_TYPES.CHAIN }
export type VariableEdge = Edge & { type: typeof EDGE_TYPES.VARIABLE }
export type SequenceEdge = Edge & { type: typeof EDGE_TYPES.SEQUENCE }

export type GraphEdge = ChainEdge | VariableEdge | SequenceEdge

// ── Serialisation (for save/load graph) ────────────────────────────

export interface SerializedGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  viewport: { x: number; y: number; zoom: number }
  globalVariables: Record<string, string>
  sshConnections: SshConnectionVariable[]
}

// ── Presets ────────────────────────────────────────────────────────

export interface NodePreset {
  id: string
  nodeType: NodeType
  label: string
  data:
    | CommandNodeData
    | VariableNodeData
    | TerminalNodeData
    | SshTerminalNodeData
    | SequenceNodeData
    | GroupPresetData
  collection: string // '' = uncategorized
}

export interface PresetCollection {
  name: string
  presets: NodePreset[]
}
