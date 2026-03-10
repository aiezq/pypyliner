import { useEffect, useState } from 'react'
import { useGraphStore } from '../../graph'
import type {
  AIModel,
  AnalyzeDocumentationResponse,
  DocumentationClarificationQuestion,
  GeneratePipelineDraftResponse,
} from '../../lib/schemas'
import {
  analyzeDocumentation,
  cancelAiModelInstall,
  fetchAiModelStatus,
  fetchAiModels,
  generatePipelineDraft,
  installAiModel,
  loadAiModel,
  removeAiModel,
  unloadAiModel,
} from './api'
import { detectDraftRiskFlags } from './riskFlags'
import styles from './LocalAiPanel.module.scss'
import { useI18n } from '../../i18n/I18nProvider'

interface LocalAiPanelProps {
  onImportComplete: () => void
  onClose?: () => void
}

function formatBytesToGb(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return 'Unknown'
  }
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${bytes} B`
}

function mergeModel(models: AIModel[], nextModel: AIModel): AIModel[] {
  return models.map((model) => (model.model_id === nextModel.model_id ? nextModel : model))
}

export default function LocalAiPanel({ onImportComplete, onClose }: LocalAiPanelProps) {
  const { messages } = useI18n()
  const importPipelineDraft = useGraphStore((state) => state.importPipelineDraft)

  const [runtimeAvailable, setRuntimeAvailable] = useState(false)
  const [runtimeName, setRuntimeName] = useState('ollama')
  const [models, setModels] = useState<AIModel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeActionModelId, setActiveActionModelId] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [documentationText, setDocumentationText] = useState('')
  const [clarificationResponse, setClarificationResponse] = useState<AnalyzeDocumentationResponse | null>(null)
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({})
  const [draftResponse, setDraftResponse] = useState<GeneratePipelineDraftResponse | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  useEffect(() => {
    let isMounted = true

    void (async () => {
      setIsLoading(true)
      setErrorMessage(null)
      try {
        const response = await fetchAiModels()
        if (!isMounted) {
          return
        }
        setRuntimeAvailable(response.runtime_available)
        setRuntimeName(response.runtime_name)
        setModels(response.models)
        setSelectedModelId(response.models[0]?.model_id ?? null)
      } catch (error) {
        if (!isMounted) {
          return
        }
        setErrorMessage(error instanceof Error ? error.message : messages.localAi.loadFailed)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const installingModelIds = models
      .filter((model) => model.install_state === 'installing')
      .map((model) => model.model_id)

    if (installingModelIds.length === 0) {
      return
    }

    const timer = window.setInterval(() => {
      void Promise.all(installingModelIds.map((modelId) => fetchAiModelStatus(modelId)))
        .then((responses) => {
          setModels((current) => {
            let next = current
            for (const response of responses) {
              next = mergeModel(next, response.model)
            }
            return next
          })
          const latestRuntimeAvailable = responses.at(-1)?.runtime_available
          const latestRuntimeName = responses.at(-1)?.runtime_name
          if (typeof latestRuntimeAvailable === 'boolean') {
            setRuntimeAvailable(latestRuntimeAvailable)
          }
          if (latestRuntimeName) {
            setRuntimeName(latestRuntimeName)
          }
        })
        .catch((error) => {
          setErrorMessage(error instanceof Error ? error.message : messages.localAi.refreshInstallStatusFailed)
        })
    }, 1200)

    return () => {
      window.clearInterval(timer)
    }
  }, [models])

  async function refreshModels(): Promise<void> {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const response = await fetchAiModels()
      setRuntimeAvailable(response.runtime_available)
      setRuntimeName(response.runtime_name)
      setModels(response.models)
      setSelectedModelId((current) => current ?? response.models[0]?.model_id ?? null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : messages.localAi.loadFailed)
    } finally {
      setIsLoading(false)
    }
  }

  async function runModelAction(
    modelId: string,
    action: (id: string) => Promise<{ model: AIModel; runtime_available: boolean; runtime_name: string }>,
  ): Promise<void> {
    setActiveActionModelId(modelId)
    setErrorMessage(null)
    try {
      const response = await action(modelId)
      setRuntimeAvailable(response.runtime_available)
      setRuntimeName(response.runtime_name)
      setModels((current) => mergeModel(current, response.model))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : messages.localAi.actionFailed)
    } finally {
      setActiveActionModelId(null)
    }
  }

  async function handleAnalyze(): Promise<void> {
    if (!selectedModelId) {
      return
    }
    setIsAnalyzing(true)
    setErrorMessage(null)
    setDraftResponse(null)
    try {
      const response = await analyzeDocumentation(selectedModelId, documentationText)
      setClarificationResponse(response)
      setClarificationAnswers((current) => {
        const next = { ...current }
        for (const question of response.questions) {
          if (next[question.id]) {
            continue
          }
          next[question.id] = question.answer_type === 'choice' ? (question.choices[0] ?? '') : ''
        }
        return next
      })
    } catch (error) {
      setClarificationResponse(null)
      setErrorMessage(error instanceof Error ? error.message : messages.localAi.analysisFailed)
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function handleGenerate(): Promise<void> {
    if (!selectedModelId) {
      return
    }
    setIsGenerating(true)
    setErrorMessage(null)
    try {
      const response = await generatePipelineDraft(
        selectedModelId,
        documentationText,
        clarificationQuestions.map((question) => ({
          question_id: question.id,
          answer: clarificationAnswers[question.id] ?? '',
        })),
      )
      setDraftResponse(response)
    } catch (error) {
      setDraftResponse(null)
      setErrorMessage(error instanceof Error ? error.message : messages.localAi.draftFailed)
    } finally {
      setIsGenerating(false)
    }
  }

  function resetDraftModalState(): void {
    setClarificationResponse(null)
    setClarificationAnswers({})
    setDraftResponse(null)
  }

  function updateClarificationAnswer(question: DocumentationClarificationQuestion, value: string): void {
    setClarificationAnswers((current) => ({
      ...current,
      [question.id]: value,
    }))
  }

  const selectedModel = models.find((model) => model.model_id === selectedModelId) ?? null
  const clarificationQuestions = clarificationResponse?.questions ?? []
  const clarificationWarnings = clarificationResponse?.warnings ?? []
  const hasRequiredClarificationAnswers = clarificationQuestions.every((question) => {
    if (!question.required) {
      return true
    }
    return Boolean(clarificationAnswers[question.id]?.trim())
  })
  const riskFlags = draftResponse ? detectDraftRiskFlags(draftResponse.draft) : []
  const previewWarnings = draftResponse
    ? Array.from(new Set([...clarificationWarnings, ...draftResponse.warnings, ...draftResponse.draft.warnings]))
    : clarificationWarnings

  return (
    <section className={`${styles.panel}${onClose ? ` ${styles.panelOverlay}` : ''}`}>
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>{messages.localAi.kicker}</p>
          <h2>{messages.localAi.title}</h2>
          <p className={styles.subtitle}>{messages.localAi.subtitle}</p>
        </div>
        <div className={styles.headerActions}>
          {onClose ? (
            <button type="button" className="buttonGhost" onClick={onClose}>
              {messages.localAi.close}
            </button>
          ) : null}
        </div>
      </div>

      {errorMessage ? <p className="errorBanner">{errorMessage}</p> : null}

      {!runtimeAvailable ? (
        <div className={styles.notice}>
          {messages.localAi.runtimeMissing}
        </div>
      ) : null}

      {isLoading ? (
        <div className="empty">{messages.localAi.loadingModels}</div>
      ) : (
        <div className={styles.modelGrid}>
          {models.map((model) => {
            const isBusy = activeActionModelId === model.model_id
            const canGenerate = model.model_state === 'ready'
            const isSelected = selectedModelId === model.model_id

            return (
              <article
                key={model.model_id}
                className={`${styles.modelCard}${isSelected ? ` ${styles.modelCardActive}` : ''}`}
              >
                <div className={styles.modelHead}>
                  <div>
                    <h3>{model.display_name}</h3>
                    <p>{model.provider}</p>
                  </div>
                  {isSelected ? (
                    <span className={styles.selectedBadge}>{messages.localAi.selected}</span>
                  ) : (
                    <button
                      type="button"
                      className="buttonGhost"
                      onClick={() => setSelectedModelId(model.model_id)}
                    >
                      {messages.localAi.select}
                    </button>
                  )}
                </div>

                <dl className={styles.metaList}>
                  <div>
                    <dt>{messages.localAi.size}</dt>
                    <dd>{formatBytesToGb(model.download_size_bytes)}</dd>
                  </div>
                  <div>
                    <dt>{messages.localAi.ram}</dt>
                    <dd>
                      {model.min_ram_gb} GB min / {model.recommended_ram_gb} GB recommended
                    </dd>
                  </div>
                  <div>
                    <dt>{messages.localAi.state}</dt>
                    <dd>
                      {model.install_state} / {model.model_state}
                    </dd>
                  </div>
                  <div>
                    <dt>{messages.localAi.license}</dt>
                    <dd>{model.license}</dd>
                  </div>
                </dl>

                {model.last_error ? <div className={styles.modelError}>{model.last_error}</div> : null}

                {model.install_state === 'installing' || model.progress_percent !== null ? (
                  <div className={styles.progressBlock}>
                    <div className={styles.progressHeader}>
                      <strong>{model.progress_status ?? messages.localAi.progressInstalling}</strong>
                      <span>{model.progress_percent !== null ? `${model.progress_percent.toFixed(1)}%` : '...'}</span>
                    </div>
                    <div
                      className={styles.progressTrack}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={model.progress_percent ?? 0}
                    >
                      <div
                        className={styles.progressFill}
                        style={{ width: `${model.progress_percent ?? 4}%` }}
                      />
                    </div>
                    <div className={styles.progressMeta}>
                      <span>
                        {model.progress_total_bytes !== null
                          ? messages.localAi.downloadedOf(
                            formatBytes(model.progress_completed_bytes),
                            formatBytes(model.progress_total_bytes),
                          )
                          : messages.localAi.downloaded(formatBytes(model.progress_completed_bytes))}
                      </span>
                      <span>
                        {messages.localAi.remaining}{' '}
                        {model.progress_total_bytes !== null && model.progress_completed_bytes !== null
                          ? formatBytes(Math.max(model.progress_total_bytes - model.progress_completed_bytes, 0))
                          : messages.localAi.unknown}
                      </span>
                    </div>
                  </div>
                ) : null}

                <div className={styles.actionRow}>
                  <button
                    type="button"
                    className="buttonGhost"
                    disabled={isBusy || model.install_state === 'installing'}
                    onClick={() => void runModelAction(model.model_id, installAiModel)}
                  >
                    {model.install_state === 'installing' ? messages.localAi.installing : isBusy && model.install_state !== 'installed' ? messages.localAi.installing : messages.localAi.install}
                  </button>
                  <button
                    type="button"
                    className="buttonGhost buttonGhost--danger"
                    disabled={isBusy || model.install_state !== 'installing'}
                    onClick={() => void runModelAction(model.model_id, cancelAiModelInstall)}
                  >
                    {messages.localAi.cancel}
                  </button>
                  <button
                    type="button"
                    className="buttonGhost"
                    disabled={isBusy || model.install_state !== 'installed' || model.model_state === 'ready'}
                    onClick={() => void runModelAction(model.model_id, loadAiModel)}
                  >
                    {messages.localAi.load}
                  </button>
                  <button
                    type="button"
                    className="buttonGhost"
                    disabled={isBusy || model.model_state !== 'ready'}
                    onClick={() => void runModelAction(model.model_id, unloadAiModel)}
                  >
                    {messages.localAi.unload}
                  </button>
                  <button
                    type="button"
                    className="buttonGhost buttonGhost--danger"
                    disabled={isBusy || model.install_state === 'not_installed'}
                    onClick={() => void runModelAction(model.model_id, removeAiModel)}
                  >
                    {messages.localAi.remove}
                  </button>
                </div>

                <button
                  type="button"
                  className={styles.generateButton}
                  disabled={!canGenerate}
                  onClick={() => {
                    setSelectedModelId(model.model_id)
                    resetDraftModalState()
                    setIsModalOpen(true)
                  }}
                >
                  {messages.localAi.generateFromDocs}
                </button>
              </article>
            )
          })}
        </div>
      )}

      {isModalOpen && selectedModel ? (
        <div className="modalBackdrop" role="presentation">
          <div className={`modalCard modalCard--flowSettings ${styles.modalCard}`}>
            <div className="modalHead">
              <div>
                <h2>{messages.localAi.generateDraftWith(selectedModel.display_name)}</h2>
                <p className="modalHint">{messages.localAi.modalHint}</p>
              </div>
              <button
                type="button"
                className="buttonGhost"
                onClick={() => {
                  setIsModalOpen(false)
                  resetDraftModalState()
                }}
              >
                {messages.localAi.close}
              </button>
            </div>

            <label className={styles.inputBlock}>
              <span>{messages.localAi.documentation}</span>
              <textarea
                value={documentationText}
                onChange={(event) => setDocumentationText(event.target.value)}
                placeholder={messages.localAi.documentationPlaceholder}
                rows={10}
              />
            </label>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.generateButton}
                disabled={isAnalyzing || selectedModel.model_state !== 'ready' || !documentationText.trim()}
                onClick={() => void handleAnalyze()}
              >
                {isAnalyzing ? messages.localAi.analyzing : messages.localAi.analyzeDocs}
              </button>
              <button
                type="button"
                className="buttonGhost"
                onClick={() => {
                  resetDraftModalState()
                  setDocumentationText('')
                }}
              >
                {messages.localAi.reset}
              </button>
            </div>

            {clarificationResponse ? (
              <div className={styles.preview}>
                <div className={styles.previewHeader}>
                  <div>
                    <p className={styles.previewKicker}>{messages.localAi.clarifications}</p>
                    <h3>{messages.localAi.answerChoicesFirst}</h3>
                    <p>{messages.localAi.clarificationsDescription}</p>
                  </div>
                </div>

                {clarificationQuestions.length === 0 ? (
                  <div className={styles.emptyState}>{messages.localAi.noClarificationQuestions}</div>
                ) : (
                  <div className={styles.questionsList}>
                    {clarificationQuestions.map((question) => (
                      <label key={question.id} className={styles.questionCard}>
                        <span className={styles.questionTitle}>
                          {question.question}
                          {question.required ? ' *' : ''}
                        </span>
                        <span className={styles.questionDescription}>{question.description}</span>
                        {question.answer_type === 'choice' ? (
                          <select
                            className={styles.questionInput}
                            value={clarificationAnswers[question.id] ?? ''}
                            onChange={(event) => updateClarificationAnswer(question, event.target.value)}
                          >
                            {question.choices.map((choice) => (
                              <option key={choice} value={choice}>
                                {choice}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className={styles.questionInput}
                            value={clarificationAnswers[question.id] ?? ''}
                            onChange={(event) => updateClarificationAnswer(question, event.target.value)}
                            placeholder={messages.localAi.typeOperatorAnswer}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                )}

                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.generateButton}
                    disabled={
                      isGenerating ||
                      selectedModel.model_state !== 'ready' ||
                      !documentationText.trim() ||
                      !hasRequiredClarificationAnswers
                    }
                    onClick={() => void handleGenerate()}
                  >
                    {isGenerating ? messages.localAi.generating : messages.localAi.generateFinalDraft}
                  </button>
                </div>
              </div>
            ) : null}

            {draftResponse ? (
              <div className={styles.preview}>
                <div className={styles.previewHeader}>
                  <div>
                    <p className={styles.previewKicker}>{messages.localAi.preview}</p>
                    <h3>{draftResponse.draft.flow_name}</h3>
                    <p>{draftResponse.draft.summary}</p>
                  </div>
                  <div className={styles.confidence}>
                    {messages.localAi.confidence((draftResponse.draft.confidence * 100).toFixed(0))}
                  </div>
                </div>

                {riskFlags.length > 0 ? (
                  <div className={styles.blockingWarning}>
                    {messages.localAi.blockingWarning(riskFlags.join(', '))}
                  </div>
                ) : null}

                <div className={styles.previewGrid}>
                  <section>
                    <h4>{messages.localAi.variables}</h4>
                    {draftResponse.draft.variables.length === 0 ? (
                      <p className={styles.emptyState}>{messages.localAi.noVariables}</p>
                    ) : (
                      <ul className={styles.simpleList}>
                        {draftResponse.draft.variables.map((variable) => (
                          <li key={variable.name}>
                            <strong>{variable.name}</strong> {variable.required ? `(${messages.localAi.required})` : `(${messages.localAi.optional})`} {variable.description}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section>
                    <h4>{messages.localAi.steps}</h4>
                    <ol className={styles.simpleList}>
                      {draftResponse.draft.steps.map((step) => (
                        <li key={step.id}>
                          <strong>{step.label}</strong>
                          <code>{step.command}</code>
                        </li>
                      ))}
                    </ol>
                  </section>

                  <section>
                    <h4>{messages.localAi.warnings}</h4>
                    {previewWarnings.length === 0 ? (
                      <p className={styles.emptyState}>{messages.localAi.noWarnings}</p>
                    ) : (
                      <ul className={styles.simpleList}>
                        {previewWarnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section>
                    <h4>{messages.localAi.assumptions}</h4>
                    {draftResponse.draft.assumptions.length === 0 ? (
                      <p className={styles.emptyState}>{messages.localAi.noAssumptions}</p>
                    ) : (
                      <ul className={styles.simpleList}>
                        {draftResponse.draft.assumptions.map((assumption) => (
                          <li key={assumption}>{assumption}</li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>

                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.generateButton}
                    disabled={riskFlags.length > 0}
                    onClick={() => {
                      importPipelineDraft(draftResponse.draft)
                      setIsModalOpen(false)
                      resetDraftModalState()
                      onImportComplete()
                    }}
                  >
                    {messages.localAi.importToGraph}
                  </button>
                  <button
                    type="button"
                    className="buttonGhost"
                    onClick={() => setIsModalOpen(false)}
                  >
                    {messages.localAi.cancel}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={styles.footerBar}>
        <div className={styles.runtimeCard}>
          <span className={runtimeAvailable ? styles.runtimeOk : styles.runtimeWarn}>
            {runtimeAvailable ? messages.localAi.runtimeAvailable(runtimeName) : messages.localAi.runtimeNotInstalled(runtimeName)}
          </span>
          <button type="button" className="buttonGhost" onClick={() => void refreshModels()}>
            {messages.localAi.refresh}
          </button>
        </div>
      </div>
    </section>
  )
}
