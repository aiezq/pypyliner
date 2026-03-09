import { z } from 'zod'

export const StreamTypeSchema = z.enum(['out', 'err', 'meta'])
export const TerminalTypeSchema = z.enum(['local', 'ssh'])
export const SessionStatusSchema = z.enum([
  'idle',
  'pending',
  'running',
  'success',
  'failed',
  'stopped',
])

export const BackendLineSchema = z.object({
  id: z.string(),
  stream: StreamTypeSchema,
  text: z.string(),
  created_at: z.string(),
})

export const BackendManualTerminalSchema = z.object({
  id: z.string(),
  title: z.string(),
  terminal_type: TerminalTypeSchema.default('local'),
  is_sequence: z.boolean(),
  prompt_user: z.string(),
  prompt_cwd: z.string(),
  status: SessionStatusSchema,
  exit_code: z.number().int().nullable(),
  draft_command: z.string(),
  ssh_connection_name: z.string().nullable().default(null),
  ssh_host: z.string().nullable().default(null),
  ssh_username: z.string().nullable().default(null),
  lines: z.array(BackendLineSchema),
})

export const BackendSnapshotSchema = z.object({
  manual_terminals: z.array(BackendManualTerminalSchema),
})

export const BackendManualTerminalHistorySchema = z.object({
  terminal_id: z.string(),
  title: z.string(),
  is_sequence: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  log_file_path: z.string(),
  commands: z.array(z.string()),
})

export const BackendHistorySchema = z.object({
  manual_terminal_history: z.array(BackendManualTerminalHistorySchema),
})

export const AIInstallStateSchema = z.enum([
  'not_installed',
  'installing',
  'installed',
  'failed',
  'removing',
])

export const AIModelStateSchema = z.enum([
  'not_installed',
  'installed',
  'loading',
  'ready',
  'failed',
])

export const AIModelSchema = z.object({
  model_id: z.string(),
  display_name: z.string(),
  provider: z.string(),
  runtime: z.literal('ollama'),
  install_ref: z.string(),
  download_size_bytes: z.number().int().nonnegative(),
  min_ram_gb: z.number().int().positive(),
  recommended_ram_gb: z.number().int().positive(),
  supports_json_mode: z.boolean(),
  license: z.string(),
  status: z.string(),
  install_state: AIInstallStateSchema,
  model_state: AIModelStateSchema,
  last_error: z.string().nullable(),
  progress_status: z.string().nullable().default(null),
  progress_completed_bytes: z.number().int().nonnegative().nullable().default(null),
  progress_total_bytes: z.number().int().nonnegative().nullable().default(null),
  progress_percent: z.number().min(0).max(100).nullable().default(null),
})

export const AIModelsResponseSchema = z.object({
  runtime_name: z.literal('ollama'),
  runtime_available: z.boolean(),
  models: z.array(AIModelSchema),
})

export const AIModelStatusResponseSchema = z.object({
  runtime_name: z.literal('ollama'),
  runtime_available: z.boolean(),
  model: AIModelSchema,
})

export const PipelineDraftVariableSchema = z.object({
  name: z.string(),
  description: z.string(),
  default_value: z.string().nullable(),
  required: z.boolean(),
})

export const PipelineDraftStepSchema = z.object({
  id: z.string(),
  label: z.string(),
  command: z.string(),
  description: z.string(),
  uses_variables: z.array(z.string()),
  template_id: z.string().nullable(),
  terminal_type: TerminalTypeSchema,
})

export const PipelineDraftTargetTerminalSchema = z.object({
  type: TerminalTypeSchema,
  connection_hint: z.string().nullable(),
})

export const PipelineDraftSchema = z.object({
  flow_name: z.string(),
  summary: z.string(),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string()),
  variables: z.array(PipelineDraftVariableSchema),
  steps: z.array(PipelineDraftStepSchema),
  target_terminal: PipelineDraftTargetTerminalSchema,
  confidence: z.number().min(0).max(1),
})

export const GeneratePipelineDraftResponseSchema = z.object({
  draft: PipelineDraftSchema,
  warnings: z.array(z.string()),
  install_state: AIInstallStateSchema,
  model_state: AIModelStateSchema,
})

export const SocketEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('snapshot'),
    data: BackendSnapshotSchema,
  }),
  z.object({
    type: z.literal('terminal_created'),
    data: z.object({
      terminal: BackendManualTerminalSchema,
    }),
  }),
  z.object({
    type: z.literal('terminal_updated'),
    data: z.object({
      terminal: BackendManualTerminalSchema,
    }),
  }),
  z.object({
    type: z.literal('terminal_status'),
    data: z.object({
      terminal_id: z.string(),
      status: SessionStatusSchema,
      exit_code: z.number().int().nullable(),
    }),
  }),
  z.object({
    type: z.literal('terminal_line'),
    data: z.object({
      terminal_id: z.string(),
      line: BackendLineSchema,
    }),
  }),
  z.object({
    type: z.literal('terminal_closed'),
    data: z.object({
      terminal_id: z.string(),
    }),
  }),
])

export const RuntimeSocketEventSchema = SocketEventSchema

export type SocketEvent = z.infer<typeof SocketEventSchema>
export type RuntimeSocketEvent = SocketEvent
export type AIModel = z.infer<typeof AIModelSchema>
export type AIModelsResponse = z.infer<typeof AIModelsResponseSchema>
export type AIModelStatusResponse = z.infer<typeof AIModelStatusResponseSchema>
export type PipelineDraft = z.infer<typeof PipelineDraftSchema>
export type GeneratePipelineDraftResponse = z.infer<typeof GeneratePipelineDraftResponseSchema>
