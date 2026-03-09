import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import BaseNode from './BaseNode'
import { HANDLE_IDS, type CommandNodeData } from '../../types'
import { useGraphStore } from '../../store/graphStore'
import { tokenizeCommandTemplate } from '../../utils/variableParser'
import styles from './BaseNode.module.scss'

type Props = NodeProps & { data: CommandNodeData }

const DEFAULT_COMMAND_LABEL = 'New Command'

function buildCommandLabel(command: string): string {
    const trimmed = command.trim()
    if (!trimmed) {
        return DEFAULT_COMMAND_LABEL
    }

    const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? trimmed
    return firstLine.length > 32 ? `${firstLine.slice(0, 29)}...` : firstLine
}

function shouldSyncLabel(label: string, previousCommand: string): boolean {
    const trimmedLabel = label.trim()
    if (!trimmedLabel || trimmedLabel === DEFAULT_COMMAND_LABEL) {
        return true
    }

    const trimmedCommand = previousCommand.trim()
    return trimmedLabel === trimmedCommand || trimmedLabel === buildCommandLabel(previousCommand)
}

function renderCommandPreview(command: string) {
    return tokenizeCommandTemplate(command).map((token, index) => (
        <Fragment key={`${token.value}-${index}`}>
            {token.isVariable ? (
                <span className={styles.nodeCodeVariable}>{token.value}</span>
            ) : (
                token.value
            )}
        </Fragment>
    ))
}

export default function CommandNode({ id, data, selected }: Props) {
    const updateNodeData = useGraphStore((s) => s.updateNodeData)
    const [isEditing, setIsEditing] = useState(false)
    const [draftCommand, setDraftCommand] = useState(data.command)
    const editorRef = useRef<HTMLTextAreaElement | null>(null)
    const previewRef = useRef<HTMLButtonElement | null>(null)
    const [editorHeight, setEditorHeight] = useState<number | null>(null)
    const [editorWidth, setEditorWidth] = useState<number | null>(null)

    useEffect(() => {
        if (!isEditing || !editorRef.current) {
            return
        }

        editorRef.current.focus()
        editorRef.current.select()
    }, [isEditing])

    useLayoutEffect(() => {
        if (!isEditing || !editorRef.current) {
            return
        }

        const nextHeight = editorHeight ?? previewRef.current?.offsetHeight ?? 0
        editorRef.current.style.height = `${nextHeight}px`
        editorRef.current.style.height = `${Math.max(nextHeight, editorRef.current.scrollHeight)}px`
    }, [draftCommand, editorHeight, isEditing])

    const saveCommand = (nextCommand: string) => {
        const nextData: Partial<CommandNodeData> = { command: nextCommand }
        if (shouldSyncLabel(data.label, data.command)) {
            nextData.label = buildCommandLabel(nextCommand)
        }

        updateNodeData<CommandNodeData>(id, nextData)
        setIsEditing(false)
    }

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
                onLabelSave={(label) => updateNodeData<CommandNodeData>(id, { label })}
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
                <div className={styles.nodeField}>
                    <span className={styles.nodeFieldLabel}>Command</span>
                    {isEditing ? (
                        <textarea
                            ref={editorRef}
                            className={styles.nodeCodeEditor}
                            style={{
                                ...(editorHeight ? { minHeight: `${editorHeight}px` } : {}),
                                ...(editorWidth ? { width: `${editorWidth}px` } : {}),
                            }}
                            value={draftCommand}
                            onChange={(e) => setDraftCommand(e.target.value)}
                            onBlur={() => saveCommand(draftCommand)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    saveCommand(draftCommand)
                                }
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            aria-label="Command editor"
                            rows={Math.max(1, draftCommand.split(/\r?\n/).length || 1)}
                        />
                    ) : (
                        <button
                            ref={previewRef}
                            type="button"
                            className={`${styles.nodeCodeBlock} ${styles.nodeCodeBlockButton} ${!data.command ? styles['nodeCodeBlock--placeholder'] : ''}`}
                            onClick={() => {
                                setDraftCommand(data.command)
                                setEditorHeight(previewRef.current?.offsetHeight ?? null)
                                setEditorWidth(previewRef.current?.offsetWidth ?? null)
                                setIsEditing(true)
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            {data.command ? renderCommandPreview(data.command) : 'Click to enter command'}
                        </button>
                    )}
                </div>
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
