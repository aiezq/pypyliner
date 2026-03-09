import { useEffect, useRef, useState, type ReactNode } from 'react'
import styles from './BaseNode.module.scss'

interface BaseNodeProps {
    icon: ReactNode
    iconVariant: 'command' | 'variable' | 'terminal' | 'sshTerminal' | 'sequence'
    label: string
    onLabelSave?: (label: string) => void
    selected?: boolean
    children: ReactNode
    footer?: ReactNode
}

export default function BaseNode({
    icon,
    iconVariant,
    label,
    onLabelSave,
    selected,
    children,
    footer,
}: BaseNodeProps) {
    const [isEditingLabel, setIsEditingLabel] = useState(false)
    const [draftLabel, setDraftLabel] = useState(label)
    const labelInputRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        if (!isEditingLabel || !labelInputRef.current) {
            return
        }

        labelInputRef.current.focus()
        labelInputRef.current.select()
    }, [isEditingLabel])

    const saveLabel = () => {
        const nextLabel = draftLabel.trim() || label
        onLabelSave?.(nextLabel)
        setIsEditingLabel(false)
    }

    return (
        <div
            className={`${styles.baseNode} ${selected ? styles['baseNode--selected'] : ''}`}
        >
            <div className={styles.nodeHeader}>
                <div className={`${styles.nodeIcon} ${styles[`nodeIcon--${iconVariant}`]}`}>
                    {icon}
                </div>
                {onLabelSave ? (
                    isEditingLabel ? (
                        <input
                            ref={labelInputRef}
                            className={styles.nodeLabelInput}
                            value={draftLabel}
                            onChange={(e) => setDraftLabel(e.target.value)}
                            onBlur={saveLabel}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    saveLabel()
                                }
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            aria-label="Node title editor"
                        />
                    ) : (
                        <button
                            type="button"
                            className={styles.nodeLabelButton}
                            onClick={() => {
                                setDraftLabel(label)
                                setIsEditingLabel(true)
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            aria-label={`Edit node title: ${label}`}
                        >
                            <span className={styles.nodeLabel}>{label}</span>
                        </button>
                    )
                ) : (
                    <span className={styles.nodeLabel}>{label}</span>
                )}
            </div>

            <div className={styles.nodeBody}>{children}</div>

            {footer}
        </div>
    )
}
