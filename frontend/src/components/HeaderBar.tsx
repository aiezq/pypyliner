interface HeaderBarProps {
  isSocketConnected: boolean
  terminalInstancesCount: number
  onCreateManualTerminal: () => void
  onOpenImportModal: () => void
  onOpenFlowSettingsModal: () => void
}

function HeaderBar({
  isSocketConnected,
  terminalInstancesCount,
  onCreateManualTerminal,
  onOpenImportModal,
  onOpenFlowSettingsModal,
}: HeaderBarProps) {
  return (
    <header className="hero">
      <div>
        <p className="hero__kicker">Operator Helper</p>
        <h1>PYPYLINE CONSOLE</h1>
        <p className="hero__subtitle">
          Локальный UI для автоматизирования workflow Linux-оператора с live-терминалами.
        </p>
      </div>
      <div className="hero__right">
        <div className="hero__badges">
          <span>Local host</span>
          <span>Sequential mode</span>
          <span>No auth</span>
          <span>Terminals {terminalInstancesCount}</span>
          <span className={isSocketConnected ? 'badge--ok' : 'badge--warn'}>
            API {isSocketConnected ? 'connected' : 'reconnecting'}
          </span>
        </div>
        <div className="hero__actions">
          <button
            type="button"
            className="hero__actionButton hero__actionButton--newTerminal"
            onClick={onCreateManualTerminal}
          >
            New terminal
          </button>
          <button
            type="button"
            className="hero__actionButton"
            onClick={onOpenImportModal}
          >
            Import JSON DLC
          </button>
          <button
            type="button"
            className="hero__actionButton hero__actionButton--settings"
            onClick={onOpenFlowSettingsModal}
          >
            Workflow settings
          </button>
        </div>
      </div>
    </header>
  )
}

export default HeaderBar
