import { useState, useEffect, useCallback, useRef } from 'react'
import { Minus, Square, X, Maximize2, Plus, LayoutGrid, Search, Sun, Moon, ChevronDown, Circle, Cloud, Cpu } from 'lucide-react'
import appIcon from '@/assets/icon.png'
import { windowControls } from '@/services/ipc-client'
import { ipc } from '@/services/ipc-client'
import { useBoardStore, type BoardInfo } from '@/stores/board-store'
import { useMicroappStore } from '@/stores/microapp-store'
import { useDataStore } from '@/stores/data-store'
import { useAIStore } from '@/stores/ai-store'
import { ModelSettings } from '@/components/ai/ModelSettings'
import { cn } from '@/lib/utils'

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
  const [maximized, setMaximized] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>(() => {
    return (localStorage.getItem('board-theme') as ThemeMode) || 'system'
  })
  const [openTabs, setOpenTabs] = useState<TabInfo[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [allBoards, setAllBoards] = useState<BoardInfo[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const pickerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const [showModelSettings, setShowModelSettings] = useState(false)

  const currentBoardId = useBoardStore((s) => s.currentBoardId)
  const currentBoardName = useBoardStore((s) => s.currentBoardName)
  const setBoardList = useBoardStore((s) => s.setBoardList)

  const aiStatus = useAIStore((s) => s.status)
  const aiProvider = useAIStore((s) => s.provider)
  const aiModel = useAIStore((s) => s.model)

  useEffect(() => {
    windowControls.isMaximized().then(setMaximized)
    const cleanup = windowControls.onMaximizeChange(setMaximized)
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

  // Initialize the first tab on mount
  useEffect(() => {
    setOpenTabs((tabs) => {
      if (tabs.length === 0) return [{ id: currentBoardId, name: currentBoardName }]
      return tabs
    })
  }, [currentBoardId, currentBoardName])

  // Keep current tab name in sync
  useEffect(() => {
    setOpenTabs((tabs) =>
      tabs.map((t) => (t.id === currentBoardId ? { ...t, name: currentBoardName } : t))
    )
  }, [currentBoardId, currentBoardName])

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
            icon: (m.icon as string) || 'sparkles',
            color: (m.color as string) || 'default',
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

      useBoardStore.setState({
        currentBoardId: result.id,
        currentBoardName: result.name,
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 }
      })
      setOpenTabs((tabs) => [...tabs, { id: result.id, name: result.name }])
      await refreshBoards()
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
      <div className="titlebar flex items-center h-8 bg-background border-b border-border select-none shrink-0">
        {/* App icon */}
        <div className="flex items-center justify-center h-full w-8 shrink-0 border-r border-border/50">
          <img src={appIcon} alt="Board" className="h-4 w-4 rounded-sm" draggable={false} />
        </div>

        {/* Tabs */}
        <div className="flex items-center h-full overflow-x-auto overflow-y-hidden min-w-0">
          {openTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab)}
              className={cn(
                'group flex items-center gap-1.5 h-full px-3 text-xs border-r border-border/50 transition-colors shrink-0 max-w-44',
                tab.id === currentBoardId
                  ? 'bg-card text-foreground'
                  : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
              )}
            >
              <LayoutGrid className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{tab.name}</span>
              {openTabs.length > 1 && (
                <span
                  onClick={(e) => handleCloseTab(e, tab.id)}
                  className="ml-0.5 shrink-0 rounded-sm p-0.5 opacity-0 group-hover:opacity-100 hover:bg-muted transition-all"
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              )}
            </button>
          ))}

          {/* Add tab button */}
          <button
            onClick={handleOpenPicker}
            className="flex items-center justify-center h-full px-2 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors shrink-0"
            title="Open board"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Draggable area */}
        <div className="flex-1 h-full app-drag-region" />

        {/* AI selector + Theme toggle + window controls */}
        <div className="flex items-center h-full shrink-0">
          {/* AI model selector */}
          <button
            onClick={() => setShowModelSettings((v) => !v)}
            className="h-full px-2.5 flex items-center gap-1.5 hover:bg-muted transition-colors text-xs text-muted-foreground hover:text-foreground"
            tabIndex={-1}
          >
            <Circle className={cn('h-1.5 w-1.5 fill-current', {
              'text-green-500': aiStatus === 'ready',
              'text-yellow-500': aiStatus === 'starting' || aiStatus === 'hardware-insufficient',
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
                ? 'AI'
                : aiProvider === 'anthropic'
                  ? (aiModel || 'Anthropic').replace('claude-', '').split('-202')[0]
                  : (aiModel || 'Local').split(':')[0]
              }
            </span>
            <ChevronDown className="h-2.5 w-2.5 opacity-50" />
          </button>
          <div className="w-px h-3.5 bg-border/50" />

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="h-full px-2 flex items-center justify-center hover:bg-muted transition-colors"
            tabIndex={-1}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
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
          <div className="w-px h-3.5 bg-border/50" />
          <button
            onClick={() => windowControls.minimize()}
            className="h-full px-3.5 flex items-center justify-center hover:bg-muted transition-colors"
            tabIndex={-1}
          >
            <Minus className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => windowControls.maximize()}
            className="h-full px-3.5 flex items-center justify-center hover:bg-muted transition-colors"
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
            className="h-full px-3.5 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/40">
          <div ref={pickerRef} className="w-96 rounded-xl border bg-card shadow-2xl overflow-hidden">
            {/* Search */}
            <div className="flex items-center gap-2 px-4 py-3 border-b">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search boards..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            {/* Board list */}
            <div className="max-h-72 overflow-auto py-1">
              {filteredBoards.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">No boards found</p>
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
                    <span className="text-[10px] text-muted-foreground">open</span>
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
                <span>New Board</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
