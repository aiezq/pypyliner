import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import SequenceRuntimeStrip from '../../src/components/SequenceRuntimeStrip'
import { renderWithProviders } from '../renderWithProviders'

describe('SequenceRuntimeStrip', () => {
  it('renders runtime job details for each sequence execution', () => {
    renderWithProviders(
      <SequenceRuntimeStrip
        sequences={[
          {
            id: 'sequence_1',
            sequenceNodeId: 'node_sequence_1',
            status: 'running',
            currentTerminalIndex: 1,
            createdAt: '2026-03-11T09:00:00Z',
            startedAt: '2026-03-11T09:00:01Z',
            finishedAt: null,
            terminalJobs: [
              {
                terminalNodeId: 'node_terminal_1',
                terminalSessionId: 'term_1',
                title: 'Prepare',
                terminalType: 'local',
                status: 'success',
              },
              {
                terminalNodeId: 'node_terminal_2',
                terminalSessionId: 'term_2',
                title: 'Deploy',
                terminalType: 'ssh',
                status: 'running',
              },
            ],
          },
        ]}
      />,
    )

    expect(screen.getByText('1. Prepare')).toBeVisible()
    expect(screen.getByText('LOCAL • success')).toBeVisible()
    expect(screen.getByText('2. Deploy')).toBeVisible()
    expect(screen.getByText('SSH • running')).toBeVisible()
  })
})
