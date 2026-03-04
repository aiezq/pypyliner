import { act, renderHook } from '@testing-library/react'
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isWorkbenchTerminalPanelKey,
  toTerminalWorkbenchPanelKey,
  toWorkbenchTerminalWindowId,
  useWorkbenchLayout,
} from '../../src/hooks/useWorkbenchLayout'

const storageGetItemSpy = vi.spyOn(Storage.prototype, 'getItem')
const storageSetItemSpy = vi.spyOn(Storage.prototype, 'setItem')

const createDataTransfer = (source = ''): DataTransfer =>
  ({
    effectAllowed: '',
    dropEffect: 'move',
    setData: vi.fn(),
    getData: vi.fn(() => source),
  }) as unknown as DataTransfer

describe('useWorkbenchLayout', () => {
  beforeEach(() => {
    window.localStorage.clear()
    storageGetItemSpy.mockReset()
    storageSetItemSpy.mockReset()
  })

  it('exports terminal panel key helpers', () => {
    expect(isWorkbenchTerminalPanelKey('terminal:manual:1')).toBe(true)
    expect(isWorkbenchTerminalPanelKey('flow')).toBe(false)
    expect(toTerminalWorkbenchPanelKey('manual:1')).toBe('terminal:manual:1')
    expect(toWorkbenchTerminalWindowId('terminal:run:1')).toBe('run:1')
    expect(toWorkbenchTerminalWindowId('dock')).toBeNull()
  })

  it('builds visible order, supports drag/drop, collapse and resize persistence', () => {
    storageGetItemSpy.mockImplementation((key: string) => {
      if (key.includes('layout')) {
        return JSON.stringify(['flow', 'dock'])
      }
      if (key.includes('collapsed')) {
        return JSON.stringify({ flow: false, dock: false })
      }
      if (key.includes('widths')) {
        return JSON.stringify({ flow: 860, dock: 460 })
      }
      if (key.includes('fullwidth')) {
        return JSON.stringify({ flow: false, dock: false })
      }
      return null
    })

    const { result } = renderHook(() =>
      useWorkbenchLayout({
        terminalPanelKeys: [toTerminalWorkbenchPanelKey('manual:1')],
      }),
    )

    expect(result.current.visibleWorkbenchPanelOrder).toEqual([
      'flow',
      'dock',
      'terminal:manual:1',
    ])

    const dragEvent = {
      dataTransfer: createDataTransfer('flow'),
      preventDefault: vi.fn(),
    } as unknown as ReactDragEvent<HTMLElement>
    const dragStartEvent = {
      dataTransfer: createDataTransfer('flow'),
    } as unknown as ReactDragEvent<HTMLElement>

    act(() => {
      result.current.startWorkbenchPanelDrag('flow', dragStartEvent)
      result.current.onWorkbenchPanelDragOver('dock', dragEvent)
      result.current.onWorkbenchPanelDrop('dock', dragEvent)
    })
    expect(result.current.visibleWorkbenchPanelOrder[0]).toBe('dock')

    act(() => {
      result.current.toggleWorkbenchPanelCollapse('flow')
    })
    expect(result.current.workbenchPanelCollapsed.flow).toBe(true)

    const resizeEvent = {
      clientX: 100,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as ReactMouseEvent<HTMLElement>
    act(() => {
      result.current.startWorkbenchPanelResize('flow', resizeEvent, 860)
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 170 }))
      window.dispatchEvent(new MouseEvent('mouseup'))
    })
    expect(result.current.workbenchPanelWidths.flow).toBeGreaterThan(860)
  })

  it('handles invalid drag source and full-width toggle restore', () => {
    storageGetItemSpy.mockImplementation(() => null)
    const { result } = renderHook(() =>
      useWorkbenchLayout({
        terminalPanelKeys: [],
      }),
    )

    const invalidDrop = {
      dataTransfer: createDataTransfer('invalid'),
      preventDefault: vi.fn(),
    } as unknown as ReactDragEvent<HTMLElement>
    act(() => {
      result.current.onWorkbenchPanelDrop('flow', invalidDrop)
      result.current.finishWorkbenchPanelDrag()
    })
    expect(result.current.draggingWorkbenchPanel).toBeNull()
    expect(result.current.dragOverWorkbenchPanel).toBeNull()

    const currentWidth = result.current.workbenchPanelWidths.flow ?? 860
    act(() => {
      result.current.toggleWorkbenchPanelFullWidth('flow', currentWidth)
    })
    expect(result.current.workbenchPanelFullWidth.flow).toBe(true)
    act(() => {
      result.current.toggleWorkbenchPanelFullWidth('flow', currentWidth)
    })
    expect(result.current.workbenchPanelFullWidth.flow).toBe(false)
  })

  it('can ensure and remove terminal panels in layout', () => {
    storageGetItemSpy.mockImplementation(() => null)
    let terminalPanelKeys: string[] = [toTerminalWorkbenchPanelKey('manual:77')]
    const { result, rerender } = renderHook(() =>
      useWorkbenchLayout({
        terminalPanelKeys,
      }),
    )

    act(() => {
      result.current.ensurePanelInLayout('terminal:manual:77', 700)
    })
    expect(result.current.visibleWorkbenchPanelOrder.includes('terminal:manual:77')).toBe(true)
    expect(result.current.workbenchPanelWidths['terminal:manual:77']).toBe(700)

    act(() => {
      result.current.removePanelFromLayout('terminal:manual:77')
    })
    terminalPanelKeys = []
    rerender()
    expect(result.current.visibleWorkbenchPanelOrder.includes('terminal:manual:77')).toBe(
      false,
    )
  })

  it('falls back on malformed stored widths and ignores mousemove without active resize', () => {
    storageGetItemSpy.mockImplementation((key: string) => {
      if (key.includes('widths')) {
        return JSON.stringify({
          flow: Number.NaN,
          dock: 'bad',
          'terminal:manual:1': 123.8,
          invalid_panel: 999,
        })
      }
      return null
    })

    const { result } = renderHook(() =>
      useWorkbenchLayout({
        terminalPanelKeys: [],
      }),
    )

    const initialWidth = result.current.workbenchPanelWidths.flow
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 999 }))
    })
    expect(result.current.workbenchPanelWidths.flow).toBe(initialWidth)
    expect(result.current.workbenchPanelWidths.dock).toBeDefined()
  })

  it('normalizes malformed persisted layout state and handles drag-over transitions', () => {
    storageGetItemSpy.mockImplementation((key: string) => {
      if (key.includes('layout')) {
        return JSON.stringify(['flow', 'terminal:manual:1', 'flow', 10])
      }
      if (key.includes('collapsed')) {
        return JSON.stringify({ flow: 'bad', dock: true, 'terminal:manual:1': false })
      }
      if (key.includes('widths')) {
        return '{"flow":460,"dock":null,"terminal:manual:1":401.6,"bad":100}'
      }
      if (key.includes('fullwidth')) {
        return JSON.stringify({ flow: 'no', dock: true, bad: false })
      }
      return null
    })

    const { result } = renderHook(() =>
      useWorkbenchLayout({
        terminalPanelKeys: [],
      }),
    )

    expect(result.current.visibleWorkbenchPanelOrder).toEqual(['flow', 'dock'])
    expect(typeof result.current.workbenchPanelCollapsed.dock).toBe('boolean')
    expect(result.current.workbenchPanelWidths.flow).toBeGreaterThan(0)

    const dragEvent = {
      dataTransfer: createDataTransfer('flow'),
      preventDefault: vi.fn(),
    } as unknown as ReactDragEvent<HTMLElement>
    const startEvent = {
      dataTransfer: createDataTransfer('flow'),
    } as unknown as ReactDragEvent<HTMLElement>

    act(() => {
      result.current.startWorkbenchPanelDrag('flow', startEvent)
      result.current.onWorkbenchPanelDragOver('dock', dragEvent)
      result.current.onWorkbenchPanelDrop('dock', dragEvent)
      result.current.ensurePanelInLayout('dock', 460)
      result.current.ensurePanelInLayout('dock', 460)
    })

    expect(result.current.dragOverWorkbenchPanel).toBeNull()
    expect(result.current.visibleWorkbenchPanelOrder[0]).toBe('dock')
  })

  it('covers storage fallback branches and reorder no-op guards', () => {
    const mountWithStorage = (values: Record<string, string | null>) => {
      storageGetItemSpy.mockImplementation((key: string) => {
        if (key.includes('layout')) {
          return values.layout ?? null
        }
        if (key.includes('collapsed')) {
          return values.collapsed ?? null
        }
        if (key.includes('widths')) {
          return values.widths ?? null
        }
        if (key.includes('fullwidth')) {
          return values.fullwidth ?? null
        }
        return null
      })
      return renderHook(() =>
        useWorkbenchLayout({
          terminalPanelKeys: [],
        }),
      )
    }

    mountWithStorage({
      layout: JSON.stringify({}),
      collapsed: JSON.stringify([]),
      widths: JSON.stringify([]),
      fullwidth: JSON.stringify([]),
    }).unmount()

    mountWithStorage({
      layout: JSON.stringify(['flow', 1]),
      collapsed: '{invalid',
      widths: '{"flow":1e309,"bad":"x"}',
      fullwidth: '{invalid',
    }).unmount()

    const last = mountWithStorage({
      layout: JSON.stringify(['flow', 'flow']),
      collapsed: JSON.stringify({ flow: true, bad: false }),
      widths: '{invalid',
      fullwidth: JSON.stringify({ flow: 'bad', dock: false }),
    })

    const dragSame = {
      dataTransfer: createDataTransfer('flow'),
      preventDefault: vi.fn(),
    } as unknown as ReactDragEvent<HTMLElement>
    const dragMissingTarget = {
      dataTransfer: createDataTransfer('flow'),
      preventDefault: vi.fn(),
    } as unknown as ReactDragEvent<HTMLElement>
    act(() => {
      last.result.current.onWorkbenchPanelDrop('flow', dragSame)
      last.result.current.onWorkbenchPanelDrop('terminal:missing', dragMissingTarget)
    })
    expect(last.result.current.visibleWorkbenchPanelOrder.includes('dock')).toBe(true)
  })
})
