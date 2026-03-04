import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useBackendStatusMessage } from '../../src/hooks/useBackendStatusMessage'

describe('useBackendStatusMessage', () => {
  it('prefers backendError over query messages', () => {
    const { result } = renderHook(() =>
      useBackendStatusMessage({
        backendError: 'Backend hard error',
        commandPacksQuery: {
          isError: true,
          error: new Error('packs error'),
        },
        pipelineFlowsQuery: {
          isError: false,
          error: null,
          data: { errors: ['flows error'] },
        },
      }),
    )

    expect(result.current).toBe('Backend hard error')
  })

  it('uses command packs query error when backendError is null', () => {
    const { result } = renderHook(() =>
      useBackendStatusMessage({
        backendError: null,
        commandPacksQuery: {
          isError: true,
          error: new Error('packs error'),
        },
        pipelineFlowsQuery: {
          isError: false,
          error: null,
          data: { errors: ['flows error'] },
        },
      }),
    )

    expect(result.current).toBe('packs error')
  })

  it('falls back to query data.errors and returns null when no errors', () => {
    const { result, rerender } = renderHook(
      ({
        commandErrors,
        flowErrors,
      }: {
        commandErrors?: string[]
        flowErrors?: string[]
      }) =>
        useBackendStatusMessage({
          backendError: null,
          commandPacksQuery: {
            isError: false,
            error: null,
            data: { errors: commandErrors },
          },
          pipelineFlowsQuery: {
            isError: false,
            error: null,
            data: { errors: flowErrors },
          },
        }),
      {
        initialProps: {
          commandErrors: ['packs one', 'packs two'],
          flowErrors: ['flow one'],
        },
      },
    )

    expect(result.current).toBe('packs one | packs two')

    rerender({
      commandErrors: [],
      flowErrors: ['flow one', 'flow two'],
    })
    expect(result.current).toBe('flow one | flow two')

    rerender({
      commandErrors: [],
      flowErrors: [],
    })
    expect(result.current).toBeNull()
  })
})
