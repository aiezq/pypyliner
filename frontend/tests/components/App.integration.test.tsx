import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackendPipelineFlow } from '../../src/types'

const mocks = vi.hoisted(() => {
  const useWorkbenchFeatureMock = vi.fn()
  const useHistoryFeatureMock = vi.fn()

  const uiState = {
    pipelineName: 'Default operator pipeline',
    isImportModalOpen: false,
    setPipelineName: vi.fn<(value: string) => void>(),
    openImportModal: vi.fn<() => void>(),
    closeImportModal: vi.fn<() => void>(),
  }

  return {
    useWorkbenchFeatureMock,
    useHistoryFeatureMock,
    uiState,
  }
})

vi.mock('../../src/features/workbench/useWorkbenchFeature', () => ({
  useWorkbenchFeature: mocks.useWorkbenchFeatureMock,
}))

vi.mock('../../src/features/history/useHistoryFeature', () => ({
  useHistoryFeature: mocks.useHistoryFeatureMock,
}))

vi.mock('../../src/stores/uiStore', () => ({
  useUiStore: <T,>(selector: (state: typeof mocks.uiState) => T): T =>
    selector(mocks.uiState),
}))

vi.mock('../../src/components/workbench/WorkbenchLayoutView', () => ({
  default: () => <div data-testid="workbench-view">Workbench View</div>,
}))

vi.mock('../../src/components/HistoryPanel', () => ({
  default: ({ runs }: { runs: Array<unknown> }) => (
    <div data-testid="history-view">History View ({runs.length})</div>
  ),
}))

vi.mock('../../src/components/CommandPackImportModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="import-modal">
      <button type="button" onClick={onClose}>
        Close import modal
      </button>
    </div>
  ),
}))

vi.mock('../../src/components/PipelineFlowSettingsModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="flow-settings-modal">
      <button type="button" onClick={onClose}>
        Close flow settings modal
      </button>
    </div>
  ),
}))

vi.mock('../../src/components/TerminalWindowsLayer', () => ({
  default: () => <div data-testid="terminal-windows-layer">Terminal Windows Layer</div>,
}))

import App from '../../src/App'

const createFlow = (overrides: Partial<BackendPipelineFlow> = {}): BackendPipelineFlow => ({
  id: 'flow_main',
  flow_name: 'Main flow',
  created_at: '2026-03-01T10:00:00Z',
  updated_at: '2026-03-01T11:00:00Z',
  file_name: 'main_flow.json',
  steps: [{ type: 'template', label: 'Step 1', command: 'echo 1' }],
  ...overrides,
})

const createWorkbenchState = () => ({
  isSocketConnected: true,
  terminalInstancesCount: 2,
  createManualTerminal: vi.fn(async () => {}),
  importJsonPack: vi.fn(async () => {}),
  flowSettings: {
    flows: [createFlow()],
    selectedFlowId: 'flow_main',
    isMutating: false,
    onSwitchFlow: vi.fn(),
    onRenameFlow: vi.fn(async () => {}),
    onDeleteFlow: vi.fn(async () => {}),
  },
  errorBannerMessage: null as string | null,
  workbenchLayoutProps: {} as Record<string, unknown>,
  shouldRenderTerminalWindowsLayer: true,
  terminalWindowsLayerProps: {} as Record<string, unknown>,
})

describe('App integration', () => {
  beforeEach(() => {
    const openImportModal = vi.fn(() => {
      mocks.uiState.isImportModalOpen = true
    })
    const closeImportModal = vi.fn(() => {
      mocks.uiState.isImportModalOpen = false
    })

    mocks.uiState.pipelineName = 'Default operator pipeline'
    mocks.uiState.isImportModalOpen = false
    mocks.uiState.setPipelineName = vi.fn()
    mocks.uiState.openImportModal = openImportModal
    mocks.uiState.closeImportModal = closeImportModal

    mocks.useWorkbenchFeatureMock.mockReset()
    mocks.useHistoryFeatureMock.mockReset()
  })

  it('renders workbench by default and wires header actions', async () => {
    const workbench = createWorkbenchState()
    mocks.useWorkbenchFeatureMock.mockReturnValue(workbench)
    mocks.useHistoryFeatureMock.mockReturnValue({
      runs: [],
      terminalHistory: [],
      isLoading: false,
      errorMessage: null,
    })

    render(<App />)

    expect(await screen.findByTestId('workbench-view')).toBeInTheDocument()
    expect(screen.getByText('Terminals 2')).toBeInTheDocument()
    expect(screen.getByText('API connected')).toBeInTheDocument()
    expect(await screen.findByTestId('terminal-windows-layer')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    await waitFor(() => {
      expect(workbench.createManualTerminal).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Import JSON DLC' }))
    expect(mocks.uiState.openImportModal).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Workflow settings' }))
    expect(await screen.findByTestId('flow-settings-modal')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close flow settings modal' }))
    await waitFor(() => {
      expect(screen.queryByTestId('flow-settings-modal')).not.toBeInTheDocument()
    })
  })

  it('switches to history tab and requests active history data', async () => {
    const workbench = createWorkbenchState()
    mocks.useWorkbenchFeatureMock.mockReturnValue(workbench)
    mocks.useHistoryFeatureMock.mockReturnValue({
      runs: [{ id: 'run_1' }],
      terminalHistory: [],
      isLoading: false,
      errorMessage: null,
    })

    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: 'History' }))

    expect(await screen.findByTestId('history-view')).toHaveTextContent(
      'History View (1)',
    )
    expect(mocks.useHistoryFeatureMock).toHaveBeenLastCalledWith({
      isActive: true,
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Workbench' }))
    expect(await screen.findByTestId('workbench-view')).toBeInTheDocument()
  })

  it('renders import modal from store state and closes it through callback', async () => {
    const workbench = createWorkbenchState()
    mocks.useWorkbenchFeatureMock.mockReturnValue(workbench)
    mocks.useHistoryFeatureMock.mockReturnValue({
      runs: [],
      terminalHistory: [],
      isLoading: false,
      errorMessage: null,
    })
    mocks.uiState.isImportModalOpen = true

    render(<App />)
    expect(await screen.findByTestId('import-modal')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close import modal' }))
    expect(mocks.uiState.closeImportModal).toHaveBeenCalledTimes(1)
  })
})
