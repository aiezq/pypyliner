import { useI18n } from '../i18n/I18nProvider'
import type { SequenceExecutionViewModel } from '../types'

interface SequenceRuntimeStripProps {
  sequences: SequenceExecutionViewModel[]
}

function SequenceRuntimeStrip({ sequences }: SequenceRuntimeStripProps) {
  const { messages } = useI18n()

  if (sequences.length === 0) {
    return null
  }

  return (
    <section className="sequenceRuntimeStrip" aria-label={`${messages.graph.sequence} runtime`}>
      {sequences.map((sequence) => (
        <article key={sequence.id} className="sequenceRuntimeCard">
          <strong className="sequenceRuntimeCard__title">{messages.graph.sequence}</strong>
          <div className="sequenceRuntimeCard__id">{sequence.sequenceNodeId}</div>
          <div className="sequenceRuntimeCard__status">
            {sequence.status}
            {typeof sequence.currentTerminalIndex === 'number'
              ? ` • ${sequence.currentTerminalIndex + 1}/${sequence.terminalJobs.length}`
              : ''}
          </div>
          {sequence.finishedAt ? (
            <div className="sequenceRuntimeCard__finishedAt">{sequence.finishedAt}</div>
          ) : null}
          <div className="sequenceRuntimeCard__jobs">
            {sequence.terminalJobs.map((job, index) => (
              <div key={`${sequence.id}:${job.terminalNodeId}:${index}`} className="sequenceRuntimeJob">
                <span className="sequenceRuntimeJob__title">
                  {index + 1}. {job.title}
                </span>
                <span className="sequenceRuntimeJob__meta">
                  {job.terminalType.toUpperCase()} • {job.status}
                </span>
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  )
}

export default SequenceRuntimeStrip
