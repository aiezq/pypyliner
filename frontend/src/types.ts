export type StreamType = 'out' | 'err' | 'meta'
export type TerminalType = 'local' | 'ssh'
export type SessionStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'stopped'

export interface TerminalLine {
  id: string
  stream: StreamType
  text: string
  createdAt: string
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
}

export interface BackendLine {
  id: string
  stream: StreamType
  text: string
  created_at: string
}

export interface BackendManualTerminal {
  id: string
  title: string
  terminal_type: TerminalType
  is_sequence: boolean
  prompt_user: string
  prompt_cwd: string
  status: SessionStatus
  exit_code: number | null
  draft_command: string
  ssh_connection_name: string | null
  ssh_host: string | null
  ssh_username: string | null
  lines: BackendLine[]
}

export interface SshConnectionVariable {
  id: string
  username: string
  host: string
  password: string
}

export interface BackendTerminalCompletion {
  terminal_id: string
  command: string
  base_command: string
  completed_command: string
  matches: string[]
}

export interface BackendManualTerminalHistory {
  terminal_id: string
  title: string
  is_sequence: boolean
  created_at: string
  updated_at: string
  closed_at: string | null
  log_file_path: string
  commands: string[]
}

export interface BackendHistory {
  manual_terminal_history: BackendManualTerminalHistory[]
}
