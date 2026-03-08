import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { NodePreset } from '../types'

let presetIdCounter = 0
const nextPresetId = () => `preset-${++presetIdCounter}-${Date.now()}`

interface PresetsState {
  presets: NodePreset[]
  addPreset: (preset: Omit<NodePreset, 'id'>) => string
  removePreset: (presetId: string) => void
}

export const usePresetsStore = create<PresetsState>()(
  persist(
    (set, get) => ({
      presets: [],

      addPreset: (preset) => {
        const state = get()
        const normalizedCollection = (preset.collection || '').trim()
        
        // Deduplication check
        const duplicate = state.presets.find(p => {
          const pCollection = (p.collection || '').trim()
          if (pCollection !== normalizedCollection) return false
          
          // Same name in the same collection
          if (p.label === preset.label) return true
          
          // Exact same data configuration in the same collection
          if (p.nodeType === preset.nodeType && JSON.stringify(p.data) === JSON.stringify(preset.data)) return true
          
          return false
        })

        // Silently skip adding if duplicate found, return existing ID
        if (duplicate) return duplicate.id

        const id = nextPresetId()
        const full: NodePreset = { ...preset, id, collection: normalizedCollection }
        set((state) => ({ presets: [...state.presets, full] }))
        return id
      },

      removePreset: (presetId) => {
        set((state) => ({
          presets: state.presets.filter((p) => p.id !== presetId),
        }))
      },
    }),
    {
      name: 'graph-presets',
    },
  ),
)

/**
 * Derive collections from a flat presets array.
 * Call this inside useMemo, NOT as a Zustand selector.
 */
export function deriveCollections(presets: NodePreset[]) {
  const map = new Map<string, NodePreset[]>()
  const uncategorized: NodePreset[] = []

  for (const preset of presets) {
    if (!preset.collection) {
      uncategorized.push(preset)
    } else {
      const list = map.get(preset.collection) ?? []
      list.push(preset)
      map.set(preset.collection, list)
    }
  }

  const collections = Array.from(map.entries()).map(([name, items]) => ({
    name,
    presets: items,
  }))

  return { collections, uncategorized }
}
