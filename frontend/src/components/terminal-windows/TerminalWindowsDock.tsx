import type { TerminalWindowDescriptor } from '../../hooks/useFloatingTerminalWindowsController'

interface TerminalWindowsDockProps {
  windows: TerminalWindowDescriptor[]
  onRestoreWindow: (windowId: string) => void
}

function TerminalWindowsDock({ windows, onRestoreWindow }: TerminalWindowsDockProps) {
  if (windows.length === 0) {
    return null
  }

  return (
    <aside className="terminalDock" aria-label="Minimized terminals dock">
      <div className="terminalDock__list">
        {windows.map((windowItem) => {
          const title =
            windowItem.kind === 'manual'
              ? windowItem.terminal.title || 'Manual terminal'
              : windowItem.session.title || 'Pipeline terminal'
          const badge = windowItem.kind === 'manual' ? 'M' : 'P'
          return (
            <button
              key={windowItem.windowId}
              type="button"
              className="terminalDock__item"
              onClick={() => onRestoreWindow(windowItem.windowId)}
              title={`Restore: ${title}`}
            >
              <span className="terminalDock__icon">{badge}</span>
              <span className="terminalDock__label">{title}</span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

export default TerminalWindowsDock
