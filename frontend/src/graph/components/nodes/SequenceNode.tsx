import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useState } from 'react'
import BaseNode from './BaseNode'
import { HANDLE_IDS, NODE_TYPES, EDGE_TYPES, type SequenceNodeData } from '../../types'
import { useGraphStore } from '../../store/graphStore'
import { useSequenceExecution } from '../../hooks/useSequenceExecution'
import styles from './BaseNode.module.scss'
import { useI18n } from '../../../i18n/I18nProvider'

type Props = NodeProps & { data: SequenceNodeData }

export default function SequenceNode({ id, data, selected }: Props) {
    const { messages } = useI18n()
    const updateNodeData = useGraphStore((s) => s.updateNodeData)
    const sequenceExecutionsById = useGraphStore((s) => s.sequenceExecutionsById)
    const activeSequenceExecutionIdByNodeId = useGraphStore((s) => s.activeSequenceExecutionIdByNodeId)
    // Read edges to determine how many sequence input handles to render
    const edges = useGraphStore((s) => s.edges)

    // Find all sequence edges targeting this node
    const incomingEdges = edges.filter(
        (e) => e.target === id && e.type === EDGE_TYPES.SEQUENCE
    )

    // Calculate how many pins to show.
    // If we have connections to seq-in-0 and seq-in-1, we need to render 0, 1, and 2 (empty).
    let maxInputIndex = -1
    for (const edge of incomingEdges) {
        if (edge.targetHandle?.startsWith('seq-in-')) {
            const index = parseInt(edge.targetHandle.replace('seq-in-', ''), 10)
            if (!isNaN(index) && index > maxInputIndex) {
                maxInputIndex = index
            }
        }
    }
    const pinsToRender = maxInputIndex + 2 // Up to max + 1 (the empty one)

    const { executeSequenceNode } = useSequenceExecution()
    const [isRunning, setIsRunning] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const sequenceExecutionId = data.sequenceId ?? activeSequenceExecutionIdByNodeId[id] ?? null
    const runtimeSequence = sequenceExecutionId ? sequenceExecutionsById[sequenceExecutionId] : undefined
    const runtimeStatus = runtimeSequence?.status ?? data.status ?? null
    const currentTerminalIndex = runtimeSequence?.currentTerminalIndex ?? data.currentTerminalIndex ?? null
    const runtimeTerminalNumber =
        typeof currentTerminalIndex === 'number' ? currentTerminalIndex + 1 : null

    const statusVariant = error
        ? 'error'
        : runtimeStatus === 'failed'
            ? 'error'
            : runtimeStatus === 'running'
                ? 'connected'
                : runtimeStatus === 'success' || runtimeStatus === 'stopped'
                    ? 'closed'
                    : 'idle'
    const statusLabel = error
        ? error
        : runtimeStatus === 'running'
            ? runtimeTerminalNumber !== null
                ? `${messages.nodes.runningSequence} ${runtimeTerminalNumber}`
                : messages.nodes.runningSequence
            : runtimeStatus === 'success'
                ? messages.terminal.statusSuccess
                : runtimeStatus === 'failed'
                    ? messages.terminal.statusFailed
                    : runtimeStatus === 'stopped'
                        ? messages.terminal.statusStopped
                        : messages.terminal.statusIdle

    const handleRun = async () => {
        setError(null)
        setIsRunning(true)
        try {
            await executeSequenceNode(id)
        } catch (err) {
            setError(err instanceof Error ? err.message : messages.nodes.executionFailed)
        } finally {
            setIsRunning(false)
        }
    }

    return (
        <BaseNode
            icon="⇶"
            iconVariant="sequence"
            label={data.label}
            onLabelSave={(label) =>
                updateNodeData<SequenceNodeData>(id, { label })
            }
            selected={selected}
            footer={
                    <div className={styles.nodeStatus}>
                        <div className={`${styles.statusDot} ${styles[`statusDot--${statusVariant}`]}`} />
                        <span className={styles.statusText}>{statusLabel}</span>
                    </div>
            }
        >
            <div className={styles.varHandles} style={{ borderColor: 'rgba(243, 179, 94, 0.2)' }}>
                <span className={styles.varHandlesTitle} style={{ color: 'rgba(243, 179, 94, 0.7)' }}>{messages.nodes.executionOrder}</span>

                {Array.from({ length: pinsToRender }).map((_, i) => {
                    const handleId = HANDLE_IDS.sequenceIn(i)
                    const connectedEdge = incomingEdges.find(e => e.targetHandle === handleId)

                    // Look up the name of the connected terminal
                    let terminalName = ''
                    if (connectedEdge) {
                        const nodes = useGraphStore.getState().nodes
                        const sourceNode = nodes.find(n => n.id === connectedEdge.source)
                        if (
                            sourceNode?.type === NODE_TYPES.TERMINAL ||
                            sourceNode?.type === NODE_TYPES.SSH_TERMINAL
                        ) {
                            terminalName = sourceNode.data.label as string
                        }
                    }

                    const runtimeJob = connectedEdge
                        ? runtimeSequence?.terminalJobs.find((job) => job.terminalNodeId === connectedEdge.source)
                        : undefined
                    const runtimeJobLabel = runtimeJob?.status
                        ? `${runtimeJob.terminalType.toUpperCase()} • ${runtimeJob.status}`
                        : null

                    return (
                        <div key={handleId} className={styles.varHandleRow}>
                            <Handle
                                type="target"
                                id={handleId}
                                position={Position.Left}
                                style={{
                                    position: 'absolute',
                                    left: -22, // Push outside the node border
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: '#f3b35e',
                                    width: 10,
                                    height: 10
                                }}
                            />
                            <div className={styles.sequenceRuntimeRow}>
                                <span className={styles.varHandleName} style={{ color: '#f3b35e', fontSize: '0.68rem' }}>
                                    {i + 1}. {terminalName ? terminalName : <span style={{ opacity: 0.5 }}>({messages.nodes.connectTerminal})</span>}
                                </span>
                                {runtimeJobLabel ? (
                                    <span
                                        className={`${styles.runtimeChip} ${
                                            runtimeJob?.status === 'running' || runtimeJob?.status === 'starting'
                                                ? styles['runtimeChip--running']
                                                : runtimeJob?.status === 'failed'
                                                    ? styles['runtimeChip--failed']
                                                    : runtimeJob?.status === 'success'
                                                        ? styles['runtimeChip--success']
                                                        : ''
                                        }`}
                                    >
                                        {runtimeJobLabel}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    )
                })}
            </div>

            <button
                type="button"
                className={styles.runButton}
                disabled={isRunning}
                onClick={handleRun}
                onPointerDown={(e) => e.stopPropagation()}
            >
                {isRunning ? `⏳ ${messages.nodes.runningSequence}` : `⇶ ${messages.nodes.runSequence}`}
            </button>
        </BaseNode>
    )
}
