import { z } from 'zod'

export const StreamTypeSchema = z.enum(['out', 'err', 'meta'])
export const TerminalTypeSchema = z.enum(['local', 'ssh'])
export const SessionStatusSchema = z.enum([
  'idle',
  'starting',
  'pending',
  'running',
  'draining',
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

export const BackendTerminalCommandSchema = z.object({
  id: z.string(),
  node_id: z.string(),
  label: z.string(),
  original_command: z.string(),
  resolved_command: z.string(),
  status: z.enum([
    'pending',
    'running',
    'success',
    'failed',
    'skipped',
    'stopped',
  ]),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  exit_code: z.number().int().nullable(),
})

export const BackendTerminalSchema = z.object({
  id: z.string(),
  terminal_node_id: z.string(),
  sequence_id: z.string().nullable(),
  title: z.string(),
  terminal_type: TerminalTypeSchema,
  ssh_connection_name: z.string().nullable(),
  ssh_host: z.string().nullable(),
  ssh_username: z.string().nullable(),
  status: SessionStatusSchema,
  created_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  exit_code: z.number().int().nullable(),
  current_command_index: z.number().int().nullable(),
  current_command_id: z.string().nullable(),
  shell_pid: z.number().int().nullable(),
  stdin_enabled: z.boolean().default(false),
  queue: z.array(BackendTerminalCommandSchema),
  lines: z.array(BackendLineSchema),
})

export const BackendSequenceJobSchema = z.object({
  terminal_node_id: z.string(),
  terminal_session_id: z.string().nullable(),
  title: z.string(),
  terminal_type: TerminalTypeSchema,
  status: z.string(),
})

export const BackendSequenceSchema = z.object({
  id: z.string(),
  sequence_node_id: z.string(),
  status: z.string(),
  current_terminal_index: z.number().int().nullable(),
  created_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  terminal_jobs: z.array(BackendSequenceJobSchema),
})

export const BackendSnapshotSchema = z.object({
  runs: z.array(
    z.object({
      id: z.string(),
      pipeline_name: z.string(),
      status: z.string(),
      started_at: z.string(),
      finished_at: z.string().nullable(),
      log_file_path: z.string(),
      sessions: z.array(
        z.object({
          id: z.string(),
          step_id: z.string(),
          title: z.string(),
          command: z.string(),
          status: z.string(),
          exit_code: z.number().int().nullable(),
          lines: z.array(BackendLineSchema),
        }),
      ),
    }),
  ),
  terminals: z.array(BackendTerminalSchema).default([]),
  sequences: z.array(BackendSequenceSchema).default([]),
})

export const BackendHistorySchema = z.object({
  runs: BackendSnapshotSchema.shape.runs,
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
  terminal_group: z.string().nullable().optional(),
})

export const PipelineDraftTargetTerminalSchema = z.object({
  type: TerminalTypeSchema,
  connection_hint: z.string().nullable(),
})

export const DocumentationClarificationQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  description: z.string(),
  answer_type: z.enum(['text', 'choice']),
  choices: z.array(z.string()),
  required: z.boolean(),
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

export const AnalyzeDocumentationResponseSchema = z.object({
  questions: z.array(DocumentationClarificationQuestionSchema),
  warnings: z.array(z.string()),
  install_state: AIInstallStateSchema,
  model_state: AIModelStateSchema,
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
      terminal: BackendTerminalSchema,
    }),
  }),
  z.object({
    type: z.literal('terminal_status'),
    data: z.object({
      terminal_session_id: z.string(),
      terminal_node_id: z.string(),
      sequence_id: z.string().nullable(),
      status: SessionStatusSchema,
      current_command_index: z.number().int().nullable(),
      current_command_id: z.string().nullable(),
      exit_code: z.number().int().nullable(),
      started_at: z.string().nullable(),
      finished_at: z.string().nullable(),
      shell_pid: z.number().int().nullable(),
      stdin_enabled: z.boolean().default(false),
    }),
  }),
  z.object({
    type: z.literal('terminal_line'),
    data: z.object({
      terminal_session_id: z.string(),
      line: BackendLineSchema,
    }),
  }),
  z.object({
    type: z.literal('terminal_queue_changed'),
    data: z.object({
      terminal_session_id: z.string(),
      queue: z.array(BackendTerminalCommandSchema),
      current_command_index: z.number().int().nullable(),
    }),
  }),
  z.object({
    type: z.literal('terminal_deleted'),
    data: z.object({
      terminal_session_id: z.string(),
    }),
  }),
  z.object({
    type: z.literal('terminal_command_status'),
    data: z.object({
      terminal_session_id: z.string(),
      command: BackendTerminalCommandSchema,
      current_command_index: z.number().int().nullable(),
    }),
  }),
  z.object({
    type: z.literal('sequence_created'),
    data: z.object({
      sequence: BackendSequenceSchema,
    }),
  }),
  z.object({
    type: z.literal('sequence_status'),
    data: z.object({
      sequence_id: z.string(),
      sequence_node_id: z.string(),
      status: z.string(),
      current_terminal_index: z.number().int().nullable(),
      finished_at: z.string().nullable(),
    }),
  }),
])

export const RuntimeSocketEventSchema = SocketEventSchema

export const TerminalSocketMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('snapshot'),
    data: z.object({
      buffer: z.string(),
      read_only: z.boolean(),
    }),
  }),
  z.object({
    type: z.literal('data'),
    data: z.string(),
  }),
  z.object({
    type: z.literal('mode'),
    data: z.object({
      read_only: z.boolean(),
    }),
  }),
  z.object({
    type: z.literal('reset'),
  }),
])

export type SocketEvent = z.infer<typeof SocketEventSchema>
export type RuntimeSocketEvent = SocketEvent
export type TerminalSocketMessage = z.infer<typeof TerminalSocketMessageSchema>
export type BackendLine = z.infer<typeof BackendLineSchema>
export type BackendTerminal = z.infer<typeof BackendTerminalSchema>
export type BackendTerminalCommand = z.infer<typeof BackendTerminalCommandSchema>
export type BackendSequence = z.infer<typeof BackendSequenceSchema>
export type AIModel = z.infer<typeof AIModelSchema>
export type AIModelsResponse = z.infer<typeof AIModelsResponseSchema>
export type AIModelStatusResponse = z.infer<typeof AIModelStatusResponseSchema>
export type DocumentationClarificationQuestion = z.infer<typeof DocumentationClarificationQuestionSchema>
export type PipelineDraft = z.infer<typeof PipelineDraftSchema>
export type AnalyzeDocumentationResponse = z.infer<typeof AnalyzeDocumentationResponseSchema>
export type GeneratePipelineDraftResponse = z.infer<typeof GeneratePipelineDraftResponseSchema>
