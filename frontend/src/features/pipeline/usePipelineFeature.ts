import { useMemo, type Dispatch, type SetStateAction } from 'react'
import { PIPELINE_OPEN_TERMINAL_COMMAND } from '../../data/templates'
import { usePipelineFlowController } from '../../hooks/usePipelineFlowController'
import { useRunController } from '../../hooks/useRunController'
import { useWorkbenchCatalog } from '../../hooks/useWorkbenchCatalog'
import { createId } from '../../lib/mappers'

interface UsePipelineFeatureOptions {
  pipelineName: string
  setPipelineName: (name: string) => void
  setBackendError: Dispatch<SetStateAction<string | null>>
  getSocketEventContext: Parameters<typeof useRunController>[0]['getSocketEventContext']
}

export const usePipelineFeature = ({
  pipelineName,
  setPipelineName,
  setBackendError,
  getSocketEventContext,
}: UsePipelineFeatureOptions) => {
  const defaultPipelineSteps = useMemo(
    () => [
      {
        id: createId('step'),
        type: 'template' as const,
        label: 'Open terminal shell',
        command: PIPELINE_OPEN_TERMINAL_COMMAND,
      },
    ],
    [],
  )

  const catalog = useWorkbenchCatalog()

  const pipelineFlow = usePipelineFlowController({
    initialSteps: defaultPipelineSteps,
    pipelineName,
    setPipelineName,
    savedPipelineFlows: catalog.savedPipelineFlows,
    setBackendError,
    createTemplateRequest: catalog.createTemplate,
    updateTemplateRequest: catalog.updateTemplate,
    moveTemplateToPackRequest: catalog.moveTemplateToPack,
    deleteTemplateRequest: catalog.deleteTemplate,
    importJsonPackRequest: catalog.importJsonPack,
    createPipelineFlowRequest: catalog.createPipelineFlow,
    updatePipelineFlowRequest: catalog.updatePipelineFlow,
    deletePipelineFlowRequest: catalog.deletePipelineFlow,
  })

  const runtime = useRunController({
    pipelineName,
    steps: pipelineFlow.steps,
    setBackendError,
    getSocketEventContext,
    reloadCommandPacks: catalog.reloadCommandPacks,
    reloadPipelineFlows: catalog.reloadPipelineFlows,
  })

  return {
    catalog,
    pipelineFlow,
    runtime,
  }
}
