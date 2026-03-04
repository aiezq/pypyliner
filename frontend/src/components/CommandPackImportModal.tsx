import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState, type ChangeEvent } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { CommandPackImportFormSchema } from '../lib/schemas'

type CommandPackImportFormValues = z.infer<typeof CommandPackImportFormSchema>

interface CommandPackImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImport: (payload: { content: string; fileName?: string }) => Promise<void>
}

function CommandPackImportModal({
  isOpen,
  onClose,
  onImport,
}: CommandPackImportModalProps) {
  const {
    formState,
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
  } = useForm<CommandPackImportFormValues>({
    resolver: zodResolver(CommandPackImportFormSchema),
    defaultValues: {
      fileName: '',
      content: '',
    },
  })
  const [submitError, setSubmitError] = useState<string | null>(null)
  const importContent = watch('content')

  useEffect(() => {
    if (!isOpen) {
      reset({
        fileName: '',
        content: '',
      })
      setSubmitError(null)
      return
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, onClose, reset])

  if (!isOpen) {
    return null
  }

  const onImportFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const text = await file.text()
    setValue('fileName', file.name, { shouldDirty: true, shouldValidate: true })
    setValue('content', text, { shouldDirty: true, shouldValidate: true })
    setSubmitError(null)
  }

  const submitImportForm = handleSubmit(async (values) => {
    setSubmitError(null)
    try {
      const nextFileName = values.fileName.trim()
      await onImport({
        content: values.content.trim(),
        fileName: nextFileName.length > 0 ? nextFileName : undefined,
      })
      reset({
        fileName: '',
        content: '',
      })
      onClose()
    } catch (error) {
      if (error instanceof Error) {
        setSubmitError(error.message)
      } else {
        setSubmitError('Failed to import JSON pack')
      }
    }
  })

  return (
    <div
      className="modalBackdrop"
      onClick={() => {
        if (!formState.isSubmitting) {
          onClose()
        }
      }}
    >
      <section
        className="modalCard"
        onClick={(event) => {
          event.stopPropagation()
        }}
      >
        <div className="modalHead">
          <h2>Import JSON DLC</h2>
          <button
            type="button"
            className="buttonGhost"
            onClick={onClose}
            disabled={formState.isSubmitting}
          >
            Close
          </button>
        </div>

        <p className="modalHint">
          Upload `.json` file or paste JSON content manually.
        </p>

        <form
          className="inputs"
          onSubmit={(event) => {
            void submitImportForm(event)
          }}
        >
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              void onImportFileChange(event)
            }}
            disabled={formState.isSubmitting}
          />
          <input {...register('fileName')} placeholder="File name, e.g. ops-pack.json" />
          {formState.errors.fileName ? (
            <p className="fieldError">{formState.errors.fileName.message}</p>
          ) : null}

          <textarea
            {...register('content')}
            placeholder='Paste JSON pack: {"pack_id":"my_pack","pack_name":"My Pack","commands":[...]}'
          />
          {formState.errors.content ? (
            <p className="fieldError">{formState.errors.content.message}</p>
          ) : null}

          <button
            type="submit"
            disabled={!importContent.trim() || formState.isSubmitting}
          >
            {formState.isSubmitting ? 'Importing...' : 'Import pack'}
          </button>
        </form>

        {submitError ? <p className="errorBanner">{submitError}</p> : null}
      </section>
    </div>
  )
}

export default CommandPackImportModal
