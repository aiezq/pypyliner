import { Handle, Position, type NodeProps } from '@xyflow/react'
import BaseNode from './BaseNode'
import { HANDLE_IDS, type CommandNodeData } from '../../types'
import { useGraphStore } from '../../store/graphStore'
import styles from './BaseNode.module.scss'

type Props = NodeProps & { data: CommandNodeData }

export default function CommandNode({ id, data, selected }: Props) {
    const updateNodeData = useGraphStore((s) => s.updateNodeData)

    return (
        <>
            {/* Chain input handle (left) */}
            <Handle
                type="target"
                id={HANDLE_IDS.CHAIN_IN}
                position={Position.Left}
                style={{ top: 20, background: '#6ec3ff', width: 10, height: 10 }}
            />

            <BaseNode
                icon="⌘"
                iconVariant="command"
                label={data.label}
                selected={selected}
                footer={
                    data.variableNames.length > 0 ? (
                        <div className={styles.varHandles}>
                            <span className={styles.varHandlesTitle}>Variables</span>
                            {data.variableNames.map((varName) => (
                                <div key={varName} className={styles.varHandleRow}>
                                    <Handle
                                        type="target"
                                        id={HANDLE_IDS.variableIn(varName)}
                                        position={Position.Left}
                                        style={{
                                            position: 'relative',
                                            left: -8,
                                            top: 0,
                                            transform: 'none',
                                            background: '#d4a8ff',
                                            width: 8,
                                            height: 8,
                                        }}
                                    />
                                    <span className={styles.varHandleName}>{`{${varName}}`}</span>
                                </div>
                            ))}
                        </div>
                    ) : undefined
                }
            >
                {/* Name field */}
                <div className={styles.nodeField}>
                    <span className={styles.nodeFieldLabel}>Name</span>
                    <input
                        className={styles.nodeInput}
                        value={data.label}
                        onChange={(e) =>
                            updateNodeData<CommandNodeData>(id, { label: e.target.value })
                        }
                        onPointerDown={(e) => e.stopPropagation()}
                    />
                </div>

                {/* Command field */}
                <div className={styles.nodeField}>
                    <span className={styles.nodeFieldLabel}>Command</span>
                    <input
                        className={styles.nodeInput}
                        value={data.command}
                        onChange={(e) =>
                            updateNodeData<CommandNodeData>(id, { command: e.target.value })
                        }
                        placeholder="e.g. apt install {package}"
                        onPointerDown={(e) => e.stopPropagation()}
                    />
                </div>

                {/* Command preview */}
                {data.command && (
                    <div className={styles.nodeCodeBlock}>{data.command}</div>
                )}
            </BaseNode>

            {/* Chain output handle (right) */}
            <Handle
                type="source"
                id={HANDLE_IDS.CHAIN_OUT}
                position={Position.Right}
                style={{ top: 20, background: '#6ec3ff', width: 10, height: 10 }}
            />
        </>
    )
}
