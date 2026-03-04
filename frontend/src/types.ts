export type StepType = 'template' | 'custom'
export type StreamType = 'out' | 'err' | 'meta'
export type SessionStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'stopped'
export type RunStatus = 'running' | 'success' | 'failed' | 'stopped'

export interface CommandTemplate {
  id: string
  name: string
  command: string
  description: string
}

export interface PipelineStep {
  id: string
  type: StepType
  label: string
  command: string
}

export interface TerminalLine {
  id: string
  stream: StreamType
  text: string
  createdAt: string
}

export interface TerminalSession {
  id: string
  stepId: string
  title: string
  command: string
  status: SessionStatus
  exitCode: number | null
  lines: TerminalLine[]
}

export interface ManualTerminal {
  id: string
  title: string
  titleDraft: string
  promptUser: string
  promptCwd: string
  status: SessionStatus
  exitCode: number | null
  draftCommand: string
  lines: TerminalLine[]
}

export interface RunState {
  id: string
  pipelineName: string
  status: RunStatus
  startedAt: string
  finishedAt: string | null
  logFilePath: string
  sessions: TerminalSession[]
}

export interface BackendLine {
  id: string
  stream: StreamType
  text: string
  created_at: string
}

export interface BackendSession {
  id: string
  step_id: string
  title: string
  command: string
  status: SessionStatus
  exit_code: number | null
  lines: BackendLine[]
}

export interface BackendRun {
  id: string
  pipeline_name: string
  status: RunStatus
  started_at: string
  finished_at: string | null
  log_file_path: string
  sessions: BackendSession[]
}

export interface BackendManualTerminal {
  id: string
  title: string
  prompt_user: string
  prompt_cwd: string
  status: SessionStatus
  exit_code: number | null
  draft_command: string
  lines: BackendLine[]
}

export interface BackendSnapshot {
  runs: BackendRun[]
  manual_terminals: BackendManualTerminal[]
}

export interface BackendTerminalCompletion {
  terminal_id: string
  command: string
  base_command: string
  completed_command: string
  matches: string[]
}

export interface BackendCommandPack {
  pack_id: string
  pack_name: string
  description: string
  file_name: string
  templates: CommandTemplate[]
}

export interface BackendCommandPackList {
  packs: BackendCommandPack[]
  templates: CommandTemplate[]
  errors: string[]
}

export interface BackendTemplateCreatePayload {
  name: string
  command: string
  description: string
  pack_id?: string
}

export interface BackendTemplateUpdatePayload {
  name?: string
  command?: string
}

export interface BackendCommandPackImportPayload {
  file_name?: string
  content: string
}

export interface BackendCommandPackImportResult {
  imported: boolean
  pack_id: string
  pack_name: string
  file_name: string
  commands_count: number
}

export interface BackendPipelineFlowStep {
  type: StepType
  label: string
  command: string
}

export interface BackendPipelineFlow {
  id: string
  flow_name: string
  created_at: string
  updated_at: string
  file_name: string
  steps: BackendPipelineFlowStep[]
}

export interface BackendPipelineFlowList {
  flows: BackendPipelineFlow[]
  errors: string[]
}

export interface BackendManualTerminalHistory {
  terminal_id: string
  title: string
  created_at: string
  updated_at: string
  closed_at: string | null
  log_file_path: string
  commands: string[]
}

export interface BackendHistory {
  runs: BackendRun[]
  manual_terminal_history: BackendManualTerminalHistory[]
}

export interface SocketEvent {
  type: string
  data: unknown
}
