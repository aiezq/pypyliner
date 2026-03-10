
import { useI18n } from '../i18n/I18nProvider'

interface HeaderBarProps {
  isSocketConnected: boolean
  terminalInstancesCount: number
  onCreateManualTerminal: () => void
}

function HeaderBar({
  isSocketConnected,
  terminalInstancesCount,
  onCreateManualTerminal,
}: HeaderBarProps) {
  const { language, setLanguage, messages } = useI18n()

  return (
    <header className="hero">
      <div>
        <p className="hero__kicker">{messages.header.kicker}</p>
        <h1>{messages.header.title}</h1>
        <p className="hero__subtitle">{messages.header.subtitle}</p>
      </div>
      <div className="hero__right">
        <div className="hero__badges">
          <span>{messages.header.localHost}</span>
          <span>{messages.header.sequentialMode}</span>
          <span>{messages.header.noAuth}</span>
          <span>{messages.header.terminals(terminalInstancesCount)}</span>
          <span className={isSocketConnected ? 'badge--ok' : 'badge--warn'}>
            {isSocketConnected ? messages.header.apiConnected : messages.header.apiReconnecting}
          </span>
        </div>
        <div className="hero__actions">
          <div className="hero__languageSwitch" role="group" aria-label={messages.language.switcherLabel}>
            <button
              type="button"
              className={`hero__languageButton${language === 'ru' ? ' hero__languageButton--active' : ''}`}
              onClick={() => setLanguage('ru')}
            >
              {messages.language.ru}
            </button>
            <button
              type="button"
              className={`hero__languageButton${language === 'en' ? ' hero__languageButton--active' : ''}`}
              onClick={() => setLanguage('en')}
            >
              {messages.language.en}
            </button>
          </div>
          <button
            type="button"
            className="hero__actionButton hero__actionButton--newTerminal"
            onClick={onCreateManualTerminal}
          >
            {messages.header.newTerminal}
          </button>
        </div>
      </div>
    </header>
  )
}

export default HeaderBar
