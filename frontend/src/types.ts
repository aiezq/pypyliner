export type StreamType = 'out' | 'err' | 'meta'
export type TerminalType = 'local' | 'ssh'
export type SessionStatus =
  | 'idle'
  | 'starting'
  | 'pending'
  | 'running'
  | 'draining'
  | 'success'
  | 'failed'
  | 'stopped'

export interface TerminalLine {
  id: string
  stream: StreamType
  text: string
  createdAt: string
}

export interface TerminalQueueCommand {
  id: string
  nodeId: string
  label: string
  originalCommand: string
  resolvedCommand: string
  status: SessionStatus | 'skipped'
  startedAt: string | null
  finishedAt: string | null
  exitCode: number | null
}

export interface ManualTerminal {
  id: string
  title: string
  titleDraft: string
  terminalType: TerminalType
  promptUser: string
  promptCwd: string
  isSequence: boolean
  status: SessionStatus
  exitCode: number | null
  draftCommand: string
  sshConnectionName: string | null
  sshHost: string | null
  sshUsername: string | null
  lines: TerminalLine[]
  isBackendSession?: boolean
  terminalNodeId?: string | null
  sequenceId?: string | null
  createdAt?: string | null
  startedAt?: string | null
  finishedAt?: string | null
  currentCommandIndex?: number | null
  currentCommandId?: string | null
  currentCommandLabel?: string | null
  queue?: TerminalQueueCommand[]
  stdinEnabled?: boolean
}

export interface SshConnectionVariable {
  id: string
  username: string
  host: string
  password: string
}

export interface BackendHistory {
  runs: Array<{
    id: string
    pipeline_name: string
    status: string
    started_at: string
    finished_at: string | null
    log_file_path: string
    sessions: Array<{
      id: string
      step_id: string
      title: string
      command: string
      status: string
      exit_code: number | null
      lines: Array<{
        id: string
        stream: StreamType
        text: string
        created_at: string
      }>
    }>
  }>
}
