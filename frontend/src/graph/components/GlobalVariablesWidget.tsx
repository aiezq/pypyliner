import { useState } from 'react'
import { useGraphStore } from '../store/graphStore'
import styles from './GlobalVariablesWidget.module.scss'

export default function GlobalVariablesWidget() {
    const [isOpen, setIsOpen] = useState(false)
    const [newKey, setNewKey] = useState('')
    const [newValue, setNewValue] = useState('')

    const globalVariables = useGraphStore((s) => s.globalVariables)
    const setGlobalVariable = useGraphStore((s) => s.setGlobalVariable)
    const deleteGlobalVariable = useGraphStore((s) => s.deleteGlobalVariable)

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault()
        const trimmedKey = newKey.trim().replace(/^\{|\}$/g, '') // remove brackets if user typed them
        const trimmedValue = newValue.trim()

        if (!trimmedKey) return

        setGlobalVariable(trimmedKey, trimmedValue)
        setNewKey('')
        setNewValue('')
    }

    const entries = Object.entries(globalVariables)

    return (
        <div className={`${styles.widget} ${isOpen ? styles['widget--open'] : ''}`}>
            <button
                type="button"
                className={styles.header}
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
            >
                <span className={styles.headerIcon}>x</span>
                <span className={styles.headerTitle}>Global Variables</span>
                <span className={styles.headerBadge}>{entries.length}</span>
                <span className={styles.headerChevron}>{isOpen ? '▾' : '▸'}</span>
            </button>

            {isOpen && (
                <div className={styles.content}>
                    <div className={styles.list}>
                        {entries.length === 0 ? (
                            <div className={styles.empty}>No global variables set</div>
                        ) : (
                            entries.map(([key, val]) => (
                                <div key={key} className={styles.variableItem}>
                                    <div className={styles.variableInfo}>
                                        <span className={styles.variableKey}>&#123;{key}&#125;</span>
                                        <span className={styles.variableValue}>{val}</span>
                                    </div>
                                    <button
                                        type="button"
                                        className={styles.deleteButton}
                                        onClick={() => deleteGlobalVariable(key)}
                                        title="Delete variable"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    <form className={styles.addForm} onSubmit={handleAdd}>
                        <div className={styles.inputGroup}>
                            <input
                                type="text"
                                placeholder="Key (e.g. login)"
                                value={newKey}
                                onChange={(e) => setNewKey(e.target.value)}
                                className={styles.input}
                            />
                            <input
                                type="text"
                                placeholder="Value"
                                value={newValue}
                                onChange={(e) => setNewValue(e.target.value)}
                                className={styles.input}
                            />
                        </div>
                        <button
                            type="submit"
                            className={styles.addButton}
                            disabled={!newKey.trim()}
                        >
                            Add
                        </button>
                    </form>
                </div>
            )}
        </div>
    )
}
