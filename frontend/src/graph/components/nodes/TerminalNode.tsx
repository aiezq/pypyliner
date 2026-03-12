import { useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import BaseNode from './BaseNode'
import { HANDLE_IDS, type TerminalNodeData } from '../../types'
import { useGraphStore } from '../../store/graphStore'
import { useGraphExecution } from '../../hooks/useGraphExecution'
import styles from './BaseNode.module.scss'
import { useI18n } from '../../../i18n/I18nProvider'

type Props = NodeProps & { data: TerminalNodeData }

export default function TerminalNode({ id, data, selected }: Props) {
    const { messages } = useI18n()
    const updateNodeData = useGraphStore((s) => s.updateNodeData)
    const terminalSessionsById = useGraphStore((s) => s.terminalSessionsById)
    const { executeTerminalNode } = useGraphExecution()
    const [isRunning, setIsRunning] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const terminalSessionId = data.terminalSessionId ?? data.terminalId
    const runtimeTerminal = terminalSessionId ? terminalSessionsById[terminalSessionId] : undefined
    const runtimeCommandNumber =
        typeof runtimeTerminal?.currentCommandIndex === 'number'
            ? runtimeTerminal.currentCommandIndex + 1
            : null

    const statusVariant = error
        ? 'error'
        : runtimeTerminal
            ? runtimeTerminal.status === 'failed'
                ? 'error'
                : runtimeTerminal.status === 'running' ||
                    runtimeTerminal.status === 'starting' ||
                    runtimeTerminal.status === 'draining'
                    ? 'connected'
                    : 'closed'
            : terminalSessionId
                ? 'closed'
                : 'idle'
    const statusLabel = error
        ? error
        : runtimeTerminal
            ? runtimeTerminal.status === 'running' ||
                runtimeTerminal.status === 'starting' ||
                runtimeTerminal.status === 'draining'
                ? runtimeCommandNumber !== null
                    ? `${messages.terminal.statusRunning} • ${runtimeCommandNumber}`
                    : messages.terminal.statusRunning
                : runtimeTerminal.status === 'success'
                    ? messages.terminal.statusSuccess
                    : runtimeTerminal.status === 'failed'
                        ? messages.terminal.statusFailed
                        : runtimeTerminal.status === 'stopped'
                            ? messages.terminal.statusStopped
                            : messages.terminal.statusIdle
            : terminalSessionId
                ? messages.nodes.terminalClosed
                : messages.nodes.notConnectedToBackend

    const handleRun = async () => {
        setError(null)
        setIsRunning(true)
        try {
            await executeTerminalNode(id)
        } catch (err) {
            setError(err instanceof Error ? err.message : messages.nodes.executionFailed)
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
                        <span className={styles.statusText}>
                            {terminalSessionId ? `${messages.nodes.terminalId(terminalSessionId)} • ${statusLabel}` : statusLabel}
                        </span>
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
                    {isRunning ? `⏳ ${messages.nodes.running}` : `▶ ${messages.nodes.runChain}`}
                </button>
            </BaseNode>
        </>
    )
}
