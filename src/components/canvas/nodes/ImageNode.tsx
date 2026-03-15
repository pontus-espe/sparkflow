import { memo, useCallback } from 'react'
import { type NodeProps, NodeResizeControl } from '@xyflow/react'
import { GripVertical, Trash2, Image } from 'lucide-react'
import { useBoardStore } from '@/stores/board-store'

interface ImageNodeData {
  name: string
  dataUrl: string
  filePath: string
  [key: string]: unknown
}

function ImageNodeComponent({ id, data, selected }: NodeProps) {
  const { name, dataUrl } = data as ImageNodeData
  const removeNode = useBoardStore((s) => s.removeNode)

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      removeNode(id)
    },
    [id, removeNode]
  )

  return (
    <>
      <NodeResizeControl
        minWidth={120}
        minHeight={80}
        style={{ background: 'transparent', border: 'none' }}
      />
      <div
        className="group relative flex flex-col rounded-lg border border-border/50 bg-card shadow-md overflow-hidden"
        style={{ width: '100%', height: '100%' }}
      >
        <div className="drag-handle flex items-center gap-1.5 px-2 py-1 border-b border-border/30 bg-card/80 cursor-grab active:cursor-grabbing shrink-0">
          <GripVertical className="h-3 w-3 text-muted-foreground/60 shrink-0" />
          <span className="text-[10px] text-muted-foreground truncate flex-1">{name as string}</span>
          {selected && (
            <button
              onClick={handleDelete}
              className="p-0.5 rounded hover:bg-destructive/20 transition-colors"
            >
              <Trash2 className="h-2.5 w-2.5 text-destructive" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-hidden flex items-center justify-center nodrag nowheel nopan">
          {dataUrl ? (
            <img
              src={dataUrl as string}
              alt={name as string}
              className="w-full h-full object-contain"
              draggable={false}
            />
          ) : (
            <Image className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
      </div>
    </>
  )
}

export const ImageNode = memo(ImageNodeComponent)
