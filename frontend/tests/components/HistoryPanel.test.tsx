import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import HistoryPanel from '../../src/components/HistoryPanel'
import type { BackendManualTerminalHistory, RunState } from '../../src/types'

const createRun = (overrides: Partial<RunState> = {}): RunState => ({
  id: 'run_1',
  pipelineName: 'Deploy flow',
  status: 'success',
  startedAt: '2026-03-01T10:00:00Z',
  finishedAt: '2026-03-01T10:01:00Z',
  logFilePath: '/tmp/run_1.log',
  sessions: [],
  ...overrides,
})

const createTerminalHistoryItem = (
  overrides: Partial<BackendManualTerminalHistory> = {},
): BackendManualTerminalHistory => ({
  terminal_id: 'terminal_1',
  title: 'Terminal #1',
  created_at: '2026-03-01T09:00:00Z',
  updated_at: '2026-03-01T09:10:00Z',
  closed_at: null,
  log_file_path: '/tmp/terminal_1.log',
  commands: ['pwd', 'ls', 'cat file.txt'],
  ...overrides,
})

describe('HistoryPanel', () => {
  it('shows loading placeholders when history is empty and loading', () => {
    render(
      <HistoryPanel
        runs={[]}
        terminalHistory={[]}
        isLoading
        errorMessage={null}
      />,
    )

    expect(screen.getAllByText('Loading history...')).toHaveLength(2)
  })

  it('renders runs and manual terminal history entries', () => {
    render(
      <HistoryPanel
        runs={[createRun()]}
        terminalHistory={[createTerminalHistoryItem()]}
        isLoading={false}
        errorMessage={null}
      />,
    )

    expect(screen.getByText('Pipeline History')).toBeInTheDocument()
    expect(screen.getByText('Manual Command History')).toBeInTheDocument()
    expect(screen.getByText('Deploy flow')).toBeInTheDocument()
    expect(screen.getByText('Terminal #1')).toBeInTheDocument()
    expect(screen.getByText('/tmp/run_1.log')).toBeInTheDocument()
    expect(screen.getByText('/tmp/terminal_1.log')).toBeInTheDocument()
    expect(screen.getByText('cat file.txt')).toBeInTheDocument()
  })
})
