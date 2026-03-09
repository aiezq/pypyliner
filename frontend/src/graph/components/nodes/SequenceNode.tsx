import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useState } from 'react'
import BaseNode from './BaseNode'
import { HANDLE_IDS, NODE_TYPES, EDGE_TYPES, type SequenceNodeData } from '../../types'
import { useGraphStore } from '../../store/graphStore'
import { useSequenceExecution } from '../../hooks/useSequenceExecution'
import styles from './BaseNode.module.scss'

type Props = NodeProps & { data: SequenceNodeData }

export default function SequenceNode({ id, data, selected }: Props) {
    const updateNodeData = useGraphStore((s) => s.updateNodeData)
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

    const handleRun = async () => {
        setError(null)
        setIsRunning(true)
        try {
            await executeSequenceNode(id)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Execution failed')
        } finally {
            setIsRunning(false)
        }
    }

    return (
        <BaseNode
            icon="⇶"
            iconVariant="sequence"
            label={data.label}
            selected={selected}
            footer={
                error && (
                    <div className={styles.nodeStatus}>
                        <div className={`${styles.statusDot} ${styles['statusDot--error']}`} />
                        <span className={styles.statusText}>{error}</span>
                    </div>
                )
            }
        >
            <div className={styles.nodeField}>
                <span className={styles.nodeFieldLabel}>Label</span>
                <input
                    className={styles.nodeInput}
                    value={data.label}
                    onChange={(e) =>
                        updateNodeData<SequenceNodeData>(id, { label: e.target.value })
                    }
                    onPointerDown={(e) => e.stopPropagation()}
                />
            </div>

            <div className={styles.varHandles} style={{ borderColor: 'rgba(243, 179, 94, 0.2)' }}>
                <span className={styles.varHandlesTitle} style={{ color: 'rgba(243, 179, 94, 0.7)' }}>Execution Order</span>

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
                            <span className={styles.varHandleName} style={{ color: '#f3b35e', fontSize: '0.68rem' }}>
                                {i + 1}. {terminalName ? terminalName : <span style={{ opacity: 0.5 }}>(connect terminal)</span>}
                            </span>
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
                {isRunning ? '⏳ Running Sequence…' : '⇶ Run Sequence'}
            </button>
        </BaseNode>
    )
}
