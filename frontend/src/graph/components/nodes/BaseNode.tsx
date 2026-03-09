import type { ReactNode } from 'react'
import styles from './BaseNode.module.scss'

interface BaseNodeProps {
    icon: ReactNode
    iconVariant: 'command' | 'variable' | 'terminal' | 'sshTerminal' | 'sequence'
    label: string
    selected?: boolean
    children: ReactNode
    footer?: ReactNode
}

export default function BaseNode({
    icon,
    iconVariant,
    label,
    selected,
    children,
    footer,
}: BaseNodeProps) {
    return (
        <div
            className={`${styles.baseNode} ${selected ? styles['baseNode--selected'] : ''}`}
        >
            <div className={styles.nodeHeader}>
                <div className={`${styles.nodeIcon} ${styles[`nodeIcon--${iconVariant}`]}`}>
                    {icon}
                </div>
                <span className={styles.nodeLabel}>{label}</span>
            </div>

            <div className={styles.nodeBody}>{children}</div>

            {footer}
        </div>
    )
}
