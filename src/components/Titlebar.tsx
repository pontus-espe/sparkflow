import { useState, useEffect, useCallback, useRef } from 'react'
import { Minus, Square, X, Maximize2, Plus, LayoutGrid, Search, Sun, Moon, ChevronDown, Circle, Cloud, Cpu, ArrowUpCircle, RotateCcw, Globe } from 'lucide-react'
import appIcon from '@/assets/icon.png'
import { windowControls } from '@/services/ipc-client'
import { ipc } from '@/services/ipc-client'
import { useBoardStore, type BoardInfo } from '@/stores/board-store'
import { useMicroappStore } from '@/stores/microapp-store'
import { useDataStore } from '@/stores/data-store'
import { useAIStore, LANGUAGES } from '@/stores/ai-store'
import { ModelSettings } from '@/components/ai/ModelSettings'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import type { MicroappIcon, MicroappColor } from '@/types/microapp'

const ANTHROPIC_MODEL_NAMES: Record<string, string> = {
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-opus-4-6': 'Opus 4.6',
  'claude-haiku-4-5-20251001': 'Haiku 4.5'
}

function formatAnthropicModel(modelId: string | null): string {
  if (!modelId) return 'Anthropic'
  return ANTHROPIC_MODEL_NAMES[modelId] || modelId.replace('claude-', '').replace(/-\d{8}$/, '')
}

// Track which boards have open tabs
interface TabInfo {
  id: string
  name: string
}

type ThemeMode = 'system' | 'light' | 'dark'

function resolveIsDark(mode: ThemeMode): boolean {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  return mode === 'dark' || (mode === 'system' && prefersDark)
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle('light', !resolveIsDark(mode))
}

export function Titlebar() {
  const { t } = useTranslation()
  const [maximized, setMaximized] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>(() => {
    return (localStorage.getItem('board-theme') as ThemeMode) || 'system'
  })
  const [openTabs, setOpenTabs] = useState<TabInfo[]>(() => {
    try {
      const saved = localStorage.getItem('board-open-tabs')
      if (saved) {
        const parsed = JSON.parse(saved) as TabInfo[]
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch { /* ignore */ }
    return []
  })
  const [showPicker, setShowPicker] = useState(false)
  const [allBoards, setAllBoards] = useState<BoardInfo[]>([])
  const dragTabRef = useRef<string | null>(null)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const pickerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const [showModelSettings, setShowModelSettings] = useState(false)
  const [showLangMenu, setShowLangMenu] = useState(false)
  const langMenuRef = useRef<HTMLDivElement>(null)
  const [updateInfo, setUpdateInfo] = useState<{ latestVersion: string; url: string } | null>(null)

  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const currentBoardId = useBoardStore((s) => s.currentBoardId)
  const currentBoardName = useBoardStore((s) => s.currentBoardName)
  const setCurrentBoardName = useBoardStore((s) => s.setCurrentBoardName)
  const setBoardList = useBoardStore((s) => s.setBoardList)

  const aiStatus = useAIStore((s) => s.status)
  const aiProvider = useAIStore((s) => s.provider)
  const aiModel = useAIStore((s) => s.model)
  const language = useAIStore((s) => s.language)
  const setLanguage = useAIStore((s) => s.setLanguage)

  useEffect(() => {
    windowControls.isMaximized().then(setMaximized)
    const cleanup = windowControls.onMaximizeChange(setMaximized)
    return cleanup
  }, [])

  useEffect(() => {
    const cleanup = ipc.app.onUpdateAvailable((info) => {
      setUpdateInfo({ latestVersion: info.latestVersion, url: info.url })
    })
    return cleanup
  }, [])

  const [isDark, setIsDark] = useState(() => resolveIsDark(theme))

  // Apply theme on change and listen for system preference changes
  useEffect(() => {
    applyTheme(theme)
    setIsDark(resolveIsDark(theme))
    localStorage.setItem('board-theme', theme)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (theme === 'system') {
        applyTheme('system')
        setIsDark(resolveIsDark('system'))
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const currentlyDark = resolveIsDark(t)
      return currentlyDark ? 'light' : 'dark'
    })
  }, [])

  // Persist open tabs to localStorage
  useEffect(() => {
    if (openTabs.length > 0 && openTabs[0].id) {
      localStorage.setItem('board-open-tabs', JSON.stringify(openTabs))
    }
  }, [openTabs])


  // Ensure the current board always has a tab, and keep its name in sync
  useEffect(() => {
    if (!currentBoardId) return
    setOpenTabs((tabs) => {
      const exists = tabs.some((t) => t.id === currentBoardId)
      if (!exists) return [...tabs, { id: currentBoardId, name: currentBoardName }]
      return tabs.map((t) => (t.id === currentBoardId ? { ...t, name: currentBoardName } : t))
    })
  }, [currentBoardId, currentBoardName])

  // Close language menu on click outside
  useEffect(() => {
    if (!showLangMenu) return
    const handle = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setShowLangMenu(false)
      }
    }
    const raf = requestAnimationFrame(() => document.addEventListener('mousedown', handle))
    return () => { cancelAnimationFrame(raf); document.removeEventListener('mousedown', handle) }
  }, [showLangMenu])

  const refreshBoards = useCallback(async () => {
    const boards = await ipc.board.list()
    const list = (boards || []).map((b: Record<string, unknown>) => ({
      id: b.id as string,
      name: b.name as string,
      updatedAt: b.updated_at as number
    }))
    setAllBoards(list)
    setBoardList(list)
  }, [setBoardList])

  const saveCurrentBoard = useCallback(async () => {
    const { nodes, edges, viewport, currentBoardId: id, currentBoardName: name } = useBoardStore.getState()
    const instances = useMicroappStore.getState().instances
    const microapps = Object.values(instances).map((m) => ({
      id: m.id,
      name: m.name,
      prompt: m.prompt,
      source: m.source,
      state: JSON.stringify(m.state),
      positionX: m.position.x,
      positionY: m.position.y,
      width: m.size.width,
      height: m.size.height,
      icon: m.icon || 'sparkles',
      color: m.color || 'default'
    }))
    await ipc.board.save({
      id,
      name,
      canvasState: JSON.stringify({ nodes, edges, viewport }),
      microapps
    })
  }, [])

  const loadBoard = useCallback(async (boardId: string, boardName: string) => {
    if (boardId === currentBoardId) return

    localStorage.setItem('board-active-id', boardId)
    await saveCurrentBoard()

    const microappStore = useMicroappStore.getState()
    Object.keys(microappStore.instances).forEach((mid) => microappStore.removeInstance(mid))
    const dataStore = useDataStore.getState()
    Object.keys(dataStore.sources).forEach((sid) => dataStore.removeSource(sid))

    const data = await ipc.board.load(boardId)
    if (data) {
      try {
        const canvasState = JSON.parse(data.canvas_state as string)
        const loadedNodes = (canvasState.nodes || []).map((n: { type?: string }) =>
          n.type === 'dataSource' ? { ...n, hidden: true } : n
        )
        useBoardStore.setState({
          currentBoardId: boardId,
          currentBoardName: boardName,
          nodes: loadedNodes,
          edges: canvasState.edges || [],
          viewport: canvasState.viewport || { x: 0, y: 0, zoom: 1 }
        })

        const microapps = (data.microapps || []) as Array<Record<string, unknown>>
        for (const m of microapps) {
          microappStore.addInstance({
            id: m.id as string,
            boardId,
            name: m.name as string,
            prompt: m.prompt as string,
            source: m.source as string,
            compiled: null,
            error: null,
            status: 'ready',
            streamingText: '',
            icon: ((m.icon as string) || 'sparkles') as MicroappIcon,
            color: ((m.color as string) || 'default') as MicroappColor,
            state: (m.state as Record<string, unknown>) || {},
            position: { x: m.position_x as number, y: m.position_y as number },
            size: { width: m.width as number, height: m.height as number },
            createdAt: m.created_at as number,
            updatedAt: m.updated_at as number
          })
        }

        const dataSources = (data.dataSources || []) as Array<Record<string, unknown>>
        for (const s of dataSources) {
          dataStore.addSource({
            id: s.id as string,
            boardId: s.board_id as string,
            name: s.name as string,
            type: s.type as 'excel' | 'csv' | 'manual',
            columns: s.columns_def as { name: string; type: 'text' | 'number' | 'date' | 'boolean' }[],
            rowCount: s.row_count as number,
            filePath: (s.file_path as string) || undefined,
            config: {},
            createdAt: s.created_at as number,
            updatedAt: s.updated_at as number
          })
          if (s.data) {
            dataStore.setCachedData(s.id as string, s.data as unknown[])
          }
        }
      } catch {
        useBoardStore.setState({
          currentBoardId: boardId,
          currentBoardName: boardName,
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 }
        })
      }
    }
  }, [currentBoardId, saveCurrentBoard])

  // Agent-triggered board navigation
  useEffect(() => {
    const handler = (e: Event) => {
      const { boardId, boardName } = (e as CustomEvent).detail
      loadBoard(boardId, boardName)
    }
    window.addEventListener('agent:navigate-board', handler)
    return () => window.removeEventListener('agent:navigate-board', handler)
  }, [loadBoard])

  const handleTabClick = useCallback((tab: TabInfo) => {
    loadBoard(tab.id, tab.name)
  }, [loadBoard])

  const handleCloseTab = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    setOpenTabs((tabs) => {
      const remaining = tabs.filter((t) => t.id !== tabId)
      if (remaining.length === 0) return tabs // Don't close last tab

      // If closing active tab, switch to the nearest one
      if (tabId === currentBoardId) {
        const idx = tabs.findIndex((t) => t.id === tabId)
        const next = remaining[Math.min(idx, remaining.length - 1)]
        loadBoard(next.id, next.name)
      }
      return remaining
    })
  }, [currentBoardId, loadBoard])

  const handleTabDoubleClick = useCallback((tab: TabInfo) => {
    setEditingTabId(tab.id)
    setEditingName(tab.name)
    setTimeout(() => editInputRef.current?.select(), 0)
  }, [])

  const handleRenameSubmit = useCallback(() => {
    const trimmed = editingName.trim()
    if (editingTabId && trimmed && trimmed !== '') {
      setOpenTabs((tabs) =>
        tabs.map((t) => (t.id === editingTabId ? { ...t, name: trimmed } : t))
      )
      if (editingTabId === currentBoardId) {
        setCurrentBoardName(trimmed)
        // Persist to database
        setTimeout(() => saveCurrentBoard(), 0)
      }
    }
    setEditingTabId(null)
  }, [editingTabId, editingName, currentBoardId, setCurrentBoardName, saveCurrentBoard])

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleRenameSubmit()
    } else if (e.key === 'Escape') {
      setEditingTabId(null)
    }
  }, [handleRenameSubmit])

  const handleOpenPicker = useCallback(async () => {
    await refreshBoards()
    setSearchQuery('')
    setShowPicker(true)
    setTimeout(() => searchRef.current?.focus(), 0)
  }, [refreshBoards])

  const handlePickBoard = useCallback((board: BoardInfo) => {
    setShowPicker(false)
    // Add tab if not already open
    setOpenTabs((tabs) => {
      if (tabs.some((t) => t.id === board.id)) return tabs
      return [...tabs, { id: board.id, name: board.name }]
    })
    loadBoard(board.id, board.name)
  }, [loadBoard])

  const handleCreateBoard = useCallback(async () => {
    await saveCurrentBoard()
    const result = await ipc.board.create('Untitled Board')
    if (result?.id) {
      const microappStore = useMicroappStore.getState()
      Object.keys(microappStore.instances).forEach((mid) => microappStore.removeInstance(mid))
      const dataStore = useDataStore.getState()
      Object.keys(dataStore.sources).forEach((sid) => dataStore.removeSource(sid))

      localStorage.setItem('board-active-id', result.id)
      useBoardStore.setState({
        currentBoardId: result.id,
        currentBoardName: result.name,
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 }
      })
      setOpenTabs((tabs) => [...tabs, { id: result.id, name: result.name }])
      await refreshBoards()

      // Immediately enter rename mode on the new tab
      setEditingTabId(result.id)
      setEditingName(result.name)
      setTimeout(() => editInputRef.current?.select(), 0)
    }
    setShowPicker(false)
  }, [saveCurrentBoard, refreshBoards])

  // Close picker on click outside
  useEffect(() => {
    if (!showPicker) return
    const handle = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    const timer = setTimeout(() => window.addEventListener('mousedown', handle), 0)
    return () => { clearTimeout(timer); window.removeEventListener('mousedown', handle) }
  }, [showPicker])

  const filteredBoards = allBoards.filter((b) =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const openTabIds = new Set(openTabs.map((t) => t.id))

  return (
    <>
      <div className="titlebar flex items-center h-9 bg-background border-b border-border select-none shrink-0">
        {/* App icon */}
        <div className="flex items-center justify-center h-full w-9 shrink-0 border-r border-border/50">
          <img src={appIcon} alt="Board" className="h-5 w-5 rounded-sm" draggable={false} />
        </div>

        {/* Tabs */}
        <div className="flex items-center h-full overflow-x-auto overflow-y-hidden min-w-0">
          {openTabs.map((tab) => (
            <button
              key={tab.id}
              draggable={editingTabId !== tab.id}
              onDragStart={(e) => {
                dragTabRef.current = tab.id
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dragTabRef.current && dragTabRef.current !== tab.id) {
                  setDragOverTabId(tab.id)
                }
              }}
              onDragLeave={() => setDragOverTabId(null)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOverTabId(null)
                const fromId = dragTabRef.current
                dragTabRef.current = null
                if (!fromId || fromId === tab.id) return
                setOpenTabs((tabs) => {
                  const fromIdx = tabs.findIndex((t) => t.id === fromId)
                  const toIdx = tabs.findIndex((t) => t.id === tab.id)
                  if (fromIdx === -1 || toIdx === -1) return tabs
                  const reordered = [...tabs]
                  const [moved] = reordered.splice(fromIdx, 1)
                  reordered.splice(toIdx, 0, moved)
                  return reordered
                })
              }}
              onDragEnd={() => { dragTabRef.current = null; setDragOverTabId(null) }}
              onClick={() => handleTabClick(tab)}
              onDoubleClick={() => handleTabDoubleClick(tab)}
              className={cn(
                'group flex items-center gap-1.5 h-full px-3 text-xs border-r border-border/50 transition-colors shrink-0 max-w-44',
                tab.id === currentBoardId
                  ? 'bg-card text-foreground'
                  : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
                dragOverTabId === tab.id && 'border-l-2 border-l-primary'
              )}
            >
              <LayoutGrid className="h-2.5 w-2.5 shrink-0" />
              {editingTabId === tab.id ? (
                <input
                  ref={editInputRef}
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={handleRenameSubmit}
                  onKeyDown={handleRenameKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-transparent outline-none border-b border-primary text-xs w-24"
                  autoFocus
                />
              ) : (
                <span className="truncate">{tab.name}</span>
              )}
              {openTabs.length > 1 && editingTabId !== tab.id && (
                <span
                  onClick={(e) => handleCloseTab(e, tab.id)}
                  className="ml-0.5 shrink-0 rounded-sm p-0.5 opacity-0 group-hover:opacity-100 hover:bg-muted transition-all"
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              )}
            </button>
          ))}

          {/* Add tab button — also acts as drop zone for end position */}
          <button
            onClick={handleOpenPicker}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (dragTabRef.current) setDragOverTabId('__end')
            }}
            onDragLeave={() => setDragOverTabId(null)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOverTabId(null)
              const fromId = dragTabRef.current
              dragTabRef.current = null
              if (!fromId) return
              setOpenTabs((tabs) => {
                const fromIdx = tabs.findIndex((t) => t.id === fromId)
                if (fromIdx === -1) return tabs
                const reordered = [...tabs]
                const [moved] = reordered.splice(fromIdx, 1)
                reordered.push(moved)
                return reordered
              })
            }}
            className={cn(
              'flex items-center justify-center h-full px-2 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors shrink-0',
              dragOverTabId === '__end' && 'border-l-2 border-l-primary'
            )}
            title="Open board"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Draggable area */}
        <div className="flex-1 h-full app-drag-region" />

        {/* AI selector + Theme toggle + window controls */}
        <div className="flex items-center h-full shrink-0 gap-1 px-1.5">
          {/* Update available */}
          {updateInfo && (
            <button
              onClick={() => ipc.app.openExternal(updateInfo.url)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-muted transition-colors text-xs text-green-500 hover:text-green-400"
              tabIndex={-1}
              title={t('update.available', { version: updateInfo.latestVersion })}
            >
              <ArrowUpCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">v{updateInfo.latestVersion}</span>
            </button>
          )}
          {/* Dev: reset data */}
          {import.meta.env.DEV && (
            <button
              onClick={async () => {
                await ipc.board.reset()
                setOpenTabs([])
                localStorage.removeItem('board-active-id')
                localStorage.removeItem('board-open-tabs')
                window.location.reload()
              }}
              className="flex items-center justify-center p-1.5 rounded-lg hover:bg-red-500/20 transition-colors text-muted-foreground hover:text-red-400"
              tabIndex={-1}
              title={t('board.resetDev')}
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
          {/* AI model selector */}
          <button
            onClick={() => setShowModelSettings((v) => !v)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-muted transition-colors text-xs text-muted-foreground hover:text-foreground"
            tabIndex={-1}
          >
            <Circle className={cn('h-1.5 w-1.5 fill-current', {
              'text-green-500': aiStatus === 'ready',
              'text-yellow-500': aiStatus === 'starting' || aiStatus === 'hardware-insufficient' || aiStatus === 'warming-model',
              'text-blue-500': aiStatus === 'downloading-ollama' || aiStatus === 'pulling-model' || aiStatus === 'downloading',
              'text-destructive': aiStatus === 'error',
              'text-muted-foreground': aiStatus === 'not-started'
            })} />
            {aiProvider === 'anthropic' ? (
              <Cloud className="h-3 w-3" />
            ) : (
              <Cpu className="h-3 w-3" />
            )}
            <span className="max-w-28 truncate">
              {aiStatus !== 'ready'
                ? t('ai.label')
                : aiProvider === 'anthropic'
                  ? formatAnthropicModel(aiModel)
                  : (aiModel || 'Local').split(':')[0]
              }
            </span>
            <ChevronDown className="h-2.5 w-2.5 opacity-50" />
          </button>

          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => setShowLangMenu((v) => !v)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-muted transition-colors text-xs text-muted-foreground hover:text-foreground"
              tabIndex={-1}
              title={t('settings.language')}
            >
              <Globe className="h-3.5 w-3.5" />
              <span>{LANGUAGES.find((l) => l.id === language)?.flag}</span>
            </button>
            {showLangMenu && (
              <div
                ref={langMenuRef}
                className="absolute top-full right-0 mt-1 z-50 w-36 rounded-lg border bg-popover shadow-xl py-1"
              >
                {LANGUAGES.map((lang) => {
                  const isActive = language === lang.id
                  return (
                    <button
                      key={lang.id}
                      onClick={() => { setLanguage(lang.id); setShowLangMenu(false) }}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left transition-colors',
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-accent/50 text-foreground'
                      )}
                    >
                      <span>{lang.flag}</span>
                      <span>{lang.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center p-1.5 rounded-lg hover:bg-muted transition-colors"
            tabIndex={-1}
            title={isDark ? t('theme.light') : t('theme.dark')}
          >
            <div className={cn(
              'relative w-8 h-4 rounded-full transition-colors duration-200',
              isDark ? 'bg-muted' : 'bg-primary/20'
            )}>
              <div className={cn(
                'absolute top-0.5 h-3 w-3 rounded-full flex items-center justify-center transition-all duration-200',
                isDark ? 'left-0.5 bg-muted-foreground' : 'left-[18px] bg-primary'
              )}>
                {isDark ? (
                  <Moon className="h-1.5 w-1.5 text-background" />
                ) : (
                  <Sun className="h-1.5 w-1.5 text-primary-foreground" />
                )}
              </div>
            </div>
          </button>

          <div className="w-px h-3.5 bg-border/50 mx-0.5" />

          {/* Window controls — keep rectangular, these are OS-standard */}
          <button
            onClick={() => windowControls.minimize()}
            className="flex items-center justify-center p-1.5 rounded-lg hover:bg-muted transition-colors"
            tabIndex={-1}
          >
            <Minus className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => windowControls.maximize()}
            className="flex items-center justify-center p-1.5 rounded-lg hover:bg-muted transition-colors"
            tabIndex={-1}
          >
            {maximized ? (
              <Maximize2 className="h-3 w-3 text-muted-foreground" />
            ) : (
              <Square className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
          <button
            onClick={() => windowControls.close()}
            className="flex items-center justify-center p-1.5 rounded-lg hover:bg-red-500 hover:text-white transition-colors"
            tabIndex={-1}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* AI Model Settings */}
      <ModelSettings open={showModelSettings} onClose={() => setShowModelSettings(false)} anchor="titlebar" />

      {/* Board picker overlay */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/40 backdrop-blur-sm">
          <div ref={pickerRef} className="w-96 rounded-xl border bg-card shadow-2xl overflow-hidden">
            {/* Search */}
            <div className="flex items-center gap-2 px-4 py-3 border-b">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('board.search')}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            {/* Board list */}
            <div className="max-h-72 overflow-auto py-1">
              {filteredBoards.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">{t('board.noBoards')}</p>
              )}
              {filteredBoards.map((board) => (
                <button
                  key={board.id}
                  onClick={() => handlePickBoard(board)}
                  className={cn(
                    'w-full text-left px-4 py-2 text-sm hover:bg-muted/50 transition-colors flex items-center gap-3',
                    board.id === currentBoardId && 'text-primary'
                  )}
                >
                  <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate flex-1">{board.name}</span>
                  {openTabIds.has(board.id) && (
                    <span className="text-[10px] text-muted-foreground">{t('board.open.badge')}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Create new */}
            <div className="border-t px-3 py-2">
              <button
                onClick={handleCreateBoard}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted rounded-lg transition-colors"
              >
                <Plus className="h-3.5 w-3.5 text-primary" />
                <span>{t('board.new')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
