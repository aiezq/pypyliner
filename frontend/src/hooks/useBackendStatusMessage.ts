import { useMemo } from 'react'
import { getErrorMessage } from '../lib/mappers'

interface StatusQueryLike {
  isError: boolean
  error: unknown
  data?: {
    errors?: string[]
  }
}

interface UseBackendStatusMessageOptions {
  backendError: string | null
  commandPacksQuery: StatusQueryLike
  pipelineFlowsQuery: StatusQueryLike
}

const getQueryStatusMessage = (query: StatusQueryLike): string | null => {
  if (query.isError) {
    return getErrorMessage(query.error)
  }
  const errors = query.data?.errors
  if (Array.isArray(errors) && errors.length > 0) {
    return errors.join(' | ')
  }
  return null
}

export const useBackendStatusMessage = ({
  backendError,
  commandPacksQuery,
  pipelineFlowsQuery,
}: UseBackendStatusMessageOptions): string | null =>
  useMemo(() => {
    const commandPackStatusMessage = getQueryStatusMessage(commandPacksQuery)
    const pipelineFlowsStatusMessage = getQueryStatusMessage(pipelineFlowsQuery)
    return backendError ?? commandPackStatusMessage ?? pipelineFlowsStatusMessage
  }, [backendError, commandPacksQuery, pipelineFlowsQuery])
