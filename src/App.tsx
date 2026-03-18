import { useEffect, useCallback, useRef } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { Board } from '@/components/canvas/Board'
import { SetupScreen } from '@/components/SetupScreen'
import { Toasts } from '@/components/Toasts'
import { Titlebar } from '@/components/Titlebar'
import { startStatusPolling } from '@/services/ollama-client'
import { useBoardStore } from '@/stores/board-store'
import { useMicroappStore } from '@/stores/microapp-store'
import { useDataStore } from '@/stores/data-store'
import { useAIStore } from '@/stores/ai-store'
import { ipc } from '@/services/ipc-client'
import { seedWelcomeBoard } from '@/lib/welcome-board'
import type { MicroappIcon, MicroappColor } from '@/types/microapp'

const AUTOSAVE_INTERVAL = 5000

export default function App() {
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const aiStatus = useAIStore((s) => s.status)

  const saveBoard = useCallback(async () => {
    const { nodes, edges, viewport, currentBoardId, currentBoardName } = useBoardStore.getState()
    if (!currentBoardId) return
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
      id: currentBoardId,
      name: currentBoardName,
      canvasState: JSON.stringify({ nodes, edges, viewport }),
      microapps
    })
  }, [])

  useEffect(() => {
    const stopPolling = startStatusPolling()

    // Listen for startup status events from main process
    const cleanupStartup = ipc.ollama.onStartupStatus((status) => {
      const store = useAIStore.getState()
      store.setStartupMessage(status.message)

      // Never downgrade from ready — startup events may arrive late
      if (store.status === 'ready' && status.phase !== 'error') return

      if (status.phase === 'starting') {
        store.setStatus('starting')
      } else if (status.phase === 'downloading-ollama') {
        store.setStatus('downloading-ollama')
        if (status.progress != null) store.setDownloadProgress(status.progress)
      } else if (status.phase === 'pulling-model') {
        store.setStatus('pulling-model')
        if (status.model) store.setModel(status.model)
        if (status.progress != null) store.setDownloadProgress(status.progress)
      } else if (status.phase === 'warming-model') {
        store.setStatus('warming-model')
        if (status.model) store.setModel(status.model)
      } else if (status.phase === 'ready') {
        store.setStatus('ready')
      } else if (status.phase === 'hardware-insufficient') {
        store.setStatus('hardware-insufficient')
        store.setHardwareSufficient(false)
      } else if (status.phase === 'error') {
        store.setStatus('error')
        store.setError(status.message)
      }
    })

    // Load AI config on startup
    ipc.ai.getConfig().then((config) => {
      const store = useAIStore.getState()
      store.setProvider(config.provider)
      store.setHasApiKey(config.hasApiKey)
      store.setHardwareSufficient(config.hardware.sufficient)
    }).catch(() => {})

    // Auto-save
    saveTimerRef.current = setInterval(saveBoard, AUTOSAVE_INTERVAL)

    // Ctrl+S manual save
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        saveBoard()
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      stopPolling()
      cleanupStartup()
      if (saveTimerRef.current) clearInterval(saveTimerRef.current)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [saveBoard])

  // Load board on startup (restore last-active board or seed welcome board)
  useEffect(() => {
    async function loadBoard() {
      const lastBoardId = localStorage.getItem('board-active-id')
      if (!lastBoardId || lastBoardId === 'default') {
        // First run — seed welcome board
        await seedWelcomeBoard()
        return
      }

      const data = await ipc.board.load(lastBoardId)
      if (!data || !data.canvas_state) {
        // Saved board no longer exists — seed fresh
        await seedWelcomeBoard()
        return
      }

      loadBoardData(lastBoardId, data)
    }

    function loadBoardData(boardId: string, data: Record<string, unknown>) {
      localStorage.setItem('board-active-id', boardId)
      try {
        const canvasState = JSON.parse(data.canvas_state as string)
        const loadedNodes = (canvasState.nodes || []).map((n: { type?: string; hidden?: boolean }) =>
          n.type === 'dataSource' ? { ...n, hidden: true } : n
        )
        useBoardStore.setState({
          currentBoardId: boardId,
          currentBoardName: (data.name as string) || 'Untitled Board',
          nodes: loadedNodes,
          edges: canvasState.edges || [],
          viewport: canvasState.viewport || { x: 0, y: 0, zoom: 1 }
        })

        const microapps = (data.microapps || []) as Array<Record<string, unknown>>
        for (const m of microapps) {
          useMicroappStore.getState().addInstance({
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
          useDataStore.getState().addSource({
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
            useDataStore.getState().setCachedData(s.id as string, s.data as unknown[])
          }
        }
      } catch {
        // Failed to load — start fresh
      }
    }

    loadBoard()
  }, [])

  // Show setup screen for any non-ready state (except when already configured via Anthropic)
  const showSetup = aiStatus !== 'ready'

  return (
    <div className="flex flex-col h-screen bg-background">
      <Titlebar />
      <ReactFlowProvider>
        <div className="flex-1 relative">
          <Board />
        </div>
      </ReactFlowProvider>
      <Toasts />
      {showSetup && <SetupScreen />}
    </div>
  )
}
