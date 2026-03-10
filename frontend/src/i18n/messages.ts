export type Language = 'ru' | 'en'

export interface Messages {
  app: {
    mainViews: string
    graphEditor: string
    history: string
    openLocalAi: string
    loadingHistory: string
    localAiPanelLabel: string
    loadingLocalAi: string
  }
  language: {
    switcherLabel: string
    ru: string
    en: string
  }
  header: {
    kicker: string
    title: string
    subtitle: string
    localHost: string
    sequentialMode: string
    noAuth: string
    terminals: (count: number) => string
    apiConnected: string
    apiReconnecting: string
    newTerminal: string
  }
  history: {
    title: string
    searchPlaceholder: string
    filterAll: string
    filterSingle: string
    filterSequence: string
    loading: string
    noResults: string
    commandsCount: (count: number) => string
    sequenceRun: string
    singleRun: string
    emptySelection: string
    created: string
    closed: string
    logFile: string
    noCommands: string
  }
  terminal: {
    terminalNamePlaceholder: string
    saveTerminalName: (title: string) => string
    editTerminalName: (title: string) => string
    exitCode: string
    typeCommandPlaceholder: string
    clearOutput: string
    sendCommand: string
    last: string
    lines: string
    numberOfLinesToCopy: string
    copyLastLines: string
    copied: string
    copyTail: string
    dockLabel: string
    manualTerminal: string
    restore: (title: string) => string
    sshTerminal: string
    minimize: string
    stopTerminal: string
    closeTerminal: string
    statusRunning: string
    statusIdle: string
    statusSuccess: string
    statusFailed: string
    statusStopped: string
  }
  localAi: {
    kicker: string
    title: string
    subtitle: string
    close: string
    loadFailed: string
    actionFailed: string
    analysisFailed: string
    draftFailed: string
    refreshInstallStatusFailed: string
    runtimeMissing: string
    loadingModels: string
    selected: string
    select: string
    size: string
    ram: string
    state: string
    license: string
    downloadedOf: (completed: string, total: string) => string
    downloaded: (completed: string) => string
    remaining: string
    unknown: string
    install: string
    installing: string
    cancel: string
    load: string
    unload: string
    remove: string
    generateFromDocs: string
    generateDraftWith: (name: string) => string
    modalHint: string
    documentation: string
    documentationPlaceholder: string
    analyzeDocs: string
    analyzing: string
    reset: string
    clarifications: string
    answerChoicesFirst: string
    clarificationsDescription: string
    noClarificationQuestions: string
    typeOperatorAnswer: string
    generateFinalDraft: string
    generating: string
    preview: string
    confidence: (value: number | string) => string
    blockingWarning: (flags: string) => string
    variables: string
    noVariables: string
    required: string
    optional: string
    steps: string
    warnings: string
    noWarnings: string
    assumptions: string
    noAssumptions: string
    importToGraph: string
    refresh: string
    runtimeAvailable: (name: string) => string
    runtimeNotInstalled: (name: string) => string
    progressInstalling: string
  }
  globalVariables: {
    title: string
    variables: string
    noVariables: string
    deleteVariable: string
    keyPlaceholder: string
    valuePlaceholder: string
    addVariable: string
    sshVariables: string
    noSshVariables: string
    deleteSshVariable: string
    accountNamePlaceholder: string
    hostPlaceholder: string
    passwordPlaceholder: string
    hidePassword: string
    showPassword: string
    addSshVariable: string
  }
  graph: {
    emptyHint: string
    emptyHintAction: string
    addNode: string
    command: string
    variable: string
    terminal: string
    sshTerminal: string
    sequence: string
    presetCollections: string
    saveAsPreset: string
    switchToSshTerminal: string
    switchToDefaultTerminal: string
    deleteNode: string
    deleteConnection: string
    nodesSelected: (count: number) => string
    saveGroupPreset: string
    saveIndividualPresets: string
    deleteSelected: string
    save: string
    saveGroup: string
    saveAll: string
    cancel: string
    presetNameOptional: string
    collectionOptional: string
    groupOfNodes: (count: number) => string
    groupPresetsPlaceholder: string
    commandsPlaceholder: string
    nodeTitle: (label: string) => string
    removePreset: string
  }
  nodes: {
    editNodeTitle: (label: string) => string
    nodeTitleEditor: string
    command: string
    commandEditor: string
    clickToEnterCommand: string
    variables: string
    newCommand: string
    value: string
    enterValue: string
    terminalClosed: string
    notConnectedToBackend: string
    terminalId: (id: string) => string
    executionFailed: string
    runChain: string
    running: string
    sshVariable: string
    manualCredentials: string
    sshTargetNotConfigured: string
    sshClosed: string
    sshConnected: (summary: string) => string
    username: string
    usernamePlaceholder: string
    host: string
    hostPlaceholder: string
    password: string
    hideSshPassword: string
    showSshPassword: string
    noSavedSshVariables: string
    connecting: string
    runViaSsh: string
    executionOrder: string
    connectTerminal: string
    runningSequence: string
    runSequence: string
  }
}

export const messages: Record<Language, Messages> = {
  en: {
    app: {
      mainViews: 'Main views',
      graphEditor: 'Graph Editor',
      history: 'History',
      openLocalAi: 'Open Local AI',
      loadingHistory: 'Loading history...',
      localAiPanelLabel: 'Local AI panel',
      loadingLocalAi: 'Loading Local AI...',
    },
    language: {
      switcherLabel: 'Language switcher',
      ru: 'RU',
      en: 'EN',
    },
    header: {
      kicker: 'Operator Helper',
      title: 'PYPYLINE CONSOLE',
      subtitle: 'Local UI for Linux operator workflows with live terminals.',
      localHost: 'Local host',
      sequentialMode: 'Sequential mode',
      noAuth: 'No auth',
      terminals: (count) => `Terminals ${count}`,
      apiConnected: 'API connected',
      apiReconnecting: 'API reconnecting',
      newTerminal: 'New terminal',
    },
    history: {
      title: 'Terminal History',
      searchPlaceholder: 'Search terminals...',
      filterAll: 'All',
      filterSingle: 'Singles',
      filterSequence: 'Sequences',
      loading: 'Loading...',
      noResults: 'No results.',
      commandsCount: (count) => `${count} cmds`,
      sequenceRun: 'Sequence node run',
      singleRun: 'Single terminal run',
      emptySelection: 'Select a terminal history session from the left to view details.',
      created: 'Created',
      closed: 'Closed',
      logFile: 'Log File',
      noCommands: 'No commands recorded.',
    },
    terminal: {
      terminalNamePlaceholder: 'Terminal name',
      saveTerminalName: (title) => `Save terminal name: ${title}`,
      editTerminalName: (title) => `Edit terminal name: ${title}`,
      exitCode: 'exit',
      typeCommandPlaceholder: 'Type command, e.g. ls -la /opt/app',
      clearOutput: 'Clear output',
      sendCommand: 'Send command',
      last: 'Last',
      lines: 'lines',
      numberOfLinesToCopy: 'Number of lines to copy',
      copyLastLines: 'Copy last lines to clipboard',
      copied: 'Copied',
      copyTail: 'Copy tail',
      dockLabel: 'Minimized terminals dock',
      manualTerminal: 'Manual terminal',
      restore: (title) => `Restore: ${title}`,
      sshTerminal: 'SSH terminal',
      minimize: 'Minimize',
      stopTerminal: 'Stop terminal',
      closeTerminal: 'Close terminal',
      statusRunning: 'running',
      statusIdle: 'idle',
      statusSuccess: 'success',
      statusFailed: 'failed',
      statusStopped: 'stopped',
    },
    localAi: {
      kicker: 'Local AI',
      title: 'Local pipeline draft generator',
      subtitle: 'Install a local model, paste operator documentation, answer clarification questions, review the draft, then import it into the graph.',
      close: 'Close',
      loadFailed: 'Failed to load Local AI models.',
      actionFailed: 'Local AI action failed.',
      analysisFailed: 'Documentation analysis failed.',
      draftFailed: 'Draft generation failed.',
      refreshInstallStatusFailed: 'Failed to refresh install status.',
      runtimeMissing: 'Runtime is missing. Install will first attempt to install Ollama, then pull the selected model.',
      loadingModels: 'Loading Local AI models...',
      selected: 'Selected',
      select: 'Select',
      size: 'Size',
      ram: 'RAM',
      state: 'State',
      license: 'License',
      downloadedOf: (completed, total) => `Downloaded ${completed} of ${total}`,
      downloaded: (completed) => `Downloaded ${completed}`,
      remaining: 'Remaining',
      unknown: 'Unknown',
      install: 'Install',
      installing: 'Installing...',
      cancel: 'Cancel',
      load: 'Load',
      unload: 'Unload',
      remove: 'Remove',
      generateFromDocs: 'Generate from docs',
      generateDraftWith: (name) => `Generate draft with ${name}`,
      modalHint: 'The model first extracts clarification questions, then generates the final draft from your answers.',
      documentation: 'Documentation',
      documentationPlaceholder: 'Paste operator documentation here.',
      analyzeDocs: 'Analyze docs',
      analyzing: 'Analyzing...',
      reset: 'Reset',
      clarifications: 'Clarifications',
      answerChoicesFirst: 'Answer missing operator choices first',
      clarificationsDescription: 'The model extracted decision points like region, mode, item set, app IP, or operator login before building commands.',
      noClarificationQuestions: 'No clarification questions were required for this documentation.',
      typeOperatorAnswer: 'Type operator answer',
      generateFinalDraft: 'Generate final draft',
      generating: 'Generating...',
      preview: 'Preview',
      confidence: (value) => `Confidence ${value}%`,
      blockingWarning: (flags) => `Blocking warning: risk flags detected (${flags}). Import is disabled until the draft is edited or regenerated.`,
      variables: 'Variables',
      noVariables: 'No variables.',
      required: 'required',
      optional: 'optional',
      steps: 'Steps',
      warnings: 'Warnings',
      noWarnings: 'No warnings.',
      assumptions: 'Assumptions',
      noAssumptions: 'No assumptions.',
      importToGraph: 'Import to graph',
      refresh: 'Refresh',
      runtimeAvailable: (name) => `${name} available`,
      runtimeNotInstalled: (name) => `${name} not installed`,
      progressInstalling: 'Installing model...',
    },
    globalVariables: {
      title: 'Global Variables',
      variables: 'Variables',
      noVariables: 'No global variables set',
      deleteVariable: 'Delete variable',
      keyPlaceholder: 'Key (e.g. login)',
      valuePlaceholder: 'Value',
      addVariable: 'Add Variable',
      sshVariables: 'SSH Variables',
      noSshVariables: 'No SSH variables saved',
      deleteSshVariable: 'Delete SSH variable',
      accountNamePlaceholder: 'Account name',
      hostPlaceholder: 'IP / host',
      passwordPlaceholder: 'Password',
      hidePassword: 'Hide password',
      showPassword: 'Show password',
      addSshVariable: 'Add SSH Variable',
    },
    graph: {
      emptyHint: 'Right-click to add nodes',
      emptyHintAction: 'Add Command / Variable / Terminal / SSH Terminal',
      addNode: 'Add Node',
      command: 'Command',
      variable: 'Variable',
      terminal: 'Terminal',
      sshTerminal: 'SSH Terminal',
      sequence: 'Sequence',
      presetCollections: 'Preset Collections',
      saveAsPreset: 'Save as Preset',
      switchToSshTerminal: 'Switch to SSH Terminal',
      switchToDefaultTerminal: 'Switch to Default Terminal',
      deleteNode: 'Delete Node',
      deleteConnection: 'Delete Connection',
      nodesSelected: (count) => `${count} Nodes Selected`,
      saveGroupPreset: 'Save Selection as Group Preset',
      saveIndividualPresets: 'Save Selection as Individual Presets',
      deleteSelected: 'Delete Selected',
      save: 'Save',
      saveGroup: 'Save Group',
      saveAll: 'Save All',
      cancel: 'Cancel',
      presetNameOptional: 'Preset Name (optional)',
      collectionOptional: 'Collection (optional)',
      groupOfNodes: (count) => `Group of ${count} nodes`,
      groupPresetsPlaceholder: 'e.g. My Group Presets',
      commandsPlaceholder: 'e.g. My Commands',
      nodeTitle: (label) => `Node: ${label}`,
      removePreset: 'Remove preset',
    },
    nodes: {
      editNodeTitle: (label) => `Edit node title: ${label}`,
      nodeTitleEditor: 'Node title editor',
      command: 'Command',
      commandEditor: 'Command editor',
      clickToEnterCommand: 'Click to enter command',
      variables: 'Variables',
      newCommand: 'New Command',
      value: 'Value',
      enterValue: 'Enter value...',
      terminalClosed: 'Terminal Closed',
      notConnectedToBackend: 'Not connected to backend',
      terminalId: (id) => `Terminal: ${id}`,
      executionFailed: 'Execution failed',
      runChain: 'Run Chain',
      running: 'Running...',
      sshVariable: 'SSH Variable',
      manualCredentials: 'Manual credentials',
      sshTargetNotConfigured: 'SSH target not configured',
      sshClosed: 'SSH Terminal Closed',
      sshConnected: (summary) => `SSH: ${summary}`,
      username: 'Username',
      usernamePlaceholder: 'operator',
      host: 'Host',
      hostPlaceholder: '10.0.0.12',
      password: 'Password',
      hideSshPassword: 'Hide SSH password',
      showSshPassword: 'Show SSH password',
      noSavedSshVariables: 'No saved SSH variables yet. Fill credentials here or add one in Global Variables.',
      connecting: 'Connecting...',
      runViaSsh: 'Run via SSH',
      executionOrder: 'Execution Order',
      connectTerminal: 'connect terminal',
      runningSequence: 'Running Sequence...',
      runSequence: 'Run Sequence',
    },
  },
  ru: {
    app: {
      mainViews: 'Основные разделы',
      graphEditor: 'Граф',
      history: 'История',
      openLocalAi: 'Открыть Local AI',
      loadingHistory: 'Загрузка истории...',
      localAiPanelLabel: 'Панель Local AI',
      loadingLocalAi: 'Загрузка Local AI...',
    },
    language: {
      switcherLabel: 'Переключение языка',
      ru: 'RU',
      en: 'EN',
    },
    header: {
      kicker: 'Operator Helper',
      title: 'PYPYLINE CONSOLE',
      subtitle: 'Локальный интерфейс для операторских Linux workflow с live-терминалами.',
      localHost: 'Локальный хост',
      sequentialMode: 'Последовательный режим',
      noAuth: 'Без авторизации',
      terminals: (count) => `Терминалы ${count}`,
      apiConnected: 'API подключен',
      apiReconnecting: 'API переподключается',
      newTerminal: 'Новый терминал',
    },
    history: {
      title: 'История терминалов',
      searchPlaceholder: 'Поиск терминалов...',
      filterAll: 'Все',
      filterSingle: 'Одиночные',
      filterSequence: 'Последовательности',
      loading: 'Загрузка...',
      noResults: 'Ничего не найдено.',
      commandsCount: (count) => `${count} ком.`,
      sequenceRun: 'Запуск узла sequence',
      singleRun: 'Запуск одиночного терминала',
      emptySelection: 'Выберите сессию истории слева, чтобы посмотреть детали.',
      created: 'Создан',
      closed: 'Закрыт',
      logFile: 'Лог-файл',
      noCommands: 'Команды не записаны.',
    },
    terminal: {
      terminalNamePlaceholder: 'Имя терминала',
      saveTerminalName: (title) => `Сохранить имя терминала: ${title}`,
      editTerminalName: (title) => `Изменить имя терминала: ${title}`,
      exitCode: 'выход',
      typeCommandPlaceholder: 'Введите команду, например ls -la /opt/app',
      clearOutput: 'Очистить вывод',
      sendCommand: 'Отправить команду',
      last: 'Последние',
      lines: 'строк',
      numberOfLinesToCopy: 'Количество строк для копирования',
      copyLastLines: 'Скопировать последние строки в буфер',
      copied: 'Скопировано',
      copyTail: 'Скопировать tail',
      dockLabel: 'Док свернутых терминалов',
      manualTerminal: 'Ручной терминал',
      restore: (title) => `Восстановить: ${title}`,
      sshTerminal: 'SSH терминал',
      minimize: 'Свернуть',
      stopTerminal: 'Остановить терминал',
      closeTerminal: 'Закрыть терминал',
      statusRunning: 'running',
      statusIdle: 'idle',
      statusSuccess: 'success',
      statusFailed: 'failed',
      statusStopped: 'stopped',
    },
    localAi: {
      kicker: 'Local AI',
      title: 'Локальный генератор draft-пайплайнов',
      subtitle: 'Установите локальную модель, вставьте операторскую документацию, ответьте на уточняющие вопросы, проверьте draft и импортируйте его в граф.',
      close: 'Закрыть',
      loadFailed: 'Не удалось загрузить модели Local AI.',
      actionFailed: 'Ошибка действия Local AI.',
      analysisFailed: 'Не удалось проанализировать документацию.',
      draftFailed: 'Не удалось сгенерировать draft.',
      refreshInstallStatusFailed: 'Не удалось обновить статус установки.',
      runtimeMissing: 'Рантайм не найден. Install сначала попытается установить Ollama, затем загрузить выбранную модель.',
      loadingModels: 'Загрузка моделей Local AI...',
      selected: 'Выбрано',
      select: 'Выбрать',
      size: 'Размер',
      ram: 'RAM',
      state: 'Состояние',
      license: 'Лицензия',
      downloadedOf: (completed, total) => `Загружено ${completed} из ${total}`,
      downloaded: (completed) => `Загружено ${completed}`,
      remaining: 'Осталось',
      unknown: 'Неизвестно',
      install: 'Установить',
      installing: 'Установка...',
      cancel: 'Отмена',
      load: 'Загрузить',
      unload: 'Выгрузить',
      remove: 'Удалить',
      generateFromDocs: 'Сгенерировать из документации',
      generateDraftWith: (name) => `Сгенерировать draft с ${name}`,
      modalHint: 'Сначала модель извлекает уточняющие вопросы, затем строит итоговый draft по вашим ответам.',
      documentation: 'Документация',
      documentationPlaceholder: 'Вставьте сюда операторскую документацию.',
      analyzeDocs: 'Анализировать документацию',
      analyzing: 'Анализ...',
      reset: 'Сбросить',
      clarifications: 'Уточнения',
      answerChoicesFirst: 'Сначала ответьте на недостающие операторские выборы',
      clarificationsDescription: 'Модель извлекла точки принятия решений: регион, режим, набор объектов, IP приложения или операторский логин перед построением команд.',
      noClarificationQuestions: 'Для этой документации не потребовались уточняющие вопросы.',
      typeOperatorAnswer: 'Введите ответ оператора',
      generateFinalDraft: 'Сгенерировать итоговый draft',
      generating: 'Генерация...',
      preview: 'Предпросмотр',
      confidence: (value) => `Уверенность ${value}%`,
      blockingWarning: (flags) => `Блокирующее предупреждение: найдены риск-флаги (${flags}). Импорт отключен, пока draft не будет отредактирован или пересоздан.`,
      variables: 'Переменные',
      noVariables: 'Нет переменных.',
      required: 'обязательно',
      optional: 'необязательно',
      steps: 'Шаги',
      warnings: 'Предупреждения',
      noWarnings: 'Предупреждений нет.',
      assumptions: 'Допущения',
      noAssumptions: 'Допущений нет.',
      importToGraph: 'Импортировать в граф',
      refresh: 'Обновить',
      runtimeAvailable: (name) => `${name} доступен`,
      runtimeNotInstalled: (name) => `${name} не установлен`,
      progressInstalling: 'Установка модели...',
    },
    globalVariables: {
      title: 'Глобальные переменные',
      variables: 'Переменные',
      noVariables: 'Глобальные переменные не заданы',
      deleteVariable: 'Удалить переменную',
      keyPlaceholder: 'Ключ (например, login)',
      valuePlaceholder: 'Значение',
      addVariable: 'Добавить переменную',
      sshVariables: 'SSH переменные',
      noSshVariables: 'Сохраненных SSH переменных нет',
      deleteSshVariable: 'Удалить SSH переменную',
      accountNamePlaceholder: 'Имя учетной записи',
      hostPlaceholder: 'IP / хост',
      passwordPlaceholder: 'Пароль',
      hidePassword: 'Скрыть пароль',
      showPassword: 'Показать пароль',
      addSshVariable: 'Добавить SSH переменную',
    },
    graph: {
      emptyHint: 'Нажмите правой кнопкой, чтобы добавить узлы',
      emptyHintAction: 'Добавить Command / Variable / Terminal / SSH Terminal',
      addNode: 'Добавить узел',
      command: 'Command',
      variable: 'Variable',
      terminal: 'Terminal',
      sshTerminal: 'SSH Terminal',
      sequence: 'Sequence',
      presetCollections: 'Коллекции пресетов',
      saveAsPreset: 'Сохранить как пресет',
      switchToSshTerminal: 'Переключить на SSH Terminal',
      switchToDefaultTerminal: 'Переключить на обычный Terminal',
      deleteNode: 'Удалить узел',
      deleteConnection: 'Удалить связь',
      nodesSelected: (count) => `Выбрано узлов: ${count}`,
      saveGroupPreset: 'Сохранить выделение как групповой пресет',
      saveIndividualPresets: 'Сохранить выделение как отдельные пресеты',
      deleteSelected: 'Удалить выделенное',
      save: 'Сохранить',
      saveGroup: 'Сохранить группу',
      saveAll: 'Сохранить все',
      cancel: 'Отмена',
      presetNameOptional: 'Имя пресета (необязательно)',
      collectionOptional: 'Коллекция (необязательно)',
      groupOfNodes: (count) => `Группа из ${count} узлов`,
      groupPresetsPlaceholder: 'например, Мои групповые пресеты',
      commandsPlaceholder: 'например, Мои команды',
      nodeTitle: (label) => `Узел: ${label}`,
      removePreset: 'Удалить пресет',
    },
    nodes: {
      editNodeTitle: (label) => `Изменить название узла: ${label}`,
      nodeTitleEditor: 'Редактор названия узла',
      command: 'Команда',
      commandEditor: 'Редактор команды',
      clickToEnterCommand: 'Нажмите, чтобы ввести команду',
      variables: 'Переменные',
      newCommand: 'Новая команда',
      value: 'Значение',
      enterValue: 'Введите значение...',
      terminalClosed: 'Терминал закрыт',
      notConnectedToBackend: 'Нет подключения к backend',
      terminalId: (id) => `Терминал: ${id}`,
      executionFailed: 'Ошибка выполнения',
      runChain: 'Запустить цепочку',
      running: 'Выполнение...',
      sshVariable: 'SSH переменная',
      manualCredentials: 'Ручные credentials',
      sshTargetNotConfigured: 'SSH цель не настроена',
      sshClosed: 'SSH терминал закрыт',
      sshConnected: (summary) => `SSH: ${summary}`,
      username: 'Пользователь',
      usernamePlaceholder: 'operator',
      host: 'Хост',
      hostPlaceholder: '10.0.0.12',
      password: 'Пароль',
      hideSshPassword: 'Скрыть SSH пароль',
      showSshPassword: 'Показать SSH пароль',
      noSavedSshVariables: 'Сохраненных SSH переменных пока нет. Заполните credentials здесь или добавьте их в Global Variables.',
      connecting: 'Подключение...',
      runViaSsh: 'Запустить через SSH',
      executionOrder: 'Порядок выполнения',
      connectTerminal: 'подключите терминал',
      runningSequence: 'Запуск последовательности...',
      runSequence: 'Запустить последовательность',
    },
  },
}
