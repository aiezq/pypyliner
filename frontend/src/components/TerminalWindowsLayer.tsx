import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { ManualTerminal, TerminalLine, TerminalSession } from '../types'


interface TerminalWindowsLayerProps {
  runSessions: TerminalSession[]
  manualTerminals: ManualTerminal[]
  pinnedWindowIds: string[]
  requestedMinimizedWindowIds: string[]
  onConsumeRequestedMinimizeWindow: (windowId: string) => void
  onTogglePinWindow: (windowId: string) => void
  getCopyTailLineCount: (terminalId: string) => number
  isCopyTailRecentlyCopied: (terminalId: string) => boolean
  onUpdateCopyTailLineCount: (terminalId: string, value: string) => void
  onCopyManualTerminalTail: (terminalId: string) => void
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

type WindowKind = 'run' | 'manual'
type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

interface TerminalWindowDescriptor {
  windowId: string
  kind: WindowKind
  runSession?: TerminalSession
  manualTerminal?: ManualTerminal
}

interface TerminalWindowFrame {
  x: number
  y: number
  width: number
  height: number
}

interface DragState {
  windowId: string
  offsetX: number
  offsetY: number
}

interface ResizeState {
  windowId: string
  direction: ResizeDirection
  startMouseX: number
  startMouseY: number
  startFrame: TerminalWindowFrame
}

const WINDOW_MARGIN = 8
const WINDOW_MIN_WIDTH = 360
const WINDOW_MIN_HEIGHT = 220

const RESIZE_DIRECTIONS: ResizeDirection[] = [
  'n',
  's',
  'e',
  'w',
  'ne',
  'nw',
  'se',
  'sw',
]

const createDefaultWindowFrame = (
  index: number,
  kind: WindowKind,
): TerminalWindowFrame => ({
  x: 20 + (index % 4) * 34,
  y: 118 + (index % 6) * 30,
  width: kind === 'manual' ? 920 : 560,
  height: kind === 'manual' ? 420 : 320,
})

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const getViewportLimits = (): {
  maxWidth: number
  maxHeight: number
  maxX: number
  maxY: number
} => {
  const maxWidth = Math.max(WINDOW_MIN_WIDTH, window.innerWidth - WINDOW_MARGIN * 2)
  const maxHeight = Math.max(WINDOW_MIN_HEIGHT, window.innerHeight - WINDOW_MARGIN * 2)
  const maxX = Math.max(WINDOW_MARGIN, window.innerWidth - WINDOW_MARGIN)
  const maxY = Math.max(WINDOW_MARGIN, window.innerHeight - WINDOW_MARGIN)
  return { maxWidth, maxHeight, maxX, maxY }
}

const constrainFrame = (frame: TerminalWindowFrame): TerminalWindowFrame => {
  const { maxWidth, maxHeight, maxX, maxY } = getViewportLimits()
  const width = clamp(frame.width, WINDOW_MIN_WIDTH, maxWidth)
  const height = clamp(frame.height, WINDOW_MIN_HEIGHT, maxHeight)
  const x = clamp(frame.x, WINDOW_MARGIN, maxX - width)
  const y = clamp(frame.y, WINDOW_MARGIN, maxY - height)
  return { x, y, width, height }
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

function TerminalWindowsLayer({
  runSessions,
  manualTerminals,
  pinnedWindowIds,
  requestedMinimizedWindowIds,
  onConsumeRequestedMinimizeWindow,
  onTogglePinWindow,
  getCopyTailLineCount,
  isCopyTailRecentlyCopied,
  onUpdateCopyTailLineCount,
  onCopyManualTerminalTail,
  onUpdateManualTitle,
  onRenameManualTerminal,
  onUpdateManualCommand,
  onNavigateManualHistory,
  onRunManualCommand,
  onAutocompleteManualCommand,
  onStopManualTerminal,
  onClearManualTerminal,
  onRemoveManualTerminal,
}: TerminalWindowsLayerProps) {
  const windows = useMemo<TerminalWindowDescriptor[]>(
    () => [
      ...runSessions.map((session) => ({
        windowId: `run:${session.id}`,
        kind: 'run' as const,
        runSession: session,
      })),
      ...manualTerminals.map((terminal) => ({
        windowId: `manual:${terminal.id}`,
        kind: 'manual' as const,
        manualTerminal: terminal,
      })),
    ],
    [runSessions, manualTerminals],
  )

  const [windowFrames, setWindowFrames] = useState<Record<string, TerminalWindowFrame>>({})
  const [windowZIndexes, setWindowZIndexes] = useState<Record<string, number>>({})
  const [minimizedWindows, setMinimizedWindows] = useState<Record<string, boolean>>({})
  const [editingManualTitleId, setEditingManualTitleId] = useState<string | null>(null)

  const highestZIndexRef = useRef(10)
  const dragStateRef = useRef<DragState | null>(null)
  const resizeStateRef = useRef<ResizeState | null>(null)
  const windowFramesRef = useRef<Record<string, TerminalWindowFrame>>({})

  const defaultWindowFrames = useMemo<Record<string, TerminalWindowFrame>>(() => {
    const next: Record<string, TerminalWindowFrame> = {}
    for (const [index, windowItem] of windows.entries()) {
      next[windowItem.windowId] = constrainFrame(
        createDefaultWindowFrame(index, windowItem.kind),
      )
    }
    return next
  }, [windows])

  const pinnedWindowSet = useMemo(() => new Set(pinnedWindowIds), [pinnedWindowIds])
  const requestedMinimizedWindowSet = useMemo(
    () => new Set(requestedMinimizedWindowIds),
    [requestedMinimizedWindowIds],
  )

  useEffect(() => {
    windowFramesRef.current = {
      ...defaultWindowFrames,
      ...windowFrames,
    }
  }, [defaultWindowFrames, windowFrames])

  useEffect(() => {
    const onMouseMove = (event: globalThis.MouseEvent): void => {
      const dragState = dragStateRef.current
      if (dragState) {
        setWindowFrames((prev) => {
          const current = prev[dragState.windowId] ?? defaultWindowFrames[dragState.windowId]
          if (!current) {
            return prev
          }

          const rawFrame: TerminalWindowFrame = {
            ...current,
            x: event.clientX - dragState.offsetX,
            y: event.clientY - dragState.offsetY,
          }
          const nextFrame = constrainFrame(rawFrame)

          if (current.x === nextFrame.x && current.y === nextFrame.y) {
            return prev
          }

          return {
            ...prev,
            [dragState.windowId]: nextFrame,
          }
        })
        return
      }

      const resizeState = resizeStateRef.current
      if (!resizeState) {
        return
      }

      const dx = event.clientX - resizeState.startMouseX
      const dy = event.clientY - resizeState.startMouseY
      const { direction, windowId, startFrame } = resizeState

      let nextFrame: TerminalWindowFrame = { ...startFrame }

      if (direction.includes('e')) {
        nextFrame.width = startFrame.width + dx
      }
      if (direction.includes('s')) {
        nextFrame.height = startFrame.height + dy
      }
      if (direction.includes('w')) {
        const nextWidth = startFrame.width - dx
        nextFrame.width = nextWidth
        nextFrame.x = startFrame.x + (startFrame.width - nextWidth)
      }
      if (direction.includes('n')) {
        const nextHeight = startFrame.height - dy
        nextFrame.height = nextHeight
        nextFrame.y = startFrame.y + (startFrame.height - nextHeight)
      }

      nextFrame = constrainFrame(nextFrame)

      setWindowFrames((prev) => {
        const current = prev[windowId] ?? defaultWindowFrames[windowId]
        if (
          current &&
          current.x === nextFrame.x &&
          current.y === nextFrame.y &&
          current.width === nextFrame.width &&
          current.height === nextFrame.height
        ) {
          return prev
        }

        return {
          ...prev,
          [windowId]: nextFrame,
        }
      })
    }

    const onMouseUp = (): void => {
      dragStateRef.current = null
      resizeStateRef.current = null
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [defaultWindowFrames])

  const bringToFront = (windowId: string): void => {
    setWindowZIndexes((prev) => {
      const highestExisting = Object.values(prev).reduce(
        (max, value) => (value > max ? value : max),
        highestZIndexRef.current,
      )
      highestZIndexRef.current = highestExisting
      const current = prev[windowId] ?? 0
      if (current === highestExisting) {
        return prev
      }
      const nextZIndex = highestExisting + 1
      highestZIndexRef.current = nextZIndex
      return {
        ...prev,
        [windowId]: nextZIndex,
      }
    })
  }

  const beginWindowDrag = (windowId: string, event: MouseEvent<HTMLElement>): void => {
    event.preventDefault()
    bringToFront(windowId)
    const current = windowFramesRef.current[windowId]
    if (!current) {
      return
    }
    dragStateRef.current = {
      windowId,
      offsetX: event.clientX - current.x,
      offsetY: event.clientY - current.y,
    }
  }

  const beginWindowResize = (
    windowId: string,
    direction: ResizeDirection,
    event: MouseEvent<HTMLElement>,
  ): void => {
    event.preventDefault()
    event.stopPropagation()
    bringToFront(windowId)
    const current = windowFramesRef.current[windowId]
    if (!current) {
      return
    }
    resizeStateRef.current = {
      windowId,
      direction,
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      startFrame: current,
    }
  }

  const minimizeWindow = (windowId: string): void => {
    setMinimizedWindows((prev) => ({
      ...prev,
      [windowId]: true,
    }))
  }

  const restoreWindow = (windowId: string): void => {
    setMinimizedWindows((prev) => ({
      ...prev,
      [windowId]: false,
    }))
    if (requestedMinimizedWindowSet.has(windowId)) {
      onConsumeRequestedMinimizeWindow(windowId)
    }
    bringToFront(windowId)
  }

  const startManualTitleEdit = (terminalId: string, currentTitle: string): void => {
    onUpdateManualTitle(terminalId, currentTitle)
    setEditingManualTitleId(terminalId)
  }

  const cancelManualTitleEdit = (terminalId: string, originalTitle: string): void => {
    onUpdateManualTitle(terminalId, originalTitle)
    setEditingManualTitleId((prev) => (prev === terminalId ? null : prev))
  }

  const saveManualTitleEdit = (terminalId: string): void => {
    onRenameManualTerminal(terminalId)
    setEditingManualTitleId((prev) => (prev === terminalId ? null : prev))
  }

  if (windows.length === 0) {
    return null
  }

  const isWindowMinimized = (windowId: string): boolean =>
    minimizedWindows[windowId] === true || requestedMinimizedWindowSet.has(windowId)

  const minimizedList = windows.filter(
    (windowItem) =>
      isWindowMinimized(windowItem.windowId) && !pinnedWindowSet.has(windowItem.windowId),
  )

  return (
    <>
      <div className="terminalWindowsLayer">
        {windows.map((windowItem, index) => {
          if (pinnedWindowSet.has(windowItem.windowId)) {
            return null
          }
          if (isWindowMinimized(windowItem.windowId)) {
            return null
          }

          const frame =
            windowFrames[windowItem.windowId] ??
            defaultWindowFrames[windowItem.windowId] ??
            constrainFrame(createDefaultWindowFrame(index, windowItem.kind))
          const zIndex = windowZIndexes[windowItem.windowId] ?? index + 1

          if (windowItem.kind === 'run' && windowItem.runSession) {
            const session = windowItem.runSession
            return (
              <article
                key={windowItem.windowId}
                className="terminalWindow terminalWindow--run"
                style={{
                  left: `${frame.x}px`,
                  top: `${frame.y}px`,
                  width: `${frame.width}px`,
                  height: `${frame.height}px`,
                  zIndex,
                }}
                onMouseDown={() => bringToFront(windowItem.windowId)}
              >
                <header
                  className="terminalWindow__dragbar"
                  onMouseDown={(event) => beginWindowDrag(windowItem.windowId, event)}
                >
                  <div className="terminalWindow__title">
                    <strong>{session.title}</strong>
                    <span className="terminalWindow__hint">Pipeline output</span>
                  </div>
                  <div className="terminalWindow__controls">
                    <button
                      type="button"
                      className="terminalWindowControl terminalWindowControl--pin"
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={() => onTogglePinWindow(windowItem.windowId)}
                      title="Pin to workflow"
                    >
                      P
                    </button>
                    <button
                      type="button"
                      className="terminalWindowControl"
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={() => minimizeWindow(windowItem.windowId)}
                      title="Minimize"
                    >
                      -
                    </button>
                    <span className={`status status--${session.status}`}>
                      {session.status}
                    </span>
                  </div>
                </header>

                <div className="terminalWindow__content">
                  <p className="terminalWindow__meta">exit: {session.exitCode ?? '...'}</p>
                  <code>{session.command}</code>
                  <TerminalOutput lines={session.lines} />
                </div>

                {RESIZE_DIRECTIONS.map((direction) => (
                  <span
                    key={direction}
                    className={`resizeHandle resizeHandle--${direction}`}
                    onMouseDown={(event) =>
                      beginWindowResize(windowItem.windowId, direction, event)
                    }
                  />
                ))}
              </article>
            )
          }

          if (!windowItem.manualTerminal) {
            return null
          }
          const terminal = windowItem.manualTerminal
          const isEditingTitle = editingManualTitleId === terminal.id

          return (
            <article
              key={windowItem.windowId}
              className="terminalWindow terminalWindow--manual"
              style={{
                left: `${frame.x}px`,
                top: `${frame.y}px`,
                width: `${frame.width}px`,
                height: `${frame.height}px`,
                zIndex,
              }}
              onMouseDown={() => bringToFront(windowItem.windowId)}
            >
              <header
                className="terminalWindow__dragbar"
                onMouseDown={(event) => beginWindowDrag(windowItem.windowId, event)}
              >
                <div className="terminalWindow__title terminalTitleEditable templateEditable">
                  {isEditingTitle ? (
                    <div
                      className="terminalWindow__titleInputRow templateEditInline"
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <input
                        value={terminal.titleDraft}
                        onChange={(event) =>
                          onUpdateManualTitle(terminal.id, event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            saveManualTitleEdit(terminal.id)
                            return
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault()
                            cancelManualTitleEdit(terminal.id, terminal.title)
                          }
                        }}
                        placeholder="Terminal name"
                        autoFocus
                      />
                      <button
                        type="button"
                        className="templateSaveButton"
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={() => saveManualTitleEdit(terminal.id)}
                        disabled={
                          !terminal.titleDraft.trim() ||
                          terminal.titleDraft.trim() === terminal.title
                        }
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
                        onClick={() =>
                          startManualTitleEdit(
                            terminal.id,
                            terminal.titleDraft || terminal.title,
                          )
                        }
                        aria-label={`Edit terminal name: ${terminal.title}`}
                      >
                        ✎
                      </button>
                    </div>
                  )}
                  <span className="terminalWindow__hint">Manual terminal</span>
                </div>
                <div className="terminalWindow__controls">
                  <button
                    type="button"
                    className="terminalWindowControl terminalWindowControl--pin"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={() => onTogglePinWindow(windowItem.windowId)}
                    title="Pin to workflow"
                  >
                    P
                  </button>
                  <button
                    type="button"
                    className="terminalWindowControl"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={() => minimizeWindow(windowItem.windowId)}
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
                </div>
              </header>

              <div className="terminalWindow__content">
                <p className="terminalWindow__meta">exit: {terminal.exitCode ?? '...'}</p>

                <div className="terminalActions">
                  <span
                    className="terminalPrompt"
                    title={`${terminal.promptUser}:${terminal.promptCwd}`}
                  >
                    {terminal.promptUser}:{terminal.promptCwd}$
                  </span>
                  <div className="terminalCommandInputWrap">
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
                    <div className="terminalInputActions">
                      <button
                        type="button"
                        className="terminalInputAction terminalInputAction--clear"
                        onClick={() => onClearManualTerminal(terminal.id)}
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
                        onClick={() => onRunManualCommand(terminal.id)}
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
                      value={getCopyTailLineCount(terminal.id)}
                      onChange={(event) =>
                        onUpdateCopyTailLineCount(terminal.id, event.target.value)
                      }
                      title="Number of lines to copy"
                    />
                    <span>lines</span>
                  </label>
                  <button
                    type="button"
                    className="terminalFooterCopyButton"
                    onClick={() => onCopyManualTerminalTail(terminal.id)}
                    title="Copy last lines to clipboard"
                  >
                    {isCopyTailRecentlyCopied(terminal.id) ? 'Copied' : 'Copy tail'}
                  </button>
                </div>
              </div>

              {RESIZE_DIRECTIONS.map((direction) => (
                <span
                  key={direction}
                  className={`resizeHandle resizeHandle--${direction}`}
                  onMouseDown={(event) =>
                    beginWindowResize(windowItem.windowId, direction, event)
                  }
                />
              ))}
            </article>
          )
        })}
      </div>

      {minimizedList.length > 0 ? (
        <aside className="terminalDock" aria-label="Minimized terminals dock">
          <div className="terminalDock__list">
            {minimizedList.map((windowItem) => {
              const title =
                windowItem.kind === 'manual'
                  ? windowItem.manualTerminal?.title || 'Manual terminal'
                  : windowItem.runSession?.title || 'Pipeline terminal'
              const badge = windowItem.kind === 'manual' ? 'M' : 'P'
              return (
                <button
                  key={windowItem.windowId}
                  type="button"
                  className="terminalDock__item"
                  onClick={() => restoreWindow(windowItem.windowId)}
                  title={`Restore: ${title}`}
                >
                  <span className="terminalDock__icon">{badge}</span>
                  <span className="terminalDock__label">{title}</span>
                </button>
              )
            })}
          </div>
        </aside>
      ) : null}
    </>
  )
}

export default TerminalWindowsLayer
