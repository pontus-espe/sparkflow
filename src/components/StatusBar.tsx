import { useAIStore } from '@/stores/ai-store'
import { useBoardStore } from '@/stores/board-store'
import { Circle, Keyboard, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

export function StatusBar() {
  const { status, model, downloadProgress, provider } = useAIStore()
  const nodeCount = useBoardStore((s) => s.nodes.length)

  const statusColor = {
    'not-started': 'text-muted-foreground',
    starting: 'text-yellow-500',
    'downloading-ollama': 'text-blue-500',
    'pulling-model': 'text-blue-500',
    ready: 'text-green-500',
    downloading: 'text-blue-500',
    error: 'text-destructive',
    'hardware-insufficient': 'text-yellow-500'
  }[status]

  const showProgress = status === 'downloading-ollama' || status === 'pulling-model'

  let statusText: string
  switch (status) {
    case 'not-started':
      statusText = 'AI: Connecting...'
      break
    case 'starting':
      statusText = 'AI: Starting...'
      break
    case 'downloading-ollama':
      statusText = `Downloading Ollama ${downloadProgress}%`
      break
    case 'pulling-model':
      statusText = `Downloading ${model || 'model'} ${downloadProgress}%`
      break
    case 'ready':
      if (provider === 'anthropic') {
        statusText = 'AI Ready'
      } else {
        statusText = `AI Ready`
      }
      break
    case 'hardware-insufficient':
      statusText = 'AI: Setup required'
      break
    case 'downloading':
      statusText = `Downloading model... ${downloadProgress}%`
      break
    case 'error':
      statusText = 'AI: Error'
      break
  }

  return (
    <div className="h-6 flex items-center px-3 border-t border-border bg-card text-[11px] text-muted-foreground shrink-0 select-none">
      <div className="flex items-center gap-1.5">
        {showProgress ? (
          <Download className={cn('h-2.5 w-2.5 animate-pulse', statusColor)} />
        ) : (
          <Circle className={cn('h-1.5 w-1.5 fill-current', statusColor)} />
        )}
        <span>{statusText}</span>
        {showProgress && (
          <div className="w-20 h-1 bg-muted rounded-full overflow-hidden ml-1">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
        )}
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span>{nodeCount} node{nodeCount !== 1 ? 's' : ''}</span>
        <span className="flex items-center gap-1">
          <Keyboard className="h-2.5 w-2.5" />
          <span>/ for AI</span>
        </span>
      </div>
    </div>
  )
}
