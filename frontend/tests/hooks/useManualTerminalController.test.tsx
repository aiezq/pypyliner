import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualTerminalController } from '../../src/hooks/useManualTerminalController'

describe('useManualTerminalController', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('manages placeholder terminal UI state locally', async () => {
    const setBackendError = vi.fn()
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
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
      await result.current.autocompleteManualCommand(terminalId)
      await result.current.stopManualTerminal(terminalId)
      await result.current.clearManualTerminal(terminalId)
    })
    expect(result.current.manualTerminals[0]?.status).toBe('idle')
    expect(setBackendError).toHaveBeenLastCalledWith(null)

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
    })
    expect(setBackendError).not.toHaveBeenCalledWith(
      'Failed to copy terminal output to clipboard',
    )
  })
})
