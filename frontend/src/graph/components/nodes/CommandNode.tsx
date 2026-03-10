import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import BaseNode from './BaseNode'
import { HANDLE_IDS, type CommandNodeData } from '../../types'
import { useGraphStore } from '../../store/graphStore'
import { tokenizeCommandTemplate } from '../../utils/variableParser'
import styles from './BaseNode.module.scss'
import { useI18n } from '../../../i18n/I18nProvider'

type Props = NodeProps & { data: CommandNodeData }

function buildCommandLabel(command: string, defaultLabel: string): string {
    const trimmed = command.trim()
    if (!trimmed) {
        return defaultLabel
    }

    const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? trimmed
    return firstLine.length > 32 ? `${firstLine.slice(0, 29)}...` : firstLine
}

function shouldSyncLabel(label: string, previousCommand: string, defaultLabel: string): boolean {
    const trimmedLabel = label.trim()
    if (!trimmedLabel || trimmedLabel === defaultLabel) {
        return true
    }

    const trimmedCommand = previousCommand.trim()
    return trimmedLabel === trimmedCommand || trimmedLabel === buildCommandLabel(previousCommand, defaultLabel)
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
    const { messages } = useI18n()
    const defaultCommandLabel = messages.nodes.newCommand
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
        if (shouldSyncLabel(data.label, data.command, defaultCommandLabel)) {
            nextData.label = buildCommandLabel(nextCommand, defaultCommandLabel)
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
                            <span className={styles.varHandlesTitle}>{messages.nodes.variables}</span>
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
                    <span className={styles.nodeFieldLabel}>{messages.nodes.command}</span>
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
                            aria-label={messages.nodes.commandEditor}
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
                            {data.command ? renderCommandPreview(data.command) : messages.nodes.clickToEnterCommand}
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
