import { useCallback, useRef, useState, useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
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
import { StickyNote, Sparkles, FileSpreadsheet } from 'lucide-react'
import { nodeTypes } from './nodes'
import { useBoardStore } from '@/stores/board-store'
import { useMicroappStore } from '@/stores/microapp-store'
import { useDataStore } from '@/stores/data-store'
import { CommandPalette } from '@/components/ai/CommandPalette'
import { generateMicroapp } from '@/services/generation'
import { ipc, getPathForFile } from '@/services/ipc-client'
import { generateId } from '@/lib/utils'
import type { DataSource } from '@/types/data-source'

export function Board() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addStickyNote, addNode, addEdge, viewport, setViewport, currentBoardId } =
    useBoardStore()
  const addInstance = useMicroappStore((s) => s.addInstance)
  const addDataSource = useDataStore((s) => s.addSource)
  const setCachedData = useDataStore((s) => s.setCachedData)
  const { setViewport: setFlowViewport } = useReactFlow()
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null)
  const contextMenuPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const prevBoardIdRef = useRef(currentBoardId)

  const [commandPalettePos, setCommandPalettePos] = useState<{ x: number; y: number } | null>(null)
  const [commandCanvasPos, setCommandCanvasPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [commandDataSourceIds, setCommandDataSourceIds] = useState<string[] | undefined>(undefined)

  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstance.current = instance
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
        name: prompt.slice(0, 50),
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
    const result = await ipc.data.importFile()
    if (result.canceled || result.error || !result.sources) return

    const pos = getCanvasPosition()
    for (let i = 0; i < result.sources.length; i++) {
      const source = result.sources[i]
      addDataSource({
        id: source.id,
        boardId: 'default',
        name: source.name,
        type: source.type,
        columns: source.columns,
        rowCount: source.rowCount,
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
          rowCount: source.rowCount
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
      const result = await ipc.data.importFilePath(filePath)
      if (result.error || !result.sources) return

      const sourceIds: string[] = []
      for (let i = 0; i < result.sources.length; i++) {
        const source = result.sources[i]
        sourceIds.push(source.id)
        addDataSource({
          id: source.id,
          boardId: 'default',
          name: source.name,
          type: source.type,
          columns: source.columns,
          rowCount: source.rowCount,
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
            rowCount: source.rowCount
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

  // "/" keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      if (e.key === '/') {
        e.preventDefault()
        // Open at center of viewport
        const center = { x: window.innerWidth / 2 - 240, y: window.innerHeight / 3 }
        openCommandPalette(center)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [openCommandPalette])

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
              <MiniMap
                nodeStrokeWidth={3}
                zoomable
                pannable
              />
            </ReactFlow>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-56">
          <ContextMenuItem onClick={handleAddStickyNote}>
            <StickyNote className="mr-2 h-4 w-4" />
            Add Sticky Note
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleOpenAI}>
            <Sparkles className="mr-2 h-4 w-4" />
            AI Microapp (/)
          </ContextMenuItem>
          <ContextMenuItem onClick={handleImportData}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Import Data Source
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Command Palette overlay */}
      <CommandPalette
        position={commandPalettePos}
        onClose={handleCloseCommandPalette}
        onSubmit={handleSubmitPrompt}
        dataSourceIds={commandDataSourceIds}
      />
    </div>
  )
}
