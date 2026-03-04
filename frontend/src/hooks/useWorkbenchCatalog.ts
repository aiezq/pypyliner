import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '../lib/api'
import {
  BackendCommandPackImportResultSchema,
  BackendCommandPackListSchema,
  BackendPipelineFlowListSchema,
  BackendPipelineFlowSchema,
  CommandTemplateSchema,
} from '../lib/schemas'
import type {
  BackendCommandPackImportResult,
  BackendCommandPackList,
  BackendPipelineFlow,
  BackendPipelineFlowList,
  BackendTemplateCreatePayload,
  BackendTemplateUpdatePayload,
  CommandTemplate,
} from '../types'

const COMMAND_PACKS_QUERY_KEY = ['command-packs'] as const
const PIPELINE_FLOWS_QUERY_KEY = ['pipeline-flows'] as const
const FLOW_DRAFTS_PACK_ID = 'flow_drafts'

const fetchCommandPacks = async (): Promise<BackendCommandPackList> => {
  const payload = await apiRequest<unknown>('/api/command-packs')
  return BackendCommandPackListSchema.parse(payload)
}

const fetchPipelineFlows = async (): Promise<BackendPipelineFlowList> => {
  const payload = await apiRequest<unknown>('/api/pipeline-flows')
  return BackendPipelineFlowListSchema.parse(payload)
}

export interface PipelineFlowPayload {
  flow_name: string
  steps: Array<{ type: 'template' | 'custom'; label: string; command: string }>
}

export const useWorkbenchCatalog = () => {
  const queryClient = useQueryClient()

  const commandPacksQuery = useQuery({
    queryKey: COMMAND_PACKS_QUERY_KEY,
    queryFn: fetchCommandPacks,
    refetchOnWindowFocus: false,
  })

  const pipelineFlowsQuery = useQuery({
    queryKey: PIPELINE_FLOWS_QUERY_KEY,
    queryFn: fetchPipelineFlows,
    refetchOnWindowFocus: false,
  })

  const commandPacks = useMemo(
    () => commandPacksQuery.data?.packs ?? [],
    [commandPacksQuery.data?.packs],
  )
  const templates = useMemo(
    () => commandPacksQuery.data?.templates ?? [],
    [commandPacksQuery.data?.templates],
  )
  const templatePacksCount = commandPacks.length
  const savedPipelineFlows = useMemo(
    () => pipelineFlowsQuery.data?.flows ?? [],
    [pipelineFlowsQuery.data?.flows],
  )

  const commandPackOptions = useMemo(() => {
    const result: Array<{ id: string; name: string }> = []
    const seen = new Set<string>()
    for (const pack of commandPacks) {
      if (seen.has(pack.pack_id)) {
        continue
      }
      seen.add(pack.pack_id)
      result.push({
        id: pack.pack_id,
        name: pack.pack_name,
      })
    }
    if (!seen.has(FLOW_DRAFTS_PACK_ID)) {
      result.push({
        id: FLOW_DRAFTS_PACK_ID,
        name: 'Flow Drafts',
      })
    }
    return result
  }, [commandPacks])

  const commandPackNamesById = useMemo(() => {
    const result: Record<string, string> = {}
    for (const pack of commandPacks) {
      result[pack.pack_id] = pack.pack_name
    }
    if (!result[FLOW_DRAFTS_PACK_ID]) {
      result[FLOW_DRAFTS_PACK_ID] = 'Flow Drafts'
    }
    return result
  }, [commandPacks])

  const savedPipelineFlowOptions = useMemo(
    () =>
      savedPipelineFlows.map((flow) => ({
        id: flow.id,
        name: flow.flow_name,
      })),
    [savedPipelineFlows],
  )

  const createTemplateMutation = useMutation({
    mutationFn: async (payload: BackendTemplateCreatePayload): Promise<CommandTemplate> => {
      const createdTemplate = await apiRequest<unknown>('/api/command-packs/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: payload.name,
          command: payload.command,
          description: payload.description,
          pack_id: payload.pack_id,
        }),
      })
      return CommandTemplateSchema.parse(createdTemplate)
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: COMMAND_PACKS_QUERY_KEY })
    },
  })

  const updateTemplateMutation = useMutation({
    mutationFn: async ({
      templateId,
      payload,
    }: {
      templateId: string
      payload: BackendTemplateUpdatePayload
    }): Promise<CommandTemplate> => {
      const updatedTemplate = await apiRequest<unknown>(
        `/api/command-packs/templates/${encodeURIComponent(templateId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      )
      return CommandTemplateSchema.parse(updatedTemplate)
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: COMMAND_PACKS_QUERY_KEY })
    },
  })

  const moveTemplateMutation = useMutation({
    mutationFn: async ({
      templateId,
      targetPackId,
    }: {
      templateId: string
      targetPackId: string
    }): Promise<CommandTemplate> => {
      const movedTemplate = await apiRequest<unknown>(
        `/api/command-packs/templates/${encodeURIComponent(templateId)}/move`,
        {
          method: 'POST',
          body: JSON.stringify({
            target_pack_id: targetPackId,
          }),
        },
      )
      return CommandTemplateSchema.parse(movedTemplate)
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: COMMAND_PACKS_QUERY_KEY })
    },
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string): Promise<{ deleted: boolean }> =>
      apiRequest<{ deleted: boolean }>(
        `/api/command-packs/templates/${encodeURIComponent(templateId)}`,
        {
          method: 'DELETE',
        },
      ),
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: COMMAND_PACKS_QUERY_KEY })
    },
  })

  const importCommandPackMutation = useMutation({
    mutationFn: async (payload: {
      content: string
      fileName?: string
    }): Promise<BackendCommandPackImportResult> => {
      const importedPack = await apiRequest<unknown>('/api/command-packs/import', {
        method: 'POST',
        body: JSON.stringify({
          content: payload.content,
          file_name: payload.fileName,
        }),
      })
      return BackendCommandPackImportResultSchema.parse(importedPack)
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: COMMAND_PACKS_QUERY_KEY })
    },
  })

  const createPipelineFlowMutation = useMutation({
    mutationFn: async (payload: PipelineFlowPayload): Promise<BackendPipelineFlow> => {
      const createdFlow = await apiRequest<unknown>('/api/pipeline-flows', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      return BackendPipelineFlowSchema.parse(createdFlow)
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: PIPELINE_FLOWS_QUERY_KEY })
    },
  })

  const updatePipelineFlowMutation = useMutation({
    mutationFn: async ({
      flowId,
      payload,
    }: {
      flowId: string
      payload: PipelineFlowPayload
    }): Promise<BackendPipelineFlow> => {
      const updatedFlow = await apiRequest<unknown>(
        `/api/pipeline-flows/${encodeURIComponent(flowId)}`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        },
      )
      return BackendPipelineFlowSchema.parse(updatedFlow)
    },
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: PIPELINE_FLOWS_QUERY_KEY })
    },
  })

  const deletePipelineFlowMutation = useMutation({
    mutationFn: async (
      flowId: string,
    ): Promise<{ deleted: boolean; flow_id: string }> =>
      apiRequest<{ deleted: boolean; flow_id: string }>(
        `/api/pipeline-flows/${encodeURIComponent(flowId)}`,
        {
          method: 'DELETE',
        },
      ),
    onSuccess: async (): Promise<void> => {
      await queryClient.invalidateQueries({ queryKey: PIPELINE_FLOWS_QUERY_KEY })
    },
  })

  const reloadCommandPacks = useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: COMMAND_PACKS_QUERY_KEY,
    })
  }, [queryClient])

  const reloadPipelineFlows = useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: PIPELINE_FLOWS_QUERY_KEY,
    })
  }, [queryClient])

  return {
    commandPacksQuery,
    pipelineFlowsQuery,
    templates,
    templatePacksCount,
    savedPipelineFlows,
    commandPackOptions,
    commandPackNamesById,
    savedPipelineFlowOptions,
    reloadCommandPacks,
    reloadPipelineFlows,
    createTemplate: createTemplateMutation.mutateAsync,
    updateTemplate: updateTemplateMutation.mutateAsync,
    moveTemplateToPack: moveTemplateMutation.mutateAsync,
    deleteTemplate: deleteTemplateMutation.mutateAsync,
    importJsonPack: importCommandPackMutation.mutateAsync,
    createPipelineFlow: createPipelineFlowMutation.mutateAsync,
    updatePipelineFlow: updatePipelineFlowMutation.mutateAsync,
    deletePipelineFlow: deletePipelineFlowMutation.mutateAsync,
    isSavingFlow:
      createPipelineFlowMutation.isPending || updatePipelineFlowMutation.isPending,
    isFlowSettingsMutating:
      updatePipelineFlowMutation.isPending || deletePipelineFlowMutation.isPending,
  }
}
