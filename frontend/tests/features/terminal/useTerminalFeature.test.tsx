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

  it('initializes layout managers and stores references correctly', () => {
    const manual = { getSocketEventContext: vi.fn(() => ({})) }
    useManualTerminalControllerMock.mockReturnValue(manual)

    const setBackendError = vi.fn()
    const { result } = renderHook(() => useTerminalFeature({ setBackendError }))

    expect(result.current.manual).toBe(manual)
    expect(result.current.requestedMinimizedTerminalWindowIds).toEqual([])
  })
})
