export type DataSourceType = 'excel' | 'csv' | 'manual'

export interface DataSource {
  id: string
  boardId: string
  name: string
  type: DataSourceType
  config: Record<string, unknown>
  columns: ColumnDef[]
  rowCount: number
  createdAt: number
  updatedAt: number
}

export interface ColumnDef {
  name: string
  type: 'text' | 'number' | 'date' | 'boolean'
}

export interface DataSourceNodeData {
  dataSourceId: string
  name: string
  type: DataSourceType
  rowCount: number
  [key: string]: unknown
}
