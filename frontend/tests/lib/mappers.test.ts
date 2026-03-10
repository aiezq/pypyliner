import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createId,
  formatTime,
  getErrorMessage,
} from '../../src/lib/mappers'

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
})
