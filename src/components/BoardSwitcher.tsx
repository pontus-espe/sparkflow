import { useState, useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { useBoardStore, type BoardInfo } from '@/stores/board-store'
import { useMicroappStore } from '@/stores/microapp-store'
import { useDataStore } from '@/stores/data-store'
import { ipc } from '@/services/ipc-client'
import { LayoutGrid, Plus, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MicroappIcon, MicroappColor } from '@/types/microapp'

export function BoardSwitcher() {
  const { currentBoardId, currentBoardName, boardList, setCurrentBoard, setBoardList } =
    useBoardStore()
  const [isOpen, setIsOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch board list on mount and when opened
  const refreshBoards = useCallback(async () => {
    const boards = await ipc.board.list()
    setBoardList(
      (boards || []).map((b: Record<string, unknown>) => ({
        id: b.id as string,
        name: b.name as string,
        updatedAt: b.updated_at as number
      }))
    )
  }, [setBoardList])

  useEffect(() => {
    refreshBoards()
  }, [refreshBoards])

  useEffect(() => {
    if (isOpen) refreshBoards()
  }, [isOpen, refreshBoards])

  // Save current board before switching
  const saveCurrentBoard = useCallback(async () => {
    const { nodes, edges, viewport } = useBoardStore.getState()
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
      height: m.size.height
    }))
    await ipc.board.save({
      id: currentBoardId,
      name: currentBoardName,
      canvasState: JSON.stringify({ nodes, edges, viewport }),
      microapps
    })
  }, [currentBoardId, currentBoardName])

  const handleSwitchBoard = useCallback(
    async (board: BoardInfo) => {
      if (board.id === currentBoardId) {
        setIsOpen(false)
        return
      }

      // Save current board
      await saveCurrentBoard()

      // Clear microapps and data sources
      const microappStore = useMicroappStore.getState()
      Object.keys(microappStore.instances).forEach((id) => microappStore.removeInstance(id))
      const dataStore = useDataStore.getState()
      Object.keys(dataStore.sources).forEach((id) => dataStore.removeSource(id))

      // Load new board
      const data = await ipc.board.load(board.id)
      if (data) {
        try {
          const canvasState = JSON.parse(data.canvas_state as string)
          const loadedNodes = (canvasState.nodes || []).map((n: { type?: string }) =>
            n.type === 'dataSource' ? { ...n, hidden: true } : n
          )
          useBoardStore.setState({
            currentBoardId: board.id,
            currentBoardName: board.name,
            nodes: loadedNodes,
            edges: canvasState.edges || [],
            viewport: canvasState.viewport || { x: 0, y: 0, zoom: 1 }
          })

          // Restore microapps
          const microapps = (data.microapps || []) as Array<Record<string, unknown>>
          for (const m of microapps) {
            microappStore.addInstance({
              id: m.id as string,
              boardId: board.id,
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

          // Restore data sources
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
            currentBoardId: board.id,
            currentBoardName: board.name,
            nodes: [],
            edges: [],
            viewport: { x: 0, y: 0, zoom: 1 }
          })
        }
      }

      setIsOpen(false)
    },
    [currentBoardId, saveCurrentBoard]
  )

  const handleNewBoard = useCallback(async () => {
    await saveCurrentBoard()

    const result = await ipc.board.create('Untitled Board')
    if (result?.id) {
      // Clear microapps
      const microappStore = useMicroappStore.getState()
      Object.keys(microappStore.instances).forEach((id) => microappStore.removeInstance(id))

      useBoardStore.setState({
        currentBoardId: result.id,
        currentBoardName: result.name,
        nodes: [],
        edges: []
      })
      await refreshBoards()
    }
    setIsOpen(false)
  }, [saveCurrentBoard, refreshBoards])

  const handleRename = useCallback(() => {
    setEditName(currentBoardName)
    setIsEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }, [currentBoardName])

  const handleRenameSubmit = useCallback(async () => {
    const name = editName.trim() || 'Untitled Board'
    useBoardStore.getState().setCurrentBoardName(name)
    setIsEditing(false)
    await saveCurrentBoard()
  }, [editName, saveCurrentBoard])

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleMouseDown)
    }, 0)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousedown', handleMouseDown)
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative z-30">
      {/* Bubble trigger */}
      <button
        onClick={() => {
          if (isEditing) return
          // Delay single-click so double-click can cancel it
          clickTimerRef.current = setTimeout(() => {
            setIsOpen((v) => !v)
          }, 200)
        }}
        onDoubleClick={() => {
          if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current)
            clickTimerRef.current = null
          }
          setIsOpen(false)
          handleRename()
        }}
        className={cn(
          'flex items-center gap-2 px-3 h-8 transition-colors text-xs',
          'hover:bg-muted/50',
          isOpen && 'bg-muted/50'
        )}
      >
        <LayoutGrid className="h-3 w-3 text-primary" />
        {isEditing ? (
          <input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit()
              if (e.key === 'Escape') setIsEditing(false)
            }}
            className="bg-transparent outline-none text-xs w-32"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="max-w-40 truncate text-foreground/80">{currentBoardName}</span>
        )}
        <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 rounded-lg border bg-popover shadow-lg overflow-hidden">
          <div className="max-h-64 overflow-auto py-1">
            {boardList.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No saved boards</p>
            )}
            {boardList.map((board) => (
              <button
                key={board.id}
                onClick={() => handleSwitchBoard(board)}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2',
                  board.id === currentBoardId && 'bg-primary/10 text-primary'
                )}
              >
                <LayoutGrid className="h-3 w-3 shrink-0" />
                <span className="truncate flex-1">{board.name}</span>
              </button>
            ))}
          </div>
          <div className="border-t p-1">
            <button
              onClick={handleNewBoard}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted rounded transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              New Board
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
