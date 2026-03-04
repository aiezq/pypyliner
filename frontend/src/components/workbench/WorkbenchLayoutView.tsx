import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from 'react'
import WorkbenchPanelContent, {
  type WorkbenchPanelBodyProps,
} from './WorkbenchPanelContent'
import {
  MIN_WORKBENCH_PANEL_WIDTH,
  WORKBENCH_PANEL_DOCK,
  WORKBENCH_PANEL_FLOW,
  type WorkbenchPanelKey,
} from '../../hooks/useWorkbenchLayout'


interface WorkbenchLayoutViewProps {
  visibleWorkbenchPanelOrder: WorkbenchPanelKey[]
  draggingWorkbenchPanel: WorkbenchPanelKey | null
  dragOverWorkbenchPanel: WorkbenchPanelKey | null
  workbenchPanelCollapsed: Record<string, boolean>
  workbenchPanelWidths: Record<string, number>
  workbenchPanelFullWidth: Record<string, boolean>
  getWorkbenchPanelTitle: (panel: WorkbenchPanelKey) => string
  getWorkbenchPanelDefaultWidth: (panel: WorkbenchPanelKey) => number
  startWorkbenchPanelDrag: (
    panel: WorkbenchPanelKey,
    event: ReactDragEvent<HTMLElement>,
  ) => void
  onWorkbenchPanelDragOver: (
    panel: WorkbenchPanelKey,
    event: ReactDragEvent<HTMLElement>,
  ) => void
  onWorkbenchPanelDrop: (
    panel: WorkbenchPanelKey,
    event: ReactDragEvent<HTMLElement>,
  ) => void
  finishWorkbenchPanelDrag: () => void
  toggleWorkbenchPanelCollapse: (panel: WorkbenchPanelKey) => void
  toggleWorkbenchPanelFullWidth: (
    panel: WorkbenchPanelKey,
    currentWidth: number,
  ) => void
  startWorkbenchPanelResize: (
    panel: WorkbenchPanelKey,
    event: ReactMouseEvent<HTMLElement>,
    currentWidth: number,
  ) => void
  panelContentProps: WorkbenchPanelBodyProps
}

function WorkbenchLayoutView({
  visibleWorkbenchPanelOrder,
  draggingWorkbenchPanel,
  dragOverWorkbenchPanel,
  workbenchPanelCollapsed,
  workbenchPanelWidths,
  workbenchPanelFullWidth,
  getWorkbenchPanelTitle,
  getWorkbenchPanelDefaultWidth,
  startWorkbenchPanelDrag,
  onWorkbenchPanelDragOver,
  onWorkbenchPanelDrop,
  finishWorkbenchPanelDrag,
  toggleWorkbenchPanelCollapse,
  toggleWorkbenchPanelFullWidth,
  startWorkbenchPanelResize,
  panelContentProps,
}: WorkbenchLayoutViewProps) {
  return (
    <main className="layout layout--workbench">
      {visibleWorkbenchPanelOrder.map((panel) => {
        const panelTypeClass =
          panel === WORKBENCH_PANEL_FLOW
            ? 'workbenchSlot--flow'
            : panel === WORKBENCH_PANEL_DOCK
              ? 'workbenchSlot--dock'
              : 'workbenchSlot--terminal'
        const isCollapsed = workbenchPanelCollapsed[panel] === true
        const panelTitle = getWorkbenchPanelTitle(panel)
        const panelWidth = Math.max(
          MIN_WORKBENCH_PANEL_WIDTH,
          workbenchPanelWidths[panel] ?? getWorkbenchPanelDefaultWidth(panel),
        )
        const isFullWidth = workbenchPanelFullWidth[panel] === true

        return (
          <section
            key={panel}
            className={`workbenchSlot ${panelTypeClass} ${
              dragOverWorkbenchPanel === panel ? 'workbenchSlot--dragover' : ''
            } ${draggingWorkbenchPanel === panel ? 'workbenchSlot--dragging' : ''} ${
              isFullWidth ? 'workbenchSlot--fullWidth' : ''
            }`}
            onDragOver={(event) => onWorkbenchPanelDragOver(panel, event)}
            onDrop={(event) => onWorkbenchPanelDrop(panel, event)}
            style={{
              flex: isFullWidth ? '1 1 100%' : `0 1 ${panelWidth}px`,
            }}
          >
            <div className="workbenchSlotToolbar">
              <span
                className="workbenchSlotHandle"
                draggable
                onDragStart={(event) => startWorkbenchPanelDrag(panel, event)}
                onDragEnd={finishWorkbenchPanelDrag}
                title="Drag panel to reorder layout"
              >
                Move panel
              </span>
              <button
                type="button"
                className="workbenchSlotToggle"
                onClick={() => toggleWorkbenchPanelCollapse(panel)}
                title={isCollapsed ? `Expand ${panelTitle}` : `Collapse ${panelTitle}`}
              >
                {isCollapsed ? 'Expand' : 'Collapse'}
              </button>
              <button
                type="button"
                className="workbenchSlotToggle"
                onClick={() => toggleWorkbenchPanelFullWidth(panel, panelWidth)}
                title={
                  isFullWidth
                    ? `Restore width: ${panelTitle}`
                    : `Full width: ${panelTitle}`
                }
              >
                {isFullWidth ? 'Restore width' : 'Full width'}
              </button>
            </div>

            {isCollapsed ? (
              <section className="panel panelCollapsed">
                <div className="panelCollapsed__body">
                  <h2>{panelTitle}</h2>
                  <span>Collapsed</span>
                </div>
              </section>
            ) : (
              <WorkbenchPanelContent panel={panel} {...panelContentProps} />
            )}

            {!isFullWidth ? (
              <span
                className="workbenchSlotResizeHandle"
                onMouseDown={(event) => startWorkbenchPanelResize(panel, event, panelWidth)}
                title="Drag to resize panel width"
              />
            ) : null}
          </section>
        )
      })}
    </main>
  )
}

export default WorkbenchLayoutView
