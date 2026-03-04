import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '../../lib/api'
import { getErrorMessage, toRunState } from '../../lib/mappers'
import { BackendHistorySchema } from '../../lib/schemas'
import type { BackendHistory } from '../../types'

const HISTORY_QUERY_KEY = ['history'] as const

const fetchHistory = async (): Promise<BackendHistory> => {
  const payload = await apiRequest<unknown>('/api/history')
  return BackendHistorySchema.parse(payload)
}

interface UseHistoryFeatureOptions {
  isActive: boolean
}

export const useHistoryFeature = ({ isActive }: UseHistoryFeatureOptions) => {
  const historyQuery = useQuery({
    queryKey: HISTORY_QUERY_KEY,
    queryFn: fetchHistory,
    enabled: isActive,
    refetchOnWindowFocus: false,
    refetchInterval: isActive ? 2500 : false,
  })

  return {
    runs: (historyQuery.data?.runs ?? []).map(toRunState),
    terminalHistory: historyQuery.data?.manual_terminal_history ?? [],
    isLoading: historyQuery.isLoading || historyQuery.isFetching,
    errorMessage: historyQuery.isError ? getErrorMessage(historyQuery.error) : null,
  }
}
