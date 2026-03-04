import { act, renderHook } from '@testing-library/react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useFloatingTerminalWindowsController } from '../../src/hooks/useFloatingTerminalWindowsController'
import type { ManualTerminal, TerminalSession } from '../../src/types'

const createRunSession = (): TerminalSession => ({
  id: 'run_1',
  stepId: 'step_1',
  title: 'Run #1',
  command: 'echo ok',
  status: 'running',
  exitCode: null,
  lines: [],
})

const createManualTerminal = (status: ManualTerminal['status'] = 'idle'): ManualTerminal => ({
  id: 'manual_1',
  title: 'Manual #1',
  titleDraft: 'Manual #1',
  promptUser: 'operator',
  promptCwd: '~',
  status,
  exitCode: null,
  draftCommand: '',
  lines: [],
})

describe('useFloatingTerminalWindowsController', () => {
  it('builds windows, supports drag/resize, minimize/restore and title editing', () => {
    const onConsumeRequestedMinimizeWindow = vi.fn()
    const onUpdateManualTitle = vi.fn()
    const onRenameManualTerminal = vi.fn()

    const { result } = renderHook(() =>
      useFloatingTerminalWindowsController({
        runSessions: [createRunSession()],
        manualTerminals: [createManualTerminal()],
        pinnedWindowIds: ['run:run_1'],
        requestedMinimizedWindowIds: ['manual:manual_1'],
        onConsumeRequestedMinimizeWindow,
        onUpdateManualTitle,
        onRenameManualTerminal,
      }),
    )

    expect(result.current.windows).toHaveLength(2)
    expect(result.current.visibleWindows).toEqual([])
    expect(result.current.minimizedWindowsList).toHaveLength(1)

    act(() => {
      result.current.restoreWindow('manual:manual_1')
    })
    expect(onConsumeRequestedMinimizeWindow).toHaveBeenCalledWith('manual:manual_1')

    act(() => {
      result.current.minimizeWindow('manual:manual_1')
    })
    expect(result.current.minimizedWindowsList.map((item) => item.windowId)).toContain(
      'manual:manual_1',
    )

    act(() => {
      result.current.startManualTitleEdit('manual_1', 'Draft title')
      result.current.cancelManualTitleEdit('manual_1', 'Original title')
      result.current.saveManualTitleEdit('manual_1')
    })
    expect(onUpdateManualTitle).toHaveBeenCalledWith('manual_1', 'Draft title')
    expect(onUpdateManualTitle).toHaveBeenCalledWith('manual_1', 'Original title')
    expect(onRenameManualTerminal).toHaveBeenCalledWith('manual_1')
  })

  it('updates frame coordinates on drag and resize operations', () => {
    const { result } = renderHook(() =>
      useFloatingTerminalWindowsController({
        runSessions: [],
        manualTerminals: [createManualTerminal('running')],
        pinnedWindowIds: [],
        requestedMinimizedWindowIds: [],
        onConsumeRequestedMinimizeWindow: vi.fn(),
        onUpdateManualTitle: vi.fn(),
        onRenameManualTerminal: vi.fn(),
      }),
    )

    const item = result.current.windows[0]
    expect(item?.windowId).toBe('manual:manual_1')

    const beforeDrag = result.current.getWindowFrame(item!, 0)
    const dragMouseEvent = {
      clientX: beforeDrag.x + 20,
      clientY: beforeDrag.y + 30,
      preventDefault: vi.fn(),
    } as unknown as ReactMouseEvent<HTMLElement>

    act(() => {
      result.current.beginWindowDrag(item!.windowId, dragMouseEvent)
    })
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: beforeDrag.x + 80,
          clientY: beforeDrag.y + 120,
        }),
      )
      window.dispatchEvent(new MouseEvent('mouseup'))
    })

    const afterDrag = result.current.getWindowFrame(item!, 0)
    expect(afterDrag.x).not.toBe(beforeDrag.x)
    expect(afterDrag.y).not.toBe(beforeDrag.y)

    const resizeEvent = {
      clientX: afterDrag.x + afterDrag.width,
      clientY: afterDrag.y + afterDrag.height,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as ReactMouseEvent<HTMLElement>

    act(() => {
      result.current.beginWindowResize(item!.windowId, 'se', resizeEvent)
    })
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: resizeEvent.clientX + 120,
          clientY: resizeEvent.clientY + 50,
        }),
      )
      window.dispatchEvent(new MouseEvent('mouseup'))
    })

    const afterResize = result.current.getWindowFrame(item!, 0)
    expect(afterResize.width).toBeGreaterThanOrEqual(afterDrag.width)
    expect(afterResize.height).toBeGreaterThanOrEqual(afterDrag.height)

    act(() => {
      result.current.bringToFront(item!.windowId)
    })
    expect(result.current.getWindowZIndex(item!.windowId, 0)).toBeGreaterThan(1)
  })
})
