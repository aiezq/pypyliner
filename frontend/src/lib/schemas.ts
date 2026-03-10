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
])

export const RuntimeSocketEventSchema = SocketEventSchema

export type SocketEvent = z.infer<typeof SocketEventSchema>
export type RuntimeSocketEvent = SocketEvent
export type AIModel = z.infer<typeof AIModelSchema>
export type AIModelsResponse = z.infer<typeof AIModelsResponseSchema>
export type AIModelStatusResponse = z.infer<typeof AIModelStatusResponseSchema>
export type DocumentationClarificationQuestion = z.infer<typeof DocumentationClarificationQuestionSchema>
export type PipelineDraft = z.infer<typeof PipelineDraftSchema>
export type AnalyzeDocumentationResponse = z.infer<typeof AnalyzeDocumentationResponseSchema>
export type GeneratePipelineDraftResponse = z.infer<typeof GeneratePipelineDraftResponseSchema>
