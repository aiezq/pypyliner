import { useState, useMemo } from 'react'
import { formatTime } from '../lib/mappers'
import type { BackendManualTerminalHistory } from '../types'
import styles from './HistoryPanel.module.scss'

interface HistoryPanelProps {
  terminalHistory: BackendManualTerminalHistory[]
  isLoading: boolean
  errorMessage?: string | null
}

type FilterType = 'all' | 'single' | 'sequence'

function HistoryPanel({
  terminalHistory,
  isLoading,
  errorMessage = null,
}: HistoryPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')

  const filteredHistory = useMemo(() => {
    return terminalHistory.filter(item => {
      // 1. Text Search
      if (searchQuery && !item.title.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }
      // 2. Tab Filter
      if (filterType === 'single' && item.is_sequence) return false
      if (filterType === 'sequence' && !item.is_sequence) return false

      return true
    })
  }, [terminalHistory, searchQuery, filterType])

  const selectedTerminal = terminalHistory.find(t => t.terminal_id === selectedId)

  return (
    <main className={styles.historyContainer}>
      {/* LEFT SIDEBAR */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2>Terminal History</h2>
          <input
            type="text"
            placeholder="Search terminals..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className={styles.searchBox}
          />
          <div className={styles.filterTabs}>
            <button
              className={filterType === 'all' ? styles.active : ''}
              onClick={() => setFilterType('all')}
            >All</button>
            <button
              className={filterType === 'single' ? styles.active : ''}
              onClick={() => setFilterType('single')}
            >Singles</button>
            <button
              className={filterType === 'sequence' ? styles.active : ''}
              onClick={() => setFilterType('sequence')}
            >Sequences</button>
          </div>
        </div>

        <div className={styles.sessionList}>
          {isLoading && terminalHistory.length === 0 ? (
            <div className={styles.emptyState}>Loading...</div>
          ) : filteredHistory.length === 0 ? (
            <div className={styles.emptyState}>No results.</div>
          ) : (
            filteredHistory.map((item) => (
              <div
                key={item.terminal_id}
                className={`${styles.sessionItem} ${selectedId === item.terminal_id ? styles.active : ''}`}
                onClick={() => setSelectedId(item.terminal_id)}
              >
                <div className={styles.sessionItemHeader}>
                  <strong>{item.title}</strong>
                  <span className={styles.badge}>{item.commands.length} cmds</span>
                </div>
                <div className={styles.sessionItemMeta}>
                  {item.is_sequence ? (
                    <span className={styles.iconSequence} title="Sequence Node Run">⇶</span>
                  ) : (
                    <span className={styles.iconSingle} title="Single Terminal Run">⌨</span>
                  )}
                  <span>{formatTime(item.updated_at)}</span>
                </div>
              </div>
            ))
          )}
          {errorMessage && (
            <div className={styles.errorBanner}>{errorMessage}</div>
          )}
        </div>
      </aside>

      {/* RIGHT MAIN AREA */}
      <section className={styles.mainArea}>
        {!selectedTerminal ? (
          <div className={styles.emptyState}>
            Select a terminal history session from the left to view details.
          </div>
        ) : (
          <>
            <div className={styles.detailHeader}>
              <h3>
                {selectedTerminal.is_sequence ? <span style={{ color: '#f3b35e' }}>⇶</span> : <span style={{ color: '#4CAF50' }}>⌨</span>}
                {selectedTerminal.title}
              </h3>
              <div className={styles.metaRow}>
                <span><strong>Created:</strong> {formatTime(selectedTerminal.created_at)}</span>
                {selectedTerminal.closed_at && (
                  <span><strong>Closed:</strong> {formatTime(selectedTerminal.closed_at)}</span>
                )}
                <span><strong>Log File:</strong> <code>{selectedTerminal.log_file_path}</code></span>
              </div>
            </div>
            <div className={styles.detailBody}>
              {selectedTerminal.commands.length === 0 ? (
                <div className={styles.emptyState}>No commands recorded.</div>
              ) : (
                <div className={styles.commandList}>
                  {selectedTerminal.commands.map((cmd, idx) => (
                    <div key={idx} className={styles.commandItem}>
                      {'>'} {cmd}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  )
}

export default HistoryPanel
