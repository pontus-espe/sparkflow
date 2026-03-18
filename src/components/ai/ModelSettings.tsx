import { useState, useCallback, useEffect, useRef } from 'react'
import { useAIStore } from '@/stores/ai-store'
import { ipc } from '@/services/ipc-client'
import { Loader2, Key, ChevronRight, Cpu, Cloud } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'

const ANTHROPIC_MODELS = [
  { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6', desc: 'Recommended' },
  { id: 'claude-opus-4-6', name: 'Opus 4.6', desc: 'Most capable' },
  { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5', desc: 'Fastest' },
] as const

interface ModelSettingsProps {
  open: boolean
  onClose: () => void
  anchor?: 'statusbar' | 'titlebar'
}

export function ModelSettings({ open, onClose, anchor = 'statusbar' }: ModelSettingsProps) {
  const { model, models, provider, hasApiKey } = useAIStore()
  const { t } = useTranslation()
  const [tab, setTab] = useState<'local' | 'cloud'>(provider === 'anthropic' ? 'cloud' : 'local')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)
  const [selectedAnthropicModel, setSelectedAnthropicModel] = useState('claude-sonnet-4-6')
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    ipc.ai.getConfig().then((config) => {
      if (config.anthropicModel) setSelectedAnthropicModel(config.anthropicModel)
    }).catch(() => {})
  }, [open])

  useEffect(() => {
    if (!open) return
    refreshModels()
    setShowApiKeyInput(false)
    setApiKeyInput('')
    setKeyError(null)
    setTab(provider === 'anthropic' ? 'cloud' : 'local')
  }, [open, provider])

  const refreshModels = useCallback(async () => {
    try {
      const result = await ipc.ollama.listModels()
      useAIStore.getState().setModels(result.models || [])
    } catch { /* ignore */ }
  }, [])

  const handleSetActiveLocal = useCallback(async (modelName: string) => {
    if (provider !== 'local') {
      await ipc.ai.setConfig({ provider: 'local' })
      useAIStore.getState().setProvider('local')
    }
    await ipc.ollama.setModel(modelName)
    useAIStore.getState().setModel(modelName)
  }, [provider])

  const handleSetActiveAnthropic = useCallback(async (modelId: string) => {
    setSelectedAnthropicModel(modelId)
    await ipc.ai.setConfig({ anthropicModel: modelId, provider: 'anthropic' })
    const store = useAIStore.getState()
    store.setProvider('anthropic')
    store.setModel(modelId)
    if (hasApiKey) {
      store.setStatus('ready')
      store.setStartupMessage('AI is ready (Anthropic API)')
    }
  }, [hasApiKey])

  const handleConnectAnthropic = useCallback(async () => {
    const key = apiKeyInput.trim()
    if (!key) return

    setSavingKey(true)
    setKeyError(null)

    try {
      const result = await ipc.ai.validateKey(key)
      if (!result.valid) {
        setKeyError(result.error || 'Invalid API key')
        setSavingKey(false)
        return
      }

      await ipc.ai.setConfig({ anthropicApiKey: key, provider: 'anthropic' })
      const store = useAIStore.getState()
      store.setHasApiKey(true)
      store.setProvider('anthropic')
      store.setModel(selectedAnthropicModel)
      store.setStatus('ready')
      store.setStartupMessage('AI is ready (Anthropic API)')

      setApiKeyInput('')
      setShowApiKeyInput(false)
    } catch {
      setKeyError('Failed to validate key')
    } finally {
      setSavingKey(false)
    }
  }, [apiKeyInput, selectedAnthropicModel])

  const handleDisconnectAnthropic = useCallback(async () => {
    await ipc.ai.setConfig({ anthropicApiKey: null, provider: 'local' })
    const store = useAIStore.getState()
    store.setHasApiKey(false)
    store.setProvider('local')
    store.setStatus('starting')
    setTab('local')
  }, [])

  // Escape to close
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Click outside to close
  useEffect(() => {
    if (!open) return
    const handlePointerDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const raf = requestAnimationFrame(() => {
      document.addEventListener('pointerdown', handlePointerDown, true)
    })
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [open, onClose])

  if (!open) return null

  const isAnthropicActive = provider === 'anthropic'

  return (
    <div
      ref={panelRef}
      className={cn(
        'fixed z-50 w-72 rounded-xl border bg-popover shadow-2xl overflow-hidden',
        anchor === 'titlebar' ? 'top-10 right-28' : 'bottom-8 left-3'
      )}
    >
      {/* Tab bar */}
      <div className="flex border-b">
        <button
          onClick={() => setTab('local')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[12px] font-medium transition-colors',
            tab === 'local'
              ? 'text-foreground border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Cpu className="h-3.5 w-3.5" />
          {t('settings.local')}
        </button>
        <button
          onClick={() => setTab('cloud')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[12px] font-medium transition-colors',
            tab === 'cloud'
              ? 'text-foreground border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Cloud className="h-3.5 w-3.5" />
          Cloud
          {hasApiKey && (
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          )}
        </button>
      </div>

      {/* Local tab */}
      {tab === 'local' && (
        <div className="p-1.5">
          {models.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/60 px-2 py-4 text-center">
              {t('settings.noModels')}
            </p>
          ) : (
            <div className="space-y-0.5">
              {models.map((m) => {
                const isActive = !isAnthropicActive && m === model
                return (
                  <button
                    key={m}
                    onClick={() => handleSetActiveLocal(m)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] text-left transition-colors',
                      isActive
                        ? 'bg-primary/10 text-foreground'
                        : 'hover:bg-muted text-foreground'
                    )}
                  >
                    <span className={cn(
                      'h-2 w-2 rounded-full shrink-0 transition-colors',
                      isActive ? 'bg-primary' : 'bg-border'
                    )} />
                    <span className="truncate flex-1">{m}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Cloud tab */}
      {tab === 'cloud' && (
        <div className="p-1.5">
          {hasApiKey ? (
            <>
              <div className="space-y-0.5">
                {ANTHROPIC_MODELS.map((am) => {
                  const isActive = isAnthropicActive && selectedAnthropicModel === am.id
                  return (
                    <button
                      key={am.id}
                      onClick={() => handleSetActiveAnthropic(am.id)}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] text-left transition-colors',
                        isActive
                          ? 'bg-primary/10 text-foreground'
                          : 'hover:bg-muted text-foreground'
                      )}
                    >
                      <span className={cn(
                        'h-2 w-2 rounded-full shrink-0 transition-colors',
                        isActive ? 'bg-primary' : 'bg-border'
                      )} />
                      <span className="flex-1">{am.name}</span>
                      <span className="text-[10px] text-muted-foreground">{am.desc}</span>
                    </button>
                  )
                })}
              </div>
              <div className="mt-2 pt-2 border-t mx-1">
                <button
                  onClick={handleDisconnectAnthropic}
                  className="w-full px-2 py-1.5 rounded-lg text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-left transition-colors"
                >
                  {t('settings.disconnect')}
                </button>
              </div>
            </>
          ) : showApiKeyInput ? (
            <div className="px-1 py-2 space-y-2">
              <div className="flex items-center gap-1.5 rounded-lg border bg-background px-2.5 h-8">
                <Key className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConnectAnthropic()
                    if (e.key === 'Escape') { setShowApiKeyInput(false); setApiKeyInput(''); setKeyError(null) }
                  }}
                  placeholder="sk-ant-api03-..."
                  disabled={savingKey}
                  autoFocus
                  className="flex-1 bg-transparent text-[12px] font-mono outline-none placeholder:text-muted-foreground/40 min-w-0"
                />
                <button
                  onClick={handleConnectAnthropic}
                  disabled={savingKey || !apiKeyInput.trim()}
                  className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                >
                  {savingKey ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
              </div>
              {keyError && (
                <p className="text-[11px] text-destructive px-1">{keyError}</p>
              )}
            </div>
          ) : (
            <div className="py-4 flex flex-col items-center gap-3">
              <p className="text-[11px] text-muted-foreground text-center px-4">
                Connect your Anthropic API key to use Claude models.
              </p>
              <button
                onClick={() => setShowApiKeyInput(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <Key className="h-3 w-3" />
                <span>{t('settings.connectKey')}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
