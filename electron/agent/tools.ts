/**
 * Agent tools — give the AI access to board context,
 * data sources, microapps, and system information.
 */
import { tool } from '@strands-agents/sdk'
import { z } from 'zod'
import { BrowserWindow } from 'electron'
import { hostname, userInfo, platform, arch, release } from 'os'
import { getDataSources, getDataSource, getMicroapps, loadBoard, listBoards } from '../data/database'
import { parseFile } from '../data/file-parser'
import { existsSync } from 'fs'

function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  }
}

/** Get system and user context */
export const getSystemContext = tool({
  name: 'get_system_context',
  description: 'Get information about the current user, system, and environment. Use this to personalise responses.',
  inputSchema: z.object({}),
  callback: () => {
    const user = userInfo()
    return JSON.stringify({
      username: user.username,
      hostname: hostname(),
      platform: platform(),
      arch: arch(),
      osRelease: release(),
      homeDir: user.homedir,
      shell: user.shell || undefined,
      timestamp: new Date().toISOString()
    })
  }
})

/** List all boards */
export const listAllBoards = tool({
  name: 'list_boards',
  description: 'List all boards in the app with their names and IDs.',
  inputSchema: z.object({}),
  callback: async () => {
    const boards = await listBoards()
    return JSON.stringify(boards.map((b) => ({
      id: b.id,
      name: b.name,
      updatedAt: b.updated_at
    })))
  }
})

/** Get data sources for a board */
export const getDataSourcesTool = tool({
  name: 'get_data_sources',
  description: 'Get all data sources (CSV, Excel, manual tables) for a specific board. Returns metadata and column definitions.',
  inputSchema: z.object({
    boardId: z.string().describe('The board ID to get data sources for')
  }),
  callback: async ({ boardId }) => {
    const sources = await getDataSources(boardId)
    return JSON.stringify(sources.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      columns: JSON.parse((s.columns_def as string) || '[]'),
      rowCount: s.row_count,
      filePath: s.file_path || null
    })))
  }
})

/** Query a specific data source — returns rows */
export const queryDataSource = tool({
  name: 'query_data_source',
  description: 'Get the actual row data from a data source. For file-backed sources, reads fresh from the file. Use get_data_sources first to find available source IDs.',
  inputSchema: z.object({
    sourceId: z.string().describe('The data source ID to query')
  }),
  callback: async ({ sourceId }) => {
    const source = await getDataSource(sourceId)
    if (!source) return JSON.stringify({ error: 'Data source not found' })

    // File-backed: read from file
    const filePath = source.file_path as string | null
    if (filePath && existsSync(filePath)) {
      try {
        const parsed = parseFile(filePath)
        const name = source.name as string
        const match = parsed.find((p) => p.name === name) || parsed[0]
        if (match) {
          return JSON.stringify({
            columns: match.columns,
            rows: match.rows.slice(0, 100), // limit to avoid huge payloads
            totalRows: match.rows.length
          })
        }
      } catch {
        // Fall through to DB
      }
    }

    // Manual source: read from DB
    return JSON.stringify({
      columns: JSON.parse((source.columns_def as string) || '[]'),
      rows: JSON.parse((source.data as string) || '[]').slice(0, 100),
      totalRows: source.row_count
    })
  }
})

/** Get microapps for a board */
export const getMicroappsTool = tool({
  name: 'get_microapps',
  description: 'Get all microapps on a specific board. Returns their names, prompts, and source code.',
  inputSchema: z.object({
    boardId: z.string().describe('The board ID to get microapps for')
  }),
  callback: async ({ boardId }) => {
    const apps = await getMicroapps(boardId)
    return JSON.stringify(apps.map((m) => ({
      id: m.id,
      name: m.name,
      prompt: m.prompt,
      hasSource: !!(m.source),
      icon: m.icon,
      color: m.color
    })))
  }
})

/** Get a board's full context — board info + data sources + microapps */
export const getBoardContext = tool({
  name: 'get_board_context',
  description: 'Get a complete overview of a board: its data sources and microapps. Use this as the first step to understand what the user is working with.',
  inputSchema: z.object({
    boardId: z.string().describe('The board ID')
  }),
  callback: async ({ boardId }) => {
    const board = await loadBoard(boardId)
    if (!board) return JSON.stringify({ error: 'Board not found' })

    const sources = await getDataSources(boardId)
    const apps = await getMicroapps(boardId)

    return JSON.stringify({
      board: { id: board.id, name: board.name },
      dataSources: sources.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        rowCount: s.row_count,
        columns: JSON.parse((s.columns_def as string) || '[]'),
        filePath: s.file_path || null
      })),
      microapps: apps.map((m) => ({
        id: m.id,
        name: m.name,
        prompt: m.prompt,
        icon: m.icon,
        color: m.color
      }))
    })
  }
})

/** Navigate to a different board */
export const navigateToBoard = tool({
  name: 'navigate_to_board',
  description: 'Switch the app to a different board. Use this when the user asks to go to or open a specific board.',
  inputSchema: z.object({
    boardId: z.string().describe('The board ID to navigate to'),
    boardName: z.string().describe('The board name (for display)')
  }),
  callback: ({ boardId, boardName }) => {
    broadcast('agent:navigate-board', { boardId, boardName })
    return JSON.stringify({ success: true, message: `Navigating to "${boardName}"` })
  }
})

/** Focus/zoom to a specific microapp on the canvas */
export const focusMicroapp = tool({
  name: 'focus_microapp',
  description: 'Pan and zoom the canvas to center on a specific microapp. Use this when the user asks to see, show, or go to a particular microapp.',
  inputSchema: z.object({
    microappId: z.string().describe('The microapp node ID to focus on')
  }),
  callback: ({ microappId }) => {
    broadcast('agent:focus-node', { nodeId: microappId })
    return JSON.stringify({ success: true, message: `Focusing on microapp ${microappId}` })
  }
})

import { microappTools } from './microapp-agent'

export const allTools = [
  getSystemContext,
  listAllBoards,
  getDataSourcesTool,
  queryDataSource,
  getMicroappsTool,
  getBoardContext,
  navigateToBoard,
  focusMicroapp,
  ...microappTools
]
