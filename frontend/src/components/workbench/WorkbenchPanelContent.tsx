import { useEffect, useRef } from 'react'
import PipelineDock from '../PipelineDock'
import PipelineFlowPanel from '../PipelineFlowPanel'
import {
  WORKBENCH_PANEL_DOCK,
  WORKBENCH_PANEL_FLOW,
  toWorkbenchTerminalWindowId,
  type WorkbenchPanelKey,
} from '../../hooks/useWorkbenchLayout'
import type { WorkbenchTerminalWindowItem } from '../../hooks/useWorkbenchTerminalsViewModel'
import type {
  BackendTemplateUpdatePayload,
  CommandTemplate,
  ManualTerminal,
  PipelineStep,
  RunState,
  TerminalLine,
} from '../../types'


type TerminalHistoryDirection = 'up' | 'down'

interface PinnedTerminalOutputProps {
  lines: TerminalLine[]
}

export interface WorkbenchPanelContentProps {
  panel: WorkbenchPanelKey
  steps: PipelineStep[]
  packOptions: Array<{ id: string; name: string }>
  savedFlows: Array<{ id: string; name: string }>
  selectedSavedFlowId: string | null
  pipelineName: string
  run: RunState | null
  isRunning: boolean
  isSavingFlow: boolean
  onRunPipeline: () => Promise<void>
  onStopRun: () => Promise<void>
  onClearSteps: () => void
  onCreateStep: () => void
  onRemoveStep: (stepId: string) => void
  onUpdateStep: (stepId: string, payload: { label?: string; command?: string }) => void
  onSaveStepToDock: (stepId: string, targetPackId: string) => Promise<void>
  onSwitchSavedFlow: (flowId: string | null) => void
  onPipelineNameChange: (name: string) => void
  onSaveFlow: () => Promise<void>
  onSaveFlowAsNew: () => Promise<void>
  onReorderSteps: (fromIndex: number, toIndex: number) => void
  templates: CommandTemplate[]
  packNamesById: Record<string, string>
  packsCount: number
  isReloadingTemplates: boolean
  onAddStepFromTemplate: (template: CommandTemplate) => void
  onUpdateTemplate: (
    templateId: string,
    payload: BackendTemplateUpdatePayload,
  ) => Promise<void>
  onReloadTemplates: () => Promise<void>
  onMoveTemplateToPack: (templateId: string, targetPackId: string) => Promise<void>
  onDeleteTemplate: (templateId: string) => Promise<void>
  terminalWindowMap: Map<string, WorkbenchTerminalWindowItem>
  editingPinnedTerminalTitleId: string | null
  onTogglePinTerminalWindow: (windowId: string) => void
  onMinimizePinnedTerminalWindow: (windowId: string) => void
  onUpdateManualTitle: (terminalId: string, title: string) => void
  onStartPinnedTerminalTitleEdit: (terminal: ManualTerminal) => void
  onCancelPinnedTerminalTitleEdit: (terminal: ManualTerminal) => void
  onSavePinnedTerminalTitleEdit: (terminal: ManualTerminal) => Promise<void>
  onStopManualTerminal: (terminalId: string) => Promise<void>
  onRemoveManualTerminal: (terminalId: string) => Promise<void>
  onUpdateManualCommand: (terminalId: string, command: string) => void
  onAutocompleteManualCommand: (terminalId: string) => Promise<void>
  onNavigateManualHistory: (
    terminalId: string,
    direction: TerminalHistoryDirection,
    currentDraft: string,
  ) => void
  onRunManualCommand: (terminalId: string) => Promise<void>
  onClearManualTerminal: (terminalId: string) => Promise<void>
  getCopyTailLineCount: (terminalId: string) => number
  onUpdateCopyTailLineCount: (terminalId: string, rawValue: string) => void
  onCopyManualTerminalTail: (terminalId: string) => Promise<void>
  isCopyTailRecentlyCopied: (terminalId: string) => boolean
}

export type WorkbenchPanelBodyProps = Omit<WorkbenchPanelContentProps, 'panel'>

function PinnedTerminalOutput({ lines }: PinnedTerminalOutputProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const element = bodyRef.current
    if (!element) {
      return
    }
    element.scrollTop = element.scrollHeight
  }, [lines.length])

  return (
    <div className="terminalBody" ref={bodyRef}>
      {lines.map((line) => (
        <p
          key={line.id}
          className={`line line--${line.stream}`}
          title={new Date(line.createdAt).toLocaleTimeString()}
        >
          {line.text}
        </p>
      ))}
    </div>
  )
}

function WorkbenchPanelContent({
  panel,
  steps,
  packOptions,
  savedFlows,
  selectedSavedFlowId,
  pipelineName,
  run,
  isRunning,
  isSavingFlow,
  onRunPipeline,
  onStopRun,
  onClearSteps,
  onCreateStep,
  onRemoveStep,
  onUpdateStep,
  onSaveStepToDock,
  onSwitchSavedFlow,
  onPipelineNameChange,
  onSaveFlow,
  onSaveFlowAsNew,
  onReorderSteps,
  templates,
  packNamesById,
  packsCount,
  isReloadingTemplates,
  onAddStepFromTemplate,
  onUpdateTemplate,
  onReloadTemplates,
  onMoveTemplateToPack,
  onDeleteTemplate,
  terminalWindowMap,
  editingPinnedTerminalTitleId,
  onTogglePinTerminalWindow,
  onMinimizePinnedTerminalWindow,
  onUpdateManualTitle,
  onStartPinnedTerminalTitleEdit,
  onCancelPinnedTerminalTitleEdit,
  onSavePinnedTerminalTitleEdit,
  onStopManualTerminal,
  onRemoveManualTerminal,
  onUpdateManualCommand,
  onAutocompleteManualCommand,
  onNavigateManualHistory,
  onRunManualCommand,
  onClearManualTerminal,
  getCopyTailLineCount,
  onUpdateCopyTailLineCount,
  onCopyManualTerminalTail,
  isCopyTailRecentlyCopied,
}: WorkbenchPanelContentProps) {
  if (panel === WORKBENCH_PANEL_FLOW) {
    return (
      <PipelineFlowPanel
        steps={steps}
        packOptions={packOptions}
        savedFlows={savedFlows}
        selectedSavedFlowId={selectedSavedFlowId}
        pipelineName={pipelineName}
        run={run}
        isRunning={isRunning}
        isSavingFlow={isSavingFlow}
        onRunPipeline={() => {
          void onRunPipeline()
        }}
        onStopRun={() => {
          void onStopRun()
        }}
        onClearSteps={onClearSteps}
        onCreateStep={onCreateStep}
        onRemoveStep={onRemoveStep}
        onUpdateStep={onUpdateStep}
        onSaveStepToDock={onSaveStepToDock}
        onSwitchSavedFlow={onSwitchSavedFlow}
        onPipelineNameChange={onPipelineNameChange}
        onSaveFlow={onSaveFlow}
        onSaveFlowAsNew={onSaveFlowAsNew}
        onReorderSteps={onReorderSteps}
      />
    )
  }

  if (panel === WORKBENCH_PANEL_DOCK) {
    return (
      <PipelineDock
        pipelineName={pipelineName}
        stepsCount={steps.length}
        templates={templates}
        packNamesById={packNamesById}
        packsCount={packsCount}
        isReloadingTemplates={isReloadingTemplates}
        onPipelineNameChange={onPipelineNameChange}
        onAddStepFromTemplate={onAddStepFromTemplate}
        onUpdateTemplate={onUpdateTemplate}
        onReloadTemplates={onReloadTemplates}
        onMoveTemplateToPack={onMoveTemplateToPack}
        onDeleteTemplate={onDeleteTemplate}
      />
    )
  }

  const terminalWindowId = toWorkbenchTerminalWindowId(panel)
  if (!terminalWindowId) {
    return (
      <section className="panel pinnedTerminalPanel">
        <p className="empty">Unknown panel</p>
      </section>
    )
  }
  const windowItem = terminalWindowMap.get(terminalWindowId)
  if (!windowItem) {
    return (
      <section className="panel pinnedTerminalPanel">
        <p className="empty">Terminal is no longer available.</p>
      </section>
    )
  }

  if (windowItem.kind === 'run' && windowItem.runSession) {
    const session = windowItem.runSession
    return (
      <section className="panel pinnedTerminalPanel">
        <div className="section__head">
          <h2>{session.title}</h2>
          <div className="pinnedTerminalHeadActions">
            <button
              type="button"
              className="terminalWindowControl terminalWindowControl--pin"
              onClick={() => onTogglePinTerminalWindow(windowItem.windowId)}
              title="Unpin from workflow"
            >
              P
            </button>
            <span className={`status status--${session.status}`}>{session.status}</span>
          </div>
        </div>
        <p className="terminalWindow__meta">exit: {session.exitCode ?? '...'}</p>
        <code>{session.command}</code>
        <PinnedTerminalOutput lines={session.lines} />
      </section>
    )
  }

  if (windowItem.kind !== 'manual') {
    return (
      <section className="panel pinnedTerminalPanel">
        <p className="empty">Terminal is unavailable.</p>
      </section>
    )
  }

  const terminal = windowItem.manualTerminal
  const isEditingTitle = editingPinnedTerminalTitleId === terminal.id

  return (
    <section className="panel pinnedTerminalPanel">
      <div className="section__head">
        <div className="pinnedTerminalTitle terminalTitleEditable templateEditable">
          {isEditingTitle ? (
            <div className="templateEditInline">
              <input
                value={terminal.titleDraft}
                onChange={(event) => onUpdateManualTitle(terminal.id, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void onSavePinnedTerminalTitleEdit(terminal)
                    return
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    onCancelPinnedTerminalTitleEdit(terminal)
                  }
                }}
                placeholder="Terminal name"
                autoFocus
              />
              <button
                type="button"
                className="templateSaveButton"
                onClick={() => {
                  void onSavePinnedTerminalTitleEdit(terminal)
                }}
                disabled={
                  !terminal.titleDraft.trim() ||
                  terminal.titleDraft.trim() === terminal.title
                }
                title={`Save terminal name: ${terminal.title}`}
              >
                ✓
              </button>
            </div>
          ) : (
            <div className="pinnedTerminalTitleMain">
              <h2>{terminal.title}</h2>
              <button
                type="button"
                className="templateEditButton terminalTitleEditButton"
                onClick={() => onStartPinnedTerminalTitleEdit(terminal)}
                aria-label={`Edit terminal name: ${terminal.title}`}
              >
                ✎
              </button>
            </div>
          )}
        </div>
        <div className="pinnedTerminalHeadActions">
          <button
            type="button"
            className="terminalWindowControl terminalWindowControl--pin"
            onClick={() => onTogglePinTerminalWindow(windowItem.windowId)}
            title="Unpin from workflow"
          >
            P
          </button>
          <button
            type="button"
            className="terminalWindowControl"
            onClick={() => onMinimizePinnedTerminalWindow(windowItem.windowId)}
            title="Minimize to dock"
          >
            -
          </button>
          <button
            type="button"
            className="terminalWindowControl terminalWindowControl--warning"
            onClick={() => {
              void onStopManualTerminal(terminal.id)
            }}
            title="Stop terminal"
            disabled={terminal.status !== 'running'}
          >
            ‖
          </button>
          <button
            type="button"
            className="terminalWindowControl terminalWindowControl--danger"
            onClick={() => {
              void onRemoveManualTerminal(terminal.id)
            }}
            title="Close terminal"
          >
            ×
          </button>
          <span className={`status status--${terminal.status}`}>{terminal.status}</span>
        </div>
      </div>

      <p className="terminalWindow__meta">exit: {terminal.exitCode ?? '...'}</p>

      <div className="terminalActions">
        <span
          className="terminalPrompt"
          title={`${terminal.promptUser}:${terminal.promptCwd}`}
        >
          {terminal.promptUser}:{terminal.promptCwd}$
        </span>
        <div className="terminalCommandInputWrap">
          <input
            value={terminal.draftCommand}
            onChange={(event) => onUpdateManualCommand(terminal.id, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Tab' && !event.shiftKey) {
                event.preventDefault()
                void onAutocompleteManualCommand(terminal.id)
                return
              }
              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault()
                onNavigateManualHistory(
                  terminal.id,
                  event.key === 'ArrowUp' ? 'up' : 'down',
                  terminal.draftCommand,
                )
                return
              }
              if (event.key !== 'Enter') {
                return
              }
              if (event.nativeEvent.isComposing || !terminal.draftCommand.trim()) {
                return
              }
              event.preventDefault()
              void onRunManualCommand(terminal.id)
            }}
            placeholder="Type command, e.g. ls -la /opt/app"
          />
          <div className="terminalInputActions">
            <button
              type="button"
              className="terminalInputAction terminalInputAction--clear"
              onClick={() => {
                void onClearManualTerminal(terminal.id)
              }}
              title="Clear output"
              aria-label="Clear output"
            >
              <span className="terminalInputActionIcon" aria-hidden="true">
                🗑
              </span>
            </button>
            <button
              type="button"
              className="terminalInputAction terminalInputAction--send"
              onClick={() => {
                void onRunManualCommand(terminal.id)
              }}
              disabled={!terminal.draftCommand.trim()}
              title="Send command"
              aria-label="Send command"
            >
              <span className="terminalInputActionIcon" aria-hidden="true">
                ➜
              </span>
            </button>
          </div>
        </div>
      </div>

      <PinnedTerminalOutput lines={terminal.lines} />
      <div className="terminalFooterActions">
        <label className="terminalCopyTailControl">
          <span>Last</span>
          <input
            type="number"
            min={1}
            step={1}
            value={getCopyTailLineCount(terminal.id)}
            onChange={(event) => onUpdateCopyTailLineCount(terminal.id, event.target.value)}
            title="Number of lines to copy"
          />
          <span>lines</span>
        </label>
        <button
          type="button"
          className="terminalFooterCopyButton"
          onClick={() => {
            void onCopyManualTerminalTail(terminal.id)
          }}
          title="Copy last lines to clipboard"
        >
          {isCopyTailRecentlyCopied(terminal.id) ? 'Copied' : 'Copy tail'}
        </button>
      </div>
    </section>
  )
}

export default WorkbenchPanelContent
