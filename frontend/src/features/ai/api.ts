import { apiRequest } from '../../lib/api'
import {
  AIModelStatusResponseSchema,
  AIModelsResponseSchema,
  AnalyzeDocumentationResponseSchema,
  GeneratePipelineDraftResponseSchema,
} from '../../lib/schemas'
import type {
  AIModelStatusResponse,
  AIModelsResponse,
  AnalyzeDocumentationResponse,
  GeneratePipelineDraftResponse,
} from '../../lib/schemas'

export async function fetchAiModels(): Promise<AIModelsResponse> {
  const payload = await apiRequest<unknown>('/api/ai/models')
  return AIModelsResponseSchema.parse(payload)
}

export async function installAiModel(modelId: string): Promise<AIModelStatusResponse> {
  const payload = await apiRequest<unknown>(`/api/ai/models/${modelId}/install`, {
    method: 'POST',
  })
  return AIModelStatusResponseSchema.parse(payload)
}

export async function fetchAiModelStatus(modelId: string): Promise<AIModelStatusResponse> {
  const payload = await apiRequest<unknown>(`/api/ai/models/${modelId}/status`)
  return AIModelStatusResponseSchema.parse(payload)
}

export async function cancelAiModelInstall(modelId: string): Promise<AIModelStatusResponse> {
  const payload = await apiRequest<unknown>(`/api/ai/models/${modelId}/cancel-install`, {
    method: 'POST',
  })
  return AIModelStatusResponseSchema.parse(payload)
}

export async function loadAiModel(modelId: string): Promise<AIModelStatusResponse> {
  const payload = await apiRequest<unknown>(`/api/ai/models/${modelId}/load`, {
    method: 'POST',
  })
  return AIModelStatusResponseSchema.parse(payload)
}

export async function unloadAiModel(modelId: string): Promise<AIModelStatusResponse> {
  const payload = await apiRequest<unknown>(`/api/ai/models/${modelId}/unload`, {
    method: 'POST',
  })
  return AIModelStatusResponseSchema.parse(payload)
}

export async function removeAiModel(modelId: string): Promise<AIModelStatusResponse> {
  const payload = await apiRequest<unknown>(`/api/ai/models/${modelId}`, {
    method: 'DELETE',
  })
  return AIModelStatusResponseSchema.parse(payload)
}

export async function analyzeDocumentation(
  modelId: string,
  documentationText: string,
): Promise<AnalyzeDocumentationResponse> {
  const payload = await apiRequest<unknown>('/api/ai/pipeline-drafts/clarify', {
    method: 'POST',
    body: JSON.stringify({
      model_id: modelId,
      documentation_text: documentationText,
      context: {
        command_packs: true,
      },
    }),
  })
  return AnalyzeDocumentationResponseSchema.parse(payload)
}

export async function generatePipelineDraft(
  modelId: string,
  documentationText: string,
  clarificationAnswers: Array<{ question_id: string; answer: string }>,
): Promise<GeneratePipelineDraftResponse> {
  const payload = await apiRequest<unknown>('/api/ai/pipeline-drafts/generate', {
    method: 'POST',
    body: JSON.stringify({
      model_id: modelId,
      documentation_text: documentationText,
      mode: 'graph',
      context: {
        command_packs: true,
      },
      clarification_answers: clarificationAnswers,
    }),
  })
  return GeneratePipelineDraftResponseSchema.parse(payload)
}
