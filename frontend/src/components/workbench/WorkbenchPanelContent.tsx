import PipelineDock from '../PipelineDock'
import PipelineFlowPanel from '../PipelineFlowPanel'
import TerminalPanel from '../TerminalPanel'
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
} from '../../types'


type TerminalHistoryDirection = 'up' | 'down'

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
        <TerminalPanel
          variant="pinned"
          kind="run"
          session={session}
          controls={
            <>
              <button
                type="button"
                className="terminalWindowControl terminalWindowControl--pin"
                onClick={() => onTogglePinTerminalWindow(windowItem.windowId)}
                title="Unpin from workflow"
              >
                P
              </button>
              <span className={`status status--${session.status}`}>{session.status}</span>
            </>
          }
        />
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
      <TerminalPanel
        variant="pinned"
        kind="manual"
        terminal={terminal}
        isEditingTitle={isEditingTitle}
        onUpdateTitleDraft={(title) => onUpdateManualTitle(terminal.id, title)}
        onStartTitleEdit={() => onStartPinnedTerminalTitleEdit(terminal)}
        onCancelTitleEdit={() => onCancelPinnedTerminalTitleEdit(terminal)}
        onSaveTitleEdit={() => {
          void onSavePinnedTerminalTitleEdit(terminal)
        }}
        onUpdateCommand={(command) => onUpdateManualCommand(terminal.id, command)}
        onAutocompleteCommand={() => {
          void onAutocompleteManualCommand(terminal.id)
        }}
        onNavigateHistory={(direction, currentDraft) =>
          onNavigateManualHistory(terminal.id, direction, currentDraft)
        }
        onRunCommand={() => {
          void onRunManualCommand(terminal.id)
        }}
        onClearTerminal={() => {
          void onClearManualTerminal(terminal.id)
        }}
        copyTailLineCount={getCopyTailLineCount(terminal.id)}
        onUpdateCopyTailLineCount={(rawValue) =>
          onUpdateCopyTailLineCount(terminal.id, rawValue)
        }
        onCopyTail={() => {
          void onCopyManualTerminalTail(terminal.id)
        }}
        isCopyTailRecentlyCopied={isCopyTailRecentlyCopied(terminal.id)}
        controls={
          <>
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
          </>
        }
      />
    </section>
  )
}

export default WorkbenchPanelContent
