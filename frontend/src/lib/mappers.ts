import type {
  BackendLine,
  BackendManualTerminal,
  ManualTerminal,
  TerminalLine,
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



export const toManualTerminal = (
  terminal: BackendManualTerminal,
): ManualTerminal => ({
  id: terminal.id,
  title: terminal.title,
  titleDraft: terminal.title,
  terminalType: terminal.terminal_type,
  promptUser: terminal.prompt_user,
  promptCwd: terminal.prompt_cwd,
  isSequence: terminal.is_sequence,
  status: terminal.status,
  exitCode: terminal.exit_code,
  draftCommand: terminal.draft_command,
  sshConnectionName: terminal.ssh_connection_name,
  sshHost: terminal.ssh_host,
  sshUsername: terminal.ssh_username,
  lines: terminal.lines.map(toTerminalLine),
})



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
          draftCommand: terminal.draftCommand,
        }
      : terminal,
  )
}
