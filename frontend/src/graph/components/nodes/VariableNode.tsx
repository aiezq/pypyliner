import { Handle, Position, type NodeProps } from '@xyflow/react'
import BaseNode from './BaseNode'
import { HANDLE_IDS, type VariableNodeData } from '../../types'
import { useGraphStore } from '../../store/graphStore'
import styles from './BaseNode.module.scss'
import { useI18n } from '../../../i18n/I18nProvider'

type Props = NodeProps & { data: VariableNodeData }

export default function VariableNode({ id, data, selected }: Props) {
    const { messages } = useI18n()
    const updateNodeData = useGraphStore((s) => s.updateNodeData)

    return (
        <>
            <BaseNode
                icon="x"
                iconVariant="variable"
                label={data.label}
                onLabelSave={(label) => updateNodeData<VariableNodeData>(id, { label })}
                selected={selected}
            >
                {/* Variable value */}
                <div className={styles.nodeField}>
                    <span className={styles.nodeFieldLabel}>{messages.nodes.value}</span>
                    <input
                        className={styles.nodeInput}
                        value={data.value}
                        onChange={(e) =>
                            updateNodeData<VariableNodeData>(id, { value: e.target.value })
                        }
                        placeholder={messages.nodes.enterValue}
                        onPointerDown={(e) => e.stopPropagation()}
                    />
                </div>
            </BaseNode>

            {/* Variable output handle (right) */}
            <Handle
                type="source"
                id={HANDLE_IDS.VARIABLE_OUT}
                position={Position.Right}
                style={{ top: 20, background: '#d4a8ff', width: 10, height: 10 }}
            />
        </>
    )
}
