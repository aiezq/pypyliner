let idSequence = 0

export const createId = (prefix: string): string => {
  idSequence += 1
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}_${idSequence.toString(36)}`
  }
  return `${prefix}_${Date.now().toString(36)}_${idSequence.toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`
}

export const formatTime = (iso: string | null): string => {
  if (!iso) {
    return 'not finished'
  }
  return new Date(iso).toLocaleTimeString()
}

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  return 'Unknown backend error'
}
