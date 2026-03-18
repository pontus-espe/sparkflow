import { create } from 'zustand'
import {
  type Node,
  type Edge,
  type Viewport,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge
} from '@xyflow/react'
import { generateId } from '@/lib/utils'

export interface BoardInfo {
  id: string
  name: string
  updatedAt: number
}

export interface BoardStore {
  currentBoardId: string
  currentBoardName: string
  boardList: BoardInfo[]
  viewport: Viewport
  nodes: Node[]
  edges: Edge[]
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect
  addNode: (node: Node) => void
  addEdge: (edge: Edge) => void
  removeNode: (id: string) => void
  updateNodeData: (id: string, data: Partial<Record<string, unknown>>) => void
  addStickyNote: (position: { x: number; y: number }) => void
  setViewport: (viewport: Viewport) => void
  setCurrentBoard: (id: string, name: string) => void
  setBoardList: (boards: BoardInfo[]) => void
  setCurrentBoardName: (name: string) => void
}

export const useBoardStore = create<BoardStore>((set, get) => ({
  currentBoardId: '',
  currentBoardName: '',
  boardList: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [],
  edges: [],

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) })
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) })
  },

  onConnect: (connection) => {
    set({ edges: addEdge(connection, get().edges) })
  },

  addNode: (node) => {
    set({ nodes: [...get().nodes, node] })
  },

  addEdge: (edge) => {
    set({ edges: [...get().edges, edge] })
  },

  removeNode: (id) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id)
    })
  },

  updateNodeData: (id, data) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n
      )
    })
  },

  addStickyNote: (position) => {
    const id = generateId()
    const colors = [
      'var(--color-sticky-yellow)',
      'var(--color-sticky-blue)',
      'var(--color-sticky-green)',
      'var(--color-sticky-pink)',
      'var(--color-sticky-purple)'
    ]
    const color = colors[Math.floor(Math.random() * colors.length)]

    const node: Node = {
      id,
      type: 'stickyNote',
      position,
      data: {
        label: '',
        content: '',
        color
      }
    }
    get().addNode(node)
  },

  setViewport: (viewport) => {
    set({ viewport })
  },

  setCurrentBoard: (id, name) => {
    set({ currentBoardId: id, currentBoardName: name, nodes: [], edges: [] })
  },

  setBoardList: (boards) => {
    set({ boardList: boards })
  },

  setCurrentBoardName: (name) => {
    set({ currentBoardName: name })
  }
}))
