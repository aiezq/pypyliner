import { describe, expect, it, vi } from 'vitest'
import { usePinnedTerminalLayoutController } from '../../src/hooks/usePinnedTerminalLayoutController'

describe('usePinnedTerminalLayoutController', () => {
  const createController = (overrides: Record<string, unknown> = {}) => {
    const setPinnedTerminalWindowIds = vi.fn((updater) => updater(['manual:1']))
    const removePanelFromLayout = vi.fn()
    const ensurePanelInLayout = vi.fn()
    const requestMinimizeTerminalWindow = vi.fn()

    const controller = usePinnedTerminalLayoutController({
      terminalWindowMap: new Map([
        [
          'run:1',
          {
            windowId: 'run:1',
            kind: 'run',
            runSession: {
              id: 'run_1',
              stepId: 'step_1',
              title: 'Pipeline Run #1',
              command: 'echo ok',
              status: 'success',
              exitCode: 0,
              lines: [],
            },
          },
        ],
        [
          'manual:1',
          {
            windowId: 'manual:1',
            kind: 'manual',
            manualTerminal: {
              id: 'manual_1',
              title: 'Manual #1',
              titleDraft: 'Manual #1',
              promptUser: 'operator',
              promptCwd: '~',
              status: 'idle',
              exitCode: null,
              draftCommand: '',
              lines: [],
            },
          },
        ],
      ]),
      availableTerminalWindowIds: new Set(['run:1', 'manual:1']),
      effectivePinnedTerminalWindowIds: ['manual:1'],
      setPinnedTerminalWindowIds,
      removePanelFromLayout,
      ensurePanelInLayout,
      requestMinimizeTerminalWindow,
      ...overrides,
    })

    return {
      controller,
      setPinnedTerminalWindowIds,
      removePanelFromLayout,
      ensurePanelInLayout,
      requestMinimizeTerminalWindow,
    }
  }

  it('returns titles and width defaults for flow/dock/terminal panels', () => {
    const { controller } = createController()

    expect(controller.getWorkbenchPanelTitle('flow')).toBe('Pipeline Flow')
    expect(controller.getWorkbenchPanelTitle('dock')).toBe('Pipeline Dock')
    expect(controller.getWorkbenchPanelTitle('terminal:manual:1')).toBe('Manual #1')
    expect(controller.getWorkbenchPanelTitle('terminal:run:1')).toBe('Pipeline Run #1')
    expect(controller.getWorkbenchPanelTitle('terminal:missing')).toBe('Terminal')
    expect(controller.getWorkbenchPanelTitle('unknown')).toBe('Window')

    expect(controller.getWorkbenchPanelDefaultWidth('flow')).toBe(860)
    expect(controller.getWorkbenchPanelDefaultWidth('dock')).toBe(460)
    expect(controller.getWorkbenchPanelDefaultWidth('terminal:manual:1')).toBe(940)
    expect(controller.getWorkbenchPanelDefaultWidth('terminal:run:1')).toBe(640)
    expect(controller.getWorkbenchPanelDefaultWidth('terminal:missing')).toBe(640)
    expect(controller.getWorkbenchPanelDefaultWidth('unknown')).toBe(320)
  })

  it('toggles pin state and can minimize pinned terminals', () => {
    const {
      controller,
      setPinnedTerminalWindowIds,
      removePanelFromLayout,
      ensurePanelInLayout,
      requestMinimizeTerminalWindow,
    } = createController()

    controller.togglePinTerminalWindow('run:1')
    expect(setPinnedTerminalWindowIds).toHaveBeenCalled()
    expect(ensurePanelInLayout).toHaveBeenCalledWith('terminal:run:1', 640)

    controller.togglePinTerminalWindow('manual:1')
    expect(removePanelFromLayout).toHaveBeenCalledWith('terminal:manual:1')

    controller.minimizePinnedTerminalWindow('run:1')
    expect(requestMinimizeTerminalWindow).toHaveBeenCalledWith('run:1')
  })

  it('ignores unknown terminal ids for pin/minimize operations', () => {
    const { controller, setPinnedTerminalWindowIds, requestMinimizeTerminalWindow } =
      createController({
        availableTerminalWindowIds: new Set(['manual:1']),
      })

    controller.togglePinTerminalWindow('missing')
    controller.minimizePinnedTerminalWindow('missing')

    expect(setPinnedTerminalWindowIds).not.toHaveBeenCalled()
    expect(requestMinimizeTerminalWindow).not.toHaveBeenCalled()
  })
})
