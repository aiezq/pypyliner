import {
  LEGACY_OPEN_TERMINAL_COMMAND,
  PIPELINE_OPEN_TERMINAL_COMMAND,
} from '../data/templates'
import type {
  BackendLine,
  BackendManualTerminal,
  BackendRun,
  BackendSession,
  ManualTerminal,
  RunState,
  TerminalLine,
  TerminalSession,
} from '../types'

let idSequence = 0

export const createId = (prefix: string): string => {
  idSequence += 1
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}_${idSequence.toString(36)}`
  }
  return `${prefix}_${Date.now().toString(36)}_${idSequence.toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`
}

export const formatTime = (iso: string | null): string => {
  if (!iso) {
    return 'not finished'
  }
  return new Date(iso).toLocaleTimeString()
}

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  return 'Unknown backend error'
}

export const toTerminalLine = (line: BackendLine): TerminalLine => ({
  id: line.id,
  stream: line.stream,
  text: line.text,
  createdAt: line.created_at,
})

export const toTerminalSession = (session: BackendSession): TerminalSession => ({
  id: session.id,
  stepId: session.step_id,
  title: session.title,
  command: session.command,
  status: session.status,
  exitCode: session.exit_code,
  lines: session.lines.map(toTerminalLine),
})

export const toRunState = (run: BackendRun): RunState => ({
  id: run.id,
  pipelineName: run.pipeline_name,
  status: run.status,
  startedAt: run.started_at,
  finishedAt: run.finished_at,
  logFilePath: run.log_file_path,
  sessions: run.sessions.map(toTerminalSession),
})

export const toManualTerminal = (
  terminal: BackendManualTerminal,
): ManualTerminal => ({
  id: terminal.id,
  title: terminal.title,
  titleDraft: terminal.title,
  promptUser: terminal.prompt_user,
  promptCwd: terminal.prompt_cwd,
  status: terminal.status,
  exitCode: terminal.exit_code,
  draftCommand: terminal.draft_command,
  lines: terminal.lines.map(toTerminalLine),
})

export const pickLatestRun = (runs: BackendRun[]): BackendRun | null => {
  if (runs.length === 0) {
    return null
  }
  return runs.reduce((latest, current) =>
    Date.parse(current.started_at) > Date.parse(latest.started_at) ? current : latest,
  )
}

export const isPipelineOpenTerminalCommand = (command: string): boolean => {
  const normalized = command.trim().replace(/\s+/g, ' ')
  if (!normalized) {
    return false
  }
  const lowered = normalized.toLowerCase()
  return (
    lowered === PIPELINE_OPEN_TERMINAL_COMMAND ||
    lowered === 'operator.open_terminal' ||
    lowered === 'open_terminal' ||
    normalized === LEGACY_OPEN_TERMINAL_COMMAND
  )
}

export const upsertManualTerminal = (
  terminals: ManualTerminal[],
  incoming: ManualTerminal,
): ManualTerminal[] => {
  const existing = terminals.find((terminal) => terminal.id === incoming.id)
  if (!existing) {
    return [...terminals, incoming]
  }

  return terminals.map((terminal) =>
    terminal.id === incoming.id
      ? {
          ...incoming,
          titleDraft:
            terminal.titleDraft &&
            terminal.titleDraft !== terminal.title &&
            incoming.title === terminal.title
              ? terminal.titleDraft
              : incoming.title,
          draftCommand:
            terminal.draftCommand && !incoming.draftCommand
              ? terminal.draftCommand
              : incoming.draftCommand,
        }
      : terminal,
  )
}
