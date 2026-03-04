import { useEffect, useRef } from 'react'
import type { ManualTerminal, TerminalLine, TerminalSession } from '../types'

interface TerminalInstancesPanelProps {
  runSessions: TerminalSession[]
  manualTerminals: ManualTerminal[]
  terminalInstancesCount: number
  onCreateManualTerminal: () => void
  onUpdateManualTitle: (terminalId: string, title: string) => void
  onRenameManualTerminal: (terminalId: string) => void
  onUpdateManualCommand: (terminalId: string, command: string) => void
  onNavigateManualHistory: (
    terminalId: string,
    direction: 'up' | 'down',
    currentDraft: string,
  ) => void
  onRunManualCommand: (terminalId: string) => void
  onAutocompleteManualCommand: (terminalId: string) => void
  onStopManualTerminal: (terminalId: string) => void
  onClearManualTerminal: (terminalId: string) => void
  onRemoveManualTerminal: (terminalId: string) => void
}

interface TerminalOutputProps {
  lines: TerminalLine[]
}

function TerminalOutput({ lines }: TerminalOutputProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const element = bodyRef.current
    if (!element) {
      return
    }
    element.scrollTop = element.scrollHeight
  }, [lines.length])

  return (
    <div className="terminalBody" ref={bodyRef}>
      {lines.map((line) => (
        <p
          key={line.id}
          className={`line line--${line.stream}`}
          title={new Date(line.createdAt).toLocaleTimeString()}
        >
          {line.text}
        </p>
      ))}
    </div>
  )
}

function TerminalInstancesPanel({
  runSessions,
  manualTerminals,
  terminalInstancesCount,
  onCreateManualTerminal,
  onUpdateManualTitle,
  onRenameManualTerminal,
  onUpdateManualCommand,
  onNavigateManualHistory,
  onRunManualCommand,
  onAutocompleteManualCommand,
  onStopManualTerminal,
  onClearManualTerminal,
  onRemoveManualTerminal,
}: TerminalInstancesPanelProps) {
  return (
    <section className="panel terminalsPanel">
      <div className="section__head">
        <h2>Terminal Instances</h2>
        <div className="terminalHeadActions">
          <span>{terminalInstancesCount} open</span>
          <button type="button" onClick={onCreateManualTerminal}>
            New terminal
          </button>
        </div>
      </div>

      {terminalInstancesCount === 0 ? (
        <p className="empty">No terminal instances yet.</p>
      ) : null}

      <div className="terminals">
        {runSessions.map((session) => (
          <article key={session.id} className="terminalCard">
            <header>
              <div>
                <strong>{session.title}</strong>
                <p>
                  status:{' '}
                  <span className={`status status--${session.status}`}>
                    {session.status}
                  </span>{' '}
                  | exit: {session.exitCode ?? '...'}
                </p>
              </div>
              <code>{session.command}</code>
            </header>
            <TerminalOutput lines={session.lines} />
          </article>
        ))}

        {manualTerminals.map((terminal) => (
          <article key={terminal.id} className="terminalCard terminalCard--manual">
            <header>
              <div className="terminalTitleActions">
                <input
                  value={terminal.titleDraft}
                  onChange={(event) =>
                    onUpdateManualTitle(terminal.id, event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      onRenameManualTerminal(terminal.id)
                    }
                  }}
                  placeholder="Terminal name"
                />
                <button
                  type="button"
                  onClick={() => onRenameManualTerminal(terminal.id)}
                  disabled={
                    !terminal.titleDraft.trim() ||
                    terminal.titleDraft.trim() === terminal.title
                  }
                >
                  Rename
                </button>
              </div>
              <p>
                status:{' '}
                <span className={`status status--${terminal.status}`}>
                  {terminal.status}
                </span>{' '}
                | exit: {terminal.exitCode ?? '...'}
              </p>
            </header>
            <div className="terminalActions">
              <span className="terminalPrompt" title={`${terminal.promptUser}:${terminal.promptCwd}`}>
                {terminal.promptUser}:{terminal.promptCwd}$
              </span>
              <input
                value={terminal.draftCommand}
                onChange={(event) =>
                  onUpdateManualCommand(terminal.id, event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === 'Tab' && !event.shiftKey) {
                    event.preventDefault()
                    onAutocompleteManualCommand(terminal.id)
                    return
                  }

                  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                    event.preventDefault()
                    onNavigateManualHistory(
                      terminal.id,
                      event.key === 'ArrowUp' ? 'up' : 'down',
                      terminal.draftCommand,
                    )
                    return
                  }

                  if (event.key !== 'Enter') {
                    return
                  }
                  if (event.nativeEvent.isComposing || !terminal.draftCommand.trim()) {
                    return
                  }
                  event.preventDefault()
                  onRunManualCommand(terminal.id)
                }}
                placeholder="Type command, e.g. ls -la /opt/app"
              />
              <button
                type="button"
                onClick={() => onRunManualCommand(terminal.id)}
                disabled={!terminal.draftCommand.trim()}
              >
                Send
              </button>
              <button
                type="button"
                onClick={() => onStopManualTerminal(terminal.id)}
                disabled={terminal.status !== 'running'}
              >
                Stop
              </button>
              <button
                type="button"
                onClick={() => onClearManualTerminal(terminal.id)}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => onRemoveManualTerminal(terminal.id)}
              >
                Close terminal
              </button>
            </div>
            <TerminalOutput lines={terminal.lines} />
          </article>
        ))}
      </div>
    </section>
  )
}

export default TerminalInstancesPanel
