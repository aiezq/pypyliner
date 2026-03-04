import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { apiRequest } from '../../src/lib/api'

describe('apiRequest', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('adds json content type when request has body and parses success payload', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => ({ ok: true })),
    })

    const payload = await apiRequest<{ ok: boolean }>('/api/test', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
    })

    expect(payload).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = request.headers as Headers
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('forwards url and request init for requests without body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => ({ ok: true })),
    })

    await apiRequest('/api/test', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/test'),
      expect.objectContaining({
        method: 'GET',
      }),
    )
  })

  it('returns undefined for 204 responses', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      json: vi.fn(),
    })

    const result = await apiRequest<void>('/api/no-content')
    expect(result).toBeUndefined()
  })

  it('uses json detail from error payload when available', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: vi.fn(async () => ({ detail: 'Custom detail' })),
      text: vi.fn(async () => ''),
    })

    await expect(apiRequest('/api/error')).rejects.toThrow('Custom detail')
  })

  it('falls back to text error when json parsing fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: vi.fn(async () => {
        throw new Error('invalid json')
      }),
      text: vi.fn(async () => 'Text error body'),
    })

    await expect(apiRequest('/api/error')).rejects.toThrow('Text error body')
  })

  it('falls back to status + statusText when no json detail/text', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: vi.fn(async () => {
        throw new Error('invalid json')
      }),
      text: vi.fn(async () => ''),
    })

    await expect(apiRequest('/api/error')).rejects.toThrow('404 Not Found')
  })
})
