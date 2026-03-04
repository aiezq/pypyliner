export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ||
  'http://localhost:8000'

export const WS_EVENTS_URL = `${API_BASE_URL.replace(/^http/, 'ws')}/ws/events`

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  const hasBody = init?.body !== undefined
  if (hasBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  })

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`
    try {
      const errorPayload = (await response.json()) as { detail?: string }
      if (typeof errorPayload.detail === 'string') {
        detail = errorPayload.detail
      }
    } catch {
      const text = await response.text()
      if (text) {
        detail = text
      }
    }
    throw new Error(detail)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
