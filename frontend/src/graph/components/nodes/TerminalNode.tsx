import { useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import BaseNode from './BaseNode'
import { HANDLE_IDS, type TerminalNodeData } from '../../types'
import { useGraphStore } from '../../store/graphStore'
import { useGraphExecution } from '../../hooks/useGraphExecution'
import styles from './BaseNode.module.scss'

type Props = NodeProps & { data: TerminalNodeData }

export default function TerminalNode({ id, data, selected }: Props) {
    const updateNodeData = useGraphStore((s) => s.updateNodeData)
    const activeTerminalIds = useGraphStore((s) => s.activeTerminalIds)
    const { executeTerminalNode } = useGraphExecution()
    const [isRunning, setIsRunning] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const hasTerminalId = !!data.terminalId
    const isConnected = hasTerminalId && activeTerminalIds.includes(data.terminalId!)
    const isClosed = hasTerminalId && !activeTerminalIds.includes(data.terminalId!)

    const statusVariant = error ? 'error' : isConnected ? 'connected' : isClosed ? 'closed' : 'idle'
    const statusLabel = error
        ? error
        : isConnected
            ? `Terminal: ${data.terminalId}`
            : isClosed
                ? 'Terminal Closed'
                : 'Not connected to backend'

    const handleRun = async () => {
        setError(null)
        setIsRunning(true)
        try {
            await executeTerminalNode(id)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Execution failed')
        } finally {
            setIsRunning(false)
        }
    }

    return (
        <>
            {/* Chain input handle (left) */}
            <Handle
                type="target"
                id={HANDLE_IDS.CHAIN_IN}
                position={Position.Left}
                style={{ top: 20, background: '#86f1c5', width: 10, height: 10 }}
            />

            {/* Sequence output handle (right) */}
            <Handle
                type="source"
                id={HANDLE_IDS.SEQUENCE_OUT}
                position={Position.Right}
                style={{ top: '50%', background: '#f3b35e', width: 10, height: 10 }}
            />

            <BaseNode
                icon="▶"
                iconVariant="terminal"
                label={data.label}
                onLabelSave={(label) =>
                    updateNodeData<TerminalNodeData>(id, { label })
                }
                selected={selected}
                footer={
                    <div className={styles.nodeStatus}>
                        <div className={`${styles.statusDot} ${styles[`statusDot--${statusVariant}`]}`} />
                        <span className={styles.statusText}>{statusLabel}</span>
                    </div>
                }
            >
                {/* Run button */}
                <button
                    type="button"
                    className={styles.runButton}
                    disabled={isRunning}
                    onClick={handleRun}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    {isRunning ? '⏳ Running…' : '▶ Run Chain'}
                </button>
            </BaseNode>
        </>
    )
}
