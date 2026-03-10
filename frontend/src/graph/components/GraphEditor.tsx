import { useCallback, useMemo } from 'react'
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    BackgroundVariant,
    type NodeTypes,
    type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { NODE_TYPES } from '../types'
import { useGraphStore } from '../store/graphStore'
import { useContextMenu } from '../hooks/useContextMenu'
import CommandNode from './nodes/CommandNode'
import VariableNode from './nodes/VariableNode'
import TerminalNode from './nodes/TerminalNode'
import SshTerminalNode from './nodes/SshTerminalNode'
import SequenceNode from './nodes/SequenceNode'
import ContextMenu from './ContextMenu'
import GlobalVariablesWidget from './GlobalVariablesWidget'
import styles from './GraphEditor.module.scss'
import { useI18n } from '../../i18n/I18nProvider'

const nodeTypes: NodeTypes = {
    [NODE_TYPES.COMMAND]: CommandNode,
    [NODE_TYPES.VARIABLE]: VariableNode,
    [NODE_TYPES.TERMINAL]: TerminalNode,
    [NODE_TYPES.SSH_TERMINAL]: SshTerminalNode,
    [NODE_TYPES.SEQUENCE]: SequenceNode,
}

const defaultEdgeOptions = {
    animated: true,
    style: { strokeWidth: 2 },
}

export default function GraphEditor() {
    const { messages } = useI18n()
    const nodes = useGraphStore((s) => s.nodes)
    const edges = useGraphStore((s) => s.edges)
    const onNodesChange = useGraphStore((s) => s.onNodesChange)
    const onEdgesChange = useGraphStore((s) => s.onEdgesChange)
    const onConnect = useGraphStore((s) => s.onConnect)
    const setViewport = useGraphStore((s) => s.setViewport)
    const deleteNodes = useGraphStore((s) => s.deleteNodes)
    const deleteEdge = useGraphStore((s) => s.deleteEdge)
    const insertNodeIntoIntersectedChain = useGraphStore((s) => s.insertNodeIntoIntersectedChain)

    // Get the initial viewport from the store (which includes persisted localStorage state)
    // We use useMemo to ensure it's only evaluated once on mount.
    const initialViewport = useMemo(() => useGraphStore.getState().viewport, [])

    const { menu, openCanvasMenu, openNodeMenu, openSelectionMenu, openEdgeMenu, closeMenu } = useContextMenu()

    // Right-click on empty canvas
    const handleContextMenu = useCallback(
        (event: React.MouseEvent | MouseEvent) => {
            event.preventDefault()

            const pane = (event.target as HTMLElement).closest('.react-flow')
            if (!pane) return

            const bounds = pane.getBoundingClientRect()
            const { viewport } = useGraphStore.getState()

            const canvasX = (event.clientX - bounds.left - viewport.x) / viewport.zoom
            const canvasY = (event.clientY - bounds.top - viewport.y) / viewport.zoom

            openCanvasMenu(
                { x: event.clientX, y: event.clientY },
                { x: canvasX, y: canvasY },
            )
        },
        [openCanvasMenu],
    )

    // Right-click on a node
    const handleNodeContextMenu: NodeMouseHandler = useCallback(
        (event, node) => {
            event.preventDefault()
            const { nodes } = useGraphStore.getState()

            // If the right-clicked node is part of a multi-selection, open the selection menu instead
            const selected = nodes.filter((n) => n.selected)
            if (selected.length > 1 && selected.some((n) => n.id === node.id)) {
                openSelectionMenu(
                    { x: event.clientX, y: event.clientY },
                    selected.map((n) => n.id)
                )
                return
            }

            openNodeMenu(
                { x: event.clientX, y: event.clientY },
                node.id,
            )
        },
        [openNodeMenu, openSelectionMenu]
    )

    // Right-click on a selection (if clicked exactly on the selection box or node inside it)
    const handleSelectionContextMenu = useCallback(
        (event: React.MouseEvent, selectedNodes: import('@xyflow/react').Node[]) => {
            event.preventDefault()
            openSelectionMenu(
                { x: event.clientX, y: event.clientY },
                selectedNodes.map((n) => n.id)
            )
        },
        [openSelectionMenu]
    )

    // Right-click on an edge
    const handleEdgeContextMenu = useCallback(
        (event: React.MouseEvent, edge: import('@xyflow/react').Edge) => {
            event.preventDefault()
            openEdgeMenu(
                { x: event.clientX, y: event.clientY },
                edge.id
            )
        },
        [openEdgeMenu]
    )

    const handlePaneClick = useCallback(() => {
        closeMenu()
    }, [closeMenu])

    const handleMoveEnd = useCallback(
        (_event: unknown, viewport: { x: number; y: number; zoom: number }) => {
            setViewport(viewport)
        },
        [setViewport],
    )

    const handleNodeDragStop = useCallback(
        (_event: React.MouseEvent | MouseEvent, node: import('@xyflow/react').Node) => {
            insertNodeIntoIntersectedChain(node.id)
        },
        [insertNodeIntoIntersectedChain],
    )

    const handleBeforeDelete = useCallback(
        async ({
            nodes: nodesToDelete,
            edges: edgesToDelete,
        }: {
            nodes: import('@xyflow/react').Node[]
            edges: import('@xyflow/react').Edge[]
        }) => {
            const nodeIds = new Set(nodesToDelete.map((node) => node.id))

            if (nodeIds.size > 0) {
                deleteNodes(Array.from(nodeIds))
            }

            for (const edge of edgesToDelete) {
                if (nodeIds.has(edge.source) || nodeIds.has(edge.target)) {
                    continue
                }

                deleteEdge(edge.id)
            }

            return false
        },
        [deleteEdge, deleteNodes],
    )

    const isEmpty = nodes.length === 0

    return (
        <div className={styles.graphEditorWrap}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onPaneContextMenu={handleContextMenu}
                onNodeContextMenu={handleNodeContextMenu}
                onSelectionContextMenu={handleSelectionContextMenu}
                onEdgeContextMenu={handleEdgeContextMenu}
                onPaneClick={handlePaneClick}
                onMoveEnd={handleMoveEnd}
                onNodeDragStop={handleNodeDragStop}
                onBeforeDelete={handleBeforeDelete}
                nodeTypes={nodeTypes}
                defaultEdgeOptions={defaultEdgeOptions}
                fitView={false}
                snapToGrid
                snapGrid={[16, 16]}
                defaultViewport={initialViewport}
                deleteKeyCode={['Backspace', 'Delete']}
                multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
                minZoom={0.15}
                maxZoom={2.5}
                proOptions={{ hideAttribution: true }}
            >
                <Background
                    variant={BackgroundVariant.Dots}
                    gap={20}
                    size={1}
                    color="rgba(110, 146, 199, 0.15)"
                />
                <Controls showInteractive={false} />
                <MiniMap
                    nodeColor={(node) => {
                        switch (node.type) {
                            case NODE_TYPES.COMMAND:
                                return 'rgba(52, 180, 255, 0.5)'
                            case NODE_TYPES.VARIABLE:
                                return 'rgba(200, 140, 255, 0.5)'
                            case NODE_TYPES.TERMINAL:
                                return 'rgba(96, 224, 175, 0.5)'
                            case NODE_TYPES.SSH_TERMINAL:
                                return 'rgba(112, 187, 255, 0.55)'
                            case NODE_TYPES.SEQUENCE:
                                return 'rgba(243, 179, 94, 0.5)'
                            default:
                                return 'rgba(150, 150, 150, 0.5)'
                        }
                    }}
                    maskColor="rgba(2, 6, 14, 0.8)"
                    pannable
                    zoomable
                />
            </ReactFlow>

            <GlobalVariablesWidget />

            <ContextMenu menu={menu} onClose={closeMenu} />

            {isEmpty && (
                <div className={styles.emptyHint}>
                    {messages.graph.emptyHint}
                    <br />
                    <span className={styles.emptyHintKey}>Right Click</span> → {messages.graph.emptyHintAction}
                </div>
            )}
        </div>
    )
}
