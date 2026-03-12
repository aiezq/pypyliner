import type {
  BackendLine,
  BackendTerminal,
  BackendTerminalCommand,
} from '../lib/schemas'
import type { ManualTerminal, TerminalLine, TerminalQueueCommand } from '../types'

export type TerminalHistoryDirection = 'up' | 'down'

export const toTerminalLine = (line: BackendLine): TerminalLine => ({
  id: line.id,
  stream: line.stream,
  text: line.text,
  createdAt: line.created_at,
})

export const toQueueCommand = (
  command: BackendTerminalCommand,
): TerminalQueueCommand => ({
  id: command.id,
  nodeId: command.node_id,
  label: command.label,
  originalCommand: command.original_command,
  resolvedCommand: command.resolved_command,
  status: command.status,
  startedAt: command.started_at,
  finishedAt: command.finished_at,
  exitCode: command.exit_code,
})

export const buildCurrentCommandLabel = (
  queue: TerminalQueueCommand[],
  currentCommandId: string | null | undefined,
  currentCommandIndex: number | null | undefined,
): string | null => {
  if (currentCommandId) {
    return queue.find((item) => item.id === currentCommandId)?.label ?? null
  }
  if (
    typeof currentCommandIndex === 'number' &&
    currentCommandIndex >= 0 &&
    currentCommandIndex < queue.length
  ) {
    return queue[currentCommandIndex]?.label ?? null
  }
  const running = queue.find((item) => item.status === 'running')
  return running?.label ?? null
}

export const isBackendSessionId = (terminalId: string): boolean =>
  terminalId.startsWith('term_')

export const toManualTerminal = (
  terminal: BackendTerminal,
  titleOverridesByTerminalId: Record<string, string>,
  existing?: ManualTerminal,
  options?: { draftCommand?: string },
): ManualTerminal => {
  const queue = terminal.queue.map(toQueueCommand)
  const title = titleOverridesByTerminalId[terminal.id] ?? terminal.title
  const titleDraft =
    existing && existing.titleDraft !== existing.title ? existing.titleDraft : title

  return {
    id: terminal.id,
    title,
    titleDraft,
    terminalType: terminal.terminal_type,
    promptUser:
      terminal.terminal_type === 'ssh'
        ? terminal.ssh_username ?? 'ssh'
        : terminal.sequence_id
          ? 'sequence'
          : 'local',
    promptCwd:
      terminal.terminal_type === 'ssh'
        ? terminal.ssh_host ?? '~'
        : terminal.sequence_id
          ? 'queue'
          : '~',
    isSequence: terminal.sequence_id !== null,
    status: terminal.status,
    exitCode: terminal.exit_code,
    draftCommand: options?.draftCommand ?? existing?.draftCommand ?? '',
    sshConnectionName: terminal.ssh_connection_name,
    sshHost: terminal.ssh_host,
    sshUsername: terminal.ssh_username,
    lines: terminal.lines.map(toTerminalLine),
    isBackendSession: true,
    terminalNodeId: terminal.terminal_node_id,
    sequenceId: terminal.sequence_id,
    createdAt: terminal.created_at,
    startedAt: terminal.started_at,
    finishedAt: terminal.finished_at,
    currentCommandIndex: terminal.current_command_index,
    currentCommandId: terminal.current_command_id,
    currentCommandLabel: buildCurrentCommandLabel(
      queue,
      terminal.current_command_id,
      terminal.current_command_index,
    ),
    queue,
    stdinEnabled: terminal.stdin_enabled,
  }
}
