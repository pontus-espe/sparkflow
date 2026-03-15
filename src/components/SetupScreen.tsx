import { useState, useCallback } from 'react'
import { useAIStore, type OllamaStatus } from '@/stores/ai-store'
import { ipc, windowControls } from '@/services/ipc-client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Download, Server, Box, Cpu, Check, Loader2, AlertTriangle, Cloud, Key, X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import appIcon from '@/assets/icon.png'

interface Step {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  phases: OllamaStatus[]
}

const STEPS: Step[] = [
  {
    id: 'engine',
    label: 'Downloading AI Engine',
    description: 'Installing Ollama runtime',
    icon: <Server className="h-4 w-4" />,
    phases: ['downloading-ollama']
  },
  {
    id: 'start',
    label: 'Starting AI Engine',
    description: 'Launching Ollama server',
    icon: <Download className="h-4 w-4" />,
    phases: ['starting']
  },
  {
    id: 'model',
    label: 'Downloading AI Model',
    description: 'Pulling language model',
    icon: <Box className="h-4 w-4" />,
    phases: ['pulling-model', 'downloading']
  },
  {
    id: 'warm',
    label: 'Loading Model',
    description: 'Preparing for first use',
    icon: <Cpu className="h-4 w-4" />,
    phases: ['warming-model']
  }
]

function getStepState(step: Step, currentStatus: OllamaStatus): 'pending' | 'active' | 'done' {
  const stepIdx = STEPS.indexOf(step)
  const currentStepIdx = STEPS.findIndex((s) => s.phases.includes(currentStatus))

  if (currentStatus === 'ready') return 'done'
  if (step.phases.includes(currentStatus)) return 'active'
  if (currentStepIdx > stepIdx) return 'done'
  if (currentStepIdx === -1 && stepIdx === 0 && currentStatus === 'not-started') return 'active'
  return 'pending'
}

function getStepProgress(step: Step, status: OllamaStatus, downloadProgress: number): number {
  const state = getStepState(step, status)
  if (state === 'done') return 100
  if (state === 'pending') return 0

  // Active step
  if (step.id === 'engine' && status === 'downloading-ollama') return downloadProgress
  if (step.id === 'model' && (status === 'pulling-model' || status === 'downloading')) return downloadProgress
  if (step.id === 'start') return 50 // indeterminate — show halfway
  if (step.id === 'warm') return 50
  return 0
}

export function SetupScreen() {
  const status = useAIStore((s) => s.status)
  const downloadProgress = useAIStore((s) => s.downloadProgress)
  const startupMessage = useAIStore((s) => s.startupMessage)
  const model = useAIStore((s) => s.model)
  const error = useAIStore((s) => s.error)

  const [apiKey, setApiKey] = useState('')
  const [validating, setValidating] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)

  const handleConnectAnthropic = useCallback(async () => {
    const key = apiKey.trim()
    if (!key) return
    setValidating(true)
    setKeyError(null)
    try {
      const result = await ipc.ai.validateKey(key)
      if (!result.valid) {
        setKeyError(result.error || 'Invalid API key')
        setValidating(false)
        return
      }
      await ipc.ai.setConfig({ provider: 'anthropic', anthropicApiKey: key })
      const store = useAIStore.getState()
      store.setProvider('anthropic')
      store.setHasApiKey(true)
      store.setStatus('ready')
    } catch {
      setKeyError('Failed to validate key')
    } finally {
      setValidating(false)
    }
  }, [apiKey])

  const handleTryLocal = useCallback(async () => {
    const store = useAIStore.getState()
    store.setStatus('starting')
    await ipc.ai.setConfig({ provider: 'local' })
  }, [])

  const isHardwareInsufficient = status === 'hardware-insufficient'
  const isError = status === 'error'
  const isSettingUp = !isHardwareInsufficient && !isError

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
      {/* Dot pattern background */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
        backgroundSize: '32px 32px'
      }} />

      {/* Close button */}
      <button
        onClick={() => windowControls.close()}
        className="absolute top-4 right-4 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        title="Cancel and close"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="relative w-[420px] flex flex-col items-center gap-6">
        {/* Logo & title */}
        <div className="flex flex-col items-center gap-3">
          <img src={appIcon} alt="" className="h-12 w-12 rounded-xl shadow-lg" draggable={false} />
          <div className="text-center">
            <h1 className="text-base font-semibold tracking-tight">Setting up SparkFlow</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {isHardwareInsufficient
                ? 'Your hardware needs an alternative AI provider'
                : isError
                  ? 'Something went wrong during setup'
                  : 'This only happens once — preparing your AI canvas'
              }
            </p>
          </div>
        </div>

        {/* Steps with progress bars */}
        {isSettingUp && (
          <div className="w-full space-y-0.5">
            {STEPS.map((step) => {
              const state = getStepState(step, status)
              const progress = getStepProgress(step, status, downloadProgress)
              const isIndeterminate = state === 'active' && (step.id === 'start' || step.id === 'warm')

              return (
                <div
                  key={step.id}
                  className={cn(
                    'px-4 py-3 rounded-lg transition-all duration-300',
                    state === 'active' && 'bg-card border border-border',
                    state === 'done' && 'opacity-50',
                    state === 'pending' && 'opacity-25'
                  )}
                >
                  <div className="flex items-center gap-3">
                    {/* Step icon */}
                    <div className={cn(
                      'h-7 w-7 rounded-full flex items-center justify-center shrink-0',
                      state === 'done' && 'bg-green-500/10 text-green-500',
                      state === 'active' && 'bg-primary/10 text-primary',
                      state === 'pending' && 'bg-muted text-muted-foreground'
                    )}>
                      {state === 'done' ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : state === 'active' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        step.icon
                      )}
                    </div>

                    {/* Label + percentage */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          'text-sm font-medium',
                          state === 'pending' && 'text-muted-foreground'
                        )}>
                          {step.label}
                        </span>
                        {state === 'active' && !isIndeterminate && progress > 0 && (
                          <span className="text-xs font-mono text-primary tabular-nums ml-2">
                            {progress}%
                          </span>
                        )}
                      </div>
                      {state === 'active' && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {step.id === 'model' && model ? model : step.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Progress bar — always shown for active step */}
                  {state === 'active' && (
                    <div className="mt-2 ml-10">
                      <div className="h-1 bg-muted rounded-full overflow-hidden">
                        {isIndeterminate ? (
                          <div className="h-full w-1/3 bg-primary/60 rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]" />
                        ) : (
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${progress}%` }}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Completed bar */}
                  {state === 'done' && (
                    <div className="mt-2 ml-10">
                      <div className="h-1 bg-green-500/20 rounded-full overflow-hidden">
                        <div className="h-full w-full bg-green-500/40 rounded-full" />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Hardware insufficient — API key option */}
        {isHardwareInsufficient && (
          <div className="w-full space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/10">
              <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                {startupMessage || 'Not enough memory for local AI. Connect an Anthropic API key to use Claude instead.'}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                <Cloud className="h-3.5 w-3.5" />
                <span className="font-medium">Connect Anthropic API</span>
              </div>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConnectAnthropic()}
                  placeholder="sk-ant-api03-..."
                  disabled={validating}
                  className="text-xs h-8 font-mono flex-1"
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={handleConnectAnthropic}
                  disabled={!apiKey.trim() || validating}
                  className="h-8 px-3 text-xs"
                >
                  {validating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Key className="h-3 w-3" />}
                </Button>
              </div>
              {keyError && <p className="text-xs text-destructive px-1">{keyError}</p>}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-[10px] uppercase">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <Button variant="outline" size="sm" onClick={handleTryLocal} className="w-full h-8 text-xs">
              <Cpu className="h-3 w-3 mr-1.5" />
              Try Local Anyway
            </Button>
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="w-full space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-medium text-destructive">Setup failed</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed break-all">
                  {error || 'An unknown error occurred.'}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  const store = useAIStore.getState()
                  store.setStatus('not-started')
                  store.setError(null)
                  store.setDownloadProgress(0)
                  ipc.ai.retrySetup()
                }}
                className="flex-1 h-8 text-xs"
              >
                <Download className="h-3 w-3 mr-1.5" />
                Retry
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => useAIStore.getState().setStatus('hardware-insufficient')}
                className="flex-1 h-8 text-xs"
              >
                <Cloud className="h-3 w-3 mr-1.5" />
                Use Anthropic API
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
