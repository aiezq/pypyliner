import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type Viewport,
} from '@xyflow/react'

import {
  NODE_TYPES,
  EDGE_TYPES,
  HANDLE_IDS,
  type GraphNode,
  type GraphEdge,
  type CommandNodeData,
  type VariableNodeData,
  type TerminalNodeData,
  type SshTerminalNodeData,
  type SequenceNodeData,
  type SerializedGraph,
} from '../types'
import type { PipelineDraft } from '../../lib/schemas'
import type { SessionStatus, SshConnectionVariable } from '../../types'
import { parseVariables } from '../utils/variableParser'

// ── Helpers ────────────────────────────────────────────────────────

let nodeIdCounter = 0
const nextNodeId = () => `node-${++nodeIdCounter}`
const nextEdgeId = () => `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// ── Store interface ────────────────────────────────────────────────

interface GraphState {
  nodes: GraphNode[]
  edges: GraphEdge[]
  viewport: Viewport
  activeTerminalIds: string[]
  terminalStatuses: Record<string, SessionStatus>
  globalVariables: Record<string, string>
  sshConnections: SshConnectionVariable[]

  // React Flow callbacks
  onNodesChange: (changes: NodeChange<GraphNode>[]) => void
  onEdgesChange: (changes: EdgeChange<GraphEdge>[]) => void
  onConnect: (connection: Connection) => void
  setViewport: (viewport: Viewport) => void
  setActiveTerminalIds: (ids: string[]) => void
  setTerminalStatuses: (statuses: Record<string, SessionStatus>) => void
  setGlobalVariable: (key: string, value: string) => void
  deleteGlobalVariable: (key: string) => void
  saveSshConnection: (connection: Omit<SshConnectionVariable, 'id'> & { id?: string }) => string
  deleteSshConnection: (connectionId: string) => void

  // Node CRUD
  addCommandNode: (position: { x: number; y: number }, data?: Partial<CommandNodeData>) => string
  addVariableNode: (position: { x: number; y: number }, data?: Partial<VariableNodeData>) => string
  addTerminalNode: (position: { x: number; y: number }, data?: Partial<TerminalNodeData>) => string
  addSshTerminalNode: (position: { x: number; y: number }, data?: Partial<SshTerminalNodeData>) => string
  addSequenceNode: (position: { x: number; y: number }, data?: Partial<SequenceNodeData>) => string
  updateNodeData: <T extends Record<string, unknown>>(nodeId: string, data: Partial<T>) => void
  deleteNode: (nodeId: string) => void
  deleteNodes: (nodeIds: string[]) => void
  deleteEdge: (edgeId: string) => void
  addNodesAndEdges: (nodes: GraphNode[], edges: GraphEdge[]) => void
  importPipelineDraft: (draft: PipelineDraft) => void

  // Serialization
  serialize: () => SerializedGraph
  deserialize: (graph: SerializedGraph) => void
  clear: () => void
}

// ── Connection validator ───────────────────────────────────────────

function inferEdgeType(connection: Connection): EdgeType | null {
  const { sourceHandle, targetHandle } = connection
  if (!sourceHandle || !targetHandle) return null

  // chain-out → chain-in
  if (sourceHandle === HANDLE_IDS.CHAIN_OUT && targetHandle === HANDLE_IDS.CHAIN_IN) {
    return EDGE_TYPES.CHAIN
  }

  // sequence-out → seq-in-{n}
  if (sourceHandle === HANDLE_IDS.SEQUENCE_OUT && targetHandle.startsWith('seq-in-')) {
    return EDGE_TYPES.SEQUENCE
  }

  // variable-out → var-{name}
  if (sourceHandle === HANDLE_IDS.VARIABLE_OUT && targetHandle.startsWith('var-')) {
    return EDGE_TYPES.VARIABLE
  }

  return null
}

type EdgeType = (typeof EDGE_TYPES)[keyof typeof EDGE_TYPES]

function getImportAnchor(nodes: GraphNode[]): { x: number; y: number } {
  if (nodes.length === 0) {
    return { x: 80, y: 120 }
  }

  const maxX = nodes.reduce((value, node) => Math.max(value, node.position.x), 0)
  const maxY = nodes.reduce((value, node) => Math.max(value, node.position.y), 0)
  return { x: maxX + 180, y: maxY + 140 }
}

function parseSshConnectionHint(connectionHint: string | null): {
  label: string
  sshUsername: string
  sshHost: string
} {
  const trimmed = connectionHint?.trim() ?? ''
  if (!trimmed) {
    return {
      label: 'SSH Terminal',
      sshUsername: '',
      sshHost: '',
    }
  }

  const match = /^([^@\s]+)@(.+)$/.exec(trimmed)
  if (match) {
    return {
      label: `SSH ${trimmed}`,
      sshUsername: match[1],
      sshHost: match[2],
    }
  }

  return {
    label: `SSH ${trimmed}`,
    sshUsername: '',
    sshHost: trimmed,
  }
}

// ── Store ──────────────────────────────────────────────────────────

export const useGraphStore = create<GraphState>()(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      activeTerminalIds: [],
      terminalStatuses: {},
      globalVariables: {},
      sshConnections: [],

      onNodesChange: (changes) => {
        set((state) => ({
          nodes: applyNodeChanges(changes, state.nodes) as GraphNode[],
        }))
      },

      onEdgesChange: (changes) => {
        set((state) => ({
          edges: applyEdgeChanges(changes, state.edges) as GraphEdge[],
        }))
      },

      onConnect: (connection) => {
        const edgeType = inferEdgeType(connection)
        if (!edgeType) return

        // Prevent duplicate connections to the same target handle
        const exists = get().edges.some(
          (e) =>
            e.target === connection.target &&
            e.targetHandle === connection.targetHandle,
        )
        if (exists) return

        // For chain-in, only allow one incoming chain connection
        if (edgeType === EDGE_TYPES.CHAIN) {
          const hasChainIn = get().edges.some(
            (e) =>
              e.type === EDGE_TYPES.CHAIN &&
              e.target === connection.target,
          )
          if (hasChainIn) return
        }

        const newEdge: GraphEdge = {
          id: nextEdgeId(),
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
          type: edgeType,
        } as GraphEdge

        set((state) => ({ edges: [...state.edges, newEdge] }))
      },

      setViewport: (viewport) => set({ viewport }),

      setActiveTerminalIds: (ids) => set({ activeTerminalIds: ids }),
      
      setTerminalStatuses: (statuses) => set({ terminalStatuses: statuses }),

      setGlobalVariable: (key, value) => {
        set((state) => ({
          globalVariables: { ...state.globalVariables, [key]: value },
        }))
      },

      deleteGlobalVariable: (key) => {
        set((state) => {
          const next = { ...state.globalVariables }
          delete next[key]
          return { globalVariables: next }
        })
      },

      saveSshConnection: (connection) => {
        const connectionId = connection.id ?? `ssh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
        set((state) => {
          const existingIndex = state.sshConnections.findIndex((item) => item.id === connectionId)
          const nextConnection: SshConnectionVariable = {
            id: connectionId,
            username: connection.username,
            host: connection.host,
            password: connection.password,
          }

          if (existingIndex === -1) {
            return { sshConnections: [...state.sshConnections, nextConnection] }
          }

          const nextConnections = [...state.sshConnections]
          nextConnections[existingIndex] = nextConnection
          return { sshConnections: nextConnections }
        })
        return connectionId
      },

      deleteSshConnection: (connectionId) => {
        set((state) => ({
          sshConnections: state.sshConnections.filter((connection) => connection.id !== connectionId),
          nodes: state.nodes.map((node) => {
            if (
              node.type === NODE_TYPES.SSH_TERMINAL &&
              node.data.connectionId === connectionId
            ) {
              return {
                ...node,
                data: {
                  ...node.data,
                  connectionId: null,
                  terminalId: null,
                },
              }
            }
            return node
          }) as GraphNode[],
        }))
      },

      addCommandNode: (position, data) => {
        const id = nextNodeId()
        const command = data?.command ?? ''
        const variableNames = parseVariables(command)

        const node: GraphNode = {
          id,
          type: NODE_TYPES.COMMAND,
          position,
          data: {
            label: data?.label ?? 'New Command',
            command,
            description: data?.description ?? '',
            variableNames,
          },
        }

        set((state) => ({ nodes: [...state.nodes, node] }))
        return id
      },

      addVariableNode: (position, data) => {
        const id = nextNodeId()

        const node: GraphNode = {
          id,
          type: NODE_TYPES.VARIABLE,
          position,
          data: {
            label: data?.label ?? 'variable',
            value: data?.value ?? '',
          },
        }

        set((state) => ({ nodes: [...state.nodes, node] }))
        return id
      },

      addTerminalNode: (position, data) => {
        const id = nextNodeId()

        const node: GraphNode = {
          id,
          type: NODE_TYPES.TERMINAL,
          position,
          data: {
            label: data?.label ?? 'Terminal',
            terminalId: data?.terminalId ?? null,
          },
        }

        set((state) => ({ nodes: [...state.nodes, node] }))
        return id
      },

      addSshTerminalNode: (position, data) => {
        const id = nextNodeId()

        const node: GraphNode = {
          id,
          type: NODE_TYPES.SSH_TERMINAL,
          position,
          data: {
            label: data?.label ?? 'SSH Terminal',
            terminalId: data?.terminalId ?? null,
            connectionId: data?.connectionId ?? null,
            sshUsername: data?.sshUsername ?? '',
            sshHost: data?.sshHost ?? '',
            sshPassword: data?.sshPassword ?? '',
          },
        }

        set((state) => ({ nodes: [...state.nodes, node] }))
        return id
      },

      addSequenceNode: (position, data) => {
        const id = nextNodeId()

        const node: GraphNode = {
          id,
          type: NODE_TYPES.SEQUENCE,
          position,
          data: {
            label: data?.label ?? 'Sequence',
          },
        }

        set((state) => ({ nodes: [...state.nodes, node] }))
        return id
      },

      updateNodeData: (nodeId, data) => {
        set((state) => ({
          nodes: state.nodes.map((node) => {
            if (node.id !== nodeId) return node

            const merged = { ...node.data, ...data }

            // If command changed on a command node, re-parse variables
            if (
              node.type === NODE_TYPES.COMMAND &&
              'command' in data &&
              typeof data.command === 'string'
            ) {
              ;(merged as CommandNodeData).variableNames = parseVariables(data.command)
            }

            return { ...node, data: merged }
          }) as GraphNode[],
        }))
      },

      deleteNode: (nodeId) => {
        set((state) => ({
          nodes: state.nodes.filter((n) => n.id !== nodeId),
          edges: state.edges.filter(
            (e) => e.source !== nodeId && e.target !== nodeId,
          ),
        }))
      },

      deleteNodes: (nodeIds) => {
        const idSet = new Set(nodeIds)
        set((state) => ({
          nodes: state.nodes.filter((n) => !idSet.has(n.id)),
          edges: state.edges.filter(
            (e) => !idSet.has(e.source) && !idSet.has(e.target),
          ),
        }))
      },

      deleteEdge: (edgeId) => {
        set((state) => ({
          edges: state.edges.filter((e) => e.id !== edgeId),
        }))
      },

      addNodesAndEdges: (newNodes, newEdges) => {
        set((state) => ({
          nodes: [...state.nodes, ...newNodes],
          edges: [...state.edges, ...newEdges],
        }))
      },

      importPipelineDraft: (draft) => {
        const currentNodes = get().nodes
        const anchor = getImportAnchor(currentNodes)
        const newNodes: GraphNode[] = []
        const newEdges: GraphEdge[] = []
        const commandNodeIds: string[] = []

        const referencedVariables = new Set<string>()
        for (const step of draft.steps) {
          for (const variableName of step.uses_variables) {
            if (variableName.trim()) {
              referencedVariables.add(variableName.trim())
            }
          }
          for (const variableName of parseVariables(step.command)) {
            referencedVariables.add(variableName)
          }
        }

        const variableOrder = Array.from(
          new Set([
            ...draft.variables.map((variable) => variable.name),
            ...Array.from(referencedVariables),
          ]),
        )
        const variableMap = new Map(draft.variables.map((variable) => [variable.name, variable]))
        const variableNodeIds = new Map<string, string>()

        variableOrder.forEach((variableName, index) => {
          const variable = variableMap.get(variableName)
          const nodeId = nextNodeId()
          variableNodeIds.set(variableName, nodeId)
          newNodes.push({
            id: nodeId,
            type: NODE_TYPES.VARIABLE,
            position: {
              x: anchor.x + index * 220,
              y: anchor.y - 220,
            },
            data: {
              label: variableName,
              value: variable?.default_value ?? '',
            },
          })
        })

        draft.steps.forEach((step, index) => {
          const nodeId = nextNodeId()
          commandNodeIds.push(nodeId)
          newNodes.push({
            id: nodeId,
            type: NODE_TYPES.COMMAND,
            position: {
              x: anchor.x + index * 300,
              y: anchor.y,
            },
            data: {
              label: step.label,
              command: step.command,
              description: step.description,
              variableNames: parseVariables(step.command),
            },
          })
        })

        const terminalNodeId = nextNodeId()
        if (draft.target_terminal.type === 'ssh') {
          const connectionDetails = parseSshConnectionHint(draft.target_terminal.connection_hint)
          newNodes.push({
            id: terminalNodeId,
            type: NODE_TYPES.SSH_TERMINAL,
            position: {
              x: anchor.x + Math.max(draft.steps.length - 1, 0) * 300 + 320,
              y: anchor.y,
            },
            data: {
              label: connectionDetails.label,
              terminalId: null,
              connectionId: null,
              sshUsername: connectionDetails.sshUsername,
              sshHost: connectionDetails.sshHost,
              sshPassword: '',
            },
          })
        } else {
          newNodes.push({
            id: terminalNodeId,
            type: NODE_TYPES.TERMINAL,
            position: {
              x: anchor.x + Math.max(draft.steps.length - 1, 0) * 300 + 320,
              y: anchor.y,
            },
            data: {
              label: draft.flow_name || 'Generated Terminal',
              terminalId: null,
            },
          })
        }

        commandNodeIds.forEach((nodeId, index) => {
          const nextTargetId = commandNodeIds[index + 1] ?? terminalNodeId
          newEdges.push({
            id: nextEdgeId(),
            source: nodeId,
            target: nextTargetId,
            sourceHandle: HANDLE_IDS.CHAIN_OUT,
            targetHandle: HANDLE_IDS.CHAIN_IN,
            type: EDGE_TYPES.CHAIN,
          } as GraphEdge)
        })

        draft.steps.forEach((step, index) => {
          const commandNodeId = commandNodeIds[index]
          const variableNames = Array.from(
            new Set([...step.uses_variables, ...parseVariables(step.command)]),
          )
          variableNames.forEach((variableName) => {
            const variableNodeId = variableNodeIds.get(variableName)
            if (!variableNodeId) {
              return
            }
            newEdges.push({
              id: nextEdgeId(),
              source: variableNodeId,
              target: commandNodeId,
              sourceHandle: HANDLE_IDS.VARIABLE_OUT,
              targetHandle: HANDLE_IDS.variableIn(variableName),
              type: EDGE_TYPES.VARIABLE,
            } as GraphEdge)
          })
        })

        get().addNodesAndEdges(newNodes, newEdges)
      },

      serialize: () => {
        const { nodes, edges, viewport, globalVariables, sshConnections } = get()
        return { nodes, edges, viewport, globalVariables, sshConnections }
      },

      deserialize: (graph) => {
        // Restore counter to avoid ID collisions
        const maxNum = graph.nodes.reduce((max, n) => {
          const num = parseInt(n.id.replace('node-', ''), 10)
          return isNaN(num) ? max : Math.max(max, num)
        }, 0)
        nodeIdCounter = maxNum

        set({
          nodes: graph.nodes,
          edges: graph.edges,
          viewport: graph.viewport,
          globalVariables: graph.globalVariables,
          sshConnections: graph.sshConnections ?? [],
        })
      },

      clear: () => {
        nodeIdCounter = 0
        set({
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
          globalVariables: {},
          sshConnections: [],
        })
      },
    }),
    {
      name: 'graph-editor-state',
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        viewport: state.viewport,
        globalVariables: state.globalVariables,
        sshConnections: state.sshConnections,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          const maxNum = state.nodes.reduce((max, n) => {
            const num = parseInt(n.id.replace('node-', ''), 10)
            return isNaN(num) ? max : Math.max(max, num)
          }, 0)
          nodeIdCounter = maxNum
        }
      },
    }
  )
)
