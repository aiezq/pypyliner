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
