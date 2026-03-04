import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualTerminalController } from '../../src/hooks/useManualTerminalController'

const apiRequestMock = vi.hoisted(() => vi.fn())

vi.mock('../../src/lib/api', () => ({
  apiRequest: apiRequestMock,
}))

const baseBackendTerminal = {
  id: 'terminal_1',
  title: 'Manual #1',
  prompt_user: 'operator',
  prompt_cwd: '~',
  status: 'idle',
  exit_code: null,
  draft_command: '',
  lines: [] as Array<{ id: string; stream: 'out' | 'err' | 'meta'; text: string; created_at: string }>,
}

describe('useManualTerminalController', () => {
  beforeEach(() => {
    apiRequestMock.mockReset()
    vi.useRealTimers()
  })

  it('handles manual terminal lifecycle, history, autocomplete and copy tail', async () => {
    const setBackendError = vi.fn()
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    apiRequestMock.mockImplementation(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (path === '/api/terminals' && method === 'POST') {
        return { ...baseBackendTerminal }
      }
      if (path === '/api/terminals/terminal_1' && method === 'PATCH') {
        return { ...baseBackendTerminal, title: 'Renamed terminal' }
      }
      if (path === '/api/terminals/terminal_1/run' && method === 'POST') {
        return { ...baseBackendTerminal, status: 'running' }
      }
      if (path === '/api/terminals/terminal_1/complete' && method === 'POST') {
        return {
          terminal_id: 'terminal_1',
          command: 'ec',
          base_command: 'ec',
          completed_command: 'echo one',
          matches: ['echo one', 'echo two'],
        }
      }
      if (path === '/api/terminals/terminal_1/stop' && method === 'POST') {
        return { ...baseBackendTerminal, status: 'stopped' }
      }
      if (path === '/api/terminals/terminal_1/clear' && method === 'POST') {
        return { ...baseBackendTerminal, status: 'idle', lines: [] }
      }
      if (path === '/api/terminals/terminal_1' && method === 'DELETE') {
        return { deleted: true, terminal_id: 'terminal_1' }
      }
      throw new Error(`unexpected request: ${method} ${path}`)
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
    expect(setBackendError).toHaveBeenLastCalledWith(null)

    act(() => {
      result.current.updateManualTitle('terminal_1', 'Renamed terminal')
    })
    await act(async () => {
      await result.current.renameManualTerminal('terminal_1')
    })
    expect(apiRequestMock).toHaveBeenCalledWith('/api/terminals/terminal_1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Renamed terminal' }),
    })

    act(() => {
      result.current.updateManualCommand('terminal_1', 'echo one')
    })
    await act(async () => {
      await result.current.runManualCommand('terminal_1')
    })
    expect(result.current.manualTerminals[0]?.draftCommand).toBe('')

    act(() => {
      result.current.navigateManualCommandHistory('terminal_1', 'up', '')
    })
    expect(result.current.manualTerminals[0]?.draftCommand).toBe('echo one')
    act(() => {
      result.current.navigateManualCommandHistory('terminal_1', 'down', '')
    })
    expect(result.current.manualTerminals[0]?.draftCommand).toBe('')

    act(() => {
      result.current.updateManualCommand('terminal_1', 'ec')
    })
    await act(async () => {
      await result.current.autocompleteManualCommand('terminal_1')
    })
    expect(result.current.manualTerminals[0]?.draftCommand).toBe('echo one')

    await act(async () => {
      await result.current.stopManualTerminal('terminal_1')
      await result.current.clearManualTerminal('terminal_1')
    })

    act(() => {
      result.current.setManualTerminals((prev) =>
        prev.map((terminal) => ({
          ...terminal,
          lines: [
            { id: 'l1', stream: 'out', text: 'line1', createdAt: 't1' },
            { id: 'l2', stream: 'out', text: 'line2', createdAt: 't2' },
            { id: 'l3', stream: 'err', text: 'line3', createdAt: 't3' },
          ],
        })),
      )
      result.current.updateCopyTailLineCount('terminal_1', '2')
    })

    await act(async () => {
      await result.current.copyManualTerminalTail('terminal_1')
    })
    expect(writeText).toHaveBeenCalledWith('line2\nline3')
    expect(result.current.copyTailCopiedByTerminalId.terminal_1).toBe(true)

    await act(async () => {
      await result.current.removeManualTerminal('terminal_1')
    })
    expect(result.current.manualTerminals).toEqual([])

    const context = result.current.getSocketEventContext()
    expect(typeof context.pruneAndPersistStoredHistory).toBe('function')
  })

  it('handles error branches and normalizes invalid copy-tail value', async () => {
    const setBackendError = vi.fn()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(async () => {
          throw new Error('copy failed')
        }),
      },
    })

    apiRequestMock.mockImplementation(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (path === '/api/terminals' && method === 'POST') {
        throw new Error('create failed')
      }
      if (path === '/api/terminals/terminal_1/complete' && method === 'POST') {
        throw new Error('complete failed')
      }
      return { ...baseBackendTerminal }
    })

    const { result } = renderHook(() =>
      useManualTerminalController({
        setBackendError,
      }),
    )

    await act(async () => {
      await result.current.createManualTerminal()
    })
    expect(setBackendError).toHaveBeenCalledWith('create failed')

    act(() => {
      result.current.setManualTerminals([
        {
          id: 'terminal_1',
          title: 'T',
          titleDraft: 'T',
          promptUser: 'u',
          promptCwd: '~',
          status: 'idle',
          exitCode: null,
          draftCommand: 'abc',
          lines: [{ id: '1', stream: 'out', text: 'line', createdAt: 'now' }],
        },
      ])
      result.current.updateCopyTailLineCount('terminal_1', 'not_a_number')
    })
    expect(result.current.getCopyTailLineCount('terminal_1')).toBe(20)

    await act(async () => {
      await result.current.autocompleteManualCommand('terminal_1')
      await result.current.copyManualTerminalTail('terminal_1')
    })
    expect(setBackendError).toHaveBeenCalledWith('complete failed')
    expect(setBackendError).toHaveBeenCalledWith('Failed to copy terminal output to clipboard')
  })

  it('covers guard clauses and mutation error handlers', async () => {
    const setBackendError = vi.fn()
    let completionCall = 0

    apiRequestMock.mockImplementation(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (path === '/api/terminals/terminal_1/run' && method === 'POST') {
        throw new Error('run failed')
      }
      if (path === '/api/terminals/terminal_1/complete' && method === 'POST') {
        completionCall += 1
        if (completionCall === 1) {
          return {
            terminal_id: 'terminal_1',
            command: 'abc',
            base_command: 'abc',
            completed_command: 'abc',
            matches: [],
          }
        }
        if (completionCall === 2) {
          return {
            terminal_id: 'terminal_1',
            command: 'abc',
            base_command: 'abc',
            completed_command: 'abc_done',
            matches: ['abc_done', 'abc_next'],
          }
        }
        return {
          terminal_id: 'terminal_1',
          command: 'abc_done',
          base_command: 'abc',
          completed_command: 'abc_done',
          matches: ['abc_done'],
        }
      }
      if (path === '/api/terminals/terminal_1/stop' && method === 'POST') {
        throw new Error('stop failed')
      }
      if (path === '/api/terminals/terminal_1/clear' && method === 'POST') {
        throw new Error('clear failed')
      }
      if (path === '/api/terminals/terminal_1' && method === 'DELETE') {
        throw new Error('delete failed')
      }
      return { ...baseBackendTerminal }
    })

    const { result } = renderHook(() =>
      useManualTerminalController({
        setBackendError,
      }),
    )

    await act(async () => {
      await result.current.renameManualTerminal('missing')
      await result.current.runManualCommand('missing')
      await result.current.autocompleteManualCommand('missing')
      await result.current.copyManualTerminalTail('missing')
    })

    act(() => {
      result.current.setManualTerminals([
        {
          id: 'terminal_1',
          title: 'Same',
          titleDraft: 'Same',
          promptUser: 'u',
          promptCwd: '~',
          status: 'idle',
          exitCode: null,
          draftCommand: '',
          lines: [],
        },
      ])
      result.current.navigateManualCommandHistory('terminal_1', 'up', 'draft')
      result.current.navigateManualCommandHistory('terminal_1', 'down', 'draft')
    })

    await act(async () => {
      await result.current.renameManualTerminal('terminal_1')
      await result.current.runManualCommand('terminal_1')
    })

    act(() => {
      result.current.updateManualCommand('terminal_1', 'abc')
    })
    await act(async () => {
      await result.current.runManualCommand('terminal_1')
    })
    expect(result.current.manualTerminals[0]?.draftCommand).toBe('abc')

    await act(async () => {
      await result.current.autocompleteManualCommand('terminal_1') // matches = []
      await result.current.autocompleteManualCommand('terminal_1') // sets cycle and updates
      await result.current.autocompleteManualCommand('terminal_1') // completed command unchanged
    })
    expect(result.current.manualTerminals[0]?.draftCommand).toBe('abc_done')
    act(() => {
      result.current.updateManualCommand('terminal_1', 'changed')
    })
    await act(async () => {
      await result.current.stopManualTerminal('terminal_1')
      await result.current.clearManualTerminal('terminal_1')
      await result.current.removeManualTerminal('terminal_1')
    })

    expect(setBackendError).toHaveBeenCalledWith('run failed')
    expect(setBackendError).toHaveBeenCalledWith('stop failed')
    expect(setBackendError).toHaveBeenCalledWith('clear failed')
    expect(setBackendError).toHaveBeenCalledWith('delete failed')
  })

  it('clears previous copy timeout and resets copied state', async () => {
    vi.useFakeTimers()
    const setBackendError = vi.fn()
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    apiRequestMock.mockResolvedValue({ ...baseBackendTerminal })
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')

    const { result } = renderHook(() =>
      useManualTerminalController({
        setBackendError,
      }),
    )

    act(() => {
      result.current.setManualTerminals([
        {
          id: 'terminal_1',
          title: 'T',
          titleDraft: 'T',
          promptUser: 'u',
          promptCwd: '~',
          status: 'idle',
          exitCode: null,
          draftCommand: '',
          lines: [{ id: '1', stream: 'out', text: 'line', createdAt: 'now' }],
        },
      ])
    })

    await act(async () => {
      await result.current.copyManualTerminalTail('terminal_1')
      await result.current.copyManualTerminalTail('terminal_1')
    })
    expect(clearTimeoutSpy).toHaveBeenCalled()
    expect(result.current.copyTailCopiedByTerminalId.terminal_1).toBe(true)

    act(() => {
      vi.advanceTimersByTime(1400)
    })
    expect(result.current.copyTailCopiedByTerminalId.terminal_1).toBe(false)
  })
})
