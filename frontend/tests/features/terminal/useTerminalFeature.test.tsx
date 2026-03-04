import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useManualTerminalControllerMock = vi.hoisted(() => vi.fn())

vi.mock('../../../src/hooks/useManualTerminalController', () => ({
  useManualTerminalController: useManualTerminalControllerMock,
}))

import { useTerminalFeature } from '../../../src/features/terminal/useTerminalFeature'

describe('useTerminalFeature', () => {
  beforeEach(() => {
    window.localStorage.removeItem('operator_helper.pinned_terminals.v1')
    useManualTerminalControllerMock.mockReset()
  })

  it('loads pinned ids from storage and persists updates', async () => {
    window.localStorage.setItem(
      'operator_helper.pinned_terminals.v1',
      JSON.stringify(['terminal_1', 'terminal_2']),
    )

    const manual = { getSocketEventContext: vi.fn(() => ({})) }
    useManualTerminalControllerMock.mockReturnValue(manual)

    const setBackendError = vi.fn()
    const { result } = renderHook(() => useTerminalFeature({ setBackendError }))

    expect(result.current.manual).toBe(manual)
    expect(result.current.pinnedTerminalWindowIds).toEqual(['terminal_1', 'terminal_2'])

    result.current.setPinnedTerminalWindowIds(['terminal_3'])

    await vi.waitFor(() => {
      expect(window.localStorage.getItem('operator_helper.pinned_terminals.v1')).toBe(
        JSON.stringify(['terminal_3']),
      )
    })
  })

  it('handles invalid storage payload and keeps default pinned ids', () => {
    window.localStorage.setItem('operator_helper.pinned_terminals.v1', '{invalid')
    useManualTerminalControllerMock.mockReturnValue({ getSocketEventContext: vi.fn() })

    const { result } = renderHook(() =>
      useTerminalFeature({ setBackendError: vi.fn() }),
    )
    expect(result.current.pinnedTerminalWindowIds).toEqual([])
    expect(result.current.requestedMinimizedTerminalWindowIds).toEqual([])
  })

  it('handles missing and non-array storage values', () => {
    useManualTerminalControllerMock.mockReturnValue({ getSocketEventContext: vi.fn() })

    window.localStorage.removeItem('operator_helper.pinned_terminals.v1')
    const first = renderHook(() =>
      useTerminalFeature({ setBackendError: vi.fn() }),
    )
    expect(first.result.current.pinnedTerminalWindowIds).toEqual([])
    first.unmount()

    window.localStorage.setItem(
      'operator_helper.pinned_terminals.v1',
      JSON.stringify({ invalid: true }),
    )
    const second = renderHook(() => useTerminalFeature({ setBackendError: vi.fn() }))
    expect(second.result.current.pinnedTerminalWindowIds).toEqual([])
  })
})
