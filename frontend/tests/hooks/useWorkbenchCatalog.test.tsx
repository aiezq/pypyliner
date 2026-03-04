import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useWorkbenchCatalog } from '../../src/hooks/useWorkbenchCatalog'

const apiRequestMock = vi.hoisted(() => vi.fn())

vi.mock('../../src/lib/api', () => ({
  apiRequest: apiRequestMock,
}))

const commandTemplate = {
  id: 'core:list',
  name: 'List',
  command: 'ls -la',
  description: 'List files',
}

const withQueryClient = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  }
}

describe('useWorkbenchCatalog', () => {
  it('loads catalog data, derives pack options and supports all mutation handlers', async () => {
    apiRequestMock.mockImplementation(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'

      if (path === '/api/command-packs' && method === 'GET') {
        return {
          packs: [
            {
              pack_id: 'core',
              pack_name: 'Core Pack',
              description: 'Core',
              file_name: 'core.json',
              templates: [commandTemplate],
            },
            {
              pack_id: 'core',
              pack_name: 'Core Pack Duplicate',
              description: 'Core',
              file_name: 'core2.json',
              templates: [],
            },
          ],
          templates: [commandTemplate],
          errors: [],
        }
      }

      if (path === '/api/pipeline-flows' && method === 'GET') {
        return {
          flows: [
            {
              id: 'flow_1',
              flow_name: 'Main flow',
              created_at: '2026-03-01T10:00:00Z',
              updated_at: '2026-03-01T10:00:00Z',
              file_name: 'flow_1.json',
              steps: [{ type: 'template', label: 'List', command: 'ls -la' }],
            },
          ],
          errors: [],
        }
      }

      if (path === '/api/command-packs/templates' && method === 'POST') {
        return { ...commandTemplate, id: 'core:new' }
      }
      if (path === '/api/command-packs/templates/core%3Alist' && method === 'PATCH') {
        return { ...commandTemplate, name: 'List files' }
      }
      if (
        path === '/api/command-packs/templates/core%3Alist/move' &&
        method === 'POST'
      ) {
        return { ...commandTemplate, id: 'ops:list' }
      }
      if (path === '/api/command-packs/templates/core%3Alist' && method === 'DELETE') {
        return { deleted: true }
      }
      if (path === '/api/command-packs/import' && method === 'POST') {
        return {
          imported: true,
          pack_id: 'ops',
          pack_name: 'Ops Pack',
          file_name: 'ops.json',
          commands_count: 1,
        }
      }
      if (path === '/api/pipeline-flows' && method === 'POST') {
        return {
          id: 'flow_new',
          flow_name: 'New flow',
          created_at: '2026-03-01T10:00:00Z',
          updated_at: '2026-03-01T10:00:00Z',
          file_name: 'flow_new.json',
          steps: [],
        }
      }
      if (path === '/api/pipeline-flows/flow_1' && method === 'PUT') {
        return {
          id: 'flow_1',
          flow_name: 'Updated flow',
          created_at: '2026-03-01T10:00:00Z',
          updated_at: '2026-03-01T11:00:00Z',
          file_name: 'flow_1.json',
          steps: [],
        }
      }
      if (path === '/api/pipeline-flows/flow_1' && method === 'DELETE') {
        return { deleted: true, flow_id: 'flow_1' }
      }

      throw new Error(`Unexpected request: ${method} ${path}`)
    })

    const { wrapper } = withQueryClient()
    const { result } = renderHook(() => useWorkbenchCatalog(), { wrapper })

    await waitFor(() => {
      expect(result.current.commandPacksQuery.data?.packs.length).toBe(2)
      expect(result.current.pipelineFlowsQuery.data?.flows.length).toBe(1)
    })

    expect(result.current.templates).toHaveLength(1)
    expect(result.current.templatePacksCount).toBe(2)
    expect(result.current.commandPackOptions).toEqual([
      { id: 'core', name: 'Core Pack' },
      { id: 'flow_drafts', name: 'Flow Drafts' },
    ])
    expect(result.current.commandPackNamesById.flow_drafts).toBe('Flow Drafts')
    expect(result.current.savedPipelineFlowOptions).toEqual([
      { id: 'flow_1', name: 'Main flow' },
    ])

    await act(async () => {
      await result.current.createTemplate({
        name: 'Create',
        command: 'echo create',
        description: '',
        pack_id: 'core',
      })
      await result.current.updateTemplate({
        templateId: 'core:list',
        payload: { name: 'List files' },
      })
      await result.current.moveTemplateToPack({
        templateId: 'core:list',
        targetPackId: 'ops',
      })
      await result.current.deleteTemplate('core:list')
      await result.current.importJsonPack({ content: '{"ok":true}', fileName: 'ops.json' })
      await result.current.createPipelineFlow({ flow_name: 'New flow', steps: [] })
      await result.current.updatePipelineFlow({
        flowId: 'flow_1',
        payload: { flow_name: 'Updated flow', steps: [] },
      })
      await result.current.deletePipelineFlow('flow_1')
      await result.current.reloadCommandPacks()
      await result.current.reloadPipelineFlows()
    })

    expect(apiRequestMock).toHaveBeenCalledWith('/api/command-packs/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Create',
        command: 'echo create',
        description: '',
        pack_id: 'core',
      }),
    })
    expect(apiRequestMock).toHaveBeenCalledWith('/api/command-packs/templates/core%3Alist', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'List files' }),
    })
    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/command-packs/templates/core%3Alist/move',
      {
        method: 'POST',
        body: JSON.stringify({ target_pack_id: 'ops' }),
      },
    )
    expect(apiRequestMock).toHaveBeenCalledWith('/api/command-packs/templates/core%3Alist', {
      method: 'DELETE',
    })
    expect(apiRequestMock).toHaveBeenCalledWith('/api/command-packs/import', {
      method: 'POST',
      body: JSON.stringify({ content: '{"ok":true}', file_name: 'ops.json' }),
    })
    expect(apiRequestMock).toHaveBeenCalledWith('/api/pipeline-flows', {
      method: 'POST',
      body: JSON.stringify({ flow_name: 'New flow', steps: [] }),
    })
    expect(apiRequestMock).toHaveBeenCalledWith('/api/pipeline-flows/flow_1', {
      method: 'PUT',
      body: JSON.stringify({ flow_name: 'Updated flow', steps: [] }),
    })
    expect(apiRequestMock).toHaveBeenCalledWith('/api/pipeline-flows/flow_1', {
      method: 'DELETE',
    })
  })
})
