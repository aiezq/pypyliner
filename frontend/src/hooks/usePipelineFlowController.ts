import { useState } from 'react'
import { createId, getErrorMessage } from '../lib/mappers'
import type { PipelineFlowPayload } from './useWorkbenchCatalog'
import type {
  BackendPipelineFlow,
  BackendTemplateCreatePayload,
  BackendTemplateUpdatePayload,
  CommandTemplate,
  PipelineStep,
} from '../types'

const ensureUniquePipelineStepIds = (steps: PipelineStep[]): PipelineStep[] => {
  const seen = new Set<string>()
  let hasCollisions = false

  const normalized = steps.map((step) => {
    let nextId = step.id
    while (!nextId || seen.has(nextId)) {
      nextId = createId('step')
      hasCollisions = true
    }
    seen.add(nextId)
    if (nextId === step.id) {
      return step
    }
    hasCollisions = true
    return {
      ...step,
      id: nextId,
    }
  })

  return hasCollisions ? normalized : steps
}

interface UsePipelineFlowControllerOptions {
  initialSteps: PipelineStep[]
  pipelineName: string
  setPipelineName: (name: string) => void
  savedPipelineFlows: BackendPipelineFlow[]
  setBackendError: (value: string | null) => void
  createTemplateRequest: (
    payload: BackendTemplateCreatePayload,
  ) => Promise<CommandTemplate>
  updateTemplateRequest: (payload: {
    templateId: string
    payload: BackendTemplateUpdatePayload
  }) => Promise<CommandTemplate>
  moveTemplateToPackRequest: (payload: {
    templateId: string
    targetPackId: string
  }) => Promise<CommandTemplate>
  deleteTemplateRequest: (templateId: string) => Promise<{ deleted: boolean }>
  importJsonPackRequest: (payload: {
    content: string
    fileName?: string
  }) => Promise<unknown>
  createPipelineFlowRequest: (
    payload: PipelineFlowPayload,
  ) => Promise<BackendPipelineFlow>
  updatePipelineFlowRequest: (payload: {
    flowId: string
    payload: PipelineFlowPayload
  }) => Promise<BackendPipelineFlow>
  deletePipelineFlowRequest: (
    flowId: string,
  ) => Promise<{ deleted: boolean; flow_id: string }>
}

export const usePipelineFlowController = ({
  initialSteps,
  pipelineName,
  setPipelineName,
  savedPipelineFlows,
  setBackendError,
  createTemplateRequest,
  updateTemplateRequest,
  moveTemplateToPackRequest,
  deleteTemplateRequest,
  importJsonPackRequest,
  createPipelineFlowRequest,
  updatePipelineFlowRequest,
  deletePipelineFlowRequest,
}: UsePipelineFlowControllerOptions) => {
  const [steps, setSteps] = useState<PipelineStep[]>(
    ensureUniquePipelineStepIds(initialSteps),
  )
  const [selectedPipelineFlowId, setSelectedPipelineFlowId] = useState<string | null>(
    null,
  )

  const addStepFromTemplate = (template: CommandTemplate): void => {
    setSteps((prev) =>
      ensureUniquePipelineStepIds([
        ...prev,
        {
          id: createId('step'),
          type: 'template',
          label: template.name,
          command: template.command,
        },
      ]),
    )
  }

  const createEmptyStep = (): void => {
    setSteps((prev) =>
      ensureUniquePipelineStepIds([
        ...prev,
        {
          id: createId('step'),
          type: 'custom',
          label: 'New step',
          command: '',
        },
      ]),
    )
  }

  const updateStep = (
    stepId: string,
    payload: { label?: string; command?: string },
  ): void => {
    if (payload.label === undefined && payload.command === undefined) {
      return
    }
    setSteps((prev) =>
      prev.map((step) => {
        if (step.id !== stepId) {
          return step
        }
        return {
          ...step,
          label: payload.label ?? step.label,
          command: payload.command ?? step.command,
        }
      }),
    )
  }

  const reorderStepByIndex = (fromIndex: number, toIndex: number): void => {
    if (fromIndex === toIndex) {
      return
    }

    setSteps((prev) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length
      ) {
        return prev
      }
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  const removeStep = (stepId: string): void => {
    setSteps((prev) => prev.filter((step) => step.id !== stepId))
  }

  const clearSteps = (): void => {
    setSteps([])
  }

  const createTemplate = async (
    payload: BackendTemplateCreatePayload,
  ): Promise<void> => {
    try {
      await createTemplateRequest(payload)
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
      throw error
    }
  }

  const updateTemplate = async (
    templateId: string,
    payload: BackendTemplateUpdatePayload,
  ): Promise<void> => {
    try {
      await updateTemplateRequest({ templateId, payload })
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
      throw error
    }
  }

  const moveTemplateToPack = async (
    templateId: string,
    targetPackId: string,
  ): Promise<void> => {
    try {
      await moveTemplateToPackRequest({ templateId, targetPackId })
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
      throw error
    }
  }

  const deleteTemplate = async (templateId: string): Promise<void> => {
    try {
      await deleteTemplateRequest(templateId)
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
      throw error
    }
  }

  const importJsonPack = async (payload: {
    content: string
    fileName?: string
  }): Promise<void> => {
    try {
      await importJsonPackRequest(payload)
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
      throw error
    }
  }

  const saveStepToDock = async (
    stepId: string,
    targetPackId: string,
  ): Promise<void> => {
    const step = steps.find((item) => item.id === stepId)
    if (!step) {
      throw new Error('Step not found')
    }

    const label = step.label.trim()
    const command = step.command.trim()
    if (!label) {
      throw new Error('Step name cannot be empty')
    }
    if (!command) {
      throw new Error('Step command cannot be empty')
    }

    await createTemplate({
      name: label,
      command,
      description: 'Saved from Pipeline Flow',
      pack_id: targetPackId.trim(),
    })
  }

  const makePipelineFlowPayload = (): PipelineFlowPayload => ({
    flow_name: pipelineName.trim() || 'Operator pipeline',
    steps: steps.map((step) => ({
      type: step.type,
      label: step.label,
      command: step.command,
    })),
  })

  const applySavedPipelineFlow = (flow: BackendPipelineFlow): void => {
    const nextSteps = ensureUniquePipelineStepIds(
      flow.steps.map((step) => ({
        id: createId('step'),
        type: step.type,
        label: step.label,
        command: step.command,
      })),
    )
    setSteps(nextSteps)
    setPipelineName(flow.flow_name)
    setSelectedPipelineFlowId(flow.id)
  }

  const switchPipelineFlow = (flowId: string | null): void => {
    if (!flowId) {
      setSelectedPipelineFlowId(null)
      return
    }
    const targetFlow = savedPipelineFlows.find((flow) => flow.id === flowId)
    if (!targetFlow) {
      setBackendError(`Pipeline flow '${flowId}' not found`)
      return
    }
    applySavedPipelineFlow(targetFlow)
    setBackendError(null)
  }

  const effectiveSelectedPipelineFlowId =
    selectedPipelineFlowId &&
    savedPipelineFlows.some((flow) => flow.id === selectedPipelineFlowId)
      ? selectedPipelineFlowId
      : null

  const savePipelineFlow = async (): Promise<void> => {
    const payload = makePipelineFlowPayload()
    try {
      if (effectiveSelectedPipelineFlowId) {
        const updated = await updatePipelineFlowRequest({
          flowId: effectiveSelectedPipelineFlowId,
          payload,
        })
        setSelectedPipelineFlowId(updated.id)
      } else {
        const created = await createPipelineFlowRequest(payload)
        setSelectedPipelineFlowId(created.id)
      }
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
      throw error
    }
  }

  const savePipelineFlowAsNew = async (): Promise<void> => {
    const payload = makePipelineFlowPayload()
    try {
      const created = await createPipelineFlowRequest(payload)
      setSelectedPipelineFlowId(created.id)
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
      throw error
    }
  }

  const renamePipelineFlow = async (
    flowId: string,
    nextName: string,
  ): Promise<void> => {
    const sourceFlow = savedPipelineFlows.find((flow) => flow.id === flowId)
    if (!sourceFlow) {
      throw new Error(`Pipeline flow '${flowId}' not found`)
    }

    const payload: PipelineFlowPayload = {
      flow_name: nextName,
      steps: sourceFlow.steps.map((step) => ({
        type: step.type,
        label: step.label,
        command: step.command,
      })),
    }

    try {
      const updated = await updatePipelineFlowRequest({
        flowId,
        payload,
      })
      if (effectiveSelectedPipelineFlowId === updated.id) {
        setPipelineName(updated.flow_name)
      }
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
      throw error
    }
  }

  const deletePipelineFlow = async (flowId: string): Promise<void> => {
    try {
      await deletePipelineFlowRequest(flowId)
      if (effectiveSelectedPipelineFlowId === flowId) {
        setSelectedPipelineFlowId(null)
      }
      setBackendError(null)
    } catch (error) {
      setBackendError(getErrorMessage(error))
      throw error
    }
  }

  return {
    steps,
    clearSteps,
    addStepFromTemplate,
    createEmptyStep,
    updateStep,
    reorderStepByIndex,
    removeStep,
    effectiveSelectedPipelineFlowId,
    switchPipelineFlow,
    savePipelineFlow,
    savePipelineFlowAsNew,
    renamePipelineFlow,
    deletePipelineFlow,
    createTemplate,
    updateTemplate,
    moveTemplateToPack,
    deleteTemplate,
    importJsonPack,
    saveStepToDock,
  }
}
