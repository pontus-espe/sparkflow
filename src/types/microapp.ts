export type MicroappStatus = 'queued' | 'generating' | 'retrying' | 'ready' | 'error'

export type MicroappColor = 'default' | 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'pink' | 'yellow'

export type MicroappIcon =
  | 'sparkles' | 'table' | 'chart' | 'list' | 'calendar'
  | 'mail' | 'users' | 'dollar' | 'heart' | 'star'
  | 'clock' | 'map' | 'image' | 'music' | 'code'
  | 'search' | 'settings' | 'shield' | 'zap' | 'briefcase'

export interface MicroappInstance {
  id: string
  boardId: string
  name: string
  prompt: string
  source: string
  compiled: string | null
  error: string | null
  status: MicroappStatus
  streamingText: string
  dataSourceIds?: string[]
  icon?: MicroappIcon
  color?: MicroappColor
  state: Record<string, unknown>
  position: { x: number; y: number }
  size: { width: number; height: number }
  createdAt: number
  updatedAt: number
}

export interface MicroappNodeData {
  microappId: string
  name: string
  [key: string]: unknown
}
