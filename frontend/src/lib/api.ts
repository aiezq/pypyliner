const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
  /\/+$/,
  '',
)

const fallbackApiBaseUrl = import.meta.env.DEV ? '' : 'http://127.0.0.1:8000'

export const API_BASE_URL = configuredApiBaseUrl ?? fallbackApiBaseUrl

const joinUrlPath = (basePathname: string, path: string): string => {
  const normalizedBase = basePathname === '/' ? '' : basePathname.replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}` || '/'
}

export const buildWebSocketUrl = (
  apiBaseUrl: string,
  path: string,
  windowOrigin = window.location.origin,
  windowProtocol = window.location.protocol,
  windowHost = window.location.host,
): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  if (!apiBaseUrl) {
    const protocol = windowProtocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${windowHost}${normalizedPath}`
  }

  const baseUrl = new URL(apiBaseUrl, windowOrigin)
  baseUrl.protocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  baseUrl.pathname = joinUrlPath(baseUrl.pathname, normalizedPath)
  baseUrl.search = ''
  baseUrl.hash = ''
  return baseUrl.toString()
}

export const getWebSocketUrl = (path: string): string => buildWebSocketUrl(API_BASE_URL, path)

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
