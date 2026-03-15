import { memo, useCallback } from 'react'
import { type NodeProps, NodeResizeControl } from '@xyflow/react'
import { GripVertical, Trash2, FileText, File } from 'lucide-react'
import { useBoardStore } from '@/stores/board-store'
import { cn } from '@/lib/utils'

interface FileNodeData {
  name: string
  content?: string
  filePath: string
  ext?: string
  fileType: 'document' | 'file'
  [key: string]: unknown
}

function FileNodeComponent({ id, data, selected }: NodeProps) {
  const { name, content, ext, fileType } = data as FileNodeData
  const removeNode = useBoardStore((s) => s.removeNode)

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      removeNode(id)
    },
    [id, removeNode]
  )

  const isDocument = fileType === 'document' && content
  const Icon = isDocument ? FileText : File
  const lineCount = isDocument ? (content as string).split('\n').length : 0

  return (
    <>
      <NodeResizeControl
        minWidth={200}
        minHeight={120}
        style={{ background: 'transparent', border: 'none' }}
      />
      <div
        className="relative flex flex-col rounded-xl border bg-card shadow-lg overflow-hidden"
        style={{ width: '100%', height: '100%' }}
      >
        <div className="drag-handle flex items-center gap-2 px-3 py-1.5 border-b bg-card/80 backdrop-blur-sm cursor-grab active:cursor-grabbing shrink-0">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs font-medium truncate flex-1">{name as string}</span>
          {isDocument && (
            <span className="text-[10px] text-muted-foreground shrink-0">{lineCount} lines</span>
          )}
          {selected && (
            <button
              onClick={handleDelete}
              className="p-1 rounded hover:bg-destructive/20 transition-colors"
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-auto nodrag nowheel nopan">
          {isDocument ? (
            <pre className="p-3 text-xs font-mono text-foreground/80 whitespace-pre-wrap break-words leading-relaxed">
              {content as string}
            </pre>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4">
              <File className="h-10 w-10 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{name as string}</span>
              {ext && (
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase font-medium"
                )}>
                  {(ext as string).replace('.', '')}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export const FileNode = memo(FileNodeComponent)
