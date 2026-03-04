import type { MouseEvent as ReactMouseEvent } from 'react'
import TerminalPanel from '../TerminalPanel'
import {
  RESIZE_DIRECTIONS,
  type ResizeDirection,
  type TerminalWindowDescriptor,
  type TerminalWindowFrame,
} from '../../hooks/useFloatingTerminalWindowsController'

interface FloatingTerminalWindowProps {
  windowItem: TerminalWindowDescriptor
  frame: TerminalWindowFrame
  zIndex: number
  editingManualTitleId: string | null
  onBringToFront: () => void
  onBeginDrag: (event: ReactMouseEvent<HTMLElement>) => void
  onBeginResize: (
    direction: ResizeDirection,
    event: ReactMouseEvent<HTMLElement>,
  ) => void
  onTogglePin: () => void
  onMinimize: () => void
  getCopyTailLineCount: (terminalId: string) => number
  isCopyTailRecentlyCopied: (terminalId: string) => boolean
  onUpdateCopyTailLineCount: (terminalId: string, value: string) => void
  onCopyManualTerminalTail: (terminalId: string) => void
  onUpdateManualTitle: (terminalId: string, title: string) => void
  onStartManualTitleEdit: (terminalId: string, currentTitle: string) => void
  onCancelManualTitleEdit: (terminalId: string, originalTitle: string) => void
  onSaveManualTitleEdit: (terminalId: string) => void
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

function FloatingTerminalWindow({
  windowItem,
  frame,
  zIndex,
  editingManualTitleId,
  onBringToFront,
  onBeginDrag,
  onBeginResize,
  onTogglePin,
  onMinimize,
  getCopyTailLineCount,
  isCopyTailRecentlyCopied,
  onUpdateCopyTailLineCount,
  onCopyManualTerminalTail,
  onUpdateManualTitle,
  onStartManualTitleEdit,
  onCancelManualTitleEdit,
  onSaveManualTitleEdit,
  onUpdateManualCommand,
  onNavigateManualHistory,
  onRunManualCommand,
  onAutocompleteManualCommand,
  onStopManualTerminal,
  onClearManualTerminal,
  onRemoveManualTerminal,
}: FloatingTerminalWindowProps) {
  if (windowItem.kind === 'run') {
    const session = windowItem.session
    return (
      <article
        className="terminalWindow terminalWindow--run"
        style={{
          left: `${frame.x}px`,
          top: `${frame.y}px`,
          width: `${frame.width}px`,
          height: `${frame.height}px`,
          zIndex,
        }}
        onMouseDown={onBringToFront}
      >
        <TerminalPanel
          variant="floating"
          kind="run"
          session={session}
          titleHint="Pipeline output"
          onHeaderMouseDown={onBeginDrag}
          controls={
            <>
              <button
                type="button"
                className="terminalWindowControl terminalWindowControl--pin"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={onTogglePin}
                title="Pin to workflow"
              >
                P
              </button>
              <button
                type="button"
                className="terminalWindowControl"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={onMinimize}
                title="Minimize"
              >
                -
              </button>
              <span className={`status status--${session.status}`}>{session.status}</span>
            </>
          }
        />

        {RESIZE_DIRECTIONS.map((direction) => (
          <span
            key={direction}
            className={`resizeHandle resizeHandle--${direction}`}
            onMouseDown={(event) => onBeginResize(direction, event)}
          />
        ))}
      </article>
    )
  }

  const terminal = windowItem.terminal
  const isEditingTitle = editingManualTitleId === terminal.id

  return (
    <article
      className="terminalWindow terminalWindow--manual"
      style={{
        left: `${frame.x}px`,
        top: `${frame.y}px`,
        width: `${frame.width}px`,
        height: `${frame.height}px`,
        zIndex,
      }}
      onMouseDown={onBringToFront}
    >
      <TerminalPanel
        variant="floating"
        kind="manual"
        terminal={terminal}
        isEditingTitle={isEditingTitle}
        titleHint="Manual terminal"
        onHeaderMouseDown={onBeginDrag}
        onUpdateTitleDraft={(title) => onUpdateManualTitle(terminal.id, title)}
        onStartTitleEdit={() =>
          onStartManualTitleEdit(terminal.id, terminal.titleDraft || terminal.title)
        }
        onCancelTitleEdit={() => onCancelManualTitleEdit(terminal.id, terminal.title)}
        onSaveTitleEdit={() => onSaveManualTitleEdit(terminal.id)}
        onUpdateCommand={(command) => onUpdateManualCommand(terminal.id, command)}
        onAutocompleteCommand={() => onAutocompleteManualCommand(terminal.id)}
        onNavigateHistory={(direction, currentDraft) =>
          onNavigateManualHistory(terminal.id, direction, currentDraft)
        }
        onRunCommand={() => onRunManualCommand(terminal.id)}
        onClearTerminal={() => onClearManualTerminal(terminal.id)}
        copyTailLineCount={getCopyTailLineCount(terminal.id)}
        onUpdateCopyTailLineCount={(rawValue) =>
          onUpdateCopyTailLineCount(terminal.id, rawValue)
        }
        onCopyTail={() => onCopyManualTerminalTail(terminal.id)}
        isCopyTailRecentlyCopied={isCopyTailRecentlyCopied(terminal.id)}
        controls={
          <>
            <button
              type="button"
              className="terminalWindowControl terminalWindowControl--pin"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={onTogglePin}
              title="Pin to workflow"
            >
              P
            </button>
            <button
              type="button"
              className="terminalWindowControl"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={onMinimize}
              title="Minimize"
            >
              -
            </button>
            <button
              type="button"
              className="terminalWindowControl terminalWindowControl--warning"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => onStopManualTerminal(terminal.id)}
              title="Stop terminal"
              disabled={terminal.status !== 'running'}
            >
              ‖
            </button>
            <button
              type="button"
              className="terminalWindowControl terminalWindowControl--danger"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => onRemoveManualTerminal(terminal.id)}
              title="Close terminal"
            >
              ×
            </button>
            <span className={`status status--${terminal.status}`}>{terminal.status}</span>
          </>
        }
      />

      {RESIZE_DIRECTIONS.map((direction) => (
        <span
          key={direction}
          className={`resizeHandle resizeHandle--${direction}`}
          onMouseDown={(event) => onBeginResize(direction, event)}
        />
      ))}
    </article>
  )
}

export default FloatingTerminalWindow
