const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
  /\/+$/,
  '',
)

const fallbackApiBaseUrl = import.meta.env.DEV ? '' : 'http://127.0.0.1:8000'

export const API_BASE_URL = configuredApiBaseUrl ?? fallbackApiBaseUrl

const browserOrigin =
  typeof window === 'undefined' ? 'http://127.0.0.1:5173' : window.location.origin

export const WS_EVENTS_URL = API_BASE_URL
  ? `${API_BASE_URL.replace(/^http/, 'ws')}/ws/events`
  : `${browserOrigin.replace(/^http/, 'ws')}/ws/events`

interface ValidationErrorItem {
  loc?: Array<string | number>
  msg?: string
}

interface ApiErrorPayload {
  detail?: string | ValidationErrorItem[] | Record<string, unknown>
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  const hasBody = init?.body !== undefined
  if (hasBody && !headers.has('content-type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  })

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`
    try {
      const errorPayload = (await response.json()) as ApiErrorPayload
      if (typeof errorPayload.detail === 'string') {
        detail = errorPayload.detail
      } else if (Array.isArray(errorPayload.detail)) {
        detail = errorPayload.detail.map((e) => `${e.loc?.join('.')}: ${e.msg}`).join(', ')
      } else if (errorPayload.detail) {
        detail = JSON.stringify(errorPayload.detail)
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
