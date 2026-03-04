import { z } from 'zod'

export const StreamTypeSchema = z.enum(['out', 'err', 'meta'])
export const SessionStatusSchema = z.enum([
  'idle',
  'pending',
  'running',
  'success',
  'failed',
  'stopped',
])
export const RunStatusSchema = z.enum(['running', 'success', 'failed', 'stopped'])

export const CommandTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  command: z.string(),
  description: z.string(),
})

export const BackendLineSchema = z.object({
  id: z.string(),
  stream: StreamTypeSchema,
  text: z.string(),
  created_at: z.string(),
})

export const BackendSessionSchema = z.object({
  id: z.string(),
  step_id: z.string(),
  title: z.string(),
  command: z.string(),
  status: SessionStatusSchema,
  exit_code: z.number().int().nullable(),
  lines: z.array(BackendLineSchema),
})

export const BackendRunSchema = z.object({
  id: z.string(),
  pipeline_name: z.string(),
  status: RunStatusSchema,
  started_at: z.string(),
  finished_at: z.string().nullable(),
  log_file_path: z.string(),
  sessions: z.array(BackendSessionSchema),
})

export const BackendManualTerminalSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt_user: z.string(),
  prompt_cwd: z.string(),
  status: SessionStatusSchema,
  exit_code: z.number().int().nullable(),
  draft_command: z.string(),
  lines: z.array(BackendLineSchema),
})

export const BackendSnapshotSchema = z.object({
  runs: z.array(BackendRunSchema),
  manual_terminals: z.array(BackendManualTerminalSchema),
})

export const BackendCommandPackSchema = z.object({
  pack_id: z.string(),
  pack_name: z.string(),
  description: z.string(),
  file_name: z.string(),
  templates: z.array(CommandTemplateSchema),
})

export const BackendCommandPackListSchema = z.object({
  packs: z.array(BackendCommandPackSchema),
  templates: z.array(CommandTemplateSchema),
  errors: z.array(z.string()),
})

export const BackendCommandPackImportResultSchema = z.object({
  imported: z.boolean(),
  pack_id: z.string(),
  pack_name: z.string(),
  file_name: z.string(),
  commands_count: z.number().int(),
})

export const BackendPipelineFlowStepSchema = z.object({
  type: z.enum(['template', 'custom']),
  label: z.string(),
  command: z.string(),
})

export const BackendPipelineFlowSchema = z.object({
  id: z.string(),
  flow_name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  file_name: z.string(),
  steps: z.array(BackendPipelineFlowStepSchema),
})

export const BackendPipelineFlowListSchema = z.object({
  flows: z.array(BackendPipelineFlowSchema),
  errors: z.array(z.string()),
})

export const BackendManualTerminalHistorySchema = z.object({
  terminal_id: z.string(),
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  log_file_path: z.string(),
  commands: z.array(z.string()),
})

export const BackendHistorySchema = z.object({
  runs: z.array(BackendRunSchema),
  manual_terminal_history: z.array(BackendManualTerminalHistorySchema),
})

export const SocketEventSchema = z.object({
  type: z.string(),
  data: z.unknown(),
})

const NonEmptyTrimmedStringSchema = z
  .string()
  .trim()
  .min(1, 'Value cannot be empty')

export const TemplateEditableValueSchema = NonEmptyTrimmedStringSchema

export const TemplateFormSchema = z.object({
  name: z.string().trim().min(1, 'Template name is required').max(120, 'Max 120 chars'),
  command: z.string().trim().min(1, 'Command is required').max(2000, 'Max 2000 chars'),
  description: z.string().trim().max(300, 'Max 300 chars'),
})

export const CustomStepFormSchema = z.object({
  label: z.string().trim().max(120, 'Max 120 chars'),
  command: z.string().trim().min(1, 'Command is required').max(4000, 'Max 4000 chars'),
})

export const CommandPackImportFormSchema = z.object({
  fileName: z.string().trim().max(255, 'Max 255 chars'),
  content: NonEmptyTrimmedStringSchema.refine((value) => {
    try {
      JSON.parse(value)
      return true
    } catch {
      return false
    }
  }, 'Invalid JSON content'),
})
