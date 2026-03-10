import type { TerminalWindowDescriptor } from '../../hooks/useFloatingTerminalWindowsController'
import { useI18n } from '../../i18n/I18nProvider'

interface TerminalWindowsDockProps {
  windows: TerminalWindowDescriptor[]
  onRestoreWindow: (windowId: string) => void
}

function TerminalWindowsDock({ windows, onRestoreWindow }: TerminalWindowsDockProps) {
  const { messages } = useI18n()
  if (windows.length === 0) {
    return null
  }

  return (
    <aside className="terminalDock" aria-label={messages.terminal.dockLabel}>
      <div className="terminalDock__list">
        {windows.map((windowItem) => {
          const title = windowItem.terminal.title || messages.terminal.manualTerminal
          const badge = windowItem.terminal.isSequence ? 'S' : 'M'
          return (
            <button
              key={windowItem.windowId}
              type="button"
              className="terminalDock__item"
              onClick={() => onRestoreWindow(windowItem.windowId)}
              title={messages.terminal.restore(title)}
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
