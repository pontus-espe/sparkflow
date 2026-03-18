import { useCallback, useRef, useState, useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  useReactFlow,
  type ReactFlowInstance,
  type Viewport
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { StickyNote, Sparkles, FileSpreadsheet, Plus, MessageCircle, X, Send, Loader2, SquarePen, Wrench, Check } from 'lucide-react'
import { nodeTypes } from './nodes'
import { useBoardStore } from '@/stores/board-store'
import { useMicroappStore } from '@/stores/microapp-store'
import { useDataStore } from '@/stores/data-store'
import { useAIStore } from '@/stores/ai-store'
import { CommandPalette } from '@/components/ai/CommandPalette'
import { generateMicroapp } from '@/services/generation'
import { ipc, getPathForFile } from '@/services/ipc-client'
import { generateId, cn } from '@/lib/utils'
import type { DataSource } from '@/types/data-source'
import { useTranslation } from '@/lib/i18n'
import Markdown from 'react-markdown'

export function Board() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addStickyNote, addNode, addEdge, viewport, setViewport, currentBoardId } =
    useBoardStore()
  const addInstance = useMicroappStore((s) => s.addInstance)
  const addDataSource = useDataStore((s) => s.addSource)
  const setCachedData = useDataStore((s) => s.setCachedData)
  const { t } = useTranslation()
  const { setViewport: setFlowViewport } = useReactFlow()
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null)
  const contextMenuPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const prevBoardIdRef = useRef(currentBoardId)

  const [commandPalettePos, setCommandPalettePos] = useState<{ x: number; y: number } | null>(null)
  const [commandCanvasPos, setCommandCanvasPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [commandDataSourceIds, setCommandDataSourceIds] = useState<string[] | undefined>(undefined)
  const [chatOpen, setChatOpen] = useState(false)

  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstance.current = instance
    // Fit view on fresh/welcome boards (viewport is still at default origin)
    const { viewport: vp, nodes: n } = useBoardStore.getState()
    if (n.length > 0 && vp.x === 0 && vp.y === 0 && vp.zoom === 1) {
      setTimeout(() => instance.fitView({ padding: 0.1, duration: 400 }), 100)
    }
  }, [])

  // Track viewport changes in store
  const onMoveEnd = useCallback((_event: unknown, vp: Viewport) => {
    setViewport(vp)
  }, [setViewport])

  // Animate to saved viewport when board switches
  useEffect(() => {
    if (currentBoardId !== prevBoardIdRef.current) {
      prevBoardIdRef.current = currentBoardId
      // Small delay to let nodes render first
      setTimeout(() => {
        setFlowViewport(viewport, { duration: 400 })
      }, 50)
    }
  }, [currentBoardId, viewport, setFlowViewport])

  // Listen for file-based data source updates (live reload)
  useEffect(() => {
    const cleanup = ipc.data.onSourceUpdated((update) => {
      const existing = useDataStore.getState().sources[update.id]
      if (!existing) return
      useDataStore.getState().updateSource(update.id, {
        name: update.name,
        columns: update.columns as DataSource['columns'],
        rowCount: update.rowCount
      })
      useDataStore.getState().setCachedData(update.id, update.rows)
    })
    return cleanup
  }, [])

  // Agent: focus on a node (pan + zoom to fit it nicely in the viewport)
  useEffect(() => {
    const cleanup = ipc.agent.onFocusNode(({ nodeId }) => {
      const node = useBoardStore.getState().nodes.find((n) => n.id === nodeId)
      const rf = reactFlowInstance.current
      if (!node || !rf) return

      const nodeW = (node.style?.width as number) || (node.width as number) || 360
      const nodeH = (node.style?.height as number) || (node.height as number) || 320
      const centerX = node.position.x + nodeW / 2
      const centerY = node.position.y + nodeH / 2

      // Get the ReactFlow container size
      const el = document.querySelector('.react-flow') as HTMLElement | null
      const vpW = el?.clientWidth || window.innerWidth
      const vpH = el?.clientHeight || window.innerHeight

      // Calculate zoom so the node fills ~70% of the viewport with some padding
      const padding = 1.4 // 1/0.7 — node should be ~70% of viewport
      const zoomX = vpW / (nodeW * padding)
      const zoomY = vpH / (nodeH * padding)
      const zoom = Math.min(zoomX, zoomY, 1.5) // cap at 1.5 to avoid over-zoom on small apps

      rf.setCenter(centerX, centerY, { zoom: Math.max(zoom, 0.5), duration: 600 })
    })
    return cleanup
  }, [])

  // Agent: navigate to a different board
  useEffect(() => {
    const cleanup = ipc.agent.onNavigateBoard(({ boardId, boardName }) => {
      window.dispatchEvent(new CustomEvent('agent:navigate-board', { detail: { boardId, boardName } }))
    })
    return cleanup
  }, [])

  // Agent: create a new microapp
  useEffect(() => {
    const cleanup = ipc.agent.onCreateMicroapp(({ boardId, prompt, code, metadata, position, dataSourceIds }) => {
      if (boardId !== useBoardStore.getState().currentBoardId) return

      const id = generateId()
      const rf = reactFlowInstance.current

      // Use agent-provided position, or fall back to center of viewport
      const pos = position || (rf
        ? rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
        : { x: 200, y: 200 })

      // Add microapp instance
      addInstance({
        id,
        boardId,
        name: metadata.name,
        prompt,
        source: code,
        compiled: null,
        error: null,
        status: 'ready',
        streamingText: '',
        icon: metadata.icon as 'sparkles',
        color: metadata.color as 'default',
        state: {},
        dataSourceIds,
        position: pos,
        size: { width: metadata.width, height: metadata.height },
        createdAt: Date.now(),
        updatedAt: Date.now()
      })

      // Add canvas node
      addNode({
        id,
        type: 'microapp',
        position: pos,
        data: { microappId: id, name: metadata.name },
        style: { width: metadata.width, height: metadata.height }
      })

      // Connect to data sources
      for (const dsId of dataSourceIds) {
        addEdge({ id: `${dsId}-${id}`, source: dsId, target: id })
      }

      // Focus on the newly created app after a short delay for rendering
      setTimeout(() => {
        if (rf) {
          const centerX = pos.x + metadata.width / 2
          const centerY = pos.y + metadata.height / 2
          const el = document.querySelector('.react-flow') as HTMLElement | null
          const vpW = el?.clientWidth || window.innerWidth
          const vpH = el?.clientHeight || window.innerHeight
          const zoomX = vpW / (metadata.width * 1.4)
          const zoomY = vpH / (metadata.height * 1.4)
          const zoom = Math.min(zoomX, zoomY, 1.5)
          rf.setCenter(centerX, centerY, { zoom: Math.max(zoom, 0.5), duration: 600 })
        }
      }, 100)
    })
    return cleanup
  }, [addInstance, addNode, addEdge])

  // Agent: update an existing microapp's code
  useEffect(() => {
    const cleanup = ipc.agent.onUpdateMicroapp(({ microappId, code }) => {
      useMicroappStore.getState().updateInstance(microappId, {
        source: code,
        status: 'ready',
        error: null
      })
    })
    return cleanup
  }, [])

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    contextMenuPosition.current = { x: event.clientX, y: event.clientY }
  }, [])

  const getCanvasPosition = useCallback(() => {
    if (!reactFlowInstance.current) return { x: 0, y: 0 }
    return reactFlowInstance.current.screenToFlowPosition(contextMenuPosition.current)
  }, [])

  const handleAddStickyNote = useCallback(() => {
    addStickyNote(getCanvasPosition())
  }, [addStickyNote, getCanvasPosition])

  const openCommandPalette = useCallback((screenPos: { x: number; y: number }) => {
    setCommandPalettePos(screenPos)
    if (reactFlowInstance.current) {
      setCommandCanvasPos(reactFlowInstance.current.screenToFlowPosition(screenPos))
    }
  }, [])

  const handleOpenAI = useCallback(() => {
    openCommandPalette(contextMenuPosition.current)
  }, [openCommandPalette])

  const handleCloseCommandPalette = useCallback(() => {
    setCommandPalettePos(null)
    setCommandDataSourceIds(undefined)
  }, [])

  const handleSubmitPrompt = useCallback(
    (prompt: string, dataSourceIds?: string[]) => {
      const id = generateId()
      const microapp = {
        id,
        boardId: currentBoardId,
        name: 'Generating...',
        prompt,
        source: '',
        compiled: null,
        error: null,
        status: 'queued' as const,
        streamingText: '',
        dataSourceIds,
        state: {},
        position: commandCanvasPos,
        size: { width: 360, height: 320 },
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      addInstance(microapp)

      addNode({
        id,
        type: 'microapp',
        position: commandCanvasPos,
        data: { microappId: id, name: microapp.name },
        style: { width: 360, height: 320 }
      })

      // Connect data source nodes to the microapp node
      if (dataSourceIds) {
        for (const sourceId of dataSourceIds) {
          addEdge({
            id: `${sourceId}->${id}`,
            source: sourceId,
            target: id,
            animated: true
          })
        }
      }

      setCommandPalettePos(null)
      setCommandDataSourceIds(undefined)

      // Kick off generation in background
      generateMicroapp(id, prompt, dataSourceIds)
    },
    [commandCanvasPos, addInstance, addNode, addEdge, currentBoardId]
  )

  const handleImportData = useCallback(async () => {
    const boardId = useBoardStore.getState().currentBoardId
    const result = await ipc.data.importFile(boardId)
    if (result.canceled || result.error || !result.sources) return

    const pos = getCanvasPosition()
    for (let i = 0; i < result.sources.length; i++) {
      const source = result.sources[i]
      addDataSource({
        id: source.id,
        boardId,
        name: source.name,
        type: source.type,
        columns: source.columns,
        rowCount: source.rowCount,
        filePath: source.filePath,
        config: {},
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
      setCachedData(source.id, source.rows)
      addNode({
        id: source.id,
        type: 'dataSource',
        position: { x: pos.x - 320, y: pos.y + i * 100 },
        hidden: true,
        data: {
          dataSourceId: source.id,
          name: source.name,
          type: source.type,
          rowCount: source.rowCount,
          filePath: source.filePath
        }
      })
    }
  }, [addDataSource, setCachedData, addNode, getCanvasPosition])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    const hasFiles = e.dataTransfer.types.includes('Files')
    if (hasFiles) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    const files = e.dataTransfer.files
    if (!files || files.length === 0) return

    e.preventDefault()

    const file = files[0]
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const filePath = getPathForFile(file)
    if (!filePath) return

    const screenPos = { x: e.clientX, y: e.clientY }
    const canvasPos = reactFlowInstance.current
      ? reactFlowInstance.current.screenToFlowPosition(screenPos)
      : { x: 0, y: 0 }

    const dataExts = ['xlsx', 'xls', 'csv', 'tsv', 'xlsm', 'xlsb']

    if (dataExts.includes(ext)) {
      // Data file → import as data source + open command palette
      const boardId = useBoardStore.getState().currentBoardId
      const result = await ipc.data.importFilePath(filePath, boardId)
      if (result.error || !result.sources) return

      const sourceIds: string[] = []
      for (let i = 0; i < result.sources.length; i++) {
        const source = result.sources[i]
        sourceIds.push(source.id)
        addDataSource({
          id: source.id,
          boardId,
          name: source.name,
          type: source.type,
          columns: source.columns,
          rowCount: source.rowCount,
          filePath: source.filePath,
          config: {},
          createdAt: Date.now(),
          updatedAt: Date.now()
        })
        setCachedData(source.id, source.rows)
        addNode({
          id: source.id,
          type: 'dataSource',
          position: { x: canvasPos.x - 320, y: canvasPos.y + i * 160 },
          hidden: true,
          data: {
            dataSourceId: source.id,
            name: source.name,
            type: source.type,
            rowCount: source.rowCount,
            filePath: source.filePath
          }
        })
      }
      setCommandDataSourceIds(sourceIds)
      openCommandPalette(screenPos)
    } else {
      // Image, document, or other file → read and create appropriate node
      const result = await ipc.file.readDrop(filePath)
      if ('error' in result) return

      const nodeId = generateId()

      if (result.type === 'image') {
        addNode({
          id: nodeId,
          type: 'image',
          position: canvasPos,
          data: { name: result.name, dataUrl: result.dataUrl, filePath: result.path },
          style: { width: 400, height: 300 }
        })
      } else {
        addNode({
          id: nodeId,
          type: 'file',
          position: canvasPos,
          data: {
            name: result.name,
            content: result.type === 'document' ? result.content : undefined,
            filePath: result.path,
            ext: result.ext,
            fileType: result.type
          },
          style: { width: 360, height: result.type === 'document' ? 400 : 200 }
        })
      }
    }
  }, [addDataSource, setCachedData, addNode, openCommandPalette])

  const handleCreateMicroapp = useCallback(() => {
    const center = { x: window.innerWidth / 2 - 240, y: window.innerHeight / 3 }
    openCommandPalette(center)
  }, [openCommandPalette])

  // "/" keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      if (e.key === '/') {
        e.preventDefault()
        handleCreateMicroapp()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleCreateMicroapp])

  return (
    <div className="w-full h-full">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="w-full h-full" onContextMenu={handleContextMenu}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={onInit}
              onMoveEnd={onMoveEnd}
              nodeTypes={nodeTypes}
              fitView={false}
              snapToGrid
              snapGrid={[16, 16]}
              defaultViewport={{ x: 0, y: 0, zoom: 1 }}
              minZoom={0.1}
              maxZoom={4}
              deleteKeyCode="Delete"
              multiSelectionKeyCode="Shift"
              proOptions={{ hideAttribution: true }}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--color-border)" />
              <Controls />
            </ReactFlow>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-56">
          <ContextMenuItem onClick={handleAddStickyNote}>
            <StickyNote className="mr-2 h-4 w-4" />
            {t('canvas.addSticky')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleOpenAI}>
            <Sparkles className="mr-2 h-4 w-4" />
            {t('canvas.aiMicroapp')}
          </ContextMenuItem>
          <ContextMenuItem onClick={handleImportData}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            {t('canvas.importData')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Create Microapp floating button */}
      {!commandPalettePos && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
          <button
            onClick={handleCreateMicroapp}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            {t('canvas.newMicroapp')}
          </button>
          <p className="text-center text-[10px] text-muted-foreground mt-1.5 opacity-60">
            {t('canvas.orPress')}
          </p>
        </div>
      )}

      {/* Command Palette overlay */}
      <CommandPalette
        position={commandPalettePos}
        onClose={handleCloseCommandPalette}
        onSubmit={handleSubmitPrompt}
        dataSourceIds={commandDataSourceIds}
      />

      {/* AI Chat */}
      {chatOpen ? (
        <ChatPanel onClose={() => setChatOpen(false)} />
      ) : (
        <ChatButton onOpen={() => setChatOpen(true)} />
      )}
    </div>
  )
}

/** Parse model size in billions from an Ollama model name like "qwen2.5:7b" or "llama3.1:3b-instruct" */
function getModelSizeB(modelName: string | null): number | null {
  if (!modelName) return null
  const match = modelName.match(/(\d+(?:\.\d+)?)b/i)
  return match ? parseFloat(match[1]) : null
}

const MIN_AGENT_SIZE_B = 14

function ChatButton({ onOpen }: { onOpen: () => void }) {
  const provider = useAIStore((s) => s.provider)
  const model = useAIStore((s) => s.model)
  const status = useAIStore((s) => s.status)

  const sizeB = getModelSizeB(model)
  const tooSmall = provider === 'local' && sizeB !== null && sizeB < MIN_AGENT_SIZE_B
  const notReady = status !== 'ready'
  const disabled = tooSmall || notReady

  const title = tooSmall
    ? `Model too small for AI chat — requires ${MIN_AGENT_SIZE_B}B+ parameters (current: ${sizeB}B)`
    : notReady
      ? 'AI is not ready yet'
      : 'Open AI chat'

  return (
    <button
      onClick={disabled ? undefined : onOpen}
      className={cn(
        'absolute bottom-5 right-5 z-20 p-3 rounded-full shadow-lg transition-all',
        disabled
          ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-60'
          : 'bg-primary text-primary-foreground hover:shadow-xl hover:scale-105'
      )}
      title={title}
    >
      <MessageCircle className="h-5 w-5" />
    </button>
  )
}

interface ChatMsg {
  type: 'user' | 'assistant' | 'tool'
  content: string
  toolName?: string
  done?: boolean
}

/** Pretty-print a tool call into a human-readable action label */
function formatToolLabel(name: string, toolInput?: string): string {
  try {
    const args = toolInput ? JSON.parse(toolInput) : {}

    // Look up friendly names from stores for IDs
    const sourceName = (id: string) => {
      const s = useDataStore.getState().sources[id]
      return s?.filePath?.replace(/\\/g, '/').split('/').pop() || s?.name || id
    }
    const appName = (id: string) => {
      const inst = useMicroappStore.getState().instances[id]
      return inst?.name || id
    }

    switch (name) {
      case 'get_board_context': return 'Reading board context'
      case 'get_data_sources': return 'Listing data sources'
      case 'query_data_source': return `Reading ${sourceName(args.sourceId)}`
      case 'get_microapps': return 'Listing microapps'
      case 'list_boards': return 'Listing boards'
      case 'get_system_context': return 'Reading system info'
      case 'navigate_to_board': return `Navigating to ${args.boardName || 'board'}`
      case 'focus_microapp': return `Focusing on ${appName(args.microappId)}`
      case 'create_microapp': return `Building ${args.prompt?.slice(0, 30) || 'microapp'}...`
      case 'edit_microapp': return `Editing ${appName(args.microappId)}`
      default:
        return name.replace(/^(get_|query_|list_|navigate_to_|focus_)/, '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
    }
  } catch {
    return name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  }
}

function ChatPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const boardId = useBoardStore((s) => s.currentBoardId)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [streaming, setStreaming] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load history on mount
  useEffect(() => {
    ipc.agent.history().then((history) => {
      if (history && history.length > 0) {
        setMessages(history.map((h) => ({
          type: h.role as ChatMsg['type'],
          content: h.content,
          toolName: h.toolName
        })))
      }
    }).catch(() => {})
  }, [])

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streaming])

  const handleNewSession = useCallback(async () => {
    await ipc.agent.newSession()
    setMessages([])
    setStreaming('')
    inputRef.current?.focus()
  }, [])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    setMessages((prev) => [...prev, { type: 'user', content: text }])
    setLoading(true)
    setStreaming('')

    // Track accumulated text in a ref so callbacks always see current value
    let streamBuf = ''
    const cleanups: (() => void)[] = []

    const flushStream = () => {
      if (streamBuf) {
        const flushed = streamBuf
        streamBuf = ''
        setStreaming('')
        setMessages((prev) => [...prev, { type: 'assistant', content: flushed }])
      }
    }

    cleanups.push(ipc.agent.onStream((chunk) => {
      streamBuf += chunk
      setStreaming(streamBuf)
    }))

    cleanups.push(ipc.agent.onToolStart(({ name, input: toolInput }) => {
      flushStream()
      setMessages((prev) => [...prev, { type: 'tool', content: toolInput, toolName: name, done: false }])
    }))

    cleanups.push(ipc.agent.onToolEnd(() => {
      setMessages((prev) => {
        // Find the last pending tool message and mark it done
        const idx = prev.findLastIndex((m) => m.type === 'tool' && !m.done)
        if (idx === -1) return prev
        const updated = [...prev]
        updated[idx] = { ...updated[idx], done: true }
        return updated
      })
    }))

    cleanups.push(ipc.agent.onReasoning(() => {
      // Reasoning is not displayed — just ignore
    }))

    const cleanup = () => cleanups.forEach((fn) => fn())

    try {
      const result = await ipc.agent.chat(text, boardId)
      cleanup()
      flushStream()
      if (result.error) {
        setMessages((prev) => [...prev, { type: 'assistant', content: `Error: ${result.error}` }])
      }
    } catch {
      cleanup()
      setStreaming('')
      setMessages((prev) => [...prev, { type: 'assistant', content: 'Something went wrong.' }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, boardId])

  const hasMessages = messages.length > 0 || streaming

  return (
    <div className="absolute bottom-4 right-4 z-20 w-[360px] h-[600px] min-h-[400px] flex flex-col rounded-2xl border bg-card/95 backdrop-blur-md shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2.5 px-4 py-3 border-b border-border/50">
        <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-sm font-semibold flex-1">SparkFlow AI</span>
        <button
          onClick={handleNewSession}
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="New session"
        >
          <SquarePen className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-3">
        {!hasMessages ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground max-w-[200px]">
              Ask anything about your board, data, or microapps.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {messages.map((msg, i) => {
              const next = messages[i + 1]
              const prev = messages[i - 1]
              const isUser = msg.type === 'user'
              const isAssistant = msg.type === 'assistant'
              const isTool = msg.type === 'tool'

              // Grouping: same sender consecutive messages cluster together
              const sameAsNext = next?.type === msg.type
              const sameAsPrev = prev?.type === msg.type
              const isLast = !sameAsNext
              const isFirst = !sameAsPrev

              if (isTool) {
                return (
                  <div key={i} className={cn(
                    'flex items-center gap-2 text-[11px] text-muted-foreground px-3 py-1.5 rounded-lg border border-border/40 w-fit',
                    !msg.done && 'animate-pulse',
                    isFirst && 'mt-2',
                    isLast && 'mb-2'
                  )}>
                    {msg.done ? (
                      <Check className="h-3 w-3 text-green-500 shrink-0" />
                    ) : (
                      <Wrench className="h-3 w-3 shrink-0" />
                    )}
                    <span>{formatToolLabel(msg.toolName || '', msg.content)}</span>
                  </div>
                )
              }

              // Messenger-style rounded corners:
              // - First in group: full round top, tight bottom on sender side
              // - Middle: tight both sides on sender corner
              // - Last: tight top on sender side, full round bottom (the "tail")
              const userCorners = isFirst && isLast
                ? 'rounded-2xl'
                : isFirst
                  ? 'rounded-2xl rounded-br-md'
                  : isLast
                    ? 'rounded-2xl rounded-tr-md'
                    : 'rounded-2xl rounded-r-md'

              const assistantCorners = isFirst && isLast
                ? 'rounded-2xl'
                : isFirst
                  ? 'rounded-2xl rounded-bl-md'
                  : isLast
                    ? 'rounded-2xl rounded-tl-md'
                    : 'rounded-2xl rounded-l-md'

              if (isUser) {
                return (
                  <div key={i} className={cn(
                    'text-sm px-3 py-2 max-w-[80%] ml-auto bg-primary text-primary-foreground whitespace-pre-wrap',
                    userCorners,
                    isFirst && 'mt-3'
                  )}>
                    {msg.content}
                  </div>
                )
              }

              if (isAssistant) {
                return (
                  <div key={i} className={cn(
                    'text-sm px-3 py-2 max-w-[80%] bg-muted text-foreground chat-md',
                    assistantCorners,
                    isFirst && 'mt-3'
                  )}>
                    <Markdown>{msg.content}</Markdown>
                  </div>
                )
              }

              return null
            })}
            {streaming && (
              <div className="text-sm px-3 py-2 max-w-[80%] bg-muted text-foreground chat-md rounded-2xl mt-3">
                <Markdown>{streaming}</Markdown>
                <span className="inline-block w-1.5 h-4 bg-foreground/50 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 px-3 pb-3 pt-1">
        <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 focus-within:ring-1 focus-within:ring-ring transition-shadow">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={t('command.placeholder')}
            disabled={loading}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="p-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-30 transition-opacity"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
