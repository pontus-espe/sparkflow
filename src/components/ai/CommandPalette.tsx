import { useState, useCallback, useRef, useEffect } from 'react'
import { useAIStore } from '@/stores/ai-store'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Sparkles, X, FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDataStore } from '@/stores/data-store'

interface CommandPaletteProps {
  position: { x: number; y: number } | null
  onClose: () => void
  onSubmit: (prompt: string, dataSourceIds?: string[]) => void
  dataSourceIds?: string[]
}

export function CommandPalette({ position, onClose, onSubmit, dataSourceIds }: CommandPaletteProps) {
  const [prompt, setPrompt] = useState('')
  const { status } = useAIStore()
  const sources = useDataStore((s) => s.sources)
  const inputRef = useRef<HTMLInputElement>(null)
  const paletteRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (position && inputRef.current) {
      inputRef.current.focus()
    }
  }, [position])

  // Close on Escape
  useEffect(() => {
    if (!position) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [position, onClose])

  // Close on click outside palette (without blocking canvas interaction)
  useEffect(() => {
    if (!position) return

    const handleMouseDown = (e: MouseEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(e.target as Node)) {
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
  }, [position, onClose])

  const handleSubmit = useCallback(() => {
    if (!prompt.trim()) return
    onSubmit(prompt.trim(), dataSourceIds)
    setPrompt('')
    onClose()
  }, [prompt, onSubmit, onClose, dataSourceIds])

  if (!position) return null

  const isReady = status === 'ready'

  return (
    <div
      ref={paletteRef}
      className="fixed z-50 w-[480px] rounded-xl border bg-popover shadow-2xl overflow-hidden"
      style={{
        left: Math.min(position.x, window.innerWidth - 500),
        top: Math.min(position.y, window.innerHeight - 400)
      }}
    >
      {/* Data source badges */}
      {dataSourceIds && dataSourceIds.length > 0 && (
        <div className="flex items-center gap-2 px-3 pt-2 pb-1">
          {dataSourceIds.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              <FileSpreadsheet className="h-3 w-3" />
              {sources[id]?.name || id}
            </span>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-center gap-2 p-3 border-b">
        <Sparkles className="h-4 w-4 text-primary shrink-0" />
        <Input
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder={isReady ? 'Describe a microapp...' : 'AI is not ready yet...'}
          disabled={!isReady}
          className="border-0 shadow-none focus-visible:ring-0 bg-transparent"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-7 w-7 shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 text-xs text-muted-foreground border-t">
        {isReady ? (
          <span>Press <kbd className="px-1 py-0.5 rounded bg-muted text-foreground">Enter</kbd> to generate — the app will appear on canvas</span>
        ) : (
          <span className={cn(
            (status === 'starting') && 'text-yellow-500',
            (status === 'downloading' || status === 'downloading-ollama' || status === 'pulling-model') && 'text-blue-500',
            status === 'error' && 'text-destructive'
          )}>
            {status === 'starting' && 'Ollama is starting...'}
            {status === 'downloading-ollama' && 'Downloading Ollama runtime...'}
            {status === 'pulling-model' && 'Downloading AI model... This may take a few minutes.'}
            {status === 'downloading' && 'Downloading AI model...'}
            {status === 'error' && 'AI connection error. Is Ollama running?'}
            {status === 'not-started' && 'Connecting to AI...'}
          </span>
        )}
      </div>
    </div>
  )
}
