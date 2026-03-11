import { useEffect, useMemo, useRef, type MouseEventHandler, type ReactNode } from 'react'
import type { ManualTerminal } from '../types'
import { useI18n } from '../i18n/I18nProvider'
import type { TerminalHistoryDirection } from '../hooks/useManualTerminalController'
import TerminalEmulator from './TerminalEmulator'

type TerminalPanelVariant = 'pinned' | 'floating'

interface TerminalPanelBaseProps {
  variant: TerminalPanelVariant
  controls: ReactNode
  controlsClassName?: string
  onHeaderMouseDown?: MouseEventHandler<HTMLElement>
  titleHint?: string
}

interface ManualTerminalPanelProps extends TerminalPanelBaseProps {
  kind: 'manual'
  terminal: ManualTerminal
  isEditingTitle: boolean
  copyTailLineCount: number
  isCopyTailRecentlyCopied: boolean
  onUpdateTitleDraft: (title: string) => void
  onStartTitleEdit: () => void
  onCancelTitleEdit: () => void
  onSaveTitleEdit: () => void
  onUpdateCopyTailLineCount: (rawValue: string) => void
  onCopyTail: () => void
  onUpdateCommandDraft: (command: string) => void
  onNavigateCommandHistory: (direction: TerminalHistoryDirection) => void
  onRunCommand: () => void
  onAutocompleteCommand: () => void
  onClearOutput: () => void
}

type TerminalPanelProps = ManualTerminalPanelProps

const getControlsClassName = (
  variant: TerminalPanelVariant,
  controlsClassName?: string,
): string =>
  controlsClassName ?? (variant === 'floating' ? 'terminalWindow__controls' : 'pinnedTerminalHeadActions')

function TerminalPanel(props: TerminalPanelProps) {
  const { messages } = useI18n()
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const {
    variant,
    controls,
    controlsClassName,
    onHeaderMouseDown,
    titleHint,
    terminal,
    isEditingTitle,
    copyTailLineCount,
    isCopyTailRecentlyCopied,
    onUpdateTitleDraft,
    onStartTitleEdit,
    onCancelTitleEdit,
    onSaveTitleEdit,
    onUpdateCopyTailLineCount,
    onCopyTail,
    onUpdateCommandDraft,
    onNavigateCommandHistory,
    onRunCommand,
    onAutocompleteCommand,
    onClearOutput,
  } = props

  const headerClassName = variant === 'floating' ? 'terminalWindow__dragbar' : 'section__head'
  const bodyClassName = variant === 'floating' ? 'terminalWindow__content' : undefined
  const queue = terminal.queue ?? []
  const hasLiveRuntime = terminal.isBackendSession === true
  const canUseInteractiveTerminal = hasLiveRuntime && terminal.stdinEnabled === true
  const currentCommandPosition =
    typeof terminal.currentCommandIndex === 'number' ? terminal.currentCommandIndex + 1 : null
  const queueSummary = useMemo(() => {
    if (!queue.length) {
      return null
    }
    if (!terminal.currentCommandLabel) {
      return `${queue.length}`
    }
    const prefix = currentCommandPosition ? `${currentCommandPosition}/${queue.length}` : `${queue.length}`
    return `${prefix} ${terminal.currentCommandLabel}`
  }, [currentCommandPosition, queue.length, terminal.currentCommandLabel])

  useEffect(() => {
    const node = bodyRef.current
    if (!node) {
      return
    }
    node.scrollTop = node.scrollHeight
  }, [terminal.lines])

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
                  placeholder={messages.terminal.terminalNamePlaceholder}
                  autoFocus
                />
                <button
                  type="button"
                  className="templateSaveButton"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={onSaveTitleEdit}
                  disabled={!terminal.titleDraft.trim() || terminal.titleDraft.trim() === terminal.title}
                  title={messages.terminal.saveTerminalName(terminal.title)}
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
                  aria-label={messages.terminal.editTerminalName(terminal.title)}
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
                  placeholder={messages.terminal.terminalNamePlaceholder}
                  autoFocus
                />
                <button
                  type="button"
                  className="templateSaveButton"
                  onClick={onSaveTitleEdit}
                  disabled={!terminal.titleDraft.trim() || terminal.titleDraft.trim() === terminal.title}
                  title={messages.terminal.saveTerminalName(terminal.title)}
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
                  aria-label={messages.terminal.editTerminalName(terminal.title)}
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
        <div className="terminalWindow__metaRow">
          <p className="terminalWindow__meta">
            {messages.terminal.exitCode}: {terminal.exitCode ?? '...'}
          </p>
          <p className="terminalWindow__meta terminalWindow__meta--muted">
            {queueSummary ? `${queueSummary} • ` : ''}
            {terminal.promptUser}:{terminal.promptCwd}
          </p>
        </div>
        {hasLiveRuntime ? null : (
          <div className="terminalActions">
            <div className="terminalPrompt">
              {terminal.promptUser}:{terminal.promptCwd}
            </div>
            <div className="terminalCommandInputWrap">
              <input
                value={terminal.draftCommand}
                onChange={(event) => onUpdateCommandDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    onRunCommand()
                    return
                  }
                  if (event.key === 'Tab') {
                    event.preventDefault()
                    onAutocompleteCommand()
                    return
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    onNavigateCommandHistory('up')
                    return
                  }
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    onNavigateCommandHistory('down')
                  }
                }}
                disabled={false}
                placeholder={messages.terminal.typeCommandPlaceholder}
              />
              <div className="terminalInputActions">
                <button
                  type="button"
                  className="terminalInputAction terminalInputAction--clear"
                  onClick={onClearOutput}
                  title={messages.terminal.clearOutput}
                >
                  <span className="terminalInputActionIcon">⌫</span>
                </button>
                <button
                  type="button"
                  className="terminalInputAction terminalInputAction--send"
                  onClick={onRunCommand}
                  disabled={!terminal.draftCommand.trim()}
                  title={messages.terminal.sendCommand}
                >
                  <span className="terminalInputActionIcon">➜</span>
                </button>
              </div>
            </div>
          </div>
        )}
        <div ref={bodyRef} className="terminalBody terminalEmulator terminalEmulator--live">
          {hasLiveRuntime ? (
            <TerminalEmulator
              terminalId={terminal.id}
              canWrite={canUseInteractiveTerminal}
              fallbackLines={terminal.lines.map((line) => line.text)}
            />
          ) : (
            <div className="terminalConsole">
              {terminal.lines.length > 0 ? (
                terminal.lines.map((line) => (
                  <div
                    key={line.id}
                    className={`terminalConsole__line terminalConsole__line--${line.stream}`}
                  >
                    <span className="terminalConsole__timestamp">{line.createdAt.slice(11, 19)}</span>
                    <span className="terminalConsole__text">{line.text}</span>
                  </div>
                ))
              ) : (
                <div className="terminalPlaceholder">
                  <strong>{terminal.title}</strong>
                  <p>Manual terminal is idle. Backend queue output appears here.</p>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="terminalFooterActions">
          <label className="terminalCopyTailControl">
            <span>{messages.terminal.last}</span>
            <input
              type="number"
              min={1}
              max={5000}
              value={copyTailLineCount}
              onChange={(event) => onUpdateCopyTailLineCount(event.target.value)}
              aria-label={messages.terminal.numberOfLinesToCopy}
            />
            <span>{messages.terminal.lines}</span>
          </label>
          <button
            type="button"
            className="terminalFooterCopyButton"
            onClick={onCopyTail}
          >
            {isCopyTailRecentlyCopied ? messages.terminal.copied : messages.terminal.copyTail}
          </button>
        </div>
      </div>
    </>
  )
}

export default TerminalPanel
