import type { Node, Edge, Viewport } from '@xyflow/react'

export type BoardNodeType = 'microapp' | 'dataSource' | 'stickyNote'

export interface StickyNoteData {
  label: string
  content: string
  color: string
}

export interface BoardNode extends Node {
  type: BoardNodeType
  data: Record<string, unknown>
}

export interface BoardState {
  id: string
  name: string
  nodes: BoardNode[]
  edges: Edge[]
  viewport: Viewport
}
