import { useState, useCallback } from 'react'
import { useAIStore } from '@/stores/ai-store'
import { ipc } from '@/services/ipc-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, AlertTriangle, Check, Cpu } from 'lucide-react'

interface ApiKeyPromptProps {
  onDone: () => void
}

export function ApiKeyPrompt({ onDone }: ApiKeyPromptProps) {
  const { startupMessage } = useAIStore()
  const [apiKey, setApiKey] = useState('')
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = useCallback(async () => {
    const key = apiKey.trim()
    if (!key) return

    setValidating(true)
    setError(null)

    try {
      const result = await ipc.ai.validateKey(key)
      if (!result.valid) {
        setError(result.error || 'Invalid API key')
        setValidating(false)
        return
      }

      // Save the key and switch to Anthropic provider
      await ipc.ai.setConfig({ provider: 'anthropic', anthropicApiKey: key })

      const store = useAIStore.getState()
      store.setProvider('anthropic')
      store.setHasApiKey(true)
      store.setStatus('ready')
      store.setStartupMessage('AI is ready (Anthropic API)')

      setSuccess(true)
      setTimeout(onDone, 800)
    } catch {
      setError('Failed to validate key')
    } finally {
      setValidating(false)
    }
  }, [apiKey, onDone])

  const handleSkip = useCallback(async () => {
    // Try local anyway despite weak hardware
    const store = useAIStore.getState()
    store.setStatus('starting')
    store.setStartupMessage('Starting Ollama (may be slow)...')
    onDone()

    // Re-trigger Ollama startup by forcing provider to local
    await ipc.ai.setConfig({ provider: 'local' })
  }, [onDone])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[420px] rounded-xl border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b bg-muted/30">
          <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold">Hardware Insufficient for Local AI</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{startupMessage}</p>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-xs text-muted-foreground">
            Enter an Anthropic API key to use Claude as your AI backend instead of running models locally.
          </p>

          <div className="space-y-2">
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="sk-ant-api03-..."
              disabled={validating || success}
              className="text-xs h-8 font-mono"
              autoFocus
            />
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSubmit}
              disabled={!apiKey.trim() || validating || success}
              className="flex-1 h-8 text-xs"
            >
              {success ? (
                <><Check className="h-3 w-3 mr-1" /> Connected</>
              ) : validating ? (
                <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Validating...</>
              ) : (
                'Use Anthropic API'
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleSkip}
              disabled={validating || success}
              className="h-8 text-xs"
            >
              <Cpu className="h-3 w-3 mr-1" />
              Try Local Anyway
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground/70 text-center">
            Your API key is stored locally and never sent anywhere except Anthropic's API.
          </p>
        </div>
      </div>
    </div>
  )
}
