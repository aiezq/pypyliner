import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from '../../src/stores/uiStore'

describe('useUiStore', () => {
  beforeEach(() => {
    window.localStorage.removeItem('operator_helper.ui.v1')
    useUiStore.setState({
      pipelineName: 'Default operator pipeline',
      isImportModalOpen: false,
    })
  })

  it('updates pipeline name and import modal state through store actions', () => {
    useUiStore.getState().setPipelineName('Ops flow')
    expect(useUiStore.getState().pipelineName).toBe('Ops flow')

    useUiStore.getState().openImportModal()
    expect(useUiStore.getState().isImportModalOpen).toBe(true)

    useUiStore.getState().closeImportModal()
    expect(useUiStore.getState().isImportModalOpen).toBe(false)
  })
})
