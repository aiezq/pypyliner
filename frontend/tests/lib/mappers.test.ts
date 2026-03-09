import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createId,
  formatTime,
  getErrorMessage,
  toManualTerminal,
  toTerminalLine,
  upsertManualTerminal,
} from '../../src/lib/mappers'
import type {
  BackendLine,
  BackendManualTerminal,
  ManualTerminal,
} from '../../src/types'

const createBackendLine = (overrides: Partial<BackendLine> = {}): BackendLine => ({
  id: 'line_1',
  stream: 'out',
  text: 'hello',
  created_at: '2026-03-01T10:00:00Z',
  ...overrides,
})

const createBackendManualTerminal = (
  overrides: Partial<BackendManualTerminal> = {},
): BackendManualTerminal => ({
  id: 'terminal_1',
  title: 'Terminal #1',
  prompt_user: 'operator',
  prompt_cwd: '~',
  is_sequence: false,
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
  isSequence: false,
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
      .mockReturnValue('uuid-fixed' as never)

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

  it('maps backend line and manual terminal into ui models', () => {
    const line = createBackendLine()
    const terminal = createBackendManualTerminal()

    expect(toTerminalLine(line)).toEqual({
      id: line.id,
      stream: line.stream,
      text: line.text,
      createdAt: line.created_at,
    })

    expect(toManualTerminal(terminal)).toEqual({
      id: terminal.id,
      title: terminal.title,
      titleDraft: terminal.title,
      promptUser: terminal.prompt_user,
      promptCwd: terminal.prompt_cwd,
      isSequence: terminal.is_sequence,
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
    expect(next[0]?.draftCommand).toBe('')
  })
})
