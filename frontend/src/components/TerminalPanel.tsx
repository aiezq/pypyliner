import type { MouseEventHandler, ReactNode } from 'react'
import type { ManualTerminal } from '../types'
import { useI18n } from '../i18n/I18nProvider'

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
  onUpdateTitleDraft: (title: string) => void
  onStartTitleEdit: () => void
  onCancelTitleEdit: () => void
  onSaveTitleEdit: () => void
}

type TerminalPanelProps = ManualTerminalPanelProps

const getControlsClassName = (
  variant: TerminalPanelVariant,
  controlsClassName?: string,
): string =>
  controlsClassName ?? (variant === 'floating' ? 'terminalWindow__controls' : 'pinnedTerminalHeadActions')

function TerminalPanel(props: TerminalPanelProps) {
  const { messages } = useI18n()
  const {
    variant,
    controls,
    controlsClassName,
    onHeaderMouseDown,
    titleHint,
    terminal,
    isEditingTitle,
    onUpdateTitleDraft,
    onStartTitleEdit,
    onCancelTitleEdit,
    onSaveTitleEdit,
  } = props

  const headerClassName = variant === 'floating' ? 'terminalWindow__dragbar' : 'section__head'
  const bodyClassName = variant === 'floating' ? 'terminalWindow__content' : undefined

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
            {terminal.promptUser}:{terminal.promptCwd}
          </p>
        </div>
        <div className="terminalBody terminalEmulator terminalEmulator--placeholder">
          <div className="terminalPlaceholder">
            <strong>{terminal.title}</strong>
            <p>Terminal runtime removed. UI window preserved.</p>
          </div>
        </div>
      </div>
    </>
  )
}

export default TerminalPanel
