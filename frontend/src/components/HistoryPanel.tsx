import { formatTime } from '../lib/mappers'
import type { BackendManualTerminalHistory, RunState } from '../types'

interface HistoryPanelProps {
  runs: RunState[]
  terminalHistory: BackendManualTerminalHistory[]
  isLoading: boolean
  errorMessage?: string | null
}

function HistoryPanel({
  runs,
  terminalHistory,
  isLoading,
  errorMessage = null,
}: HistoryPanelProps) {
  return (
    <main className="historyLayout">
      <section className="panel historyPanel">
        <div className="section__head">
          <h2>Pipeline History</h2>
          <span>{runs.length} runs</span>
        </div>

        {runs.length === 0 ? (
          <p className="empty">{isLoading ? 'Loading history...' : 'No run history yet.'}</p>
        ) : (
          <div className="historySessionList">
            {runs.map((run) => (
              <article key={run.id} className="historySessionCard">
                <div className="historySessionHead">
                  <strong>{run.pipelineName}</strong>
                  <span className={`status status--${run.status}`}>{run.status}</span>
                </div>
                <div className="historyRunMeta">
                  <p>
                    <strong>Run ID:</strong> {run.id}
                  </p>
                  <p>
                    <strong>Started:</strong> {formatTime(run.startedAt)}
                  </p>
                  <p>
                    <strong>Finished:</strong> {formatTime(run.finishedAt)}
                  </p>
                  <p>
                    <strong>Sessions:</strong> {run.sessions.length}
                  </p>
                  <p>
                    <strong>Log file:</strong> <code>{run.logFilePath}</code>
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel historyPanel">
        <div className="section__head">
          <h2>Manual Command History</h2>
          <span>{terminalHistory.length} terminals</span>
        </div>

        {terminalHistory.length === 0 ? (
          <p className="empty">{isLoading ? 'Loading history...' : 'No command history yet.'}</p>
        ) : (
          <div className="historyTerminalList">
            {terminalHistory.map((item) => (
              <article key={item.terminal_id} className="historyTerminalCard">
                <div className="historySessionHead">
                  <strong>{item.title}</strong>
                  <span>{item.commands.length} commands</span>
                </div>
                <p className="historySessionMeta">
                  Updated: {formatTime(item.updated_at)}
                  {item.closed_at ? ` | Closed: ${formatTime(item.closed_at)}` : ''}
                </p>
                <p className="historySessionMeta">
                  <strong>Log file:</strong> <code>{item.log_file_path}</code>
                </p>
                <div className="historyCommandList">
                  {item.commands
                    .slice(-40)
                    .reverse()
                    .map((command, index) => (
                      <code key={`${item.terminal_id}_${index}`}>{command}</code>
                    ))}
                </div>
              </article>
            ))}
          </div>
        )}
        {errorMessage ? <p className="errorBanner">{errorMessage}</p> : null}
      </section>
    </main>
  )
}

export default HistoryPanel
