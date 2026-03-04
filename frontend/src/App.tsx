import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import CommandPackImportModal from './components/CommandPackImportModal'
import HeaderBar from './components/HeaderBar'
import HistoryPanel from './components/HistoryPanel'
import PipelineDock from './components/PipelineDock'
import PipelineFlowPanel from './components/PipelineFlowPanel'
import PipelineFlowSettingsModal from './components/PipelineFlowSettingsModal'
import TerminalWindowsLayer from './components/TerminalWindowsLayer'
import { PIPELINE_OPEN_TERMINAL_COMMAND } from './data/templates'
import { WS_EVENTS_URL, apiRequest } from './lib/api'
import {
  BackendCommandPackImportResultSchema,
  BackendCommandPackListSchema,
  BackendHistorySchema,
  BackendPipelineFlowListSchema,
  BackendPipelineFlowSchema,
  BackendSnapshotSchema,
  CommandTemplateSchema,
  SocketEventSchema,
} from './lib/schemas'
import {
  createId,
  getErrorMessage,
  isPipelineOpenTerminalCommand,
  toManualTerminal,
  toRunState,
  toTerminalLine,
  upsertManualTerminal,
} from './lib/mappers'
import { useUiStore } from './stores/uiStore'
import type {
  BackendLine,
  BackendManualTerminal,
  BackendCommandPackImportResult,
  BackendCommandPackList,
  BackendHistory,
  BackendPipelineFlow,
  BackendPipelineFlowList,
  BackendRun,
  BackendTemplateCreatePayload,
  BackendTemplateUpdatePayload,
  BackendTerminalCompletion,
  CommandTemplate,
  ManualTerminal,
  PipelineStep,
  RunState,
  RunStatus,
  SessionStatus,
  SocketEvent,
  TerminalLine,
} from './types'
import './App.css'

type TerminalHistoryDirection = 'up' | 'down'
type WorkbenchPanelKey = string
type WorkbenchPanelCollapsedState = Record<string, boolean>

interface WorkbenchPanelResizeState {
  panel: WorkbenchPanelKey
  startX: number
  startWidth: number
}

interface TerminalCommandHistory {
  entries: string[]
  pointer: number
  scratch: string
}

interface TerminalCompletionCycle {
  baseCommand: string
  nextIndex: number
  lastAppliedCommand: string
}

interface PinnedTerminalOutputProps {
  lines: TerminalLine[]
}

type AppView = 'workbench' | 'history'

const MANUAL_HISTORY_STORAGE_KEY = 'operator_helper.manual_terminal_history.v1'
const WORKBENCH_LAYOUT_STORAGE_KEY = 'operator_helper.workbench_layout.v1'
const WORKBENCH_COLLAPSE_STORAGE_KEY = 'operator_helper.workbench_collapsed.v1'
const WORKBENCH_WIDTHS_STORAGE_KEY = 'operator_helper.workbench_widths.v1'
const WORKBENCH_FULLSCREEN_STORAGE_KEY = 'operator_helper.workbench_fullwidth.v1'
const WORKBENCH_PINNED_TERMINALS_STORAGE_KEY = 'operator_helper.pinned_terminals.v1'
const WORKBENCH_PANEL_FLOW = 'flow'
const WORKBENCH_PANEL_DOCK = 'dock'
const WORKBENCH_TERMINAL_PANEL_PREFIX = 'terminal:'
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
const MIN_WORKBENCH_PANEL_WIDTH = 320
const COMMAND_PACKS_QUERY_KEY = ['command-packs'] as const
const HISTORY_QUERY_KEY = ['history'] as const
const PIPELINE_FLOWS_QUERY_KEY = ['pipeline-flows'] as const
const FLOW_DRAFTS_PACK_ID = 'flow_drafts'

const fetchCommandPacks = async (): Promise<BackendCommandPackList> => {
  const payload = await apiRequest<unknown>('/api/command-packs')
  return BackendCommandPackListSchema.parse(payload)
}

const fetchHistory = async (): Promise<BackendHistory> => {
  const payload = await apiRequest<unknown>('/api/history')
  return BackendHistorySchema.parse(payload)
}

const fetchPipelineFlows = async (): Promise<BackendPipelineFlowList> => {
  const payload = await apiRequest<unknown>('/api/pipeline-flows')
  return BackendPipelineFlowListSchema.parse(payload)
}

const ensureUniquePipelineStepIds = (steps: PipelineStep[]): PipelineStep[] => {
  const seen = new Set<string>()
  let hasCollisions = false

  const normalized = steps.map((step) => {
    let nextId = step.id
    while (!nextId || seen.has(nextId)) {
      nextId = createId('step')
      hasCollisions = true
    }
    seen.add(nextId)
    if (nextId === step.id) {
      return step
    }
    hasCollisions = true
    return {
      ...step,
      id: nextId,
    }
  })

  return hasCollisions ? normalized : steps
}

const isWorkbenchTerminalPanelKey = (value: string): boolean =>
  value.startsWith(WORKBENCH_TERMINAL_PANEL_PREFIX) &&
  value.length > WORKBENCH_TERMINAL_PANEL_PREFIX.length

const toTerminalWorkbenchPanelKey = (windowId: string): WorkbenchPanelKey =>
  `${WORKBENCH_TERMINAL_PANEL_PREFIX}${windowId}`

const toWorkbenchTerminalWindowId = (panel: WorkbenchPanelKey): string | null => {
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
    return normalized ? { ...DEFAULT_WORKBENCH_PANEL_WIDTHS, ...normalized } : { ...DEFAULT_WORKBENCH_PANEL_WIDTHS }
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

const readStoredPinnedTerminalWindowIds = (): string[] => {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const raw = window.localStorage.getItem(WORKBENCH_PINNED_TERMINALS_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .filter((item) => item.length > 0)
  } catch {
    return []
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
  const fromIndex = current.indexOf(dragged)
  const toIndex = current.indexOf(target)
  if (fromIndex < 0 || toIndex < 0) {
    return current
  }
  const next = [...current]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

const createEmptyCommandHistory = (): TerminalCommandHistory => ({
  entries: [],
  pointer: -1,
  scratch: '',
})

function PinnedTerminalOutput({ lines }: PinnedTerminalOutputProps) {
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

const readStoredManualHistory = (): Record<string, string[]> => {
  if (typeof window === 'undefined') {
    return {}
  }
  try {
    const raw = window.localStorage.getItem(MANUAL_HISTORY_STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    const result: Record<string, string[]> = {}
    for (const [terminalId, value] of Object.entries(parsed)) {
      if (Array.isArray(value)) {
        const commands = value
          .filter((item): item is string => typeof item === 'string')
          .filter((item) => item.trim().length > 0)
          .slice(-500)
        result[terminalId] = commands
      }
    }
    return result
  } catch {
    return {}
  }
}

const writeStoredManualHistory = (history: Record<string, string[]>): void => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(MANUAL_HISTORY_STORAGE_KEY, JSON.stringify(history))
  } catch {
    // Ignore storage errors (quota/private mode).
  }
}

function App() {
  const queryClient = useQueryClient()
  const pipelineName = useUiStore((state) => state.pipelineName)
  const setPipelineName = useUiStore((state) => state.setPipelineName)
  const isImportModalOpen = useUiStore((state) => state.isImportModalOpen)
  const openImportModal = useUiStore((state) => state.openImportModal)
  const closeImportModal = useUiStore((state) => state.closeImportModal)
  const [isFlowSettingsModalOpen, setIsFlowSettingsModalOpen] = useState(false)
  const [steps, setSteps] = useState<PipelineStep[]>([
    {
      id: createId('step'),
      type: 'template',
      label: 'Open terminal shell',
      command: PIPELINE_OPEN_TERMINAL_COMMAND,
    },
  ])
  const [run, setRun] = useState<RunState | null>(null)
  const [manualTerminals, setManualTerminals] = useState<ManualTerminal[]>([])
  const storedManualHistoryRef = useRef<Record<string, string[]>>(
    readStoredManualHistory(),
  )
  const manualCommandHistoryRef = useRef<Record<string, TerminalCommandHistory>>({})
  const manualCompletionCycleRef = useRef<Record<string, TerminalCompletionCycle>>({})
  const [activeView, setActiveView] = useState<AppView>('workbench')
  const [backendError, setBackendError] = useState<string | null>(null)
  const [selectedPipelineFlowId, setSelectedPipelineFlowId] = useState<string | null>(
    null,
  )
  const [isSocketConnected, setIsSocketConnected] = useState(false)
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
  const [pinnedTerminalWindowIds, setPinnedTerminalWindowIds] = useState<string[]>(
    readStoredPinnedTerminalWindowIds(),
  )
  const [editingPinnedTerminalTitleId, setEditingPinnedTerminalTitleId] = useState<
    string | null
  >(null)
  const [requestedMinimizedTerminalWindowIds, setRequestedMinimizedTerminalWindowIds] =
    useState<string[]>([])
  const [copyTailLineCountsByTerminalId, setCopyTailLineCountsByTerminalId] = useState<
    Record<string, number>
  >({})
  const [copyTailCopiedByTerminalId, setCopyTailCopiedByTerminalId] = useState<
    Record<string, boolean>
  >({})
  const workbenchPanelResizeRef = useRef<WorkbenchPanelResizeState | null>(null)
  const copyTailResetTimeoutByTerminalIdRef = useRef<Record<string, number>>({})

  const isRunning = run?.status === 'running'
  const commandPacksQuery = useQuery({
    queryKey: COMMAND_PACKS_QUERY_KEY,
    queryFn: fetchCommandPacks,
    refetchOnWindowFocus: false,
  })
  const historyQuery = useQuery({
    queryKey: HISTORY_QUERY_KEY,
    queryFn: fetchHistory,
    enabled: activeView === 'history',
    refetchOnWindowFocus: false,
    refetchInterval: activeView === 'history' ? 2500 : false,
  })
  const pipelineFlowsQuery = useQuery({
    queryKey: PIPELINE_FLOWS_QUERY_KEY,
    queryFn: fetchPipelineFlows,
    refetchOnWindowFocus: false,
  })
  const templates = commandPacksQuery.data?.templates ?? []
  const templatePacksCount = commandPacksQuery.data?.packs.length ?? 0
  const savedPipelineFlows = pipelineFlowsQuery.data?.flows ?? []
  const commandPackOptions = useMemo(() => {
    const result: Array<{ id: string; name: string }> = []
    const seen = new Set<string>()
    for (const pack of commandPacksQuery.data?.packs ?? []) {
      if (seen.has(pack.pack_id)) {
        continue
      }
      seen.add(pack.pack_id)
      result.push({
        id: pack.pack_id,
        name: pack.pack_name,
      })
    }
    if (!seen.has(FLOW_DRAFTS_PACK_ID)) {
      result.push({
        id: FLOW_DRAFTS_PACK_ID,
        name: 'Flow Drafts',
      })
    }
    return result
  }, [commandPacksQuery.data?.packs])
  const commandPackNamesById = useMemo(() => {
    const result: Record<string, string> = {}
    for (const pack of commandPacksQuery.data?.packs ?? []) {
      result[pack.pack_id] = pack.pack_name
    }
    if (!result[FLOW_DRAFTS_PACK_ID]) {
      result[FLOW_DRAFTS_PACK_ID] = 'Flow Drafts'
    }
    return result
  }, [commandPacksQuery.data?.packs])
  const savedPipelineFlowOptions = useMemo(
    () =>
      savedPipelineFlows.map((flow) => ({
        id: flow.id,
        name: flow.flow_name,
      })),
    [savedPipelineFlows],
  )

  const createTemplateMutation = useMutation({
    mutationFn: async (payload: BackendTemplateCreatePayload): Promise<CommandTemplate> => {
      const createdTemplate = await apiRequest<unknown>('/api/command-packs/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: payload.name,
          command: payload.command,
          description: payload.description,
          pack_id: payload.pack_id,
        }),
      })
      return CommandTemplateSchema.parse(createdTemplate)
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: COMMAND_PACKS_QUERY_KEY })
    },
  })

  const updateTemplateMutation = useMutation({
    mutationFn: async ({
      templateId,
      payload,
    }: {
      templateId: string
      payload: BackendTemplateUpdatePayload
    }): Promise<CommandTemplate> => {
      const updatedTemplate = await apiRequest<unknown>(
        `/api/command-packs/templates/${encodeURIComponent(templateId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      )
      return CommandTemplateSchema.parse(updatedTemplate)
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: COMMAND_PACKS_QUERY_KEY })
    },
  })

  const moveTemplateMutation = useMutation({
    mutationFn: async ({
      templateId,
      targetPackId,
    }: {
      templateId: string
      targetPackId: string
    }): Promise<CommandTemplate> => {
      const movedTemplate = await apiRequest<unknown>(
        `/api/command-packs/templates/${encodeURIComponent(templateId)}/move`,
        {
          method: 'POST',
          body: JSON.stringify({
            target_pack_id: targetPackId,
          }),
        },
      )
      return CommandTemplateSchema.parse(movedTemplate)
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: COMMAND_PACKS_QUERY_KEY })
    },
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string): Promise<{ deleted: boolean }> =>
      apiRequest<{ deleted: boolean }>(
        `/api/command-packs/templates/${encodeURIComponent(templateId)}`,
        {
          method: 'DELETE',
        },
      ),
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: COMMAND_PACKS_QUERY_KEY })
    },
  })

  const importCommandPackMutation = useMutation({
    mutationFn: async (payload: {
      content: string
      fileName?: string
    }): Promise<BackendCommandPackImportResult> => {
      const importedPack = await apiRequest<unknown>('/api/command-packs/import', {
        method: 'POST',
        body: JSON.stringify({
          content: payload.content,
          file_name: payload.fileName,
        }),
      })
      return BackendCommandPackImportResultSchema.parse(importedPack)
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: COMMAND_PACKS_QUERY_KEY })
    },
  })

  const createPipelineFlowMutation = useMutation({
    mutationFn: async (payload: {
      flow_name: string
      steps: Array<{ type: 'template' | 'custom'; label: string; command: string }>
    }): Promise<BackendPipelineFlow> => {
      const createdFlow = await apiRequest<unknown>('/api/pipeline-flows', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      return BackendPipelineFlowSchema.parse(createdFlow)
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: PIPELINE_FLOWS_QUERY_KEY })
    },
  })

  const updatePipelineFlowMutation = useMutation({
    mutationFn: async ({
      flowId,
      payload,
    }: {
      flowId: string
      payload: {
        flow_name: string
        steps: Array<{ type: 'template' | 'custom'; label: string; command: string }>
      }
    }): Promise<BackendPipelineFlow> => {
      const updatedFlow = await apiRequest<unknown>(
        `/api/pipeline-flows/${encodeURIComponent(flowId)}`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        },
      )
      return BackendPipelineFlowSchema.parse(updatedFlow)
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: PIPELINE_FLOWS_QUERY_KEY })
    },
  })

  const deletePipelineFlowMutation = useMutation({
    mutationFn: async (
      flowId: string,
    ): Promise<{ deleted: boolean; flow_id: string }> =>
      apiRequest<{ deleted: boolean; flow_id: string }>(
        `/api/pipeline-flows/${encodeURIComponent(flowId)}`,
        {
          method: 'DELETE',
        },
      ),
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: PIPELINE_FLOWS_QUERY_KEY })
    },
  })

  const reloadCommandPacks = useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: COMMAND_PACKS_QUERY_KEY,
    })
  }, [queryClient])

  const reloadPipelineFlows = useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: PIPELINE_FLOWS_QUERY_KEY,
    })
  }, [queryClient])

  const addStepFromTemplate = (template: CommandTemplate): void => {
    setSteps((prev) =>
      ensureUniquePipelineStepIds([
        ...prev,
        {
          id: createId('step'),
          type: 'template',
          label: template.name,
          command: template.command,
        },
      ]),
    )
  }

  const createEmptyStep = (): void => {
    setSteps((prev) =>
      ensureUniquePipelineStepIds([
        ...prev,
        {
          id: createId('step'),
          type: 'custom',
          label: 'New step',
          command: '',
        },
      ]),
    )
  }

  const updateStep = (
    stepId: string,
    payload: { label?: string; command?: string },
  ): void => {
    if (payload.label === undefined && payload.command === undefined) {
      return
    }
    setSteps((prev) =>
      prev.map((step) => {
        if (step.id !== stepId) {
          return step
        }
        return {
          ...step,
          label: payload.label ?? step.label,
          command: payload.command ?? step.command,
        }
      }),
    )
  }

  const createTemplate = async (
    payload: BackendTemplateCreatePayload,
  ): Promise<void> => {
    try {
      await createTemplateMutation.mutateAsync(payload)
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
      throw error
    }
  }

  const updateTemplate = async (
    templateId: string,
    payload: BackendTemplateUpdatePayload,
  ): Promise<void> => {
    try {
      await updateTemplateMutation.mutateAsync({ templateId, payload })
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
      throw error
    }
  }

  const moveTemplateToPack = async (
    templateId: string,
    targetPackId: string,
  ): Promise<void> => {
    try {
      await moveTemplateMutation.mutateAsync({ templateId, targetPackId })
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
      throw error
    }
  }

  const saveStepToDock = async (
    stepId: string,
    targetPackId: string,
  ): Promise<void> => {
    const step = steps.find((item) => item.id === stepId)
    if (!step) {
      throw new Error('Step not found')
    }

    const label = step.label.trim()
    const command = step.command.trim()
    if (!label) {
      throw new Error('Step name cannot be empty')
    }
    if (!command) {
      throw new Error('Step command cannot be empty')
    }

    await createTemplate({
      name: label,
      command,
      description: 'Saved from Pipeline Flow',
      pack_id: targetPackId.trim(),
    })
  }

  const makePipelineFlowPayload = (): {
    flow_name: string
    steps: Array<{ type: 'template' | 'custom'; label: string; command: string }>
  } => ({
    flow_name: pipelineName.trim() || 'Operator pipeline',
    steps: steps.map((step) => ({
      type: step.type,
      label: step.label,
      command: step.command,
    })),
  })

  const applySavedPipelineFlow = (flow: BackendPipelineFlow): void => {
    const nextSteps = ensureUniquePipelineStepIds(
      flow.steps.map((step) => ({
        id: createId('step'),
        type: step.type,
        label: step.label,
        command: step.command,
      })),
    )
    setSteps(nextSteps)
    setPipelineName(flow.flow_name)
    setSelectedPipelineFlowId(flow.id)
  }

  const switchPipelineFlow = (flowId: string | null): void => {
    if (!flowId) {
      setSelectedPipelineFlowId(null)
      return
    }
    const targetFlow = savedPipelineFlows.find((flow) => flow.id === flowId)
    if (!targetFlow) {
      setBackendError(`Pipeline flow '${flowId}' not found`)
      return
    }
    applySavedPipelineFlow(targetFlow)
    setBackendError(null)
  }

  const savePipelineFlow = async (): Promise<void> => {
    const payload = makePipelineFlowPayload()
    try {
      if (selectedPipelineFlowId) {
        const updated = await updatePipelineFlowMutation.mutateAsync({
          flowId: selectedPipelineFlowId,
          payload,
        })
        setSelectedPipelineFlowId(updated.id)
      } else {
        const created = await createPipelineFlowMutation.mutateAsync(payload)
        setSelectedPipelineFlowId(created.id)
      }
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
      throw error
    }
  }

  const savePipelineFlowAsNew = async (): Promise<void> => {
    const payload = makePipelineFlowPayload()
    try {
      const created = await createPipelineFlowMutation.mutateAsync(payload)
      setSelectedPipelineFlowId(created.id)
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
      throw error
    }
  }

  const renamePipelineFlow = async (
    flowId: string,
    nextName: string,
  ): Promise<void> => {
    const sourceFlow = savedPipelineFlows.find((flow) => flow.id === flowId)
    if (!sourceFlow) {
      throw new Error(`Pipeline flow '${flowId}' not found`)
    }

    const payload = {
      flow_name: nextName,
      steps: sourceFlow.steps.map((step) => ({
        type: step.type,
        label: step.label,
        command: step.command,
      })),
    }

    try {
      const updated = await updatePipelineFlowMutation.mutateAsync({
        flowId,
        payload,
      })
      if (selectedPipelineFlowId === updated.id) {
        setPipelineName(updated.flow_name)
      }
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
      throw error
    }
  }

  const deletePipelineFlow = async (flowId: string): Promise<void> => {
    try {
      await deletePipelineFlowMutation.mutateAsync(flowId)
      if (selectedPipelineFlowId === flowId) {
        setSelectedPipelineFlowId(null)
      }
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
      throw error
    }
  }

  const deleteTemplate = async (templateId: string): Promise<void> => {
    try {
      await deleteTemplateMutation.mutateAsync(templateId)
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
      throw error
    }
  }

  const importJsonPack = async (payload: {
    content: string
    fileName?: string
  }): Promise<void> => {
    try {
      await importCommandPackMutation.mutateAsync(payload)
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
      throw error
    }
  }

  const reorderStepByIndex = (fromIndex: number, toIndex: number): void => {
    if (fromIndex === toIndex) {
      return
    }

    setSteps((prev) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length
      ) {
        return prev
      }
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  const removeStep = (stepId: string): void => {
    setSteps((prev) => prev.filter((step) => step.id !== stepId))
  }

  const startWorkbenchPanelDrag = (
    panel: WorkbenchPanelKey,
    event: DragEvent<HTMLElement>,
  ): void => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', panel)
    setDraggingWorkbenchPanel(panel)
    setDragOverWorkbenchPanel(null)
  }

  const onWorkbenchPanelDragOver = (
    panel: WorkbenchPanelKey,
    event: DragEvent<HTMLElement>,
  ): void => {
    event.preventDefault()
    if (!draggingWorkbenchPanel || draggingWorkbenchPanel === panel) {
      return
    }
    setDragOverWorkbenchPanel(panel)
  }

  const onWorkbenchPanelDrop = (
    targetPanel: WorkbenchPanelKey,
    event: DragEvent<HTMLElement>,
  ): void => {
    event.preventDefault()
    const rawSource = draggingWorkbenchPanel ?? event.dataTransfer.getData('text/plain')
    if (!rawSource || !isWorkbenchPanelKey(rawSource)) {
      setDragOverWorkbenchPanel(null)
      setDraggingWorkbenchPanel(null)
      return
    }
    setWorkbenchPanelOrder((prev) => {
      const pinnedPanelSet = new Set(pinnedTerminalPanelKeys)
      const next = prev.filter((panel) => {
        if (!isWorkbenchTerminalPanelKey(panel)) {
          return true
        }
        return pinnedPanelSet.has(panel)
      })
      for (const panel of pinnedTerminalPanelKeys) {
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

  const updateManualCommand = (terminalId: string, command: string): void => {
    setManualTerminals((prev) =>
      prev.map((terminal) =>
        terminal.id === terminalId ? { ...terminal, draftCommand: command } : terminal,
      ),
    )
    const current = manualCommandHistoryRef.current[terminalId]
    if (current) {
      manualCommandHistoryRef.current = {
        ...manualCommandHistoryRef.current,
        [terminalId]: {
          ...current,
          pointer: -1,
          scratch: '',
        },
      }
    }

    if (terminalId in manualCompletionCycleRef.current) {
      const nextCycles = { ...manualCompletionCycleRef.current }
      delete nextCycles[terminalId]
      manualCompletionCycleRef.current = nextCycles
    }
  }

  const navigateManualCommandHistory = (
    terminalId: string,
    direction: TerminalHistoryDirection,
    currentDraft: string,
  ): void => {
    const currentMap = manualCommandHistoryRef.current
    const current = currentMap[terminalId]
    const history = current ?? createEmptyCommandHistory()
    if (!current) {
      manualCommandHistoryRef.current = {
        ...currentMap,
        [terminalId]: history,
      }
    }
    if (history.entries.length === 0) {
      return
    }

    let nextDraft: string | null = null
    let nextPointer = history.pointer
    let nextScratch = history.scratch
    if (direction === 'up') {
      if (history.pointer === -1) {
        nextScratch = currentDraft
        nextPointer = history.entries.length - 1
      } else if (history.pointer > 0) {
        nextPointer = history.pointer - 1
      }
      nextDraft = history.entries[nextPointer] ?? ''
    } else {
      if (history.pointer === -1) {
        return
      }
      if (history.pointer < history.entries.length - 1) {
        nextPointer = history.pointer + 1
        nextDraft = history.entries[nextPointer] ?? ''
      } else {
        nextPointer = -1
        nextDraft = history.scratch
      }
    }

    manualCommandHistoryRef.current = {
      ...manualCommandHistoryRef.current,
      [terminalId]: {
        entries: history.entries,
        pointer: nextPointer,
        scratch: nextScratch,
      },
    }

    if (nextDraft !== null) {
      setManualTerminals((prev) =>
        prev.map((terminal) =>
          terminal.id === terminalId
            ? { ...terminal, draftCommand: nextDraft ?? terminal.draftCommand }
            : terminal,
        ),
      )
    }
  }

  const pruneAndPersistStoredHistory = (
    historyMap: Record<string, TerminalCommandHistory>,
  ): void => {
    const nextStoredHistory: Record<string, string[]> = {}
    for (const [terminalId, history] of Object.entries(historyMap)) {
      if (history.entries.length > 0) {
        nextStoredHistory[terminalId] = history.entries
      }
    }
    storedManualHistoryRef.current = nextStoredHistory
    writeStoredManualHistory(nextStoredHistory)
  }

  const updateManualTitle = (terminalId: string, title: string): void => {
    setManualTerminals((prev) =>
      prev.map((terminal) =>
        terminal.id === terminalId ? { ...terminal, titleDraft: title } : terminal,
      ),
    )
  }

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const applySocketEvent = useCallback((event: SocketEvent): void => {
    switch (event.type) {
      case 'snapshot': {
        const parsedSnapshot = BackendSnapshotSchema.safeParse(event.data)
        if (!parsedSnapshot.success) {
          setBackendError('Failed to parse snapshot payload')
          break
        }
        const data = parsedSnapshot.data
        const latestRun = data.runs
          .map(toRunState)
          .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))[0]
        setRun(latestRun ?? null)
        const terminals = data.manual_terminals.map(toManualTerminal)
        setManualTerminals(terminals)

        const nextHistory: Record<string, TerminalCommandHistory> = {}
        const nextCycles: Record<string, TerminalCompletionCycle> = {}
        for (const terminal of terminals) {
          const existing = manualCommandHistoryRef.current[terminal.id]
          const storedEntries = storedManualHistoryRef.current[terminal.id] ?? []
          nextHistory[terminal.id] = existing
            ? existing
            : {
                entries: storedEntries,
                pointer: -1,
                scratch: '',
              }
          const existingCycle = manualCompletionCycleRef.current[terminal.id]
          if (existingCycle) {
            nextCycles[terminal.id] = existingCycle
          }
        }
        manualCommandHistoryRef.current = nextHistory
        manualCompletionCycleRef.current = nextCycles
        pruneAndPersistStoredHistory(nextHistory)
        break
      }
      case 'run_created': {
        const data = event.data as { run: BackendRun }
        const nextRun = toRunState(data.run)
        setRun(nextRun)
        break
      }
      case 'run_status': {
        const data = event.data as {
          run_id: string
          status: RunStatus
          finished_at: string | null
        }
        setRun((prev) => {
          if (!prev || prev.id !== data.run_id) {
            return prev
          }
          return {
            ...prev,
            status: data.status,
            finishedAt: data.finished_at,
          }
        })
        break
      }
      case 'run_session_status': {
        const data = event.data as {
          run_id: string
          session_id: string
          status: SessionStatus
          exit_code: number | null
        }
        setRun((prev) => {
          if (!prev || prev.id !== data.run_id) {
            return prev
          }
          return {
            ...prev,
            sessions: prev.sessions.map((session) =>
              session.id === data.session_id
                ? {
                    ...session,
                    status: data.status,
                    exitCode: data.exit_code,
                  }
                : session,
            ),
          }
        })
        break
      }
      case 'run_session_line': {
        const data = event.data as {
          run_id: string
          session_id: string
          line: BackendLine
        }
        const nextLine = toTerminalLine(data.line)
        setRun((prev) => {
          if (!prev || prev.id !== data.run_id) {
            return prev
          }
          return {
            ...prev,
            sessions: prev.sessions.map((session) =>
              session.id === data.session_id
                ? {
                    ...session,
                    lines: [...session.lines, nextLine],
                  }
                : session,
            ),
          }
        })
        break
      }
      case 'terminal_created': {
        const data = event.data as { terminal: BackendManualTerminal }
        const terminal = toManualTerminal(data.terminal)
        setManualTerminals((prev) => upsertManualTerminal(prev, terminal))
        if (!(terminal.id in manualCommandHistoryRef.current)) {
          const storedEntries = storedManualHistoryRef.current[terminal.id] ?? []
          manualCommandHistoryRef.current = {
            ...manualCommandHistoryRef.current,
            [terminal.id]: {
              entries: storedEntries,
              pointer: -1,
              scratch: '',
            },
          }
        }
        break
      }
      case 'terminal_updated': {
        const data = event.data as { terminal: BackendManualTerminal }
        const terminal = toManualTerminal(data.terminal)
        setManualTerminals((prev) => upsertManualTerminal(prev, terminal))
        if (!(terminal.id in manualCommandHistoryRef.current)) {
          const storedEntries = storedManualHistoryRef.current[terminal.id] ?? []
          manualCommandHistoryRef.current = {
            ...manualCommandHistoryRef.current,
            [terminal.id]: {
              entries: storedEntries,
              pointer: -1,
              scratch: '',
            },
          }
        }
        break
      }
      case 'terminal_status': {
        const data = event.data as {
          terminal_id: string
          status: SessionStatus
          exit_code: number | null
        }
        setManualTerminals((prev) =>
          prev.map((terminal) =>
            terminal.id === data.terminal_id
              ? {
                  ...terminal,
                  status: data.status,
                  exitCode: data.exit_code,
                }
              : terminal,
          ),
        )
        break
      }
      case 'terminal_line': {
        const data = event.data as {
          terminal_id: string
          line: BackendLine
        }
        const nextLine = toTerminalLine(data.line)
        setManualTerminals((prev) =>
          prev.map((terminal) =>
            terminal.id === data.terminal_id
              ? {
                  ...terminal,
                  lines: [...terminal.lines, nextLine],
                }
              : terminal,
          ),
        )
        break
      }
      case 'terminal_closed': {
        const data = event.data as { terminal_id: string }
        setManualTerminals((prev) =>
          prev.filter((terminal) => terminal.id !== data.terminal_id),
        )
        const nextHistory = { ...manualCommandHistoryRef.current }
        delete nextHistory[data.terminal_id]
        manualCommandHistoryRef.current = nextHistory
        const nextCycles = { ...manualCompletionCycleRef.current }
        delete nextCycles[data.terminal_id]
        manualCompletionCycleRef.current = nextCycles
        setCopyTailLineCountsByTerminalId((prev) => {
          const next = { ...prev }
          delete next[data.terminal_id]
          return next
        })
        setCopyTailCopiedByTerminalId((prev) => {
          const next = { ...prev }
          delete next[data.terminal_id]
          return next
        })
        const copyResetTimeout = copyTailResetTimeoutByTerminalIdRef.current[data.terminal_id]
        if (copyResetTimeout !== undefined) {
          window.clearTimeout(copyResetTimeout)
          const nextCopyTimeoutMap = { ...copyTailResetTimeoutByTerminalIdRef.current }
          delete nextCopyTimeoutMap[data.terminal_id]
          copyTailResetTimeoutByTerminalIdRef.current = nextCopyTimeoutMap
        }
        pruneAndPersistStoredHistory(nextHistory)
        break
      }
      default:
        break
    }
  }, [])

  useEffect(() => {
    setSteps((prev) => ensureUniquePipelineStepIds(prev))
  }, [])

  useEffect(() => {
    if (!selectedPipelineFlowId) {
      return
    }
    const stillExists = savedPipelineFlows.some((flow) => flow.id === selectedPipelineFlowId)
    if (stillExists) {
      return
    }
    setSelectedPipelineFlowId(null)
  }, [savedPipelineFlows, selectedPipelineFlowId])

  useEffect(() => {
    let isDisposed = false
    let reconnectTimerId: number | null = null
    let socket: WebSocket | null = null

    const connectSocket = (): void => {
      socket = new WebSocket(WS_EVENTS_URL)

      socket.onopen = () => {
        if (isDisposed) {
          return
        }
        setIsSocketConnected(true)
        setBackendError(null)
        void Promise.all([reloadCommandPacks(), reloadPipelineFlows()]).catch(
          (error: unknown) => {
            if (isDisposed) {
              return
            }
            setBackendError(getErrorMessage(error))
          },
        )
      }

      socket.onmessage = (message) => {
        if (isDisposed) {
          return
        }
        try {
          const rawPayload = JSON.parse(message.data) as unknown
          const parsedEvent = SocketEventSchema.safeParse(rawPayload)
          if (!parsedEvent.success) {
            setBackendError('Failed to parse WebSocket event payload')
            return
          }
          applySocketEvent(parsedEvent.data)
        } catch {
          setBackendError('Failed to parse WebSocket event payload')
        }
      }

      socket.onerror = () => {
        if (isDisposed) {
          return
        }
        setBackendError('WebSocket disconnected from backend')
      }

      socket.onclose = () => {
        if (isDisposed) {
          return
        }
        setIsSocketConnected(false)
        reconnectTimerId = window.setTimeout(connectSocket, 1500)
      }
    }

    connectSocket()

    return () => {
      isDisposed = true
      if (reconnectTimerId !== null) {
        window.clearTimeout(reconnectTimerId)
      }
      socket?.close()
    }
  }, [applySocketEvent, reloadCommandPacks, reloadPipelineFlows])

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
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(
        WORKBENCH_PINNED_TERMINALS_STORAGE_KEY,
        JSON.stringify(pinnedTerminalWindowIds),
      )
    } catch {
      // Ignore storage errors.
    }
  }, [pinnedTerminalWindowIds])

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

  useEffect(
    () => () => {
      for (const timeoutId of Object.values(copyTailResetTimeoutByTerminalIdRef.current)) {
        window.clearTimeout(timeoutId)
      }
      copyTailResetTimeoutByTerminalIdRef.current = {}
    },
    [],
  )

  const executePipeline = async (): Promise<void> => {
    if (steps.length === 0 || isRunning) {
      return
    }

    try {
      const payload = {
        pipeline_name: pipelineName,
        steps: steps.map((step) => ({
          label: step.label,
          command: step.command,
        })),
      }
      const createdRun = await apiRequest<BackendRun>('/api/runs', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      const nextRun = toRunState(createdRun)
      setRun(nextRun)
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
    }
  }

  const stopRun = async (): Promise<void> => {
    if (!run) {
      return
    }
    try {
      const updatedRun = await apiRequest<BackendRun>(`/api/runs/${run.id}/stop`, {
        method: 'POST',
      })
      const nextRun = toRunState(updatedRun)
      setRun(nextRun)
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
    }
  }

  const createManualTerminal = async (): Promise<void> => {
    try {
      const createdTerminal = await apiRequest<BackendManualTerminal>('/api/terminals', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setManualTerminals((prev) =>
        upsertManualTerminal(prev, toManualTerminal(createdTerminal)),
      )
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
    }
  }

  const renameManualTerminal = async (terminalId: string): Promise<void> => {
    const terminal = manualTerminals.find((item) => item.id === terminalId)
    if (!terminal) {
      return
    }

    const title = terminal.titleDraft.trim()
    if (!title || title === terminal.title) {
      return
    }

    try {
      const updatedTerminal = await apiRequest<BackendManualTerminal>(
        `/api/terminals/${terminalId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ title }),
        },
      )
      setManualTerminals((prev) =>
        upsertManualTerminal(prev, toManualTerminal(updatedTerminal)),
      )
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
    }
  }

  const runManualCommand = async (terminalId: string): Promise<void> => {
    const terminal = manualTerminals.find((item) => item.id === terminalId)
    if (!terminal) {
      return
    }

    const command = terminal.draftCommand.trim()
    if (!command) {
      return
    }

    const currentHistory =
      manualCommandHistoryRef.current[terminalId] ?? createEmptyCommandHistory()
    manualCommandHistoryRef.current = {
      ...manualCommandHistoryRef.current,
      [terminalId]: {
        entries: [...currentHistory.entries, command],
        pointer: -1,
        scratch: '',
      },
    }
    storedManualHistoryRef.current = {
      ...storedManualHistoryRef.current,
      [terminalId]: manualCommandHistoryRef.current[terminalId].entries,
    }
    writeStoredManualHistory(storedManualHistoryRef.current)

    setManualTerminals((prev) =>
      prev.map((item) =>
        item.id === terminalId
          ? {
              ...item,
              draftCommand: '',
              status: 'running',
              exitCode: null,
            }
          : item,
      ),
    )
    const nextCycles = { ...manualCompletionCycleRef.current }
    delete nextCycles[terminalId]
    manualCompletionCycleRef.current = nextCycles

    try {
      await apiRequest<BackendManualTerminal>(`/api/terminals/${terminalId}/run`, {
        method: 'POST',
        body: JSON.stringify({ command }),
      })
      setBackendError(null)
    } catch (error) {
      setManualTerminals((prev) =>
        prev.map((item) =>
          item.id === terminalId
            ? {
                ...item,
                draftCommand: command,
              }
            : item,
        ),
      )
      setBackendError(getErrorMessage(error))
    }
  }

  const autocompleteManualCommand = async (terminalId: string): Promise<void> => {
    const terminal = manualTerminals.find((item) => item.id === terminalId)
    if (!terminal) {
      return
    }

    const cycle = manualCompletionCycleRef.current[terminalId]
    const shouldContinueCycle =
      cycle !== undefined && terminal.draftCommand === cycle.lastAppliedCommand
    const baseCommand = shouldContinueCycle ? cycle.baseCommand : terminal.draftCommand
    const cycleIndex = shouldContinueCycle ? cycle.nextIndex : 0

    try {
      const completion = await apiRequest<BackendTerminalCompletion>(
        `/api/terminals/${terminalId}/complete`,
        {
          method: 'POST',
          body: JSON.stringify({
            command: terminal.draftCommand,
            base_command: baseCommand,
            cycle_index: cycleIndex,
          }),
        },
      )
      if (completion.matches.length === 0) {
        const nextCycles = { ...manualCompletionCycleRef.current }
        delete nextCycles[terminalId]
        manualCompletionCycleRef.current = nextCycles
        return
      }

      const nextIndex = (cycleIndex + 1) % completion.matches.length
      manualCompletionCycleRef.current = {
        ...manualCompletionCycleRef.current,
        [terminalId]: {
          baseCommand: completion.base_command,
          nextIndex,
          lastAppliedCommand: completion.completed_command,
        },
      }

      if (completion.completed_command === terminal.draftCommand) {
        return
      }
      setManualTerminals((prev) =>
        prev.map((item) =>
          item.id === terminalId
            ? {
                ...item,
                draftCommand: completion.completed_command,
              }
            : item,
        ),
      )
      setBackendError(null)
    } catch (error) {
      const nextCycles = { ...manualCompletionCycleRef.current }
      delete nextCycles[terminalId]
      manualCompletionCycleRef.current = nextCycles
      setBackendError(getErrorMessage(error))
    }
  }

  const stopManualTerminal = async (terminalId: string): Promise<void> => {
    try {
      const updatedTerminal = await apiRequest<BackendManualTerminal>(
        `/api/terminals/${terminalId}/stop`,
        {
          method: 'POST',
        },
      )
      setManualTerminals((prev) =>
        upsertManualTerminal(prev, toManualTerminal(updatedTerminal)),
      )
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
    }
  }

  const clearManualTerminal = async (terminalId: string): Promise<void> => {
    try {
      const updatedTerminal = await apiRequest<BackendManualTerminal>(
        `/api/terminals/${terminalId}/clear`,
        {
          method: 'POST',
        },
      )
      setManualTerminals((prev) =>
        upsertManualTerminal(prev, toManualTerminal(updatedTerminal)),
      )
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
    }
  }

  const removeManualTerminal = async (terminalId: string): Promise<void> => {
    try {
      await apiRequest<{ deleted: boolean; terminal_id: string }>(
        `/api/terminals/${terminalId}`,
        {
          method: 'DELETE',
        },
      )
      setManualTerminals((prev) =>
        prev.filter((terminal) => terminal.id !== terminalId),
      )
      const nextHistory = { ...manualCommandHistoryRef.current }
      delete nextHistory[terminalId]
      manualCommandHistoryRef.current = nextHistory
      const nextCycles = { ...manualCompletionCycleRef.current }
      delete nextCycles[terminalId]
      manualCompletionCycleRef.current = nextCycles
      setCopyTailLineCountsByTerminalId((prev) => {
        const next = { ...prev }
        delete next[terminalId]
        return next
      })
      setCopyTailCopiedByTerminalId((prev) => {
        const next = { ...prev }
        delete next[terminalId]
        return next
      })
      const copyResetTimeout = copyTailResetTimeoutByTerminalIdRef.current[terminalId]
      if (copyResetTimeout !== undefined) {
        window.clearTimeout(copyResetTimeout)
        const nextCopyTimeoutMap = { ...copyTailResetTimeoutByTerminalIdRef.current }
        delete nextCopyTimeoutMap[terminalId]
        copyTailResetTimeoutByTerminalIdRef.current = nextCopyTimeoutMap
      }
      pruneAndPersistStoredHistory(nextHistory)
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
    }
  }

  const getCopyTailLineCount = (terminalId: string): number => {
    const raw = copyTailLineCountsByTerminalId[terminalId]
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1) {
      return 20
    }
    return Math.max(1, Math.min(5000, Math.round(raw)))
  }

  const updateCopyTailLineCount = (terminalId: string, rawValue: string): void => {
    const parsed = Number.parseInt(rawValue, 10)
    const normalized = Number.isFinite(parsed)
      ? Math.max(1, Math.min(5000, parsed))
      : 20
    setCopyTailLineCountsByTerminalId((prev) => ({
      ...prev,
      [terminalId]: normalized,
    }))
  }

  const copyManualTerminalTail = async (terminalId: string): Promise<void> => {
    const terminal = manualTerminals.find((item) => item.id === terminalId)
    if (!terminal) {
      return
    }
    const count = getCopyTailLineCount(terminalId)
    const text = terminal.lines
      .slice(-count)
      .map((line) => line.text)
      .join('\n')

    try {
      await navigator.clipboard.writeText(text)
      setCopyTailCopiedByTerminalId((prev) => ({
        ...prev,
        [terminalId]: true,
      }))
      const previousTimeout = copyTailResetTimeoutByTerminalIdRef.current[terminalId]
      if (previousTimeout !== undefined) {
        window.clearTimeout(previousTimeout)
      }
      copyTailResetTimeoutByTerminalIdRef.current[terminalId] = window.setTimeout(() => {
        setCopyTailCopiedByTerminalId((prev) => ({
          ...prev,
          [terminalId]: false,
        }))
      }, 1400)
      setBackendError(null)
    } catch {
      setBackendError('Failed to copy terminal output to clipboard')
    }
  }

  const commandPackStatusMessage = useMemo((): string | null => {
    if (commandPacksQuery.isError) {
      return getErrorMessage(commandPacksQuery.error)
    }
    if (commandPacksQuery.data && commandPacksQuery.data.errors.length > 0) {
      return commandPacksQuery.data.errors.join(' | ')
    }
    return null
  }, [commandPacksQuery.data, commandPacksQuery.error, commandPacksQuery.isError])

  const pipelineFlowsStatusMessage = useMemo((): string | null => {
    if (pipelineFlowsQuery.isError) {
      return getErrorMessage(pipelineFlowsQuery.error)
    }
    if (pipelineFlowsQuery.data && pipelineFlowsQuery.data.errors.length > 0) {
      return pipelineFlowsQuery.data.errors.join(' | ')
    }
    return null
  }, [pipelineFlowsQuery.data, pipelineFlowsQuery.error, pipelineFlowsQuery.isError])

  const errorBannerMessage =
    backendError ?? commandPackStatusMessage ?? pipelineFlowsStatusMessage

  const visibleRunSessions = useMemo(
    () =>
      run?.sessions.filter(
        (session) => !isPipelineOpenTerminalCommand(session.command),
      ) ?? [],
    [run],
  )

  const terminalWindowItems = useMemo(
    () => [
      ...visibleRunSessions.map((session) => ({
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
    [manualTerminals, visibleRunSessions],
  )

  const terminalWindowMap = useMemo(() => {
    const map = new Map<string, (typeof terminalWindowItems)[number]>()
    for (const item of terminalWindowItems) {
      map.set(item.windowId, item)
    }
    return map
  }, [terminalWindowItems])

  const availableTerminalWindowIds = useMemo(
    () => new Set(terminalWindowItems.map((item) => item.windowId)),
    [terminalWindowItems],
  )

  const effectivePinnedTerminalWindowIds = useMemo(
    () =>
      pinnedTerminalWindowIds.filter((windowId) =>
        availableTerminalWindowIds.has(windowId),
      ),
    [availableTerminalWindowIds, pinnedTerminalWindowIds],
  )

  const effectiveRequestedMinimizedTerminalWindowIds = useMemo(
    () =>
      requestedMinimizedTerminalWindowIds.filter((windowId) =>
        availableTerminalWindowIds.has(windowId),
      ),
    [availableTerminalWindowIds, requestedMinimizedTerminalWindowIds],
  )

  const pinnedTerminalPanelKeys = effectivePinnedTerminalWindowIds.map((windowId) =>
    toTerminalWorkbenchPanelKey(windowId),
  )

  const visibleWorkbenchPanelOrder = (() => {
    const pinnedPanelSet = new Set(pinnedTerminalPanelKeys)
    const next = workbenchPanelOrder.filter((panel) => {
      if (!isWorkbenchTerminalPanelKey(panel)) {
        return true
      }
      return pinnedPanelSet.has(panel)
    })

    for (const panel of pinnedTerminalPanelKeys) {
      if (!next.includes(panel)) {
        next.push(panel)
      }
    }

    return next
  })()

  const terminalInstancesCount = visibleRunSessions.length + manualTerminals.length

  const getWorkbenchPanelTitle = (panel: WorkbenchPanelKey): string => {
    if (panel === WORKBENCH_PANEL_FLOW) {
      return 'Pipeline Flow'
    }
    if (panel === WORKBENCH_PANEL_DOCK) {
      return 'Pipeline Dock'
    }
    const terminalWindowId = toWorkbenchTerminalWindowId(panel)
    if (!terminalWindowId) {
      return 'Window'
    }
    const windowItem = terminalWindowMap.get(terminalWindowId)
    if (!windowItem) {
      return 'Terminal'
    }
    if (windowItem.kind === 'run') {
      return windowItem.runSession?.title ?? 'Pipeline terminal'
    }
    return windowItem.manualTerminal?.title ?? 'Manual terminal'
  }

  const getWorkbenchPanelDefaultWidth = (panel: WorkbenchPanelKey): number => {
    if (panel in DEFAULT_WORKBENCH_PANEL_WIDTHS) {
      return DEFAULT_WORKBENCH_PANEL_WIDTHS[panel] ?? MIN_WORKBENCH_PANEL_WIDTH
    }
    const terminalWindowId = toWorkbenchTerminalWindowId(panel)
    if (!terminalWindowId) {
      return MIN_WORKBENCH_PANEL_WIDTH
    }
    const windowItem = terminalWindowMap.get(terminalWindowId)
    if (!windowItem) {
      return 640
    }
    return windowItem.kind === 'manual' ? 940 : 640
  }

  const unpinTerminalWindow = (windowId: string): void => {
    const panelKey = toTerminalWorkbenchPanelKey(windowId)
    setPinnedTerminalWindowIds((prev) => prev.filter((id) => id !== windowId))
    setWorkbenchPanelOrder((prev) => prev.filter((item) => item !== panelKey))
    setWorkbenchPanelFullWidth((prev) => ({
      ...prev,
      [panelKey]: false,
    }))
  }

  const requestMinimizeTerminalWindow = (windowId: string): void => {
    setRequestedMinimizedTerminalWindowIds((prev) =>
      prev.includes(windowId) ? prev : [...prev, windowId],
    )
  }

  const consumeRequestedMinimizeTerminalWindow = (windowId: string): void => {
    setRequestedMinimizedTerminalWindowIds((prev) =>
      prev.filter((id) => id !== windowId),
    )
  }

  const minimizePinnedTerminalWindow = (windowId: string): void => {
    if (!availableTerminalWindowIds.has(windowId)) {
      return
    }
    unpinTerminalWindow(windowId)
    requestMinimizeTerminalWindow(windowId)
  }

  const togglePinTerminalWindow = (windowId: string): void => {
    if (!availableTerminalWindowIds.has(windowId)) {
      return
    }
    const panelKey = toTerminalWorkbenchPanelKey(windowId)
    if (effectivePinnedTerminalWindowIds.includes(windowId)) {
      unpinTerminalWindow(windowId)
      return
    }

    setPinnedTerminalWindowIds((prev) => [...prev, windowId])
    setWorkbenchPanelOrder((prev) =>
      prev.includes(panelKey) ? prev : [...prev, panelKey],
    )
    setWorkbenchPanelCollapsed((prev) => ({
      ...prev,
      [panelKey]: false,
    }))
    setWorkbenchPanelWidths((prev) => ({
      ...prev,
      [panelKey]: prev[panelKey] ?? getWorkbenchPanelDefaultWidth(panelKey),
    }))
  }

  const startPinnedTerminalTitleEdit = (terminal: ManualTerminal): void => {
    updateManualTitle(terminal.id, terminal.titleDraft || terminal.title)
    setEditingPinnedTerminalTitleId(terminal.id)
  }

  const cancelPinnedTerminalTitleEdit = (terminal: ManualTerminal): void => {
    updateManualTitle(terminal.id, terminal.title)
    setEditingPinnedTerminalTitleId((prev) => (prev === terminal.id ? null : prev))
  }

  const savePinnedTerminalTitleEdit = async (
    terminal: ManualTerminal,
  ): Promise<void> => {
    await renameManualTerminal(terminal.id)
    setEditingPinnedTerminalTitleId((prev) => (prev === terminal.id ? null : prev))
  }

  const renderWorkbenchPanel = (panel: WorkbenchPanelKey) => {
    if (panel === WORKBENCH_PANEL_FLOW) {
      return (
        <PipelineFlowPanel
          steps={steps}
          packOptions={commandPackOptions}
          savedFlows={savedPipelineFlowOptions}
          selectedSavedFlowId={selectedPipelineFlowId}
          pipelineName={pipelineName}
          run={run}
          isRunning={isRunning}
          isSavingFlow={
            createPipelineFlowMutation.isPending || updatePipelineFlowMutation.isPending
          }
          onRunPipeline={() => {
            void executePipeline()
          }}
          onStopRun={() => {
            void stopRun()
          }}
          onClearSteps={() => setSteps([])}
          onCreateStep={createEmptyStep}
          onRemoveStep={removeStep}
          onUpdateStep={updateStep}
          onSaveStepToDock={saveStepToDock}
          onSwitchSavedFlow={switchPipelineFlow}
          onPipelineNameChange={setPipelineName}
          onSaveFlow={savePipelineFlow}
          onSaveFlowAsNew={savePipelineFlowAsNew}
          onReorderSteps={reorderStepByIndex}
        />
      )
    }

    if (panel === WORKBENCH_PANEL_DOCK) {
      return (
        <PipelineDock
          pipelineName={pipelineName}
          stepsCount={steps.length}
          templates={templates}
          packNamesById={commandPackNamesById}
          packsCount={templatePacksCount}
          isReloadingTemplates={commandPacksQuery.isFetching}
          onPipelineNameChange={setPipelineName}
          onAddStepFromTemplate={addStepFromTemplate}
          onUpdateTemplate={updateTemplate}
          onReloadTemplates={reloadCommandPacks}
          onMoveTemplateToPack={moveTemplateToPack}
          onDeleteTemplate={deleteTemplate}
        />
      )
    }

    const terminalWindowId = toWorkbenchTerminalWindowId(panel)
    if (!terminalWindowId) {
      return (
        <section className="panel pinnedTerminalPanel">
          <p className="empty">Unknown panel</p>
        </section>
      )
    }
    const windowItem = terminalWindowMap.get(terminalWindowId)
    if (!windowItem) {
      return (
        <section className="panel pinnedTerminalPanel">
          <p className="empty">Terminal is no longer available.</p>
        </section>
      )
    }

    if (windowItem.kind === 'run' && windowItem.runSession) {
      const session = windowItem.runSession
      return (
        <section className="panel pinnedTerminalPanel">
          <div className="section__head">
            <h2>{session.title}</h2>
            <div className="pinnedTerminalHeadActions">
              <button
                type="button"
                className="terminalWindowControl terminalWindowControl--pin"
                onClick={() => togglePinTerminalWindow(windowItem.windowId)}
                title="Unpin from workflow"
              >
                P
              </button>
              <span className={`status status--${session.status}`}>{session.status}</span>
            </div>
          </div>
          <p className="terminalWindow__meta">exit: {session.exitCode ?? '...'}</p>
          <code>{session.command}</code>
          <PinnedTerminalOutput lines={session.lines} />
        </section>
      )
    }

    if (windowItem.kind !== 'manual') {
      return (
        <section className="panel pinnedTerminalPanel">
          <p className="empty">Terminal is unavailable.</p>
        </section>
      )
    }
    const terminal = windowItem.manualTerminal
    const isEditingTitle = editingPinnedTerminalTitleId === terminal.id
    return (
      <section className="panel pinnedTerminalPanel">
        <div className="section__head">
          <div className="pinnedTerminalTitle terminalTitleEditable templateEditable">
            {isEditingTitle ? (
              <div className="templateEditInline">
                <input
                  value={terminal.titleDraft}
                  onChange={(event) =>
                    updateManualTitle(terminal.id, event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void savePinnedTerminalTitleEdit(terminal)
                      return
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelPinnedTerminalTitleEdit(terminal)
                    }
                  }}
                  placeholder="Terminal name"
                  autoFocus
                />
                <button
                  type="button"
                  className="templateSaveButton"
                  onClick={() => {
                    void savePinnedTerminalTitleEdit(terminal)
                  }}
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
              <div className="pinnedTerminalTitleMain">
                <h2>{terminal.title}</h2>
                <button
                  type="button"
                  className="templateEditButton terminalTitleEditButton"
                  onClick={() => startPinnedTerminalTitleEdit(terminal)}
                  aria-label={`Edit terminal name: ${terminal.title}`}
                >
                  ✎
                </button>
              </div>
            )}
          </div>
          <div className="pinnedTerminalHeadActions">
            <button
              type="button"
              className="terminalWindowControl terminalWindowControl--pin"
              onClick={() => togglePinTerminalWindow(windowItem.windowId)}
              title="Unpin from workflow"
            >
              P
            </button>
            <button
              type="button"
              className="terminalWindowControl"
              onClick={() => minimizePinnedTerminalWindow(windowItem.windowId)}
              title="Minimize to dock"
            >
              -
            </button>
            <button
              type="button"
              className="terminalWindowControl terminalWindowControl--warning"
              onClick={() => {
                void stopManualTerminal(terminal.id)
              }}
              title="Stop terminal"
              disabled={terminal.status !== 'running'}
            >
              ‖
            </button>
            <button
              type="button"
              className="terminalWindowControl terminalWindowControl--danger"
              onClick={() => {
                void removeManualTerminal(terminal.id)
              }}
              title="Close terminal"
            >
              ×
            </button>
            <span className={`status status--${terminal.status}`}>{terminal.status}</span>
          </div>
        </div>

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
              onChange={(event) => updateManualCommand(terminal.id, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Tab' && !event.shiftKey) {
                  event.preventDefault()
                  void autocompleteManualCommand(terminal.id)
                  return
                }
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                  event.preventDefault()
                  navigateManualCommandHistory(
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
                void runManualCommand(terminal.id)
              }}
              placeholder="Type command, e.g. ls -la /opt/app"
            />
            <div className="terminalInputActions">
              <button
                type="button"
                className="terminalInputAction terminalInputAction--clear"
                onClick={() => {
                  void clearManualTerminal(terminal.id)
                }}
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
                onClick={() => {
                  void runManualCommand(terminal.id)
                }}
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

        <PinnedTerminalOutput lines={terminal.lines} />
        <div className="terminalFooterActions">
          <label className="terminalCopyTailControl">
            <span>Last</span>
            <input
              type="number"
              min={1}
              step={1}
              value={getCopyTailLineCount(terminal.id)}
              onChange={(event) =>
                updateCopyTailLineCount(terminal.id, event.target.value)
              }
              title="Number of lines to copy"
            />
            <span>lines</span>
          </label>
          <button
            type="button"
            className="terminalFooterCopyButton"
            onClick={() => {
              void copyManualTerminalTail(terminal.id)
            }}
            title="Copy last lines to clipboard"
          >
            {copyTailCopiedByTerminalId[terminal.id] ? 'Copied' : 'Copy tail'}
          </button>
        </div>
      </section>
    )
  }

  return (
    <div className="app">
      <HeaderBar
        isSocketConnected={isSocketConnected}
        terminalInstancesCount={terminalInstancesCount}
        onCreateManualTerminal={() => {
          void createManualTerminal()
        }}
        onOpenImportModal={openImportModal}
        onOpenFlowSettingsModal={() => setIsFlowSettingsModalOpen(true)}
      />

      <CommandPackImportModal
        isOpen={isImportModalOpen}
        onClose={closeImportModal}
        onImport={importJsonPack}
      />
      <PipelineFlowSettingsModal
        isOpen={isFlowSettingsModalOpen}
        flows={savedPipelineFlows}
        selectedFlowId={selectedPipelineFlowId}
        isMutating={
          updatePipelineFlowMutation.isPending || deletePipelineFlowMutation.isPending
        }
        onClose={() => setIsFlowSettingsModalOpen(false)}
        onSwitchFlow={(flowId) => switchPipelineFlow(flowId)}
        onRenameFlow={renamePipelineFlow}
        onDeleteFlow={deletePipelineFlow}
      />

      {errorBannerMessage ? <p className="errorBanner">{errorBannerMessage}</p> : null}

      <div className="appTabs" role="tablist" aria-label="Main views">
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'workbench'}
          className={`appTabButton${activeView === 'workbench' ? ' appTabButton--active' : ''}`}
          onClick={() => setActiveView('workbench')}
        >
          Workbench
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'history'}
          className={`appTabButton${activeView === 'history' ? ' appTabButton--active' : ''}`}
          onClick={() => setActiveView('history')}
        >
          History
        </button>
      </div>

      {activeView === 'workbench' ? (
        <main className="layout layout--workbench">
          {visibleWorkbenchPanelOrder.map((panel) => {
            const panelTypeClass =
              panel === WORKBENCH_PANEL_FLOW
                ? 'workbenchSlot--flow'
                : panel === WORKBENCH_PANEL_DOCK
                  ? 'workbenchSlot--dock'
                  : 'workbenchSlot--terminal'
            const isCollapsed = workbenchPanelCollapsed[panel] === true
            const panelTitle = getWorkbenchPanelTitle(panel)
            const panelWidth = Math.max(
              MIN_WORKBENCH_PANEL_WIDTH,
              workbenchPanelWidths[panel] ?? getWorkbenchPanelDefaultWidth(panel),
            )
            const isFullWidth = workbenchPanelFullWidth[panel] === true
            return (
              <section
                key={panel}
                className={`workbenchSlot ${panelTypeClass} ${
                  dragOverWorkbenchPanel === panel ? 'workbenchSlot--dragover' : ''
                } ${draggingWorkbenchPanel === panel ? 'workbenchSlot--dragging' : ''} ${
                  isFullWidth ? 'workbenchSlot--fullWidth' : ''
                }`}
                onDragOver={(event) => onWorkbenchPanelDragOver(panel, event)}
                onDrop={(event) => onWorkbenchPanelDrop(panel, event)}
                style={{
                  flex: isFullWidth ? '1 1 100%' : `0 1 ${panelWidth}px`,
                }}
              >
                <div className="workbenchSlotToolbar">
                  <span
                    className="workbenchSlotHandle"
                    draggable
                    onDragStart={(event) => startWorkbenchPanelDrag(panel, event)}
                    onDragEnd={finishWorkbenchPanelDrag}
                    title="Drag panel to reorder layout"
                  >
                    Move panel
                  </span>
                  <button
                    type="button"
                    className="workbenchSlotToggle"
                    onClick={() => toggleWorkbenchPanelCollapse(panel)}
                    title={isCollapsed ? `Expand ${panelTitle}` : `Collapse ${panelTitle}`}
                  >
                    {isCollapsed ? 'Expand' : 'Collapse'}
                  </button>
                  <button
                    type="button"
                    className="workbenchSlotToggle"
                    onClick={() => toggleWorkbenchPanelFullWidth(panel, panelWidth)}
                    title={
                      isFullWidth
                        ? `Restore width: ${panelTitle}`
                        : `Full width: ${panelTitle}`
                    }
                  >
                    {isFullWidth ? 'Restore width' : 'Full width'}
                  </button>
                </div>

                {isCollapsed ? (
                  <section className="panel panelCollapsed">
                    <div className="panelCollapsed__body">
                      <h2>{panelTitle}</h2>
                      <span>Collapsed</span>
                    </div>
                  </section>
                ) : (
                  renderWorkbenchPanel(panel)
                )}

                {!isFullWidth ? (
                  <span
                    className="workbenchSlotResizeHandle"
                    onMouseDown={(event) =>
                      startWorkbenchPanelResize(panel, event, panelWidth)
                    }
                    title="Drag to resize panel width"
                  />
                ) : null}
              </section>
            )
          })}
        </main>
      ) : (
        <HistoryPanel
          runs={(historyQuery.data?.runs ?? []).map(toRunState)}
          terminalHistory={historyQuery.data?.manual_terminal_history ?? []}
          isLoading={historyQuery.isLoading || historyQuery.isFetching}
          errorMessage={historyQuery.isError ? getErrorMessage(historyQuery.error) : null}
        />
      )}

      <TerminalWindowsLayer
        runSessions={visibleRunSessions}
        manualTerminals={manualTerminals}
        pinnedWindowIds={effectivePinnedTerminalWindowIds}
        requestedMinimizedWindowIds={effectiveRequestedMinimizedTerminalWindowIds}
        onConsumeRequestedMinimizeWindow={consumeRequestedMinimizeTerminalWindow}
        onTogglePinWindow={togglePinTerminalWindow}
        getCopyTailLineCount={getCopyTailLineCount}
        isCopyTailRecentlyCopied={(terminalId) =>
          copyTailCopiedByTerminalId[terminalId] === true
        }
        onUpdateCopyTailLineCount={updateCopyTailLineCount}
        onCopyManualTerminalTail={(terminalId) => {
          void copyManualTerminalTail(terminalId)
        }}
        onUpdateManualTitle={updateManualTitle}
        onRenameManualTerminal={(terminalId) => {
          void renameManualTerminal(terminalId)
        }}
        onUpdateManualCommand={updateManualCommand}
        onNavigateManualHistory={navigateManualCommandHistory}
        onRunManualCommand={(terminalId) => {
          void runManualCommand(terminalId)
        }}
        onAutocompleteManualCommand={(terminalId) => {
          void autocompleteManualCommand(terminalId)
        }}
        onStopManualTerminal={(terminalId) => {
          void stopManualTerminal(terminalId)
        }}
        onClearManualTerminal={(terminalId) => {
          void clearManualTerminal(terminalId)
        }}
        onRemoveManualTerminal={(terminalId) => {
          void removeManualTerminal(terminalId)
        }}
      />
    </div>
  )
}

export default App
