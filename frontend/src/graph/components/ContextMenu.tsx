import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGraphStore } from '../store/graphStore'
import { usePresetsStore, deriveCollections } from '../store/presetsStore'
import type { ContextMenuState } from '../hooks/useContextMenu'
import type {
    NodePreset,
    CommandNodeData,
    VariableNodeData,
    TerminalNodeData,
    SshTerminalNodeData,
    GroupPresetData,
} from '../types'
import { NODE_TYPES } from '../types'
import styles from './ContextMenu.module.scss'
import { useI18n } from '../../i18n/I18nProvider'

interface ContextMenuProps {
    menu: ContextMenuState
    onClose: () => void
}

export default function ContextMenu({ menu, onClose }: ContextMenuProps) {
    const { messages } = useI18n()
    const addCommandNode = useGraphStore((s) => s.addCommandNode)
    const addVariableNode = useGraphStore((s) => s.addVariableNode)
    const addTerminalNode = useGraphStore((s) => s.addTerminalNode)
    const addSshTerminalNode = useGraphStore((s) => s.addSshTerminalNode)
    const addSequenceNode = useGraphStore((s) => s.addSequenceNode)
    const switchTerminalNodeType = useGraphStore((s) => s.switchTerminalNodeType)
    const deleteNode = useGraphStore((s) => s.deleteNode)
    const deleteNodes = useGraphStore((s) => s.deleteNodes)
    const deleteEdge = useGraphStore((s) => s.deleteEdge)
    const addNodesAndEdges = useGraphStore((s) => s.addNodesAndEdges)
    const nodes = useGraphStore((s) => s.nodes)
    const edges = useGraphStore((s) => s.edges)

    const addPreset = usePresetsStore((s) => s.addPreset)
    const presets = usePresetsStore((s) => s.presets)
    const { collections, uncategorized } = useMemo(() => deriveCollections(presets), [presets])

    const ref = useRef<HTMLDivElement>(null)
    const [presetsExpanded, setPresetsExpanded] = useState(false)
    const [saveDialogOpen, setSaveDialogOpen] = useState(false)
    const [saveIndividualDialogOpen, setSaveIndividualDialogOpen] = useState(false)
    const [saveCollection, setSaveCollection] = useState('')
    const [saveName, setSaveName] = useState('')

    const resetMenuState = useCallback(() => {
        setPresetsExpanded(false)
        setSaveDialogOpen(false)
        setSaveIndividualDialogOpen(false)
        setSaveCollection('')
        setSaveName('')
    }, [])

    const closeMenu = useCallback(() => {
        resetMenuState()
        onClose()
    }, [onClose, resetMenuState])

    // Close on click outside
    useEffect(() => {
        if (!menu.isOpen) return

            const handleClick = (e: MouseEvent) => {
                if (ref.current && !ref.current.contains(e.target as Node)) {
                    closeMenu()
                }
            }

            const handleEsc = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    if (saveDialogOpen) {
                        setSaveDialogOpen(false)
                    } else {
                        closeMenu()
                    }
                }
            }

        document.addEventListener('mousedown', handleClick)
        document.addEventListener('keydown', handleEsc)
        return () => {
            document.removeEventListener('mousedown', handleClick)
            document.removeEventListener('keydown', handleEsc)
        }
    }, [closeMenu, menu.isOpen, saveDialogOpen])

    if (!menu.isOpen) return null

    const pos = { x: menu.canvasX, y: menu.canvasY }
    const targetNode = menu.nodeId ? nodes.find((n) => n.id === menu.nodeId) : null
    const canSwitchTerminalType =
        targetNode?.type === NODE_TYPES.TERMINAL || targetNode?.type === NODE_TYPES.SSH_TERMINAL

    // ── Spawn a preset as a new node ──
    const spawnPreset = (preset: NodePreset) => {
        switch (preset.nodeType) {
            case NODE_TYPES.COMMAND:
                addCommandNode(pos, preset.data as CommandNodeData)
                break
            case NODE_TYPES.VARIABLE:
                addVariableNode(pos, preset.data as VariableNodeData)
                break
            case NODE_TYPES.TERMINAL:
                addTerminalNode(pos, preset.data as TerminalNodeData)
                break
            case NODE_TYPES.SSH_TERMINAL:
                addSshTerminalNode(pos, preset.data as SshTerminalNodeData)
                break
            case NODE_TYPES.GROUP: {
                const groupData = preset.data as GroupPresetData
                if (!groupData.nodes || !groupData.edges) break

                // Calculate bounding box center of the saved nodes to offset correctly
                if (groupData.nodes.length === 0) break
                const minX = Math.min(...groupData.nodes.map(n => n.position.x))
                const minY = Math.min(...groupData.nodes.map(n => n.position.y))

                const newNodes: typeof nodes = []
                const newEdges: typeof edges = []
                const idMap = new Map<string, string>()

                // Create new nodes with offset positions and new IDs
                for (const node of groupData.nodes) {
                    const newId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
                    idMap.set(node.id, newId)
                    newNodes.push({
                        ...node,
                        id: newId,
                        position: {
                            x: pos.x + (node.position.x - minX),
                            y: pos.y + (node.position.y - minY)
                        }
                    })
                }

                // Create new edges re-mapping their source and target to the new node IDs
                for (const edge of groupData.edges) {
                    const newSource = idMap.get(edge.source)
                    const newTarget = idMap.get(edge.target)
                    if (newSource && newTarget) {
                        newEdges.push({
                            ...edge,
                            id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                            source: newSource,
                            target: newTarget
                        })
                    }
                }

                addNodesAndEdges(newNodes, newEdges)
                break
            }
        }
        closeMenu()
    }

    // ── Save node as preset ──
    const handleSavePreset = () => {
        if (menu.mode === 'selection' && menu.selectedNodeIds.length > 0) {
            const selectedNodes = nodes.filter(n => menu.selectedNodeIds.includes(n.id))
            const selectedNodeIdsSet = new Set(menu.selectedNodeIds)
            const internalEdges = edges.filter(
                e => selectedNodeIdsSet.has(e.source) && selectedNodeIdsSet.has(e.target)
            )

            addPreset({
                nodeType: NODE_TYPES.GROUP,
                label: saveName.trim() || messages.graph.groupOfNodes(selectedNodes.length),
                data: {
                    nodes: selectedNodes,
                    edges: internalEdges
                },
                collection: saveCollection.trim(),
            })
        } else if (targetNode) {
            const nodeType = targetNode.type as typeof NODE_TYPES[keyof typeof NODE_TYPES]

            addPreset({
                nodeType,
                label: (targetNode.data as { label: string }).label,
                data: { ...targetNode.data } as CommandNodeData | VariableNodeData | TerminalNodeData | SshTerminalNodeData,
                collection: saveCollection.trim(),
            })
        }

        setSaveDialogOpen(false)
        setSaveIndividualDialogOpen(false)
        closeMenu()
    }

    // ── Save multiple nodes individually ──
    const handleSaveIndividualPresets = () => {
        if (menu.mode === 'selection' && menu.selectedNodeIds.length > 0) {
            const selectedNodes = nodes.filter(n => menu.selectedNodeIds.includes(n.id))

            for (const node of selectedNodes) {
                const nodeType = node.type as typeof NODE_TYPES[keyof typeof NODE_TYPES]
                addPreset({
                    nodeType,
                    label: (node.data as { label: string }).label,
                    data: { ...node.data } as CommandNodeData | VariableNodeData | TerminalNodeData | SshTerminalNodeData,
                    collection: saveCollection.trim(),
                })
            }
        }
        setSaveIndividualDialogOpen(false)
        closeMenu()
    }

    const hasPresets = collections.length > 0 || uncategorized.length > 0

    const renderSaveDialog = (
        submitText: string,
        placeholder: string,
        onSubmit: () => void,
        onCancel: () => void,
        requireName: boolean = false
    ) => {
        const lowerInput = saveCollection.toLowerCase()
        const suggestedCollections = collections
            .map(c => c.name)
            .filter(name => name.toLowerCase().includes(lowerInput) && name.toLowerCase() !== lowerInput)
            .slice(0, 3)

        return (
            <div className={styles.saveDialog}>
                {requireName && (
                    <>
                        <span className={styles.saveDialogLabel}>{messages.graph.presetNameOptional}</span>
                        <input
                            className={styles.saveDialogInput}
                            value={saveName}
                            onChange={(e) => setSaveName(e.target.value)}
                            placeholder={messages.graph.groupOfNodes(menu.selectedNodeIds.length)}
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') onSubmit()
                            }}
                        />
                    </>
                )}

                <span className={styles.saveDialogLabel}>{messages.graph.collectionOptional}</span>
                <input
                    className={styles.saveDialogInput}
                    value={saveCollection}
                    onChange={(e) => setSaveCollection(e.target.value)}
                    placeholder={placeholder}
                    autoFocus={!requireName}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') onSubmit()
                    }}
                />
                {suggestedCollections.length > 0 && (
                    <div className={styles.suggestionsList}>
                        {suggestedCollections.map(name => (
                            <button
                                key={name}
                                type="button"
                                className={styles.suggestionItem}
                                onClick={() => setSaveCollection(name)}
                            >
                                {name}
                            </button>
                        ))}
                    </div>
                )}
                <div className={styles.saveDialogActions}>
                    <button
                        type="button"
                        className={`${styles.menuItem} ${styles['menuItem--accent']}`}
                        onClick={onSubmit}
                    >
                        ✓ {submitText}
                    </button>
                    <button
                        type="button"
                        className={styles.menuItem}
                        onClick={onCancel}
                    >
                        {messages.graph.cancel}
                    </button>
                </div>
            </div>
        )
    }

    // ── NODE CONTEXT MENU ──
    if (menu.mode === 'node' && targetNode) {
        return (
            <div ref={ref} className={styles.contextMenu} style={{ left: menu.x, top: menu.y }}>
                <div className={styles.menuTitle}>{messages.graph.nodeTitle((targetNode.data as { label: string }).label)}</div>

                {saveDialogOpen ? renderSaveDialog(messages.graph.save, messages.graph.commandsPlaceholder, handleSavePreset, () => setSaveDialogOpen(false)) : (
                    <>
                        <button
                            type="button"
                            className={styles.menuItem}
                            onClick={() => setSaveDialogOpen(true)}
                        >
                            <span className={`${styles.menuItemIcon} ${styles['menuItemIcon--save']}`}>💾</span>
                            {messages.graph.saveAsPreset}
                        </button>

                        {canSwitchTerminalType && (
                            <button
                                type="button"
                                className={styles.menuItem}
                                onClick={() => {
                                    switchTerminalNodeType(targetNode.id)
                                    closeMenu()
                                }}
                            >
                                <span className={`${styles.menuItemIcon} ${styles[targetNode.type === NODE_TYPES.TERMINAL ? 'menuItemIcon--ssh-terminal' : 'menuItemIcon--terminal']}`}>
                                    {targetNode.type === NODE_TYPES.TERMINAL ? '⇄' : '▶'}
                                </span>
                                {targetNode.type === NODE_TYPES.TERMINAL ? messages.graph.switchToSshTerminal : messages.graph.switchToDefaultTerminal}
                            </button>
                        )}

                        <div className={styles.menuDivider} />

                        <button
                            type="button"
                            className={`${styles.menuItem} ${styles['menuItem--danger']}`}
                            onClick={() => {
                                deleteNode(targetNode.id)
                                closeMenu()
                            }}
                        >
                            <span className={`${styles.menuItemIcon} ${styles['menuItemIcon--delete']}`}>✕</span>
                            {messages.graph.deleteNode}
                        </button>
                    </>
                )}
            </div>
        )
    }

    // ── EDGE CONTEXT MENU ──
    if (menu.mode === 'edge' && menu.edgeId) {
        return (
            <div ref={ref} className={styles.contextMenu} style={{ left: menu.x, top: menu.y }}>
                <button
                    type="button"
                    className={`${styles.menuItem} ${styles['menuItem--danger']}`}
                    onClick={() => {
                        deleteEdge(menu.edgeId!)
                        closeMenu()
                    }}
                >
                    <span className={`${styles.menuItemIcon} ${styles['menuItemIcon--delete']}`}>✕</span>
                    {messages.graph.deleteConnection}
                </button>
            </div>
        )
    }

    // ── SELECTION CONTEXT MENU ──
    if (menu.mode === 'selection' && menu.selectedNodeIds.length > 0) {
        return (
            <div ref={ref} className={styles.contextMenu} style={{ left: menu.x, top: menu.y }}>
                <div className={styles.menuTitle}>{messages.graph.nodesSelected(menu.selectedNodeIds.length)}</div>

                {saveDialogOpen ? renderSaveDialog(messages.graph.saveGroup, messages.graph.groupPresetsPlaceholder, handleSavePreset, () => setSaveDialogOpen(false), true) :
                    saveIndividualDialogOpen ? renderSaveDialog(messages.graph.saveAll, messages.graph.commandsPlaceholder, handleSaveIndividualPresets, () => setSaveIndividualDialogOpen(false)) : (
                        <>
                            <button
                                type="button"
                                className={styles.menuItem}
                                onClick={() => setSaveDialogOpen(true)}
                            >
                                <span className={`${styles.menuItemIcon} ${styles['menuItemIcon--save']}`}>💾</span>
                                {messages.graph.saveGroupPreset}
                            </button>

                            <button
                                type="button"
                                className={styles.menuItem}
                                onClick={() => setSaveIndividualDialogOpen(true)}
                            >
                                <span className={`${styles.menuItemIcon} ${styles['menuItemIcon--save']}`}>⚄</span>
                                {messages.graph.saveIndividualPresets}
                            </button>

                            <div className={styles.menuDivider} />

                            <button
                                type="button"
                                className={`${styles.menuItem} ${styles['menuItem--danger']}`}
                                onClick={() => {
                                    deleteNodes(menu.selectedNodeIds)
                                    closeMenu()
                                }}
                            >
                                <span className={`${styles.menuItemIcon} ${styles['menuItemIcon--delete']}`}>✕</span>
                                {messages.graph.deleteSelected}
                            </button>
                        </>
                    )}
            </div>
        )
    }

    // ── CANVAS CONTEXT MENU ──
    return (
        <div ref={ref} className={styles.contextMenu} style={{ left: menu.x, top: menu.y }}>
            <div className={styles.menuTitle}>{messages.graph.addNode}</div>

            <button
                type="button"
                className={styles.menuItem}
                onClick={() => { addCommandNode(pos); closeMenu() }}
            >
                <span className={`${styles.menuItemIcon} ${styles['menuItemIcon--command']}`}>⌘</span>
                {messages.graph.command}
            </button>

            <button
                type="button"
                className={styles.menuItem}
                onClick={() => { addVariableNode(pos); closeMenu() }}
            >
                <span className={`${styles.menuItemIcon} ${styles['menuItemIcon--variable']}`}>x</span>
                {messages.graph.variable}
            </button>

            <button
                type="button"
                className={styles.menuItem}
                onClick={() => { addTerminalNode(pos); closeMenu() }}
            >
                <span className={`${styles.menuItemIcon} ${styles['menuItemIcon--terminal']}`}>▶</span>
                {messages.graph.terminal}
            </button>

            <button
                type="button"
                className={styles.menuItem}
                onClick={() => { addSshTerminalNode(pos); closeMenu() }}
            >
                <span className={`${styles.menuItemIcon} ${styles['menuItemIcon--ssh-terminal']}`}>⇄</span>
                {messages.graph.sshTerminal}
            </button>

            <button
                type="button"
                className={styles.menuItem}
                onClick={() => { addSequenceNode(pos); closeMenu() }}
            >
                <span className={`${styles.menuItemIcon} ${styles['menuItemIcon--sequence']}`}>⇶</span>
                {messages.graph.sequence}
            </button>

            {/* ── Presets section ── */}
            {hasPresets && (
                <>
                    <div className={styles.menuDivider} />

                    <button
                        type="button"
                        className={styles.menuItem}
                        onClick={() => setPresetsExpanded(!presetsExpanded)}
                    >
                        <span className={`${styles.menuItemIcon} ${styles['menuItemIcon--preset']}`}>★</span>
                        {messages.graph.presetCollections}
                        <span className={styles.menuChevron}>{presetsExpanded ? '▾' : '▸'}</span>
                    </button>

                    {presetsExpanded && (
                        <div className={styles.presetsPanel}>
                            {/* Uncategorized presets */}
                            {uncategorized.length > 0 && (
                                <div className={styles.presetGroup}>
                                    {uncategorized.map((p) => (
                                        <PresetItem key={p.id} preset={p} onSpawn={spawnPreset} />
                                    ))}
                                </div>
                            )}

                            {/* Collection groups */}
                            {collections.map((col) => (
                                <PresetCollectionGroup
                                    key={col.name}
                                    collection={col}
                                    onSpawn={spawnPreset}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

// ── Sub-components ──

function PresetItem({
    preset,
    onSpawn,
}: {
    preset: NodePreset
    onSpawn: (p: NodePreset) => void
}) {
    const { messages } = useI18n()
    const removePreset = usePresetsStore((s) => s.removePreset)
    const typeIcon =
        preset.nodeType === 'command'
            ? '⌘'
            : preset.nodeType === 'variable'
                ? 'x'
                : preset.nodeType === 'group'
                    ? '⚄'
                    : preset.nodeType === 'ssh-terminal'
                        ? '⇄'
                        : preset.nodeType === 'sequence'
                            ? '⇶'
                            : '▶'
    const variant = preset.nodeType === 'ssh-terminal' ? 'ssh-terminal' : preset.nodeType

    return (
        <div className={styles.presetItem}>
            <button
                type="button"
                className={styles.presetItemMain}
                onClick={() => onSpawn(preset)}
            >
                <span className={`${styles.menuItemIcon} ${styles[`menuItemIcon--${variant}`]}`}>
                    {typeIcon}
                </span>
                <span className={styles.presetItemLabel}>{preset.label}</span>
            </button>
            <button
                type="button"
                className={styles.presetItemDelete}
                onClick={() => removePreset(preset.id)}
                title={messages.graph.removePreset}
            >
                ✕
            </button>
        </div>
    )
}

function PresetCollectionGroup({
    collection,
    onSpawn,
}: {
    collection: { name: string; presets: NodePreset[] }
    onSpawn: (p: NodePreset) => void
}) {
    const [expanded, setExpanded] = useState(false)

    return (
        <div className={styles.presetGroup}>
            <button
                type="button"
                className={styles.presetGroupHeader}
                onClick={() => setExpanded(!expanded)}
            >
                <span className={styles.menuChevron}>{expanded ? '▾' : '▸'}</span>
                <span className={styles.presetGroupName}>{collection.name}</span>
                <span className={styles.presetGroupCount}>{collection.presets.length}</span>
            </button>

            {expanded &&
                collection.presets.map((p) => (
                    <PresetItem key={p.id} preset={p} onSpawn={onSpawn} />
                ))}
        </div>
    )
}
