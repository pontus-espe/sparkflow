import { memo, useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { type NodeProps, NodeResizeControl, Handle, Position } from '@xyflow/react'
import {
  Code, Sparkles, Trash2, Loader2, RotateCcw, AlertCircle, Database, MoreHorizontal, Palette,
  BarChart3, List, Calendar, Mail, Users, DollarSign, Heart, Star,
  Clock, Map, Image, Music, Search, Settings, Shield, Zap, Briefcase, Table
} from 'lucide-react'
import { MicroappRenderer } from '@/components/microapp/MicroappRenderer'
import { useBoardStore } from '@/stores/board-store'
import { useMicroappStore } from '@/stores/microapp-store'
import { generateMicroapp } from '@/services/generation'
import type { MicroappNodeData, MicroappIcon, MicroappColor } from '@/types/microapp'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'

const ICON_MAP: Record<MicroappIcon, React.ComponentType<{ className?: string }>> = {
  sparkles: Sparkles, table: Table, chart: BarChart3, list: List, calendar: Calendar,
  mail: Mail, users: Users, dollar: DollarSign, heart: Heart, star: Star,
  clock: Clock, map: Map, image: Image, music: Music, code: Code,
  search: Search, settings: Settings, shield: Shield, zap: Zap, briefcase: Briefcase
}

const COLOR_CLASSES: Record<MicroappColor, { border: string; bar: string; icon: string; accent: string }> = {
  default: { border: 'border-border', bar: 'bg-card/80', icon: 'text-primary', accent: 'bg-primary/10' },
  blue: { border: 'border-blue-500/40', bar: 'bg-blue-950/60', icon: 'text-blue-400', accent: 'bg-blue-500/10' },
  green: { border: 'border-green-500/40', bar: 'bg-green-950/60', icon: 'text-green-400', accent: 'bg-green-500/10' },
  purple: { border: 'border-purple-500/40', bar: 'bg-purple-950/60', icon: 'text-purple-400', accent: 'bg-purple-500/10' },
  orange: { border: 'border-orange-500/40', bar: 'bg-orange-950/60', icon: 'text-orange-400', accent: 'bg-orange-500/10' },
  red: { border: 'border-red-500/40', bar: 'bg-red-950/60', icon: 'text-red-400', accent: 'bg-red-500/10' },
  pink: { border: 'border-pink-500/40', bar: 'bg-pink-950/60', icon: 'text-pink-400', accent: 'bg-pink-500/10' },
  yellow: { border: 'border-yellow-500/40', bar: 'bg-yellow-950/60', icon: 'text-yellow-400', accent: 'bg-yellow-500/10' }
}

const COLOR_SWATCHES: { id: MicroappColor; bg: string }[] = [
  { id: 'default', bg: 'bg-muted' },
  { id: 'blue', bg: 'bg-blue-500' },
  { id: 'green', bg: 'bg-green-500' },
  { id: 'purple', bg: 'bg-purple-500' },
  { id: 'orange', bg: 'bg-orange-500' },
  { id: 'red', bg: 'bg-red-500' },
  { id: 'pink', bg: 'bg-pink-500' },
  { id: 'yellow', bg: 'bg-yellow-500' }
]

const ICON_LIST: MicroappIcon[] = [
  'sparkles', 'table', 'chart', 'list', 'calendar',
  'mail', 'users', 'dollar', 'heart', 'star',
  'clock', 'map', 'image', 'music', 'code',
  'search', 'settings', 'shield', 'zap', 'briefcase'
]

function MicroappNodeComponent({ id, data, selected }: NodeProps) {
  const { microappId, name } = data as MicroappNodeData
  const removeNode = useBoardStore((s) => s.removeNode)
  const removeInstance = useMicroappStore((s) => s.removeInstance)
  const updateInstance = useMicroappStore((s) => s.updateInstance)
  const instance = useMicroappStore((s) => s.instances[microappId])
  const { t } = useTranslation()
  const [showSource, setShowSource] = useState(false)
  const [editingSource, setEditingSource] = useState('')
  const [dataVisible, setDataVisible] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showCustomize, setShowCustomize] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const appColor = (instance?.color || 'default') as MicroappColor
  const appIcon = (instance?.icon || 'sparkles') as MicroappIcon
  const colorClasses = COLOR_CLASSES[appColor]
  const IconComponent = ICON_MAP[appIcon] || Sparkles

  const status = instance?.status || 'ready'
  const isWorking = status === 'queued' || status === 'generating' || status === 'retrying'
  const isReady = status === 'ready' || (status === 'error' && !!instance?.source)

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      removeNode(id)
      removeInstance(microappId)
    },
    [id, microappId, removeNode, removeInstance]
  )

  const handleEditSource = useCallback(() => {
    if (instance?.source) {
      setEditingSource(instance.source)
      setShowSource(true)
    }
  }, [instance?.source])

  const handleSaveSource = useCallback(() => {
    updateInstance(microappId, { source: editingSource, status: 'ready', error: null })
    setShowSource(false)
  }, [microappId, editingSource, updateInstance])

  const handleRegenerate = useCallback(() => {
    if (instance?.prompt) {
      generateMicroapp(microappId, instance.prompt)
    }
  }, [microappId, instance?.prompt])

  // Find data source nodes connected to this microapp via edges
  const connectedDataSourceKey = useBoardStore((s) =>
    s.edges.filter((e) => e.target === id).map((e) => e.source).join(',')
  )
  const connectedDataSourceIds = useMemo(
    () => connectedDataSourceKey ? connectedDataSourceKey.split(',') : [],
    [connectedDataSourceKey]
  )
  const hasDataSources = connectedDataSourceIds.length > 0

  const handleToggleData = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      const store = useBoardStore.getState()
      const newVisible = !dataVisible
      setDataVisible(newVisible)
      const updatedNodes = store.nodes.map((n) =>
        connectedDataSourceIds.includes(n.id)
          ? { ...n, hidden: !newVisible }
          : n
      )
      useBoardStore.setState({ nodes: updatedNodes })
    },
    [dataVisible, connectedDataSourceIds]
  )

  // Close menu on click outside
  useEffect(() => {
    if (!showMenu) return
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
        setShowCustomize(false)
      }
    }
    const timer = setTimeout(() => window.addEventListener('mousedown', handle), 0)
    return () => { clearTimeout(timer); window.removeEventListener('mousedown', handle) }
  }, [showMenu])

  return (
    <>
      <NodeResizeControl
        minWidth={280}
        minHeight={200}
        style={{ background: 'transparent', border: 'none' }}
      />
      <Handle type="target" position={Position.Left} className="!bg-primary !w-2.5 !h-2.5" />
      <div
        className={cn("group relative flex flex-col rounded-xl border bg-card shadow-lg overflow-hidden", colorClasses.border)}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Title bar — always visible, acts as drag handle */}
        <div
          className={cn(
            'drag-handle flex items-center gap-2 px-3 py-1.5 cursor-grab active:cursor-grabbing shrink-0',
            colorClasses.bar
          )}
        >
          {status === 'error' ? (
            <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
          ) : (
            <IconComponent className={cn("h-3.5 w-3.5 shrink-0", colorClasses.icon)} />
          )}
          <span className="text-xs font-medium truncate flex-1">{name as string}</span>

          {/* Actions — visible on hover */}
          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {status === 'error' && (
              <button
                onClick={handleRegenerate}
                className="p-1 rounded hover:bg-muted transition-colors"
                title={t('microapp.regenerate')}
              >
                <RotateCcw className="h-3.5 w-3.5 text-primary" />
              </button>
            )}
            <button
              onClick={handleDelete}
              className="p-1 rounded hover:bg-destructive/20 transition-colors"
              title={t('microapp.delete')}
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); setShowCustomize(false) }}
              className={cn("p-1 rounded transition-colors", showMenu ? 'bg-muted' : 'hover:bg-muted')}
              title={t('microapp.moreOptions')}
            >
              <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Dropdown menu */}
        {showMenu && (
          <div
            ref={menuRef}
            className="absolute top-8 right-2 z-30 w-44 rounded-lg border bg-popover shadow-xl py-1 nodrag nowheel nopan"
          >
            {instance?.prompt && (
              <button
                onClick={() => { handleRegenerate(); setShowMenu(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {t('microapp.regenerateAI')}
              </button>
            )}
            {instance?.source && (
              <button
                onClick={() => { handleEditSource(); setShowMenu(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left"
              >
                <Code className="h-3.5 w-3.5 text-muted-foreground" />
                {t('microapp.editCode')}
              </button>
            )}
            {hasDataSources && (
              <button
                onClick={(e) => { handleToggleData(e); setShowMenu(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left"
              >
                <Database className="h-3.5 w-3.5 text-muted-foreground" />
                {dataVisible ? t('microapp.hideData') : t('microapp.showData')}
              </button>
            )}
            <button
              onClick={() => setShowCustomize((v) => !v)}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left"
            >
              <Palette className="h-3.5 w-3.5 text-muted-foreground" />
              {t('microapp.customize')}
            </button>

            {/* Inline customize panel */}
            {showCustomize && (
              <div className="border-t mt-1 pt-1.5 px-3 pb-2 space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground w-10 shrink-0">{t('microapp.color')}</span>
                  <div className="flex gap-1 flex-wrap">
                    {COLOR_SWATCHES.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => updateInstance(microappId, { color: s.id })}
                        className={cn(
                          'w-4 h-4 rounded-full transition-all',
                          s.bg,
                          appColor === s.id ? 'ring-2 ring-foreground ring-offset-1 ring-offset-card scale-110' : 'hover:scale-110'
                        )}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-[10px] text-muted-foreground w-10 shrink-0 pt-0.5">{t('microapp.icon')}</span>
                  <div className="flex gap-1 flex-wrap">
                    {ICON_LIST.map((iconName) => {
                      const Icon = ICON_MAP[iconName]
                      return (
                        <button
                          key={iconName}
                          onClick={() => updateInstance(microappId, { icon: iconName })}
                          className={cn(
                            'p-1 rounded transition-colors',
                            appIcon === iconName ? cn(colorClasses.accent, colorClasses.icon) : 'hover:bg-muted text-muted-foreground'
                          )}
                        >
                          <Icon className="h-3 w-3" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="border-t mt-1 pt-1">
              <button
                onClick={handleDelete}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-destructive/10 transition-colors text-left text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('microapp.delete')}
              </button>
            </div>
          </div>
        )}

        {/* Content area */}
        <div className={cn(
          'flex-1 overflow-auto',
          isReady && !showSource ? 'nodrag nowheel nopan' : ''
        )}>
          {showSource ? (
            <div className="flex flex-col h-full">
              <textarea
                value={editingSource}
                onChange={(e) => setEditingSource(e.target.value)}
                className="flex-1 bg-muted/30 p-3 text-xs font-mono resize-none outline-none"
                spellCheck={false}
              />
              <div className="flex gap-2 p-2 border-t">
                <button
                  onClick={handleSaveSource}
                  className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {t('microapp.saveRecompile')}
                </button>
                <button
                  onClick={() => setShowSource(false)}
                  className="text-xs px-3 py-1 rounded bg-muted hover:bg-muted/80"
                >
                  {t('microapp.cancel')}
                </button>
              </div>
            </div>
          ) : isWorking ? (
            <GeneratingView
              status={status}
              streamingText={instance?.streamingText || ''}
              error={instance?.error || null}
              prompt={instance?.prompt || ''}
            />
          ) : status === 'error' && !instance?.source ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 gap-3 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm font-medium text-destructive">{t('microapp.generationFailed')}</p>
              <pre className="text-xs text-muted-foreground max-w-full overflow-auto bg-muted p-2 rounded max-h-24">
                {instance?.error}
              </pre>
              <button
                onClick={handleRegenerate}
                className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5"
              >
                <RotateCcw className="h-3 w-3" />
                {t('microapp.retry')}
              </button>
            </div>
          ) : (
            <MicroappRenderer microappId={microappId} onEditSource={handleEditSource} />
          )}
        </div>
      </div>
    </>
  )
}

function extractReasoning(text: string): { reasoning: string; code: string } {
  const thinkMatch = text.match(/<think>([\s\S]*?)(<\/think>|$)/)
  if (thinkMatch) {
    const reasoning = thinkMatch[1].trim()
    const code = text.replace(/<think>[\s\S]*?(<\/think>|$)/, '').trim()
    return { reasoning, code }
  }
  return { reasoning: '', code: text }
}

function SkeletonLine({ width }: { width: string }) {
  return <div className={cn('h-2 rounded bg-muted animate-pulse', width)} />
}

function GeneratingView({ status, streamingText, error, prompt }: {
  status: string
  streamingText: string
  error: string | null
  prompt: string
}) {
  const { t } = useTranslation()
  const { reasoning } = extractReasoning(streamingText)
  const hasContent = streamingText.length > 0

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Skeleton app mockup */}
      <div className="flex-1 p-4 space-y-4">
        <div className="space-y-2">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-1/2" />
        </div>
        <div className="space-y-3 pt-2">
          <div className="flex gap-3">
            <SkeletonLine width="w-full" />
          </div>
          <div className="flex gap-3">
            <SkeletonLine width="w-3/4" />
          </div>
          <div className="flex gap-3">
            <SkeletonLine width="w-5/6" />
          </div>
          <div className="flex gap-3">
            <SkeletonLine width="w-2/3" />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <div className="h-6 w-16 rounded bg-muted animate-pulse" />
          <div className="h-6 w-16 rounded bg-muted animate-pulse" />
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="shrink-0 border-t bg-muted/30 px-3 py-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <Loader2 className="h-3 w-3 text-primary animate-spin shrink-0" />
          <span className={cn(
            'text-[11px] font-medium',
            status === 'retrying' ? 'text-yellow-500' : 'text-primary'
          )}>
            {status === 'queued' && t('microapp.queued')}
            {status === 'generating' && t('microapp.building')}
            {status === 'retrying' && t('microapp.autoFixing')}
          </span>
        </div>

        {status === 'retrying' && error && (
          <p className="text-[10px] text-yellow-500/80 truncate">{error}</p>
        )}

        {reasoning ? (
          <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-3 italic">
            {reasoning}
          </p>
        ) : !hasContent ? (
          <p className="text-[10px] text-muted-foreground truncate italic">"{prompt}"</p>
        ) : null}
      </div>
    </div>
  )
}

export const MicroappNode = memo(MicroappNodeComponent)
