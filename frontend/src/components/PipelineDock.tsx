import { useMemo, useState, type KeyboardEvent } from 'react'
import { TemplateEditableValueSchema } from '../lib/schemas'
import type { CommandTemplate } from '../types'

type TemplateEditableField = 'name' | 'command'

interface PipelineDockProps {
  pipelineName: string
  stepsCount: number
  templates: CommandTemplate[]
  packNamesById: Record<string, string>
  packsCount: number
  isReloadingTemplates?: boolean
  onPipelineNameChange: (value: string) => void
  onAddStepFromTemplate: (template: CommandTemplate) => void
  onUpdateTemplate: (
    templateId: string,
    payload: { name?: string; command?: string },
  ) => Promise<void>
  onReloadTemplates: () => Promise<void>
  onMoveTemplateToPack: (templateId: string, targetPackId: string) => Promise<void>
  onDeleteTemplate: (templateId: string) => Promise<void>
}

const FLOW_DRAFTS_PACK_ID = 'flow_drafts'
const CORE_PACK_ID = 'core'

const getTemplatePackId = (templateId: string): string => {
  const separator = templateId.indexOf(':')
  if (separator <= 0) {
    return ''
  }
  return templateId.slice(0, separator)
}

function PipelineDock({
  pipelineName,
  stepsCount,
  templates,
  packNamesById,
  packsCount,
  isReloadingTemplates = false,
  onPipelineNameChange,
  onAddStepFromTemplate,
  onUpdateTemplate,
  onReloadTemplates,
  onMoveTemplateToPack,
  onDeleteTemplate,
}: PipelineDockProps) {
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<TemplateEditableField | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [movingTemplateId, setMovingTemplateId] = useState<string | null>(null)
  const [activeMoveTemplateId, setActiveMoveTemplateId] = useState<string | null>(null)
  const [moveTargetByTemplateId, setMoveTargetByTemplateId] = useState<
    Record<string, string>
  >({})
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null)
  const [templateEditError, setTemplateEditError] = useState<string | null>(null)

  const { draftTemplates, preparedTemplates } = useMemo(() => {
    const drafts: CommandTemplate[] = []
    const prepared: CommandTemplate[] = []

    for (const template of templates) {
      const packId = getTemplatePackId(template.id)
      if (packId === FLOW_DRAFTS_PACK_ID) {
        drafts.push(template)
      } else {
        prepared.push(template)
      }
    }

    return {
      draftTemplates: drafts,
      preparedTemplates: prepared,
    }
  }, [templates])

  const knownPacks = useMemo(
    () =>
      Object.entries(packNamesById)
        .map(([id, name]) => ({ id, name }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [packNamesById],
  )

  const startTemplateEdit = (
    template: CommandTemplate,
    field: TemplateEditableField,
  ): void => {
    setEditingTemplateId(template.id)
    setEditingField(field)
    setEditingValue(field === 'name' ? template.name : template.command)
    setTemplateEditError(null)
  }

  const cancelTemplateEdit = (): void => {
    setEditingTemplateId(null)
    setEditingField(null)
    setEditingValue('')
    setTemplateEditError(null)
  }

  const saveTemplateEdit = async (): Promise<void> => {
    if (!editingTemplateId || !editingField || isSavingTemplate) {
      return
    }
    const parsedValue = TemplateEditableValueSchema.safeParse(editingValue)
    if (!parsedValue.success) {
      setTemplateEditError(parsedValue.error.issues[0]?.message ?? 'Value cannot be empty')
      return
    }

    setIsSavingTemplate(true)
    setTemplateEditError(null)
    try {
      if (editingField === 'name') {
        await onUpdateTemplate(editingTemplateId, { name: parsedValue.data })
      } else {
        await onUpdateTemplate(editingTemplateId, { command: parsedValue.data })
      }
      cancelTemplateEdit()
    } catch (error) {
      if (error instanceof Error) {
        setTemplateEditError(error.message)
      } else {
        setTemplateEditError('Failed to save template')
      }
    } finally {
      setIsSavingTemplate(false)
    }
  }

  const moveTemplate = async (
    templateId: string,
    rawTargetPackId: string,
  ): Promise<void> => {
    const targetPackId = rawTargetPackId.trim()
    if (!targetPackId) {
      setTemplateEditError('Target pack id cannot be empty')
      return
    }
    if (movingTemplateId) {
      return
    }
    setMovingTemplateId(templateId)
    setTemplateEditError(null)
    try {
      await onMoveTemplateToPack(templateId, targetPackId)
      setActiveMoveTemplateId((prev) => (prev === templateId ? null : prev))
    } catch (error) {
      if (error instanceof Error) {
        setTemplateEditError(error.message)
      } else {
        setTemplateEditError('Failed to move template')
      }
    } finally {
      setMovingTemplateId(null)
    }
  }

  const deleteTemplate = async (templateId: string): Promise<void> => {
    if (deletingTemplateId) {
      return
    }
    setDeletingTemplateId(templateId)
    setTemplateEditError(null)
    try {
      await onDeleteTemplate(templateId)
      if (editingTemplateId === templateId) {
        cancelTemplateEdit()
      }
    } catch (error) {
      if (error instanceof Error) {
        setTemplateEditError(error.message)
      } else {
        setTemplateEditError('Failed to delete template')
      }
    } finally {
      setDeletingTemplateId(null)
    }
  }

  const onEditInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void saveTemplateEdit()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelTemplateEdit()
    }
  }

  const onMoveInputKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    templateId: string,
  ): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      const value = moveTargetByTemplateId[templateId] ?? ''
      void moveTemplate(templateId, value)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setActiveMoveTemplateId((prev) => (prev === templateId ? null : prev))
    }
  }

  const updateMoveTarget = (templateId: string, nextValue: string): void => {
    setMoveTargetByTemplateId((prev) => ({
      ...prev,
      [templateId]: nextValue,
    }))
  }

  const openMovePanel = (templateId: string, currentPackId: string): void => {
    setActiveMoveTemplateId(templateId)
    setMoveTargetByTemplateId((prev) => ({
      ...prev,
      [templateId]: prev[templateId] ?? currentPackId,
    }))
    setTemplateEditError(null)
  }

  const renderTemplateCard = (
    template: CommandTemplate,
  ) => {
    const templatePackId = getTemplatePackId(template.id)
    const isCoreTemplate = templatePackId === CORE_PACK_ID
    const templatePackName =
      (packNamesById[templatePackId] ?? templatePackId) || 'Unknown pack'

    return (
      <div key={template.id} className="templateChip" title={template.description}>
        <div className="templateChipHead">
          <div className="templateChipMeta">
            <span
              className={`templateOriginBadge${
                isCoreTemplate ? ' templateOriginBadge--core' : ''
              }`}
            >
              {templatePackName}
            </span>
            <button
              type="button"
              className="templateMoveToggle"
              onClick={() => openMovePanel(template.id, templatePackId)}
              title="Move command to another pack"
            >
              ↔
            </button>
          </div>
          <div className="templateChipActions">
            <button
              type="button"
              className="templateAddButton"
              onClick={() => onAddStepFromTemplate(template)}
            >
              Add step
            </button>
            <button
              type="button"
              className="templateDeleteButton"
              onClick={() => {
                void deleteTemplate(template.id)
              }}
              disabled={deletingTemplateId === template.id}
              title="Delete command"
            >
              {deletingTemplateId === template.id ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>

        {activeMoveTemplateId === template.id ? (
          <div className="templateMovePanel">
            <div className="templateMoveInputRow">
              <input
                value={moveTargetByTemplateId[template.id] ?? ''}
                onChange={(event) =>
                  updateMoveTarget(template.id, event.target.value)
                }
                onKeyDown={(event) => onMoveInputKeyDown(event, template.id)}
                placeholder="target_pack_id"
                autoFocus
              />
              <button
                type="button"
                className="templateAddButton"
                onClick={() =>
                  void moveTemplate(
                    template.id,
                    moveTargetByTemplateId[template.id] ?? '',
                  )
                }
                disabled={movingTemplateId === template.id}
              >
                {movingTemplateId === template.id ? 'Moving...' : 'Move'}
              </button>
            </div>
            <div className="templatePackList">
              <span>Existing packs:</span>
              <div className="templatePackListItems">
                {knownPacks.map((pack) => (
                  <button
                    key={pack.id}
                    type="button"
                    className="templatePackChip"
                    onClick={() => {
                      updateMoveTarget(template.id, pack.id)
                      void moveTemplate(template.id, pack.id)
                    }}
                    disabled={movingTemplateId === template.id}
                    title={pack.id}
                  >
                    {pack.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="templateEditable">
          <span className="templateFieldLabel">Name</span>
          {editingTemplateId === template.id && editingField === 'name' ? (
            <div className="templateEditInline">
              <input
                value={editingValue}
                onChange={(event) => setEditingValue(event.target.value)}
                onKeyDown={onEditInputKeyDown}
                autoFocus
              />
              <button
                type="button"
                className="templateSaveButton"
                onClick={() => {
                  void saveTemplateEdit()
                }}
                disabled={isSavingTemplate}
              >
                ✓
              </button>
            </div>
          ) : (
            <div className="templateDisplayRow">
              <span>{template.name}</span>
              <button
                type="button"
                className="templateEditButton"
                onClick={() => startTemplateEdit(template, 'name')}
                aria-label={`Edit template name: ${template.name}`}
              >
                ✎
              </button>
            </div>
          )}
        </div>

        <div className="templateEditable">
          <span className="templateFieldLabel">Command</span>
          {editingTemplateId === template.id && editingField === 'command' ? (
            <div className="templateEditInline">
              <input
                value={editingValue}
                onChange={(event) => setEditingValue(event.target.value)}
                onKeyDown={onEditInputKeyDown}
                autoFocus
              />
              <button
                type="button"
                className="templateSaveButton"
                onClick={() => {
                  void saveTemplateEdit()
                }}
                disabled={isSavingTemplate}
              >
                ✓
              </button>
            </div>
          ) : (
            <div className="templateDisplayRow">
              <code>{template.command}</code>
              <button
                type="button"
                className="templateEditButton"
                onClick={() => startTemplateEdit(template, 'command')}
                aria-label={`Edit template command: ${template.name}`}
              >
                ✎
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <aside className="panel pipelineDock">
      <div className="section__head">
        <h2>Pipeline Dock</h2>
        <span>{stepsCount} steps</span>
      </div>

      <label className="field">
        <span>Pipeline name</span>
        <input
          value={pipelineName}
          onChange={(event) => onPipelineNameChange(event.target.value)}
          placeholder="Pipeline name"
        />
      </label>

      <div className="pipelineDockPanels">
        <section className="dockPanel dockPanel--static">
          <details className="dockSection" open>
            <summary>Flow drafts ({draftTemplates.length})</summary>
            <p className="dockSectionHint">
              Templates saved from Pipeline Flow before moving to Prepared commands.
            </p>
            <div className="templatesSlim">
              {draftTemplates.length === 0 ? (
                <p className="empty">No draft templates yet.</p>
              ) : (
                draftTemplates.map((template) =>
                  renderTemplateCard(template),
                )
              )}
            </div>
          </details>
        </section>

        <section className="dockPanel dockPanel--static">
          <details className="dockSection" open>
            <summary>Prepared commands ({preparedTemplates.length})</summary>
            <div className="dockHeadActions">
              <span>{packsCount} packs loaded</span>
              <button
                type="button"
                className="flowBtn flowBtn--subtle"
                onClick={() => {
                  void onReloadTemplates().catch(() => undefined)
                }}
                disabled={isReloadingTemplates}
              >
                {isReloadingTemplates ? 'Reloading...' : 'Reload packs'}
              </button>
            </div>
            <div className="templatesSlim">
              {preparedTemplates.map((template) => renderTemplateCard(template))}
            </div>
          </details>
        </section>

        {templateEditError ? <p className="errorBanner">{templateEditError}</p> : null}
      </div>
    </aside>
  )
}

export default PipelineDock
