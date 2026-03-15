import { create } from 'zustand'
import type { MicroappInstance } from '@/types/microapp'

export interface MicroappStore {
  instances: Record<string, MicroappInstance>

  addInstance: (instance: MicroappInstance) => void
  removeInstance: (id: string) => void
  updateInstance: (id: string, updates: Partial<MicroappInstance>) => void
  setAppState: (microappId: string, key: string, value: unknown) => void
  getAppState: (microappId: string) => Record<string, unknown>
}

export const useMicroappStore = create<MicroappStore>((set, get) => ({
  instances: {},

  addInstance: (instance) => {
    set((state) => ({
      instances: { ...state.instances, [instance.id]: instance }
    }))
  },

  removeInstance: (id) => {
    set((state) => {
      const { [id]: _, ...rest } = state.instances
      return { instances: rest }
    })
  },

  updateInstance: (id, updates) => {
    set((state) => ({
      instances: {
        ...state.instances,
        [id]: { ...state.instances[id], ...updates, updatedAt: Date.now() }
      }
    }))
  },

  setAppState: (microappId, key, value) => {
    const instance = get().instances[microappId]
    if (!instance) return
    set((state) => ({
      instances: {
        ...state.instances,
        [microappId]: {
          ...instance,
          state: { ...instance.state, [key]: value },
          updatedAt: Date.now()
        }
      }
    }))
  },

  getAppState: (microappId) => {
    return get().instances[microappId]?.state ?? {}
  }
}))
