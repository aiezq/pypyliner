import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createId,
  formatTime,
  getErrorMessage,
  isPipelineOpenTerminalCommand,
  pickLatestRun,
  toManualTerminal,
  toRunState,
  toTerminalLine,
  toTerminalSession,
  upsertManualTerminal,
} from '../../src/lib/mappers'
import type {
  BackendLine,
  BackendManualTerminal,
  BackendRun,
  BackendSession,
  ManualTerminal,
} from '../../src/types'

const createBackendLine = (overrides: Partial<BackendLine> = {}): BackendLine => ({
  id: 'line_1',
  stream: 'out',
  text: 'hello',
  created_at: '2026-03-01T10:00:00Z',
  ...overrides,
})

const createBackendSession = (
  overrides: Partial<BackendSession> = {},
): BackendSession => ({
  id: 'session_1',
  step_id: 'step_1',
  title: 'Step title',
  command: 'echo hello',
  status: 'success',
  exit_code: 0,
  lines: [createBackendLine()],
  ...overrides,
})

const createBackendRun = (overrides: Partial<BackendRun> = {}): BackendRun => ({
  id: 'run_1',
  pipeline_name: 'Main flow',
  status: 'success',
  started_at: '2026-03-01T10:00:00Z',
  finished_at: '2026-03-01T10:02:00Z',
  log_file_path: '/tmp/run_1.log',
  sessions: [createBackendSession()],
  ...overrides,
})

const createBackendManualTerminal = (
  overrides: Partial<BackendManualTerminal> = {},
): BackendManualTerminal => ({
  id: 'terminal_1',
  title: 'Terminal #1',
  prompt_user: 'operator',
  prompt_cwd: '~',
  status: 'running',
  exit_code: null,
  draft_command: 'ls',
  lines: [createBackendLine()],
  ...overrides,
})

const createManualTerminal = (
  overrides: Partial<ManualTerminal> = {},
): ManualTerminal => ({
  id: 'terminal_1',
  title: 'Terminal #1',
  titleDraft: 'Terminal #1',
  promptUser: 'operator',
  promptCwd: '~',
  status: 'running',
  exitCode: null,
  draftCommand: '',
  lines: [],
  ...overrides,
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('mappers', () => {
  it('createId uses crypto.randomUUID when available', () => {
    const randomUuidSpy = vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('uuid-fixed')

    const result = createId('step')

    expect(result).toMatch(/^step_uuid-fixed_[a-z0-9]+$/)
    expect(randomUuidSpy).toHaveBeenCalledTimes(1)
  })

  it('createId falls back when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', undefined)
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1234567890)
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.123456789)

    const result = createId('terminal')

    expect(result).toMatch(/^terminal_[a-z0-9]+_[a-z0-9]+_[a-z0-9]+$/)
    expect(dateNowSpy).toHaveBeenCalledTimes(1)
    expect(randomSpy).toHaveBeenCalledTimes(1)
  })

  it('formatTime returns fallback text when value is null', () => {
    expect(formatTime(null)).toBe('not finished')
  })

  it('formatTime converts iso value to locale time string', () => {
    const localeSpy = vi
      .spyOn(Date.prototype, 'toLocaleTimeString')
      .mockReturnValue('10:00:00')

    expect(formatTime('2026-03-01T10:00:00Z')).toBe('10:00:00')
    expect(localeSpy).toHaveBeenCalledTimes(1)
  })

  it('getErrorMessage handles Error and unknown values', () => {
    expect(getErrorMessage(new Error('backend failed'))).toBe('backend failed')
    expect(getErrorMessage('oops')).toBe('Unknown backend error')
  })

  it('maps backend line/session/run/manual terminal into ui models', () => {
    const line = createBackendLine()
    const session = createBackendSession()
    const run = createBackendRun()
    const terminal = createBackendManualTerminal()

    expect(toTerminalLine(line)).toEqual({
      id: line.id,
      stream: line.stream,
      text: line.text,
      createdAt: line.created_at,
    })

    expect(toTerminalSession(session)).toEqual({
      id: session.id,
      stepId: session.step_id,
      title: session.title,
      command: session.command,
      status: session.status,
      exitCode: session.exit_code,
      lines: [
        {
          id: line.id,
          stream: line.stream,
          text: line.text,
          createdAt: line.created_at,
        },
      ],
    })

    expect(toRunState(run)).toEqual({
      id: run.id,
      pipelineName: run.pipeline_name,
      status: run.status,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      logFilePath: run.log_file_path,
      sessions: [
        {
          id: session.id,
          stepId: session.step_id,
          title: session.title,
          command: session.command,
          status: session.status,
          exitCode: session.exit_code,
          lines: [
            {
              id: line.id,
              stream: line.stream,
              text: line.text,
              createdAt: line.created_at,
            },
          ],
        },
      ],
    })

    expect(toManualTerminal(terminal)).toEqual({
      id: terminal.id,
      title: terminal.title,
      titleDraft: terminal.title,
      promptUser: terminal.prompt_user,
      promptCwd: terminal.prompt_cwd,
      status: terminal.status,
      exitCode: terminal.exit_code,
      draftCommand: terminal.draft_command,
      lines: [
        {
          id: line.id,
          stream: line.stream,
          text: line.text,
          createdAt: line.created_at,
        },
      ],
    })
  })

  it('pickLatestRun returns null for empty list and latest run otherwise', () => {
    expect(pickLatestRun([])).toBeNull()

    const oldRun = createBackendRun({
      id: 'run_old',
      started_at: '2026-03-01T10:00:00Z',
    })
    const latestRun = createBackendRun({
      id: 'run_latest',
      started_at: '2026-03-01T11:00:00Z',
    })

    expect(pickLatestRun([latestRun, oldRun])?.id).toBe('run_latest')
    expect(pickLatestRun([oldRun, latestRun])?.id).toBe('run_latest')
  })

  it('matches pipeline open-terminal command for supported command forms', () => {
    expect(isPipelineOpenTerminalCommand('operator:create_terminal')).toBe(true)
    expect(isPipelineOpenTerminalCommand(' operator.open_terminal ')).toBe(true)
    expect(isPipelineOpenTerminalCommand('open_terminal')).toBe(true)
    expect(
      isPipelineOpenTerminalCommand('bash -lc "echo Terminal session started"'),
    ).toBe(true)
    expect(isPipelineOpenTerminalCommand('')).toBe(false)
    expect(isPipelineOpenTerminalCommand('echo hello')).toBe(false)
  })

  it('upsertManualTerminal appends when terminal does not exist', () => {
    const existing = createManualTerminal({ id: 'terminal_existing' })
    const incoming = createManualTerminal({ id: 'terminal_new' })

    const next = upsertManualTerminal([existing], incoming)
    expect(next).toEqual([existing, incoming])
  })

  it('upsertManualTerminal preserves draft title and command during optimistic updates', () => {
    const existing = createManualTerminal({
      id: 'terminal_1',
      title: 'Terminal #1',
      titleDraft: 'Renaming terminal...',
      draftCommand: 'ls -la',
    })
    const incoming = createManualTerminal({
      id: 'terminal_1',
      title: 'Terminal #1',
      titleDraft: 'Terminal #1',
      draftCommand: '',
    })

    const next = upsertManualTerminal([existing], incoming)
    expect(next).toHaveLength(1)
    expect(next[0]?.titleDraft).toBe('Renaming terminal...')
    expect(next[0]?.draftCommand).toBe('ls -la')
  })

  it('upsertManualTerminal uses incoming values when no optimistic local values exist', () => {
    const existing = createManualTerminal({
      id: 'terminal_1',
      title: 'Terminal #1',
      titleDraft: 'Terminal #1',
      draftCommand: '',
    })
    const incoming = createManualTerminal({
      id: 'terminal_1',
      title: 'Terminal renamed',
      titleDraft: 'Terminal renamed',
      draftCommand: 'pwd',
    })

    const next = upsertManualTerminal([existing], incoming)
    expect(next[0]?.titleDraft).toBe('Terminal renamed')
    expect(next[0]?.draftCommand).toBe('pwd')
  })
})
