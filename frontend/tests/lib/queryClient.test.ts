import { describe, expect, it } from 'vitest'
import { queryClient } from '../../src/lib/queryClient'

describe('queryClient', () => {
  it('has expected default query and mutation options', () => {
    const defaults = queryClient.getDefaultOptions()

    expect(defaults.queries?.staleTime).toBe(30_000)
    expect(defaults.queries?.retry).toBe(1)
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false)
    expect(defaults.mutations?.retry).toBe(0)
  })
})
