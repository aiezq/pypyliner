import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const useQueryMock = vi.hoisted(() => vi.fn())
const apiRequestMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-query', () => ({
  useQuery: useQueryMock,
}))

vi.mock('../../../src/lib/api', () => ({
  apiRequest: apiRequestMock,
}))

import { useHistoryFeature } from '../../../src/features/history/useHistoryFeature'

describe('useHistoryFeature', () => {
  it('maps successful query payload into ui shape', () => {
    useQueryMock.mockReturnValue({
      data: {
        runs: [
          {
            id: 'run_1',
            pipeline_name: 'Main flow',
            status: 'success',
            started_at: '2026-03-01T10:00:00Z',
            finished_at: '2026-03-01T10:01:00Z',
            log_file_path: '/tmp/run.log',
            sessions: [],
          },
        ],
        manual_terminal_history: [
          {
            terminal_id: 'terminal_1',
            title: 'Terminal #1',
            created_at: '2026-03-01T09:00:00Z',
            updated_at: '2026-03-01T09:10:00Z',
            closed_at: null,
            log_file_path: '/tmp/terminal.log',
            commands: ['pwd'],
          },
        ],
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
    })

    const { result } = renderHook(() => useHistoryFeature({ isActive: true }))

    expect(result.current.runs).toHaveLength(1)
    expect(result.current.runs[0]?.pipelineName).toBe('Main flow')
    expect(result.current.terminalHistory).toHaveLength(1)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.errorMessage).toBeNull()

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        refetchInterval: 2500,
      }),
    )
  })

  it('executes queryFn and parses history payload', async () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
    })
    apiRequestMock.mockResolvedValue({
      runs: [],
      manual_terminal_history: [],
    })

    renderHook(() => useHistoryFeature({ isActive: true }))
    const queryOptions = useQueryMock.mock.calls.at(-1)?.[0] as {
      queryFn: () => Promise<unknown>
    }
    const payload = await queryOptions.queryFn()

    expect(apiRequestMock).toHaveBeenCalledWith('/api/history')
    expect(payload).toEqual({
      runs: [],
      manual_terminal_history: [],
    })
  })

  it('reports loading and query errors', () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      isError: true,
      error: new Error('history request failed'),
    })

    const { result } = renderHook(() => useHistoryFeature({ isActive: false }))

    expect(result.current.runs).toEqual([])
    expect(result.current.terminalHistory).toEqual([])
    expect(result.current.isLoading).toBe(true)
    expect(result.current.errorMessage).toBe('history request failed')

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        refetchInterval: false,
      }),
    )
  })
})
