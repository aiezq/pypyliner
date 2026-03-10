import type { ManualTerminal } from '../types'
import {
  useFloatingTerminalWindowsController,
} from '../hooks/useFloatingTerminalWindowsController'
import FloatingTerminalWindow from './terminal-windows/FloatingTerminalWindow'
import TerminalWindowsDock from './terminal-windows/TerminalWindowsDock'

export interface TerminalWindowsLayerProps {
  manualTerminals: ManualTerminal[]

  requestedMinimizedWindowIds: string[]
  onConsumeRequestedMinimizeWindow: (windowId: string) => void

  onUpdateManualTitle: (terminalId: string, title: string) => void
  onRenameManualTerminal: (terminalId: string) => void
  onStopManualTerminal: (terminalId: string) => void
  onRemoveManualTerminal: (terminalId: string) => void
}

function TerminalWindowsLayer({
  manualTerminals,

  requestedMinimizedWindowIds,
  onConsumeRequestedMinimizeWindow,

  onUpdateManualTitle,
  onRenameManualTerminal,
  onStopManualTerminal,
  onRemoveManualTerminal,
}: TerminalWindowsLayerProps) {
  const {
    windows,
    visibleWindows,
    minimizedWindowsList,
    editingManualTitleId,
    bringToFront,
    beginWindowDrag,
    beginWindowResize,
    minimizeWindow,
    restoreWindow,
    startManualTitleEdit,
    cancelManualTitleEdit,
    saveManualTitleEdit,
    getWindowFrame,
    getWindowZIndex,
  } = useFloatingTerminalWindowsController({
    manualTerminals,

    requestedMinimizedWindowIds,
    onConsumeRequestedMinimizeWindow,
    onUpdateManualTitle,
    onRenameManualTerminal,
  })

  if (windows.length === 0) {
    return null
  }

  return (
    <>
      <div className="terminalWindowsLayer">
        {visibleWindows.map((windowItem, index) => (
          <FloatingTerminalWindow
            key={windowItem.windowId}
            windowItem={windowItem}
            frame={getWindowFrame(windowItem, index)}
            zIndex={getWindowZIndex(windowItem.windowId, index)}
            editingManualTitleId={editingManualTitleId}
            onBringToFront={() => bringToFront(windowItem.windowId)}
            onBeginDrag={(event) => beginWindowDrag(windowItem.windowId, event)}
            onBeginResize={(direction, event) =>
              beginWindowResize(windowItem.windowId, direction, event)
            }

            onMinimize={() => minimizeWindow(windowItem.windowId)}
            onUpdateManualTitle={onUpdateManualTitle}
            onStartManualTitleEdit={startManualTitleEdit}
            onCancelManualTitleEdit={cancelManualTitleEdit}
            onSaveManualTitleEdit={saveManualTitleEdit}
            onStopManualTerminal={onStopManualTerminal}
            onRemoveManualTerminal={onRemoveManualTerminal}
          />
        ))}
      </div>

      <TerminalWindowsDock windows={minimizedWindowsList} onRestoreWindow={restoreWindow} />
    </>
  )
}

export default TerminalWindowsLayer
