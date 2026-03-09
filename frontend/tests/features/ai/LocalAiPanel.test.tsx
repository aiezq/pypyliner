import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LocalAiPanel from '../../../src/features/ai/LocalAiPanel'
import { useGraphStore } from '../../../src/graph/store/graphStore'

const apiMock = vi.hoisted(() => ({
  analyzeDocumentation: vi.fn(),
  cancelAiModelInstall: vi.fn(),
  fetchAiModels: vi.fn(),
  fetchAiModelStatus: vi.fn(),
  installAiModel: vi.fn(),
  loadAiModel: vi.fn(),
  unloadAiModel: vi.fn(),
  removeAiModel: vi.fn(),
  generatePipelineDraft: vi.fn(),
}))

vi.mock('../../../src/features/ai/api', () => apiMock)

function resetGraphStore(): void {
  window.localStorage.removeItem('graph-editor-state')
  useGraphStore.setState({
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    activeTerminalIds: [],
    terminalStatuses: {},
    globalVariables: {},
    sshConnections: [],
  })
}

const readyModel = {
  model_id: 'gemma3',
  display_name: 'Gemma 3',
  provider: 'google',
  runtime: 'ollama' as const,
  install_ref: 'gemma3',
  download_size_bytes: 3300000000,
  min_ram_gb: 8,
  recommended_ram_gb: 12,
  supports_json_mode: true,
  license: 'Gemma license',
  status: 'available',
  install_state: 'installed' as const,
  model_state: 'ready' as const,
  last_error: null,
  progress_status: null,
  progress_completed_bytes: null,
  progress_total_bytes: null,
  progress_percent: null,
}

describe('LocalAiPanel', () => {
  beforeEach(() => {
    resetGraphStore()
    apiMock.fetchAiModels.mockResolvedValue({
      runtime_name: 'ollama',
      runtime_available: true,
      models: [readyModel],
    })
    apiMock.installAiModel.mockResolvedValue({
      runtime_name: 'ollama',
      runtime_available: true,
      model: readyModel,
    })
    apiMock.cancelAiModelInstall.mockResolvedValue({
      runtime_name: 'ollama',
      runtime_available: true,
      model: {
        ...readyModel,
        install_state: 'not_installed',
        model_state: 'not_installed',
      },
    })
    apiMock.fetchAiModelStatus.mockResolvedValue({
      runtime_name: 'ollama',
      runtime_available: true,
      model: readyModel,
    })
    apiMock.analyzeDocumentation.mockResolvedValue({
      questions: [
        {
          id: 'region',
          question: 'Which region is used?',
          description: 'Choose the region branch from the SOP.',
          answer_type: 'choice',
          choices: ['Moscow', 'Belgrade'],
          required: true,
        },
        {
          id: 'set_number',
          question: 'Which item set number is used?',
          description: 'Provide the exact set number for dfs-items-path.',
          answer_type: 'text',
          choices: [],
          required: true,
        },
      ],
      warnings: ['Documentation contains multiple region branches.'],
      install_state: 'installed',
      model_state: 'ready',
    })
    apiMock.generatePipelineDraft.mockResolvedValue({
      draft: {
        flow_name: 'Deploy flow',
        summary: 'Deploy app to target host.',
        assumptions: ['Target server is reachable.'],
        warnings: [],
        variables: [
          {
            name: 'host',
            description: 'Target host',
            default_value: 'srv-01',
            required: true,
          },
        ],
        steps: [
          {
            id: 'step_1',
            label: 'Check host',
            command: 'ping -c 1 {host}',
            description: 'Validate connectivity.',
            uses_variables: ['host'],
            template_id: null,
            terminal_type: 'local',
          },
        ],
        target_terminal: {
          type: 'local',
          connection_hint: null,
        },
        confidence: 0.8,
      },
      warnings: [],
      install_state: 'installed',
      model_state: 'ready',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    resetGraphStore()
  })

  it('runs install action from the model card', async () => {
    render(<LocalAiPanel onImportComplete={() => undefined} />)

    await screen.findByText('Gemma 3')
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))

    await waitFor(() => {
      expect(apiMock.installAiModel).toHaveBeenCalledWith('gemma3')
    })
  })

  it('analyzes documentation, collects clarification answers, and imports draft into graph store', async () => {
    const onImportComplete = vi.fn()
    render(<LocalAiPanel onImportComplete={onImportComplete} />)

    await screen.findByText('Gemma 3')
    fireEvent.click(screen.getByRole('button', { name: 'Generate from docs' }))

    fireEvent.change(screen.getByPlaceholderText('Paste operator documentation here.'), {
      target: { value: 'Use Moscow or Belgrade branch and choose a set number before running the collect command.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Analyze docs' }))

    await screen.findByText('Answer missing operator choices first')
    fireEvent.change(screen.getByDisplayValue('Moscow'), {
      target: { value: 'Belgrade' },
    })
    fireEvent.change(screen.getByPlaceholderText('Type operator answer'), {
      target: { value: '5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate final draft' }))

    await waitFor(() => {
      expect(apiMock.generatePipelineDraft).toHaveBeenCalledWith(
        'gemma3',
        expect.stringContaining('Use Moscow or Belgrade branch'),
        [
          { question_id: 'region', answer: 'Belgrade' },
          { question_id: 'set_number', answer: '5' },
        ],
      )
    })

    await screen.findByText('Deploy flow')
    fireEvent.click(screen.getByRole('button', { name: 'Import to graph' }))

    expect(onImportComplete).toHaveBeenCalledTimes(1)
    expect(useGraphStore.getState().nodes.some((node) => node.type === 'terminal')).toBe(true)
    expect(useGraphStore.getState().nodes.some((node) => node.type === 'command')).toBe(true)
  })

  it('renders install progress details and progress bar', async () => {
    apiMock.fetchAiModels.mockResolvedValueOnce({
      runtime_name: 'ollama',
      runtime_available: true,
      models: [
        {
          ...readyModel,
          install_state: 'installing',
          model_state: 'not_installed',
          progress_status: 'Downloading Gemma 3...',
          progress_completed_bytes: 1024 * 1024 * 1024,
          progress_total_bytes: 2 * 1024 * 1024 * 1024,
          progress_percent: 50,
        },
      ],
    })

    render(<LocalAiPanel onImportComplete={() => undefined} />)

    await screen.findByText('Downloading Gemma 3...')
    expect(screen.getByText('50.0%')).toBeInTheDocument()
    expect(screen.getByText(/Downloaded 1\.0 GB of 2\.0 GB/)).toBeInTheDocument()
    expect(screen.getByText(/Remaining 1\.0 GB/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
  })

  it('cancels installation from the model card', async () => {
    apiMock.fetchAiModels.mockResolvedValueOnce({
      runtime_name: 'ollama',
      runtime_available: true,
      models: [
        {
          ...readyModel,
          install_state: 'installing',
          model_state: 'not_installed',
          progress_status: 'Downloading Gemma 3...',
          progress_completed_bytes: 1024,
          progress_total_bytes: 2048,
          progress_percent: 50,
        },
      ],
    })

    render(<LocalAiPanel onImportComplete={() => undefined} />)

    await screen.findByRole('button', { name: 'Cancel' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(apiMock.cancelAiModelInstall).toHaveBeenCalledWith('gemma3')
    })
  })
})
