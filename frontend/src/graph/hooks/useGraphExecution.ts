import { useCallback } from 'react'

interface UseGraphExecutionReturn {
  executeTerminalNode: (_terminalNodeId: string, _isSequence?: boolean) => Promise<void>
}

export function useGraphExecution(): UseGraphExecutionReturn {
  const executeTerminalNode = useCallback(async (): Promise<void> => undefined, [])

  return { executeTerminalNode }
}
