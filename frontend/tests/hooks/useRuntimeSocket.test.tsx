import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeSocketEvent } from '../../src/lib/schemas'
import { useRuntimeSocket } from '../../src/hooks/useRuntimeSocket'

interface MockSocketInstance {
  onopen: (() => void) | null
  onmessage: ((message: { data: string }) => void) | null
  onerror: (() => void) | null
  onclose: (() => void) | null
  close: () => void
}

class MockWebSocket {
  static instances: MockSocketInstance[] = []

  onopen: (() => void) | null = null
  onmessage: ((message: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  close = vi.fn()

  constructor(_url: string) {
    MockWebSocket.instances.push(this)
  }
}

describe('useRuntimeSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('handles open, valid event, invalid payload, error and reconnect on close', async () => {
    const onEvent = vi.fn<(event: RuntimeSocketEvent) => void>()
    const onOpen = vi.fn(async () => {})
    const onOpenError = vi.fn()
    const onErrorMessage = vi.fn()

    const { result, unmount } = renderHook(() =>
      useRuntimeSocket({
        onEvent,
        onOpen,
        onOpenError,
        onErrorMessage,
      }),
    )

    expect(MockWebSocket.instances).toHaveLength(1)
    const socket = MockWebSocket.instances[0]

    act(() => {
      socket?.onopen?.()
    })
    expect(result.current.isSocketConnected).toBe(true)
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpenError).not.toHaveBeenCalled()

    act(() => {
      socket?.onmessage?.({
        data: JSON.stringify({
          type: 'terminal_closed',
          data: { terminal_id: 'terminal_1' },
        }),
      })
    })
    expect(onEvent).toHaveBeenCalledWith({
      type: 'terminal_closed',
      data: { terminal_id: 'terminal_1' },
    })

    act(() => {
      socket?.onmessage?.({ data: 'not json' })
    })
    expect(onErrorMessage).toHaveBeenCalledWith(
      'Failed to parse WebSocket event payload',
    )

    act(() => {
      socket?.onmessage?.({ data: JSON.stringify({ type: 'unknown' }) })
    })
    expect(onErrorMessage).toHaveBeenCalledWith(
      'Failed to parse WebSocket event payload',
    )

    act(() => {
      socket?.onerror?.()
    })
    expect(onErrorMessage).toHaveBeenCalledWith('WebSocket disconnected from backend')

    act(() => {
      socket?.onclose?.()
    })
    expect(result.current.isSocketConnected).toBe(false)

    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(2)

    unmount()
    expect(
      MockWebSocket.instances.some(
        (instance) => (instance.close as ReturnType<typeof vi.fn>).mock.calls.length > 0,
      ),
    ).toBe(true)
  })

  it('supports socket open when onOpen callback is not provided', () => {
    const { result } = renderHook(() =>
      useRuntimeSocket({
        onEvent: vi.fn(),
      }),
    )

    const socket = MockWebSocket.instances[0]
    act(() => {
      socket?.onopen?.()
    })
    expect(result.current.isSocketConnected).toBe(true)
  })

  it('forwards onOpen rejection to onOpenError', async () => {
    const onOpenError = vi.fn()
    const onOpen = vi.fn(async () => {
      throw new Error('open failed')
    })

    renderHook(() =>
      useRuntimeSocket({
        onEvent: vi.fn(),
        onOpen,
        onOpenError,
      }),
    )

    const socket = MockWebSocket.instances[0]
    await act(async () => {
      socket?.onopen?.()
      await Promise.resolve()
    })
    expect(onOpenError).toHaveBeenCalled()
  })

  it('ignores socket events after unmount (disposed state)', () => {
    const onEvent = vi.fn()
    const onErrorMessage = vi.fn()
    const onOpenError = vi.fn()
    const onOpen = vi.fn(async () => {
      throw new Error('late open error')
    })

    const { unmount } = renderHook(() =>
      useRuntimeSocket({
        onEvent,
        onOpen,
        onOpenError,
        onErrorMessage,
      }),
    )

    const socket = MockWebSocket.instances[0]
    unmount()

    act(() => {
      socket?.onopen?.()
      socket?.onmessage?.({
        data: JSON.stringify({
          type: 'terminal_closed',
          data: { terminal_id: 't1' },
        }),
      })
      socket?.onerror?.()
      socket?.onclose?.()
      vi.advanceTimersByTime(2000)
    })

    expect(onEvent).not.toHaveBeenCalled()
    expect(onErrorMessage).not.toHaveBeenCalled()
    expect(onOpenError).not.toHaveBeenCalled()
  })
})
