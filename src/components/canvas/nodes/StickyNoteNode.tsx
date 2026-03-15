import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { type NodeProps, NodeResizeControl } from '@xyflow/react'
import { GripVertical, Trash2 } from 'lucide-react'
import { useBoardStore } from '@/stores/board-store'

function StickyNoteNodeComponent({ id, data, selected }: NodeProps) {
  const { content, color } = data as { label: string; content: string; color: string }
  const [isEditing, setIsEditing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const updateNodeData = useBoardStore((s) => s.updateNodeData)
  const removeNode = useBoardStore((s) => s.removeNode)

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isEditing])

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true)
  }, [])

  const handleBlur = useCallback(() => {
    setIsEditing(false)
  }, [])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { content: e.target.value })
    },
    [id, updateNodeData]
  )

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
        minWidth={140}
        minHeight={100}
        style={{ background: 'transparent', border: 'none' }}
      />
      <div
        className="relative flex flex-col rounded-lg shadow-lg"
        style={{
          backgroundColor: color,
          width: '100%',
          height: '100%',
          minWidth: 140,
          minHeight: 100
        }}
      >
        {/* Drag handle header */}
        <div className="drag-handle flex items-center justify-between px-2 py-1 cursor-grab active:cursor-grabbing">
          <GripVertical className="w-3.5 h-3.5 opacity-40" />
          {selected && (
            <button
              onClick={handleDelete}
              className="p-0.5 rounded hover:bg-black/10 transition-colors"
            >
              <Trash2 className="w-3 h-3 opacity-50" />
            </button>
          )}
        </div>

        {/* Content area */}
        <div
          className="flex-1 px-3 pb-3 nodrag nowheel nopan"
          onDoubleClick={handleDoubleClick}
        >
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={content as string}
              onChange={handleChange}
              onBlur={handleBlur}
              className="w-full h-full bg-transparent resize-none outline-none text-sm text-black/80 placeholder:text-black/30"
              placeholder="Type something..."
            />
          ) : (
            <p className="text-sm text-black/80 whitespace-pre-wrap select-none">
              {(content as string) || (
                <span className="text-black/30 italic">Double-click to edit</span>
              )}
            </p>
          )}
        </div>
      </div>
    </>
  )
}

export const StickyNoteNode = memo(StickyNoteNodeComponent)
