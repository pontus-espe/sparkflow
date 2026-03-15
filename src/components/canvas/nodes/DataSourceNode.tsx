import { memo, useCallback } from 'react'
import { type NodeProps, Handle, Position } from '@xyflow/react'
import { Trash2, FileSpreadsheet, Table2, Database, Hash, ALargeSmall, Calendar, ToggleLeft } from 'lucide-react'
import { useBoardStore } from '@/stores/board-store'
import { useDataStore } from '@/stores/data-store'
import type { DataSourceNodeData } from '@/types/data-source'

const colTypeIcon = {
  number: Hash,
  text: ALargeSmall,
  date: Calendar,
  boolean: ToggleLeft
} as const

function DataSourceNodeComponent({ id, data, selected }: NodeProps) {
  const { dataSourceId, name, type, rowCount } = data as DataSourceNodeData
  const removeNode = useBoardStore((s) => s.removeNode)
  const removeSource = useDataStore((s) => s.removeSource)
  const source = useDataStore((s) => s.sources[dataSourceId])
  const cachedData = useDataStore((s) => s.cachedData[dataSourceId])

  const columns = source?.columns ?? []
  const previewRows = (cachedData as Record<string, unknown>[] | undefined)?.slice(0, 4) ?? []

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      removeNode(id)
      removeSource(dataSourceId)
    },
    [id, dataSourceId, removeNode, removeSource]
  )

  const Icon = type === 'excel' ? FileSpreadsheet : type === 'csv' ? Table2 : Database

  return (
    <div className="rounded-xl border bg-card shadow-lg overflow-hidden w-[280px]">
      <Handle type="source" position={Position.Right} className="!bg-primary !w-2.5 !h-2.5" />

      {/* Header */}
      <div className="drag-handle flex items-center gap-2 px-3 py-2 border-b cursor-grab active:cursor-grabbing">
        <Icon className="h-4 w-4 text-primary shrink-0" />
        <span className="text-xs font-medium truncate flex-1">{name as string}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{rowCount as number} rows</span>
        {selected && (
          <button
            onClick={handleDelete}
            className="p-1 rounded hover:bg-destructive/20 transition-colors shrink-0"
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </button>
        )}
      </div>

      {/* Column chips */}
      <div className="px-3 py-2 flex flex-wrap gap-1 border-b">
        {columns.slice(0, 8).map((col) => {
          const ColIcon = colTypeIcon[col.type] || ALargeSmall
          return (
            <span
              key={col.name}
              className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              <ColIcon className="h-2.5 w-2.5" />
              {col.name}
            </span>
          )
        })}
        {columns.length > 8 && (
          <span className="text-[10px] text-muted-foreground px-1 py-0.5">+{columns.length - 8}</span>
        )}
      </div>

      {/* Mini preview table */}
      {previewRows.length > 0 && (
        <div className="overflow-hidden">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b">
                {columns.slice(0, 4).map((col) => (
                  <th key={col.name} className="px-2 py-1 text-left font-medium text-muted-foreground truncate max-w-[70px]">
                    {col.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr key={i} className="border-b last:border-b-0">
                  {columns.slice(0, 4).map((col) => (
                    <td key={col.name} className="px-2 py-1 text-muted-foreground truncate max-w-[70px]">
                      {String(row[col.name] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export const DataSourceNode = memo(DataSourceNodeComponent)
