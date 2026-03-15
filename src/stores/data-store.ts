import { create } from 'zustand'
import type { DataSource } from '@/types/data-source'

export interface DataStore {
  sources: Record<string, DataSource>
  cachedData: Record<string, unknown[]>

  addSource: (source: DataSource) => void
  removeSource: (id: string) => void
  updateSource: (id: string, updates: Partial<DataSource>) => void
  setCachedData: (sourceId: string, data: unknown[]) => void
  getCachedData: (sourceId: string) => unknown[]
}

export const useDataStore = create<DataStore>((set, get) => ({
  sources: {},
  cachedData: {},

  addSource: (source) => {
    set((state) => ({
      sources: { ...state.sources, [source.id]: source }
    }))
  },

  removeSource: (id) => {
    set((state) => {
      const { [id]: _, ...restSources } = state.sources
      const { [id]: __, ...restData } = state.cachedData
      return { sources: restSources, cachedData: restData }
    })
  },

  updateSource: (id, updates) => {
    set((state) => ({
      sources: {
        ...state.sources,
        [id]: { ...state.sources[id], ...updates }
      }
    }))
  },

  setCachedData: (sourceId, data) => {
    set((state) => ({
      cachedData: { ...state.cachedData, [sourceId]: data }
    }))
  },

  getCachedData: (sourceId) => {
    return get().cachedData[sourceId] ?? []
  }
}))
