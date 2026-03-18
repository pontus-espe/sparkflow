import { create } from 'zustand'

export type OllamaStatus = 'not-started' | 'starting' | 'downloading-ollama' | 'pulling-model' | 'warming-model' | 'ready' | 'downloading' | 'error' | 'hardware-insufficient'
export type AIProvider = 'local' | 'anthropic'
export type AppLanguage = 'en' | 'sv'

export const LANGUAGES: { id: AppLanguage; label: string; flag: string }[] = [
  { id: 'en', label: 'English', flag: '🇬🇧' },
  { id: 'sv', label: 'Svenska', flag: '🇸🇪' }
]

export interface AIStore {
  status: OllamaStatus
  provider: AIProvider
  model: string | null
  models: string[]
  language: AppLanguage
  downloadProgress: number
  startupMessage: string
  isGenerating: boolean
  streamingText: string
  isPulling: boolean
  pullModel: string | null
  pullProgress: number
  error: string | null
  hardwareSufficient: boolean
  hasApiKey: boolean

  setStatus: (status: OllamaStatus) => void
  setProvider: (provider: AIProvider) => void
  setModel: (model: string | null) => void
  setModels: (models: string[]) => void
  setLanguage: (language: AppLanguage) => void
  setDownloadProgress: (progress: number) => void
  setStartupMessage: (message: string) => void
  setIsGenerating: (generating: boolean) => void
  appendStreamingText: (chunk: string) => void
  resetStreaming: () => void
  setIsPulling: (pulling: boolean) => void
  setPullModel: (model: string | null) => void
  setPullProgress: (progress: number) => void
  setError: (error: string | null) => void
  setHardwareSufficient: (sufficient: boolean) => void
  setHasApiKey: (has: boolean) => void
}

export const useAIStore = create<AIStore>((set) => ({
  status: 'not-started',
  provider: 'local',
  model: null,
  models: [],
  language: (typeof localStorage !== 'undefined' && localStorage.getItem('app-language') as AppLanguage) || 'en',
  downloadProgress: 0,
  startupMessage: '',
  isGenerating: false,
  streamingText: '',
  isPulling: false,
  pullModel: null,
  pullProgress: 0,
  error: null,
  hardwareSufficient: true,
  hasApiKey: false,

  setStatus: (status) => set({ status }),
  setProvider: (provider) => set({ provider }),
  setModel: (model) => set({ model }),
  setModels: (models) => set({ models }),
  setLanguage: (language) => {
    localStorage.setItem('app-language', language)
    set({ language })
  },
  setDownloadProgress: (progress) => set({ downloadProgress: progress }),
  setStartupMessage: (message) => set({ startupMessage: message }),
  setIsGenerating: (generating) => set({ isGenerating: generating }),
  appendStreamingText: (chunk) =>
    set((state) => ({ streamingText: state.streamingText + chunk })),
  resetStreaming: () => set({ streamingText: '', isGenerating: false }),
  setIsPulling: (pulling) => set({ isPulling: pulling }),
  setPullModel: (model) => set({ pullModel: model }),
  setPullProgress: (progress) => set({ pullProgress: progress }),
  setError: (error) => set({ error }),
  setHardwareSufficient: (sufficient) => set({ hardwareSufficient: sufficient }),
  setHasApiKey: (has) => set({ hasApiKey: has })
}))
