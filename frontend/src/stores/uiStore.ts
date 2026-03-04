import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UiStoreState {
  pipelineName: string
  isImportModalOpen: boolean
  setPipelineName: (value: string) => void
  openImportModal: () => void
  closeImportModal: () => void
}

export const useUiStore = create<UiStoreState>()(
  persist(
    (set) => ({
      pipelineName: 'Default operator pipeline',
      isImportModalOpen: false,
      setPipelineName: (value) => set({ pipelineName: value }),
      openImportModal: () => set({ isImportModalOpen: true }),
      closeImportModal: () => set({ isImportModalOpen: false }),
    }),
    {
      name: 'operator_helper.ui.v1',
      partialize: (state) => ({ pipelineName: state.pipelineName }),
    },
  ),
)
