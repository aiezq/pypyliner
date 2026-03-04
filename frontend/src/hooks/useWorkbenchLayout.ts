import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent } from 'react'

export type WorkbenchPanelKey = string
type WorkbenchPanelCollapsedState = Record<string, boolean>

interface WorkbenchPanelResizeState {
  panel: WorkbenchPanelKey
  startX: number
  startWidth: number
}

const WORKBENCH_LAYOUT_STORAGE_KEY = 'operator_helper.workbench_layout.v1'
const WORKBENCH_COLLAPSE_STORAGE_KEY = 'operator_helper.workbench_collapsed.v1'
const WORKBENCH_WIDTHS_STORAGE_KEY = 'operator_helper.workbench_widths.v1'
const WORKBENCH_FULLSCREEN_STORAGE_KEY = 'operator_helper.workbench_fullwidth.v1'

export const WORKBENCH_PANEL_FLOW = 'flow'
export const WORKBENCH_PANEL_DOCK = 'dock'
const WORKBENCH_TERMINAL_PANEL_PREFIX = 'terminal:'
export const MIN_WORKBENCH_PANEL_WIDTH = 320

const DEFAULT_WORKBENCH_PANEL_ORDER: WorkbenchPanelKey[] = [
  WORKBENCH_PANEL_FLOW,
  WORKBENCH_PANEL_DOCK,
]
const DEFAULT_WORKBENCH_PANEL_COLLAPSE: WorkbenchPanelCollapsedState = {
  [WORKBENCH_PANEL_FLOW]: false,
  [WORKBENCH_PANEL_DOCK]: false,
}
const DEFAULT_WORKBENCH_PANEL_WIDTHS: Record<string, number> = {
  [WORKBENCH_PANEL_FLOW]: 860,
  [WORKBENCH_PANEL_DOCK]: 460,
}

export const isWorkbenchTerminalPanelKey = (value: string): boolean =>
  value.startsWith(WORKBENCH_TERMINAL_PANEL_PREFIX) &&
  value.length > WORKBENCH_TERMINAL_PANEL_PREFIX.length

export const toTerminalWorkbenchPanelKey = (windowId: string): WorkbenchPanelKey =>
  `${WORKBENCH_TERMINAL_PANEL_PREFIX}${windowId}`

export const toWorkbenchTerminalWindowId = (panel: WorkbenchPanelKey): string | null => {
  if (!isWorkbenchTerminalPanelKey(panel)) {
    return null
  }
  return panel.slice(WORKBENCH_TERMINAL_PANEL_PREFIX.length)
}

const isWorkbenchPanelKey = (value: string): value is WorkbenchPanelKey =>
  value === WORKBENCH_PANEL_FLOW ||
  value === WORKBENCH_PANEL_DOCK ||
  isWorkbenchTerminalPanelKey(value)

const normalizeWorkbenchOrder = (
  value: unknown,
): WorkbenchPanelKey[] | null => {
  if (!Array.isArray(value)) {
    return null
  }
  const seen = new Set<WorkbenchPanelKey>()
  const normalized: WorkbenchPanelKey[] = []

  for (const item of value) {
    if (typeof item !== 'string' || !isWorkbenchPanelKey(item)) {
      return null
    }
    if (seen.has(item)) {
      continue
    }
    normalized.push(item)
    seen.add(item)
  }

  for (const item of DEFAULT_WORKBENCH_PANEL_ORDER) {
    if (!seen.has(item)) {
      normalized.push(item)
    }
  }

  return normalized
}

const readStoredWorkbenchOrder = (): WorkbenchPanelKey[] => {
  if (typeof window === 'undefined') {
    return [...DEFAULT_WORKBENCH_PANEL_ORDER]
  }
  try {
    const raw = window.localStorage.getItem(WORKBENCH_LAYOUT_STORAGE_KEY)
    if (!raw) {
      return [...DEFAULT_WORKBENCH_PANEL_ORDER]
    }
    const parsed = JSON.parse(raw) as unknown
    const normalized = normalizeWorkbenchOrder(parsed)
    return normalized ? [...normalized] : [...DEFAULT_WORKBENCH_PANEL_ORDER]
  } catch {
    return [...DEFAULT_WORKBENCH_PANEL_ORDER]
  }
}

const normalizeWorkbenchCollapseState = (
  value: unknown,
): WorkbenchPanelCollapsedState | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const raw = value as Record<string, unknown>
  const normalized: WorkbenchPanelCollapsedState = { ...DEFAULT_WORKBENCH_PANEL_COLLAPSE }
  for (const [key, nextValue] of Object.entries(raw)) {
    if (!isWorkbenchPanelKey(key) || typeof nextValue !== 'boolean') {
      continue
    }
    normalized[key] = nextValue
  }
  return normalized
}

const readStoredWorkbenchCollapseState = (): WorkbenchPanelCollapsedState => {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_WORKBENCH_PANEL_COLLAPSE }
  }
  try {
    const raw = window.localStorage.getItem(WORKBENCH_COLLAPSE_STORAGE_KEY)
    if (!raw) {
      return { ...DEFAULT_WORKBENCH_PANEL_COLLAPSE }
    }
    const parsed = JSON.parse(raw) as unknown
    const normalized = normalizeWorkbenchCollapseState(parsed)
    return normalized ? { ...normalized } : { ...DEFAULT_WORKBENCH_PANEL_COLLAPSE }
  } catch {
    return { ...DEFAULT_WORKBENCH_PANEL_COLLAPSE }
  }
}

const normalizeWorkbenchWidthsState = (
  value: unknown,
): Record<string, number> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const raw = value as Record<string, unknown>
  const normalized: Record<string, number> = {}
  for (const [key, nextValue] of Object.entries(raw)) {
    if (!isWorkbenchPanelKey(key) || typeof nextValue !== 'number') {
      continue
    }
    if (!Number.isFinite(nextValue)) {
      continue
    }
    normalized[key] = Math.max(MIN_WORKBENCH_PANEL_WIDTH, Math.round(nextValue))
  }
  return normalized
}

const readStoredWorkbenchWidthsState = (): Record<string, number> => {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_WORKBENCH_PANEL_WIDTHS }
  }
  try {
    const raw = window.localStorage.getItem(WORKBENCH_WIDTHS_STORAGE_KEY)
    if (!raw) {
      return { ...DEFAULT_WORKBENCH_PANEL_WIDTHS }
    }
    const parsed = JSON.parse(raw) as unknown
    const normalized = normalizeWorkbenchWidthsState(parsed)
    return normalized
      ? { ...DEFAULT_WORKBENCH_PANEL_WIDTHS, ...normalized }
      : { ...DEFAULT_WORKBENCH_PANEL_WIDTHS }
  } catch {
    return { ...DEFAULT_WORKBENCH_PANEL_WIDTHS }
  }
}

const normalizeWorkbenchFullWidthState = (
  value: unknown,
): Record<string, boolean> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const raw = value as Record<string, unknown>
  const normalized: Record<string, boolean> = {}
  for (const [key, nextValue] of Object.entries(raw)) {
    if (!isWorkbenchPanelKey(key) || typeof nextValue !== 'boolean') {
      continue
    }
    normalized[key] = nextValue
  }
  return normalized
}

const readStoredWorkbenchFullWidthState = (): Record<string, boolean> => {
  if (typeof window === 'undefined') {
    return {}
  }
  try {
    const raw = window.localStorage.getItem(WORKBENCH_FULLSCREEN_STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as unknown
    const normalized = normalizeWorkbenchFullWidthState(parsed)
    return normalized ?? {}
  } catch {
    return {}
  }
}

const reorderWorkbenchPanels = (
  current: WorkbenchPanelKey[],
  dragged: WorkbenchPanelKey,
  target: WorkbenchPanelKey,
): WorkbenchPanelKey[] => {
  if (dragged === target) {
    return current
  }
  const sourceIndex = current.indexOf(dragged)
  const targetIndex = current.indexOf(target)
  if (sourceIndex === -1 || targetIndex === -1) {
    return current
  }

  const next = [...current]
  const [moved] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, moved)
  return next
}

interface UseWorkbenchLayoutOptions {
  terminalPanelKeys: WorkbenchPanelKey[]
}

export const useWorkbenchLayout = ({ terminalPanelKeys }: UseWorkbenchLayoutOptions) => {
  const [workbenchPanelOrder, setWorkbenchPanelOrder] = useState<WorkbenchPanelKey[]>(
    readStoredWorkbenchOrder(),
  )
  const [draggingWorkbenchPanel, setDraggingWorkbenchPanel] =
    useState<WorkbenchPanelKey | null>(null)
  const [dragOverWorkbenchPanel, setDragOverWorkbenchPanel] =
    useState<WorkbenchPanelKey | null>(null)
  const [workbenchPanelCollapsed, setWorkbenchPanelCollapsed] =
    useState<WorkbenchPanelCollapsedState>(readStoredWorkbenchCollapseState())
  const [workbenchPanelWidths, setWorkbenchPanelWidths] = useState<Record<string, number>>(
    readStoredWorkbenchWidthsState(),
  )
  const [workbenchPanelFullWidth, setWorkbenchPanelFullWidth] = useState<
    Record<string, boolean>
  >(readStoredWorkbenchFullWidthState())
  const [workbenchPanelPreviousWidths, setWorkbenchPanelPreviousWidths] = useState<
    Record<string, number>
  >({})
  const workbenchPanelResizeRef = useRef<WorkbenchPanelResizeState | null>(null)

  const visibleWorkbenchPanelOrder = useMemo(() => {
    const terminalPanelSet = new Set(terminalPanelKeys)
    const next = workbenchPanelOrder.filter((panel) => {
      if (!isWorkbenchTerminalPanelKey(panel)) {
        return true
      }
      return terminalPanelSet.has(panel)
    })

    for (const panel of terminalPanelKeys) {
      if (!next.includes(panel)) {
        next.push(panel)
      }
    }
    return next
  }, [terminalPanelKeys, workbenchPanelOrder])

  const startWorkbenchPanelDrag = (
    panel: WorkbenchPanelKey,
    event: ReactDragEvent<HTMLElement>,
  ): void => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', panel)
    setDraggingWorkbenchPanel(panel)
    setDragOverWorkbenchPanel(null)
  }

  const onWorkbenchPanelDragOver = (
    panel: WorkbenchPanelKey,
    event: ReactDragEvent<HTMLElement>,
  ): void => {
    event.preventDefault()
    if (!draggingWorkbenchPanel || draggingWorkbenchPanel === panel) {
      return
    }
    setDragOverWorkbenchPanel(panel)
  }

  const onWorkbenchPanelDrop = (
    targetPanel: WorkbenchPanelKey,
    event: ReactDragEvent<HTMLElement>,
  ): void => {
    event.preventDefault()
    const rawSource = draggingWorkbenchPanel ?? event.dataTransfer.getData('text/plain')
    if (!rawSource || !isWorkbenchPanelKey(rawSource)) {
      setDragOverWorkbenchPanel(null)
      setDraggingWorkbenchPanel(null)
      return
    }
    setWorkbenchPanelOrder((prev) => {
      const terminalPanelSet = new Set(terminalPanelKeys)
      const next = prev.filter((panel) => {
        if (!isWorkbenchTerminalPanelKey(panel)) {
          return true
        }
        return terminalPanelSet.has(panel)
      })
      for (const panel of terminalPanelKeys) {
        if (!next.includes(panel)) {
          next.push(panel)
        }
      }
      return reorderWorkbenchPanels(next, rawSource, targetPanel)
    })
    setDragOverWorkbenchPanel(null)
    setDraggingWorkbenchPanel(null)
  }

  const finishWorkbenchPanelDrag = (): void => {
    setDragOverWorkbenchPanel(null)
    setDraggingWorkbenchPanel(null)
  }

  const toggleWorkbenchPanelCollapse = (panel: WorkbenchPanelKey): void => {
    setWorkbenchPanelCollapsed((prev) => ({
      ...prev,
      [panel]: !prev[panel],
    }))
  }

  const startWorkbenchPanelResize = (
    panel: WorkbenchPanelKey,
    event: ReactMouseEvent<HTMLElement>,
    currentWidth: number,
  ): void => {
    event.preventDefault()
    event.stopPropagation()
    workbenchPanelResizeRef.current = {
      panel,
      startX: event.clientX,
      startWidth: currentWidth,
    }
  }

  const toggleWorkbenchPanelFullWidth = (
    panel: WorkbenchPanelKey,
    currentWidth: number,
  ): void => {
    const isFull = workbenchPanelFullWidth[panel] === true
    if (isFull) {
      const restoreWidth =
        workbenchPanelPreviousWidths[panel] ??
        workbenchPanelWidths[panel] ??
        currentWidth
      setWorkbenchPanelWidths((prev) => ({
        ...prev,
        [panel]: Math.max(MIN_WORKBENCH_PANEL_WIDTH, Math.round(restoreWidth)),
      }))
      setWorkbenchPanelFullWidth((prev) => ({
        ...prev,
        [panel]: false,
      }))
      return
    }

    setWorkbenchPanelPreviousWidths((prev) => ({
      ...prev,
      [panel]: currentWidth,
    }))
    setWorkbenchPanelFullWidth((prev) => ({
      ...prev,
      [panel]: true,
    }))
  }

  const removePanelFromLayout = useCallback((panel: WorkbenchPanelKey): void => {
    setWorkbenchPanelOrder((prev) => prev.filter((item) => item !== panel))
    setWorkbenchPanelFullWidth((prev) => ({
      ...prev,
      [panel]: false,
    }))
  }, [])

  const ensurePanelInLayout = useCallback(
    (panel: WorkbenchPanelKey, fallbackWidth: number): void => {
      setWorkbenchPanelOrder((prev) => (prev.includes(panel) ? prev : [...prev, panel]))
      setWorkbenchPanelCollapsed((prev) => ({
        ...prev,
        [panel]: false,
      }))
      setWorkbenchPanelWidths((prev) => ({
        ...prev,
        [panel]: prev[panel] ?? fallbackWidth,
      }))
    },
    [],
  )

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(
        WORKBENCH_LAYOUT_STORAGE_KEY,
        JSON.stringify(workbenchPanelOrder),
      )
    } catch {
      // Ignore storage errors.
    }
  }, [workbenchPanelOrder])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(
        WORKBENCH_COLLAPSE_STORAGE_KEY,
        JSON.stringify(workbenchPanelCollapsed),
      )
    } catch {
      // Ignore storage errors.
    }
  }, [workbenchPanelCollapsed])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(
        WORKBENCH_WIDTHS_STORAGE_KEY,
        JSON.stringify(workbenchPanelWidths),
      )
    } catch {
      // Ignore storage errors.
    }
  }, [workbenchPanelWidths])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(
        WORKBENCH_FULLSCREEN_STORAGE_KEY,
        JSON.stringify(workbenchPanelFullWidth),
      )
    } catch {
      // Ignore storage errors.
    }
  }, [workbenchPanelFullWidth])

  useEffect(() => {
    const onMouseMove = (event: globalThis.MouseEvent): void => {
      const resizeState = workbenchPanelResizeRef.current
      if (!resizeState) {
        return
      }

      const delta = event.clientX - resizeState.startX
      const nextWidth = Math.max(
        MIN_WORKBENCH_PANEL_WIDTH,
        Math.round(resizeState.startWidth + delta),
      )
      setWorkbenchPanelWidths((prev) => ({
        ...prev,
        [resizeState.panel]: nextWidth,
      }))
    }

    const onMouseUp = (): void => {
      workbenchPanelResizeRef.current = null
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  return {
    draggingWorkbenchPanel,
    dragOverWorkbenchPanel,
    workbenchPanelCollapsed,
    workbenchPanelWidths,
    workbenchPanelFullWidth,
    visibleWorkbenchPanelOrder,
    startWorkbenchPanelDrag,
    onWorkbenchPanelDragOver,
    onWorkbenchPanelDrop,
    finishWorkbenchPanelDrag,
    toggleWorkbenchPanelCollapse,
    startWorkbenchPanelResize,
    toggleWorkbenchPanelFullWidth,
    removePanelFromLayout,
    ensurePanelInLayout,
  }
}
