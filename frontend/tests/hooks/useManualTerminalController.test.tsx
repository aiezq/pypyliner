import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualTerminalController } from '../../src/hooks/useManualTerminalController'

describe('useManualTerminalController', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.useRealTimers()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    window.localStorage.clear()
  })

  it('creates backend manual terminals and appends commands', async () => {
    const setBackendError = vi.fn()
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn(async () => ({
          id: 'term_1',
          terminal_node_id: 'manual_terminal_1',
          sequence_id: null,
          title: 'Terminal #1',
          terminal_type: 'local',
          ssh_connection_name: null,
          ssh_host: null,
          ssh_username: null,
          status: 'idle',
          created_at: '2026-03-11T09:00:00Z',
          started_at: '2026-03-11T09:00:00Z',
          finished_at: null,
          exit_code: null,
          current_command_index: null,
          current_command_id: null,
          shell_pid: 42,
          queue: [],
          lines: [],
        })),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn(async () => ({
          id: 'term_1',
          terminal_node_id: 'manual_terminal_1',
          sequence_id: null,
          title: 'Renamed terminal',
          terminal_type: 'local',
          ssh_connection_name: null,
          ssh_host: null,
          ssh_username: null,
          status: 'running',
          created_at: '2026-03-11T09:00:00Z',
          started_at: '2026-03-11T09:00:00Z',
          finished_at: null,
          exit_code: null,
          current_command_index: 0,
          current_command_id: 'cmd_1',
          shell_pid: 42,
          queue: [
            {
              id: 'cmd_1',
              node_id: 'manual_cmd_1',
              label: 'echo one',
              original_command: 'echo one',
              resolved_command: 'echo one',
              status: 'pending',
              started_at: null,
              finished_at: null,
              exit_code: null,
            },
          ],
          lines: [],
        })),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn(async () => ({
          id: 'term_1',
          terminal_node_id: 'manual_terminal_1',
          sequence_id: null,
          title: 'Renamed terminal',
          terminal_type: 'local',
          ssh_connection_name: null,
          ssh_host: null,
          ssh_username: null,
          status: 'idle',
          created_at: '2026-03-11T09:00:00Z',
          started_at: '2026-03-11T09:00:00Z',
          finished_at: null,
          exit_code: null,
          current_command_index: null,
          current_command_id: null,
          shell_pid: 42,
          queue: [],
          lines: [],
        })),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn(async () => ({
          id: 'term_1',
          terminal_node_id: 'manual_terminal_1',
          sequence_id: null,
          title: 'Renamed terminal',
          terminal_type: 'local',
          ssh_connection_name: null,
          ssh_host: null,
          ssh_username: null,
          status: 'idle',
          created_at: '2026-03-11T09:00:00Z',
          started_at: '2026-03-11T09:00:00Z',
          finished_at: null,
          exit_code: null,
          current_command_index: null,
          current_command_id: null,
          shell_pid: 42,
          queue: [],
          lines: [],
        })),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: vi.fn(async () => undefined),
        text: vi.fn(async () => ''),
      })

    const { result } = renderHook(() =>
      useManualTerminalController({
        setBackendError,
      }),
    )

    await act(async () => {
      await result.current.createManualTerminal()
    })
    expect(result.current.manualTerminals).toHaveLength(1)
    const terminalId = result.current.manualTerminals[0]?.id ?? ''
    expect(terminalId).toBe('term_1')

    act(() => {
      result.current.updateManualTitle(terminalId, 'Renamed terminal')
    })
    await act(async () => {
      await result.current.renameManualTerminal(terminalId)
    })
    expect(result.current.manualTerminals[0]?.title).toBe('Renamed terminal')

    act(() => {
      result.current.updateManualCommand(terminalId, 'echo one')
      result.current.updateCopyTailLineCount(terminalId, '2')
      result.current.setManualTerminals((prev) =>
        prev.map((terminal) =>
          terminal.id === terminalId
            ? {
                ...terminal,
                lines: [
                  { id: 'l1', stream: 'out', text: 'line1', createdAt: 't1' },
                  { id: 'l2', stream: 'out', text: 'line2', createdAt: 't2' },
                  { id: 'l3', stream: 'err', text: 'line3', createdAt: 't3' },
                ],
              }
            : terminal,
        ),
      )
    })

    await act(async () => {
      await result.current.runManualCommand(terminalId)
    })
    expect(result.current.manualTerminals[0]?.draftCommand).toBe('')

    await act(async () => {
      await result.current.stopManualTerminal(terminalId)
    })

    await act(async () => {
      await result.current.clearManualTerminal(terminalId)
    })
    expect(result.current.manualTerminals[0]?.status).toBe('idle')
    expect(setBackendError).toHaveBeenLastCalledWith(null)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/terminals/term_1/commands'),
      expect.objectContaining({
        method: 'POST',
      }),
    )

    act(() => {
      result.current.updateManualCommand(terminalId, 'echo draft')
      result.current.navigateManualCommandHistory(terminalId, 'up', 'echo draft')
    })
    expect(result.current.manualTerminals[0]?.draftCommand).toBe('echo one')

    act(() => {
      result.current.navigateManualCommandHistory(terminalId, 'down', 'echo one')
    })
    expect(result.current.manualTerminals[0]?.draftCommand).toBe('echo draft')

    act(() => {
      result.current.updateManualCommand(terminalId, 'ec')
    })
    await act(async () => {
      await result.current.autocompleteManualCommand(terminalId)
    })
    expect(result.current.manualTerminals[0]?.draftCommand).toBe('echo one')

    act(() => {
      result.current.setManualTerminals((prev) =>
        prev.map((terminal) =>
          terminal.id === terminalId
            ? {
                ...terminal,
                lines: [
                  { id: 'l1', stream: 'out', text: 'line1', createdAt: 't1' },
                  { id: 'l2', stream: 'out', text: 'line2', createdAt: 't2' },
                  { id: 'l3', stream: 'err', text: 'line3', createdAt: 't3' },
                ],
              }
            : terminal,
        ),
      )
    })

    await act(async () => {
      await result.current.copyManualTerminalTail(terminalId)
    })
    expect(writeText).toHaveBeenCalledWith('line2\nline3')
    expect(result.current.copyTailCopiedByTerminalId[terminalId]).toBe(true)

    await act(async () => {
      await result.current.removeManualTerminal(terminalId)
    })
    expect(result.current.manualTerminals).toEqual([])
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/terminals/term_1'),
      expect.objectContaining({
        method: 'DELETE',
      }),
    )

    const context = result.current.getSocketEventContext()
    expect(typeof context.pruneAndPersistStoredHistory).toBe('function')
  })

  it('handles missing terminal and invalid copy-tail input safely', async () => {
    const setBackendError = vi.fn()

    const { result } = renderHook(() =>
      useManualTerminalController({
        setBackendError,
      }),
    )

    act(() => {
      result.current.updateCopyTailLineCount('missing', 'not_a_number')
    })
    expect(result.current.getCopyTailLineCount('missing')).toBe(20)

    await act(async () => {
      await result.current.renameManualTerminal('missing')
      await result.current.copyManualTerminalTail('missing')
      await result.current.runManualCommand('missing')
    })
    expect(setBackendError).not.toHaveBeenCalledWith(
      'Failed to copy terminal output to clipboard',
    )
  })

  it('does not create a local placeholder when backend terminal creation fails', async () => {
    const setBackendError = vi.fn()
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: vi.fn(async () => ({ detail: 'shell bootstrap failed' })),
      text: vi.fn(async () => 'shell bootstrap failed'),
    })

    const { result } = renderHook(() =>
      useManualTerminalController({
        setBackendError,
      }),
    )

    await act(async () => {
      await result.current.createManualTerminal()
    })

    expect(result.current.manualTerminals).toEqual([])
    expect(setBackendError).toHaveBeenLastCalledWith('shell bootstrap failed')
  })
})
