import { useEffect, useRef, type MouseEventHandler, type ReactNode } from 'react'
import type { ManualTerminal, TerminalLine, TerminalSession } from '../types'

type TerminalHistoryDirection = 'up' | 'down'
type TerminalPanelVariant = 'pinned' | 'floating'

interface TerminalPanelBaseProps {
  variant: TerminalPanelVariant
  controls: ReactNode
  controlsClassName?: string
  onHeaderMouseDown?: MouseEventHandler<HTMLElement>
  titleHint?: string
}

interface RunTerminalPanelProps extends TerminalPanelBaseProps {
  kind: 'run'
  session: TerminalSession
}

interface ManualTerminalPanelProps extends TerminalPanelBaseProps {
  kind: 'manual'
  terminal: ManualTerminal
  isEditingTitle: boolean
  onUpdateTitleDraft: (title: string) => void
  onStartTitleEdit: () => void
  onCancelTitleEdit: () => void
  onSaveTitleEdit: () => void
  onUpdateCommand: (command: string) => void
  onAutocompleteCommand: () => void
  onNavigateHistory: (direction: TerminalHistoryDirection, currentDraft: string) => void
  onRunCommand: () => void
  onClearTerminal: () => void
  copyTailLineCount: number
  onUpdateCopyTailLineCount: (rawValue: string) => void
  onCopyTail: () => void
  isCopyTailRecentlyCopied: boolean
}

type TerminalPanelProps = RunTerminalPanelProps | ManualTerminalPanelProps

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

const getControlsClassName = (
  variant: TerminalPanelVariant,
  controlsClassName?: string,
): string =>
  controlsClassName ?? (variant === 'floating' ? 'terminalWindow__controls' : 'pinnedTerminalHeadActions')

function TerminalPanel(props: TerminalPanelProps) {
  const {
    variant,
    controls,
    controlsClassName,
    onHeaderMouseDown,
    titleHint,
  } = props
  const headerClassName = variant === 'floating' ? 'terminalWindow__dragbar' : 'section__head'
  const bodyClassName = variant === 'floating' ? 'terminalWindow__content' : undefined

  if (props.kind === 'run') {
    const { session } = props
    return (
      <>
        <div className={headerClassName} onMouseDown={onHeaderMouseDown}>
          {variant === 'floating' ? (
            <div className="terminalWindow__title">
              <strong>{session.title}</strong>
              {titleHint ? <span className="terminalWindow__hint">{titleHint}</span> : null}
            </div>
          ) : (
            <h2>{session.title}</h2>
          )}
          <div className={getControlsClassName(variant, controlsClassName)}>{controls}</div>
        </div>

        <div className={bodyClassName}>
          <p className="terminalWindow__meta">exit: {session.exitCode ?? '...'}</p>
          <code>{session.command}</code>
          <TerminalOutput lines={session.lines} />
        </div>
      </>
    )
  }

  const {
    terminal,
    isEditingTitle,
    onUpdateTitleDraft,
    onStartTitleEdit,
    onCancelTitleEdit,
    onSaveTitleEdit,
    onUpdateCommand,
    onAutocompleteCommand,
    onNavigateHistory,
    onRunCommand,
    onClearTerminal,
    copyTailLineCount,
    onUpdateCopyTailLineCount,
    onCopyTail,
    isCopyTailRecentlyCopied,
  } = props

  return (
    <>
      <div className={headerClassName} onMouseDown={onHeaderMouseDown}>
        {variant === 'floating' ? (
          <div className="terminalWindow__title terminalTitleEditable templateEditable">
            {isEditingTitle ? (
              <div
                className="terminalWindow__titleInputRow templateEditInline"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <input
                  value={terminal.titleDraft}
                  onChange={(event) => onUpdateTitleDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      onSaveTitleEdit()
                      return
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      onCancelTitleEdit()
                    }
                  }}
                  placeholder="Terminal name"
                  autoFocus
                />
                <button
                  type="button"
                  className="templateSaveButton"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={onSaveTitleEdit}
                  disabled={!terminal.titleDraft.trim() || terminal.titleDraft.trim() === terminal.title}
                  title={`Save terminal name: ${terminal.title}`}
                >
                  ✓
                </button>
              </div>
            ) : (
              <div className="terminalWindow__titleMain">
                <strong>{terminal.title}</strong>
                <button
                  type="button"
                  className="templateEditButton terminalTitleEditButton"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={onStartTitleEdit}
                  aria-label={`Edit terminal name: ${terminal.title}`}
                >
                  ✎
                </button>
              </div>
            )}
            {titleHint ? <span className="terminalWindow__hint">{titleHint}</span> : null}
          </div>
        ) : (
          <div className="pinnedTerminalTitle terminalTitleEditable templateEditable">
            {isEditingTitle ? (
              <div className="templateEditInline">
                <input
                  value={terminal.titleDraft}
                  onChange={(event) => onUpdateTitleDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      onSaveTitleEdit()
                      return
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      onCancelTitleEdit()
                    }
                  }}
                  placeholder="Terminal name"
                  autoFocus
                />
                <button
                  type="button"
                  className="templateSaveButton"
                  onClick={onSaveTitleEdit}
                  disabled={!terminal.titleDraft.trim() || terminal.titleDraft.trim() === terminal.title}
                  title={`Save terminal name: ${terminal.title}`}
                >
                  ✓
                </button>
              </div>
            ) : (
              <div className="pinnedTerminalTitleMain">
                <h2>{terminal.title}</h2>
                <button
                  type="button"
                  className="templateEditButton terminalTitleEditButton"
                  onClick={onStartTitleEdit}
                  aria-label={`Edit terminal name: ${terminal.title}`}
                >
                  ✎
                </button>
              </div>
            )}
          </div>
        )}

        <div className={getControlsClassName(variant, controlsClassName)}>{controls}</div>
      </div>

      <div className={bodyClassName}>
        <p className="terminalWindow__meta">exit: {terminal.exitCode ?? '...'}</p>

        <div className="terminalActions">
          <span className="terminalPrompt" title={`${terminal.promptUser}:${terminal.promptCwd}`}>
            {terminal.promptUser}:{terminal.promptCwd}$
          </span>
          <div className="terminalCommandInputWrap">
            <input
              value={terminal.draftCommand}
              onChange={(event) => onUpdateCommand(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Tab' && !event.shiftKey) {
                  event.preventDefault()
                  onAutocompleteCommand()
                  return
                }

                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                  event.preventDefault()
                  onNavigateHistory(
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
                onRunCommand()
              }}
              placeholder="Type command, e.g. ls -la /opt/app"
            />
            <div className="terminalInputActions">
              <button
                type="button"
                className="terminalInputAction terminalInputAction--clear"
                onClick={onClearTerminal}
                title="Clear output"
                aria-label="Clear output"
              >
                <span className="terminalInputActionIcon" aria-hidden="true">
                  🗑
                </span>
              </button>
              <button
                type="button"
                className="terminalInputAction terminalInputAction--send"
                onClick={onRunCommand}
                disabled={!terminal.draftCommand.trim()}
                title="Send command"
                aria-label="Send command"
              >
                <span className="terminalInputActionIcon" aria-hidden="true">
                  ➜
                </span>
              </button>
            </div>
          </div>
        </div>
        <TerminalOutput lines={terminal.lines} />
        <div className="terminalFooterActions">
          <label className="terminalCopyTailControl">
            <span>Last</span>
            <input
              type="number"
              min={1}
              step={1}
              value={copyTailLineCount}
              onChange={(event) => onUpdateCopyTailLineCount(event.target.value)}
              title="Number of lines to copy"
            />
            <span>lines</span>
          </label>
          <button
            type="button"
            className="terminalFooterCopyButton"
            onClick={onCopyTail}
            title="Copy last lines to clipboard"
          >
            {isCopyTailRecentlyCopied ? 'Copied' : 'Copy tail'}
          </button>
        </div>
      </div>
    </>
  )
}

export default TerminalPanel
