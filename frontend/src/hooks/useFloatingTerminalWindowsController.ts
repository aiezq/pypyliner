import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import type { ManualTerminal, TerminalSession } from '../types'

type WindowKind = 'run' | 'manual'
export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export interface RunTerminalWindowDescriptor {
  windowId: string
  kind: 'run'
  session: TerminalSession
}

export interface ManualTerminalWindowDescriptor {
  windowId: string
  kind: 'manual'
  terminal: ManualTerminal
}

export type TerminalWindowDescriptor =
  | RunTerminalWindowDescriptor
  | ManualTerminalWindowDescriptor

export interface TerminalWindowFrame {
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

interface UseFloatingTerminalWindowsControllerOptions {
  runSessions: TerminalSession[]
  manualTerminals: ManualTerminal[]
  pinnedWindowIds: string[]
  requestedMinimizedWindowIds: string[]
  onConsumeRequestedMinimizeWindow: (windowId: string) => void
  onUpdateManualTitle: (terminalId: string, title: string) => void
  onRenameManualTerminal: (terminalId: string) => void
}

const WINDOW_MARGIN = 8
const WINDOW_MIN_WIDTH = 360
const WINDOW_MIN_HEIGHT = 220

export const RESIZE_DIRECTIONS: ResizeDirection[] = [
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

export const useFloatingTerminalWindowsController = ({
  runSessions,
  manualTerminals,
  pinnedWindowIds,
  requestedMinimizedWindowIds,
  onConsumeRequestedMinimizeWindow,
  onUpdateManualTitle,
  onRenameManualTerminal,
}: UseFloatingTerminalWindowsControllerOptions) => {
  const windows = useMemo<TerminalWindowDescriptor[]>(
    () => [
      ...runSessions.map((session): TerminalWindowDescriptor => ({
        windowId: `run:${session.id}`,
        kind: 'run',
        session,
      })),
      ...manualTerminals.map((terminal): TerminalWindowDescriptor => ({
        windowId: `manual:${terminal.id}`,
        kind: 'manual',
        terminal,
      })),
    ],
    [manualTerminals, runSessions],
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

  const beginWindowDrag = (windowId: string, event: ReactMouseEvent<HTMLElement>): void => {
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
    event: ReactMouseEvent<HTMLElement>,
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

  const visibleWindows = useMemo(
    () =>
      windows.filter(
        (windowItem) =>
          !pinnedWindowSet.has(windowItem.windowId) &&
          !(
            minimizedWindows[windowItem.windowId] === true ||
            requestedMinimizedWindowSet.has(windowItem.windowId)
          ),
      ),
    [pinnedWindowSet, windows, minimizedWindows, requestedMinimizedWindowSet],
  )

  const minimizedWindowsList = useMemo(
    () =>
      windows.filter(
        (windowItem) =>
          !pinnedWindowSet.has(windowItem.windowId) &&
          (
            minimizedWindows[windowItem.windowId] === true ||
            requestedMinimizedWindowSet.has(windowItem.windowId)
          ),
      ),
    [pinnedWindowSet, windows, minimizedWindows, requestedMinimizedWindowSet],
  )

  const getWindowFrame = (windowItem: TerminalWindowDescriptor, index: number): TerminalWindowFrame =>
    windowFrames[windowItem.windowId] ??
    defaultWindowFrames[windowItem.windowId] ??
    constrainFrame(createDefaultWindowFrame(index, windowItem.kind))

  const getWindowZIndex = (windowId: string, index: number): number =>
    windowZIndexes[windowId] ?? index + 1

  return {
    windows,
    visibleWindows,
    minimizedWindowsList,
    editingManualTitleId,
    bringToFront,
    beginWindowDrag,
    beginWindowResize,
    minimizeWindow,
    restoreWindow,
    startManualTitleEdit,
    cancelManualTitleEdit,
    saveManualTitleEdit,
    getWindowFrame,
    getWindowZIndex,
  }
}
