import { create } from 'zustand'

export interface LogEntry {
  id: string
  timestamp: number
  type: 'info' | 'success' | 'error' | 'warning'
  source: string
  message: string
  detail?: string
}

export interface LogStore {
  entries: LogEntry[]
  addEntry: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void
  clear: () => void
}

let logId = 0

export const useLogStore = create<LogStore>((set) => ({
  entries: [],

  addEntry: (entry) => {
    set((state) => ({
      entries: [
        ...state.entries,
        { ...entry, id: String(++logId), timestamp: Date.now() }
      ].slice(-200) // keep last 200 entries
    }))
  },

  clear: () => set({ entries: [] })
}))

// Convenience logger — also writes to console for dev tools visibility
function emit(type: 'info' | 'success' | 'error' | 'warning', source: string, message: string, detail?: string) {
  const prefix = `[${type.toUpperCase()}] [${source}]`
  const consoleFn = type === 'error' ? console.error : type === 'warning' ? console.warn : console.log
  consoleFn(prefix, message, detail || '')
  useLogStore.getState().addEntry({ type, source, message, detail })
}

export const log = {
  info: (source: string, message: string, detail?: string) => emit('info', source, message, detail),
  success: (source: string, message: string, detail?: string) => emit('success', source, message, detail),
  error: (source: string, message: string, detail?: string) => emit('error', source, message, detail),
  warning: (source: string, message: string, detail?: string) => emit('warning', source, message, detail)
}
