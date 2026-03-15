import type { NodeTypes } from '@xyflow/react'
import { StickyNoteNode } from './StickyNoteNode'
import { MicroappNode } from './MicroappNode'
import { DataSourceNode } from './DataSourceNode'
import { ImageNode } from './ImageNode'
import { FileNode } from './FileNode'

// IMPORTANT: This must be a module-level constant.
// If nodeTypes reference changes between renders, React Flow unmounts ALL nodes.
export const nodeTypes: NodeTypes = {
  stickyNote: StickyNoteNode,
  microapp: MicroappNode,
  dataSource: DataSourceNode,
  image: ImageNode,
  file: FileNode
}
