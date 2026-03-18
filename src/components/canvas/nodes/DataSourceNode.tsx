import { memo, useCallback, useState } from 'react'
import { type NodeProps, Handle, Position } from '@xyflow/react'
import {
  Trash2, FileSpreadsheet, Table2, Database, Hash, ALargeSmall,
  Calendar, ToggleLeft, FolderOpen, Rows3
} from 'lucide-react'
import { useBoardStore } from '@/stores/board-store'
import { useDataStore } from '@/stores/data-store'
import type { DataSourceNodeData } from '@/types/data-source'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'

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
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const columns = source?.columns ?? []
  const filePath = source?.filePath
  const previewRows = (cachedData as Record<string, unknown>[] | undefined)?.slice(0, 5) ?? []
  const previewCols = columns.slice(0, 5)
  const liveRowCount = source?.rowCount ?? rowCount

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      removeNode(id)
      removeSource(dataSourceId)
    },
    [id, dataSourceId, removeNode, removeSource]
  )

  const Icon = type === 'excel' ? FileSpreadsheet : type === 'csv' ? Table2 : Database

  // Show just the filename from the path
  const fileName = filePath ? filePath.replace(/\\/g, '/').split('/').pop() : null
  // Show a shortened directory path
  const dirPath = filePath
    ? filePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
    : null

  return (
    <div className={cn(
      'rounded-xl border bg-card shadow-lg overflow-hidden transition-all',
      selected ? 'border-primary/50 shadow-primary/10' : 'border-border',
      expanded ? 'w-[360px]' : 'w-[280px]'
    )}>
      <Handle type="source" position={Position.Right} className="!bg-primary !w-2.5 !h-2.5" />

      {/* Header */}
      <div className="drag-handle flex items-center gap-2 px-3 py-2 bg-muted/40 cursor-grab active:cursor-grabbing">
        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 shrink-0">
          <Icon className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold truncate block">{name as string}</span>
          {filePath && (
            <span className="text-[10px] text-muted-foreground truncate block" title={filePath as string}>
              {dirPath}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {selected && (
            <button
              onClick={handleDelete}
              className="p-1 rounded hover:bg-destructive/20 transition-colors"
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Rows3 className="h-3 w-3" />
          {(liveRowCount as number).toLocaleString()} {t('data.rows')}
        </span>
        <span className="inline-flex items-center gap-1">
          <Hash className="h-3 w-3" />
          {columns.length} {t('data.cols')}
        </span>
        {filePath && (
          <span className="inline-flex items-center gap-1 ml-auto" title={filePath as string}>
            <FolderOpen className="h-3 w-3" />
            {fileName}
          </span>
        )}
        {!filePath && (
          <span className="inline-flex items-center gap-1 ml-auto">
            <Database className="h-3 w-3" />
            {t('data.inMemory')}
          </span>
        )}
      </div>

      {/* Column chips */}
      <div className="px-3 py-2 flex flex-wrap gap-1">
        {columns.slice(0, expanded ? 16 : 6).map((col) => {
          const ColIcon = colTypeIcon[col.type] || ALargeSmall
          return (
            <span
              key={col.name}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              <ColIcon className="h-2.5 w-2.5 opacity-60" />
              {col.name}
            </span>
          )
        })}
        {!expanded && columns.length > 6 && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(true) }}
            className="text-[10px] text-primary hover:text-primary/80 px-1.5 py-0.5 transition-colors"
          >
            {t('data.moreCols', { n: columns.length - 6 })}
          </button>
        )}
        {expanded && columns.length > 6 && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(false) }}
            className="text-[10px] text-primary hover:text-primary/80 px-1.5 py-0.5 transition-colors"
          >
            {t('data.showLess')}
          </button>
        )}
      </div>

      {/* Mini preview table */}
      {previewRows.length > 0 && (
        <div className="border-t overflow-hidden">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="bg-muted/30">
                {previewCols.map((col) => (
                  <th key={col.name} className="px-2 py-1 text-left font-medium text-muted-foreground truncate max-w-[70px]">
                    {col.name}
                  </th>
                ))}
                {columns.length > 5 && (
                  <th className="px-2 py-1 text-left font-medium text-muted-foreground">...</th>
                )}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr key={i} className="border-t border-border/50">
                  {previewCols.map((col) => (
                    <td key={col.name} className="px-2 py-0.5 text-muted-foreground truncate max-w-[70px]">
                      {String(row[col.name] ?? '')}
                    </td>
                  ))}
                  {columns.length > 5 && (
                    <td className="px-2 py-0.5 text-muted-foreground">...</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {(liveRowCount as number) > 5 && (
            <div className="px-2 py-1 text-[9px] text-muted-foreground/60 text-center border-t border-border/50">
              {t('data.moreRows', { n: ((liveRowCount as number) - 5).toLocaleString() })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const DataSourceNode = memo(DataSourceNodeComponent)
