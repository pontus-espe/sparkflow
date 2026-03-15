import { useState, useCallback, useEffect } from 'react'
import { useAIStore, type AIProvider } from '@/stores/ai-store'
import { ipc } from '@/services/ipc-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Download, Check, Loader2, X, Cloud, Cpu, Key, Unplug } from 'lucide-react'
import { cn } from '@/lib/utils'

const ANTHROPIC_MODELS = [
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', tag: 'recommended' },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', tag: 'most capable' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', tag: 'fastest' },
] as const

interface ModelSettingsProps {
  open: boolean
  onClose: () => void
  anchor?: 'statusbar' | 'titlebar'
}

export function ModelSettings({ open, onClose, anchor = 'statusbar' }: ModelSettingsProps) {
  const { model, models, isPulling, pullModel: pullingModel, pullProgress, provider, hasApiKey } = useAIStore()
  const [pullInput, setPullInput] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)
  const [removingKey, setRemovingKey] = useState(false)
  const [selectedAnthropicModel, setSelectedAnthropicModel] = useState('claude-sonnet-4-6')

  // Load current anthropic model from config
  useEffect(() => {
    if (!open) return
    ipc.ai.getConfig().then((config) => {
      if (config.anthropicModel) setSelectedAnthropicModel(config.anthropicModel)
    }).catch(() => {})
  }, [open])

  // Refresh local model list when opened
  useEffect(() => {
    if (!open) return
    refreshModels()
  }, [open])

  // Listen for pull status
  useEffect(() => {
    const cleanup = ipc.ollama.onPullStatus((status) => {
      const store = useAIStore.getState()
      if (status.completed && status.total) {
        store.setPullProgress(Math.round((status.completed / status.total) * 100))
      }
    })
    return cleanup
  }, [])

  const refreshModels = useCallback(async () => {
    try {
      const result = await ipc.ollama.listModels()
      useAIStore.getState().setModels(result.models || [])
    } catch { /* ignore if ollama isn't running */ }
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
    if (hasApiKey) {
      store.setStatus('ready')
      store.setStartupMessage('AI is ready (Anthropic API)')
    }
  }, [hasApiKey])

  const handlePull = useCallback(async () => {
    const name = pullInput.trim()
    if (!name) return

    const store = useAIStore.getState()
    store.setIsPulling(true)
    store.setPullModel(name)
    store.setPullProgress(0)

    try {
      const result = await ipc.ollama.pullModel(name)
      if (result?.error) {
        store.setError(result.error)
      } else {
        setPullInput('')
        await refreshModels()
      }
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'Pull failed')
    } finally {
      store.setIsPulling(false)
      store.setPullModel(null)
    }
  }, [pullInput, refreshModels])

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
      store.setStatus('ready')
      store.setStartupMessage('AI is ready (Anthropic API)')

      setApiKeyInput('')
    } catch {
      setKeyError('Failed to validate key')
    } finally {
      setSavingKey(false)
    }
  }, [apiKeyInput])

  const handleRemoveAnthropic = useCallback(async () => {
    setRemovingKey(true)
    await ipc.ai.setConfig({ anthropicApiKey: null, provider: 'local' })
    const store = useAIStore.getState()
    store.setHasApiKey(false)
    store.setProvider('local')
    store.setStatus('starting')
    setRemovingKey(false)
  }, [])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const el = document.getElementById('model-settings-panel')
    const handleMouseDown = (e: MouseEvent) => {
      if (el && !el.contains(e.target as Node)) {
        onClose()
      }
    }
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleMouseDown)
    }, 0)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousedown', handleMouseDown)
    }
  }, [open, onClose])

  if (!open) return null

  const isAnthropicActive = provider === 'anthropic'

  return (
    <div
      id="model-settings-panel"
      className={cn(
        'fixed z-50 w-80 rounded-xl border bg-popover shadow-2xl overflow-hidden',
        anchor === 'titlebar' ? 'top-9 right-28' : 'bottom-8 left-3'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-medium">AI Models</span>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Local models section */}
      <div className="p-2 space-y-1">
        <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          <Cpu className="h-3 w-3" />
          Local Models (Ollama)
        </div>
        {models.length === 0 ? (
          <p className="text-xs text-muted-foreground px-2 py-1">No models installed</p>
        ) : (
          models.map((m) => {
            const isActive = !isAnthropicActive && m === model
            return (
              <button
                key={m}
                onClick={() => handleSetActiveLocal(m)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted text-foreground'
                )}
              >
                {isActive ? (
                  <Check className="h-3 w-3 shrink-0" />
                ) : (
                  <div className="w-3 h-3 shrink-0" />
                )}
                <span className="truncate flex-1">{m}</span>
                {isActive && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">active</Badge>
                )}
              </button>
            )
          })
        )}

        {/* Pull new model */}
        <div className="flex gap-1.5 pt-1">
          <Input
            value={pullInput}
            onChange={(e) => setPullInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePull()}
            placeholder="Pull model (e.g. qwen3.5:4b)"
            disabled={isPulling}
            className="text-xs h-7"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handlePull}
            disabled={isPulling || !pullInput.trim()}
            className="h-7 px-2 shrink-0"
          >
            {isPulling ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
          </Button>
        </div>
        {isPulling && (
          <div className="space-y-1 px-2">
            <div className="text-[10px] text-muted-foreground">
              Pulling {pullingModel}... {pullProgress}%
            </div>
            <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${pullProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Anthropic models section */}
      <div className="p-2 border-t space-y-1">
        <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          <Cloud className="h-3 w-3" />
          Anthropic API
          {hasApiKey && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-auto bg-green-500/10 text-green-600 border-0">
              connected
            </Badge>
          )}
        </div>

        {hasApiKey ? (
          <>
            {ANTHROPIC_MODELS.map((am) => {
              const isActive = isAnthropicActive && selectedAnthropicModel === am.id
              return (
                <button
                  key={am.id}
                  onClick={() => handleSetActiveAnthropic(am.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted text-foreground'
                  )}
                >
                  {isActive ? (
                    <Check className="h-3 w-3 shrink-0" />
                  ) : (
                    <div className="w-3 h-3 shrink-0" />
                  )}
                  <span className="truncate flex-1">{am.name}</span>
                  <span className="text-[10px] text-muted-foreground">{am.tag}</span>
                  {isActive && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0">active</Badge>
                  )}
                </button>
              )
            })}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRemoveAnthropic}
              disabled={removingKey}
              className="w-full h-7 text-xs mt-1 text-destructive hover:text-destructive"
            >
              <Unplug className="h-3 w-3 mr-1" />
              Remove Anthropic Connection
            </Button>
          </>
        ) : (
          <div className="space-y-2 px-1">
            <p className="text-xs text-muted-foreground">
              Connect your Anthropic API key to use Claude models.
            </p>
            <div className="flex gap-1.5">
              <Input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConnectAnthropic()}
                placeholder="sk-ant-api03-..."
                disabled={savingKey}
                className="text-xs h-7 font-mono"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleConnectAnthropic}
                disabled={savingKey || !apiKeyInput.trim()}
                className="h-7 px-2 shrink-0"
              >
                {savingKey ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Key className="h-3 w-3" />
                )}
              </Button>
            </div>
            {keyError && (
              <p className="text-xs text-destructive">{keyError}</p>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={handleConnectAnthropic}
              disabled={savingKey || !apiKeyInput.trim()}
              className="w-full h-7 text-xs"
            >
              <Cloud className="h-3 w-3 mr-1" />
              Connect Anthropic
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
