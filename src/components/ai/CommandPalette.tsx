import { useState, useCallback, useRef, useEffect } from 'react'
import { useAIStore } from '@/stores/ai-store'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Sparkles, X, FileSpreadsheet, Table } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDataStore } from '@/stores/data-store'
import { useTranslation } from '@/lib/i18n'

interface CommandPaletteProps {
  position: { x: number; y: number } | null
  onClose: () => void
  onSubmit: (prompt: string, dataSourceIds?: string[]) => void
  dataSourceIds?: string[]
}

/** Strip file extension and capitalize first letter */
function formatSourceName(name: string): string {
  const stripped = name.replace(/\.(csv|xlsx?|tsv|json)$/i, '')
  return stripped.charAt(0).toUpperCase() + stripped.slice(1)
}

export function CommandPalette({ position, onClose, onSubmit, dataSourceIds }: CommandPaletteProps) {
  const [prompt, setPrompt] = useState('')
  const [activeSourceIds, setActiveSourceIds] = useState<string[]>(dataSourceIds || [])
  const { status } = useAIStore()
  const { t } = useTranslation()
  const sources = useDataStore((s) => s.sources)
  const inputRef = useRef<HTMLInputElement>(null)
  const paletteRef = useRef<HTMLDivElement>(null)

  // Sync when prop changes (e.g. palette reopens with different sources)
  useEffect(() => {
    setActiveSourceIds(dataSourceIds || [])
  }, [dataSourceIds])

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

  const handleRemoveSource = useCallback((id: string) => {
    setActiveSourceIds((prev) => prev.filter((s) => s !== id))
  }, [])

  const handleSubmit = useCallback(() => {
    if (!prompt.trim()) return
    const ids = activeSourceIds.length > 0 ? activeSourceIds : undefined
    onSubmit(prompt.trim(), ids)
    setPrompt('')
    onClose()
  }, [prompt, onSubmit, onClose, activeSourceIds])

  if (!position) return null

  const isReady = status === 'ready'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/40 backdrop-blur-sm">
      <div
        ref={paletteRef}
        className="w-[480px] rounded-xl border bg-popover shadow-2xl overflow-hidden"
      >
      {/* Data source chips */}
      {activeSourceIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5 pb-1">
          {activeSourceIds.map((id) => {
            const source = sources[id]
            const sourceType = source?.type
            const displayName = source ? formatSourceName(source.name) : id
            const isExcel = sourceType === 'excel'

            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/60 pl-2 pr-1 py-1 text-xs text-foreground transition-colors hover:bg-muted"
              >
                {isExcel ? (
                  <FileSpreadsheet className="h-3.5 w-3.5 text-green-500 shrink-0" />
                ) : (
                  <Table className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                )}
                <span className="truncate max-w-[160px]">{displayName}</span>
                <button
                  onClick={() => handleRemoveSource(id)}
                  className="ml-0.5 rounded-md p-0.5 text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}
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
          placeholder={isReady ? t('command.placeholder') : t('command.placeholderDisabled')}
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
          <span>{t('command.hint')}</span>
        ) : (
          <span className={cn(
            (status === 'starting') && 'text-yellow-500',
            (status === 'downloading' || status === 'downloading-ollama' || status === 'pulling-model') && 'text-blue-500',
            status === 'error' && 'text-destructive'
          )}>
            {status === 'starting' && t('ai.starting')}
            {status === 'downloading-ollama' && t('ai.downloadingRuntime')}
            {status === 'pulling-model' && t('ai.downloadingModelLong')}
            {status === 'downloading' && t('ai.downloadingModel')}
            {status === 'error' && t('ai.connectionError')}
            {status === 'not-started' && t('ai.connecting')}
          </span>
        )}
      </div>
      </div>
    </div>
  )
}
