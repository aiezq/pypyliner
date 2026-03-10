import { useState, useMemo } from 'react'
import { formatTime } from '../lib/mappers'
import styles from './HistoryPanel.module.scss'
import { useI18n } from '../i18n/I18nProvider'

interface HistoryPanelProps {
  terminalHistory: Array<{
    terminal_id: string
    title: string
    is_sequence: boolean
    created_at: string
    updated_at: string
    closed_at: string | null
    log_file_path: string
    commands: string[]
  }>
  isLoading: boolean
  errorMessage?: string | null
}

type FilterType = 'all' | 'single' | 'sequence'

function HistoryPanel({
  terminalHistory,
  isLoading,
  errorMessage = null,
}: HistoryPanelProps) {
  const { messages } = useI18n()
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
          <h2>{messages.history.title}</h2>
          <input
            type="text"
            placeholder={messages.history.searchPlaceholder}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className={styles.searchBox}
          />
          <div className={styles.filterTabs}>
            <button
              className={filterType === 'all' ? styles.active : ''}
              onClick={() => setFilterType('all')}
            >{messages.history.filterAll}</button>
            <button
              className={filterType === 'single' ? styles.active : ''}
              onClick={() => setFilterType('single')}
            >{messages.history.filterSingle}</button>
            <button
              className={filterType === 'sequence' ? styles.active : ''}
              onClick={() => setFilterType('sequence')}
            >{messages.history.filterSequence}</button>
          </div>
        </div>

        <div className={styles.sessionList}>
          {isLoading && terminalHistory.length === 0 ? (
            <div className={styles.emptyState}>{messages.history.loading}</div>
          ) : filteredHistory.length === 0 ? (
            <div className={styles.emptyState}>{messages.history.noResults}</div>
          ) : (
            filteredHistory.map((item) => (
              <div
                key={item.terminal_id}
                className={`${styles.sessionItem} ${selectedId === item.terminal_id ? styles.active : ''}`}
                onClick={() => setSelectedId(item.terminal_id)}
              >
                <div className={styles.sessionItemHeader}>
                  <strong>{item.title}</strong>
                  <span className={styles.badge}>{messages.history.commandsCount(item.commands.length)}</span>
                </div>
                <div className={styles.sessionItemMeta}>
                  {item.is_sequence ? (
                    <span className={styles.iconSequence} title={messages.history.sequenceRun}>⇶</span>
                  ) : (
                    <span className={styles.iconSingle} title={messages.history.singleRun}>⌨</span>
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
          <div className={styles.emptyState}>{messages.history.emptySelection}</div>
        ) : (
          <>
            <div className={styles.detailHeader}>
              <h3>
                {selectedTerminal.is_sequence ? <span style={{ color: '#f3b35e' }}>⇶</span> : <span style={{ color: '#4CAF50' }}>⌨</span>}
                {selectedTerminal.title}
              </h3>
              <div className={styles.metaRow}>
                <span><strong>{messages.history.created}:</strong> {formatTime(selectedTerminal.created_at)}</span>
                {selectedTerminal.closed_at && (
                  <span><strong>{messages.history.closed}:</strong> {formatTime(selectedTerminal.closed_at)}</span>
                )}
                <span><strong>{messages.history.logFile}:</strong> <code>{selectedTerminal.log_file_path}</code></span>
              </div>
            </div>
            <div className={styles.detailBody}>
              {selectedTerminal.commands.length === 0 ? (
                <div className={styles.emptyState}>{messages.history.noCommands}</div>
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
