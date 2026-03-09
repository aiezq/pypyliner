import { useState } from 'react'
import { useGraphStore } from '../store/graphStore'
import styles from './GlobalVariablesWidget.module.scss'

export default function GlobalVariablesWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [sshUsername, setSshUsername] = useState('')
  const [sshHost, setSshHost] = useState('')
  const [sshPassword, setSshPassword] = useState('')
  const [showSshPassword, setShowSshPassword] = useState(false)

  const globalVariables = useGraphStore((s) => s.globalVariables)
  const sshConnections = useGraphStore((s) => s.sshConnections)
  const setGlobalVariable = useGraphStore((s) => s.setGlobalVariable)
  const deleteGlobalVariable = useGraphStore((s) => s.deleteGlobalVariable)
  const saveSshConnection = useGraphStore((s) => s.saveSshConnection)
  const deleteSshConnection = useGraphStore((s) => s.deleteSshConnection)

  const handleAddVariable = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedKey = newKey.trim().replace(/^\{|\}$/g, '')
    const trimmedValue = newValue.trim()

    if (!trimmedKey) return

    setGlobalVariable(trimmedKey, trimmedValue)
    setNewKey('')
    setNewValue('')
  }

  const handleAddSshConnection = (e: React.FormEvent) => {
    e.preventDefault()
    const username = sshUsername.trim()
    const host = sshHost.trim()

    if (!username || !host || !sshPassword.trim()) {
      return
    }

    saveSshConnection({
      username,
      host,
      password: sshPassword,
    })
    setSshUsername('')
    setSshHost('')
    setSshPassword('')
    setShowSshPassword(false)
  }

  const variableEntries = Object.entries(globalVariables)
  const totalCount = variableEntries.length + sshConnections.length

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
        <span className={styles.headerBadge}>{totalCount}</span>
        <span className={styles.headerChevron}>{isOpen ? '▾' : '▸'}</span>
      </button>

      {isOpen && (
        <div className={styles.content}>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>Variables</span>
              <span className={styles.sectionBadge}>{variableEntries.length}</span>
            </div>

            <div className={styles.list}>
              {variableEntries.length === 0 ? (
                <div className={styles.empty}>No global variables set</div>
              ) : (
                variableEntries.map(([key, val]) => (
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

            <form className={styles.addForm} onSubmit={handleAddVariable}>
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
              <button type="submit" className={styles.addButton} disabled={!newKey.trim()}>
                Add Variable
              </button>
            </form>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>SSH Variables</span>
              <span className={styles.sectionBadge}>{sshConnections.length}</span>
            </div>

            <div className={styles.list}>
              {sshConnections.length === 0 ? (
                <div className={styles.empty}>No SSH variables saved</div>
              ) : (
                sshConnections.map((connection) => (
                  <div key={connection.id} className={styles.variableItem}>
                    <div className={styles.variableInfo}>
                      <span className={styles.variableKey}>{connection.username}</span>
                      <span className={styles.variableValue}>{connection.host}</span>
                    </div>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => deleteSshConnection(connection.id)}
                      title="Delete SSH variable"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>

            <form className={styles.addForm} onSubmit={handleAddSshConnection}>
              <div className={styles.inputStack}>
                <input
                  type="text"
                  placeholder="Account name"
                  value={sshUsername}
                  onChange={(e) => setSshUsername(e.target.value)}
                  className={styles.input}
                />
                <input
                  type="text"
                  placeholder="IP / host"
                  value={sshHost}
                  onChange={(e) => setSshHost(e.target.value)}
                  className={styles.input}
                />
                <div className={styles.passwordRow}>
                  <input
                    type={showSshPassword ? 'text' : 'password'}
                    placeholder="Password"
                    value={sshPassword}
                    onChange={(e) => setSshPassword(e.target.value)}
                    className={styles.input}
                  />
                  <button
                    type="button"
                    className={styles.passwordToggle}
                    onClick={() => setShowSshPassword((value) => !value)}
                    aria-label={showSshPassword ? 'Hide password' : 'Show password'}
                  >
                    {showSshPassword ? '🙈' : '👁'}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                className={styles.addButton}
                disabled={!sshUsername.trim() || !sshHost.trim() || !sshPassword.trim()}
              >
                Add SSH Variable
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
