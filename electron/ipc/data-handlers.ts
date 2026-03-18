import { ipcMain, dialog } from 'electron'
import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { extname, basename } from 'path'
import { parseFile, writeFile } from '../data/file-parser'
import { watchFileForSource, unwatchSource, suppressWatcher } from '../data/file-watcher'
import {
  saveDataSource,
  getDataSources,
  getDataSource,
  deleteDataSource,
  saveBoard,
  loadBoard,
  listBoards,
  saveMicroapp,
  getMicroapps
} from '../data/database'

async function importFileFromPath(filePath: string, boardId: string) {
  const parsed = parseFile(filePath)
  const sources = []
  const sourceIds: string[] = []
  const fileType = filePath.endsWith('.csv') || filePath.endsWith('.tsv') ? 'csv' : 'excel'

  for (const data of parsed) {
    const id = randomUUID()
    sourceIds.push(id)
    // File-backed sources: only store metadata in DB, not row data
    await saveDataSource(
      id,
      boardId,
      data.name,
      fileType,
      JSON.stringify(data.columns),
      data.rows.length,
      '[]',
      filePath
    )
    sources.push({
      id,
      name: data.name,
      type: fileType,
      columns: data.columns,
      rowCount: data.rows.length,
      rows: data.rows,
      filePath
    })
  }

  return { sources, sourceIds }
}

/** For a file-backed source, re-parse the file to get fresh data */
function readFileSource(source: Record<string, unknown>) {
  const filePath = source.file_path as string
  if (!filePath || !existsSync(filePath)) return null
  try {
    const parsed = parseFile(filePath)
    // Find the matching sheet by index (sources are created in order)
    // For CSV there's always one sheet; for Excel, we match by name
    const name = source.name as string
    const match = parsed.find((p) => p.name === name) || parsed[0]
    if (!match) return null
    return {
      columns: match.columns,
      rows: match.rows,
      rowCount: match.rows.length
    }
  } catch (err) {
    console.warn('[data] Failed to read file source', filePath, err)
    return null
  }
}

export function registerDataHandlers(): void {
  ipcMain.handle('data:import-file', async (_event, boardId: string) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Spreadsheets', extensions: ['xlsx', 'xls', 'csv', 'tsv'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }

    try {
      const filePath = result.filePaths[0]
      const { sources, sourceIds } = await importFileFromPath(filePath, boardId)
      watchFileForSource(filePath, sourceIds)
      return { sources }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to parse file' }
    }
  })

  ipcMain.handle('data:import-file-path', async (_event, filePath: string, boardId: string) => {
    try {
      const { sources, sourceIds } = await importFileFromPath(filePath, boardId)
      watchFileForSource(filePath, sourceIds)
      return { sources }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to parse file' }
    }
  })

  ipcMain.handle('data:query-source', async (_event, sourceId: string) => {
    try {
      const source = await getDataSource(sourceId)
      if (!source) return { error: 'Data source not found' }

      // File-backed: always read from file
      if (source.file_path) {
        const fresh = readFileSource(source)
        if (fresh) return fresh
        return { error: 'File not found or unreadable' }
      }

      // Manual source: read from DB
      return {
        columns: JSON.parse(source.columns_def as string),
        rows: JSON.parse(source.data as string),
        rowCount: source.row_count
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Query failed' }
    }
  })

  ipcMain.handle('data:save-manual-table', async (_event, data: {
    boardId: string
    name: string
    columns: { name: string; type: string }[]
    rows: Record<string, unknown>[]
  }) => {
    try {
      const id = randomUUID()
      await saveDataSource(
        id,
        data.boardId,
        data.name,
        'manual',
        JSON.stringify(data.columns),
        data.rows.length,
        JSON.stringify(data.rows)
      )
      return { id, name: data.name }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to save' }
    }
  })

  ipcMain.handle('data:get-sources', async (_event, boardId: string) => {
    try {
      const sources = await getDataSources(boardId)
      return sources.map((s) => ({
        ...s,
        columns_def: JSON.parse(s.columns_def as string),
        data: undefined // Don't send full data in list
      }))
    } catch (error) {
      return []
    }
  })

  // Update rows of an existing data source (used by microapp mutations)
  ipcMain.handle('data:update-rows', async (_event, sourceId: string, rows: Record<string, unknown>[]) => {
    try {
      const source = await getDataSource(sourceId)
      if (!source) return { error: 'Data source not found' }

      const filePath = source.file_path as string | null

      if (filePath) {
        // File-backed: write to file (the source of truth), don't store rows in DB
        try {
          suppressWatcher(filePath)
          writeFile(filePath, rows)
        } catch (err) {
          console.warn('[data:update-rows] Failed to write back to file:', err)
          return { error: 'Failed to write to file' }
        }
      } else {
        // Manual source: store rows in DB
        await saveDataSource(
          sourceId,
          source.board_id as string,
          source.name as string,
          source.type as string,
          source.columns_def as string,
          rows.length,
          JSON.stringify(rows)
        )
      }

      return { success: true }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to update rows' }
    }
  })

  ipcMain.handle('data:delete-source', async (_event, sourceId: string) => {
    try {
      unwatchSource(sourceId)
      await deleteDataSource(sourceId)
      return { success: true }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to delete' }
    }
  })
}

export function registerFileHandlers(): void {
  // Read a text file via open dialog
  ipcMain.handle('file:read-text', async (_event, filters?: { name: string; extensions: string[] }[]) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters || [
        { name: 'Text Files', extensions: ['txt', 'md', 'json', 'csv', 'tsv', 'xml', 'html', 'log'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }

    try {
      const filePath = result.filePaths[0]
      const content = readFileSync(filePath, 'utf-8')
      return { path: filePath, content }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to read file' }
    }
  })

  // Read and parse a JSON file via open dialog
  ipcMain.handle('file:read-json', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }

    try {
      const filePath = result.filePaths[0]
      const content = readFileSync(filePath, 'utf-8')
      const data = JSON.parse(content)
      return { path: filePath, data }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to read JSON file' }
    }
  })

  // Write text content via save dialog
  ipcMain.handle('file:write-text', async (_event, content: string, defaultName?: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName || 'untitled.txt',
      filters: [
        { name: 'Text Files', extensions: ['txt', 'md', 'csv', 'json', 'xml', 'html'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePath) return { canceled: true }

    try {
      writeFileSync(result.filePath, content, 'utf-8')
      return { path: result.filePath }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to write file' }
    }
  })

  // Write JSON data via save dialog
  ipcMain.handle('file:write-json', async (_event, data: unknown, defaultName?: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName || 'data.json',
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return { canceled: true }

    try {
      writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8')
      return { path: result.filePath }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to write JSON file' }
    }
  })

  // Write array of objects as CSV via save dialog
  ipcMain.handle('file:write-csv', async (_event, rows: Record<string, unknown>[], defaultName?: string) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { error: 'No data to export' }
    }

    const result = await dialog.showSaveDialog({
      defaultPath: defaultName || 'export.csv',
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    })
    if (result.canceled || !result.filePath) return { canceled: true }

    try {
      const headers = Object.keys(rows[0])
      const csvLines = [
        headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','),
        ...rows.map(row =>
          headers.map(h => {
            const val = row[h]
            if (val == null) return ''
            const str = String(val)
            return str.includes(',') || str.includes('"') || str.includes('\n')
              ? `"${str.replace(/"/g, '""')}"`
              : str
          }).join(',')
        )
      ]
      writeFileSync(result.filePath, csvLines.join('\n'), 'utf-8')
      return { path: result.filePath }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to write CSV file' }
    }
  })

  // Read a dropped file by path — returns appropriate data by type
  ipcMain.handle('file:read-drop', async (_event, filePath: string) => {
    try {
      const ext = extname(filePath).toLowerCase()
      const name = basename(filePath)
      const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico']
      const textExts = ['.txt', '.md', '.markdown', '.log', '.json', '.xml', '.html', '.css', '.js', '.ts', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.env', '.sh', '.bat', '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h']

      if (imageExts.includes(ext)) {
        const buffer = readFileSync(filePath)
        const mime = ext === '.svg' ? 'image/svg+xml'
          : ext === '.png' ? 'image/png'
          : ext === '.gif' ? 'image/gif'
          : ext === '.webp' ? 'image/webp'
          : ext === '.bmp' ? 'image/bmp'
          : ext === '.ico' ? 'image/x-icon'
          : 'image/jpeg'
        const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`
        return { type: 'image', name, path: filePath, dataUrl }
      }

      if (textExts.includes(ext)) {
        const content = readFileSync(filePath, 'utf-8')
        return { type: 'document', name, path: filePath, content, ext }
      }

      // Unknown/binary — just return file info
      return { type: 'file', name, path: filePath, ext }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to read file' }
    }
  })

  // Overwrite an existing file at a known path (for update-in-place)
  ipcMain.handle('file:update', async (_event, filePath: string, content: string) => {
    try {
      const ext = extname(filePath).toLowerCase()
      // Safety: only allow overwriting known text-based file types
      const allowedExts = ['.txt', '.md', '.json', '.csv', '.tsv', '.xml', '.html', '.log', '.yaml', '.yml', '.toml']
      if (!allowedExts.includes(ext)) {
        return { error: `Cannot update files of type ${ext}` }
      }
      writeFileSync(filePath, content, 'utf-8')
      return { path: filePath }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to update file' }
    }
  })
}

export function registerBoardHandlers(): void {
  ipcMain.handle('board:save', async (_event, state: {
    id: string
    name: string
    canvasState: string
    microapps?: Array<{
      id: string
      name: string
      prompt: string
      source: string
      state: string
      positionX: number
      positionY: number
      width: number
      height: number
      icon?: string
      color?: string
    }>
  }) => {
    try {
      await saveBoard(state.id, state.name, state.canvasState)

      if (state.microapps) {
        for (const m of state.microapps) {
          await saveMicroapp({ ...m, boardId: state.id })
        }
      }

      return { success: true }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to save' }
    }
  })

  ipcMain.handle('board:load', async (_event, id: string) => {
    try {
      const board = await loadBoard(id)
      if (!board) return null

      const microapps = await getMicroapps(id)
      const dataSources = await getDataSources(id)

      // Re-establish file watchers for data sources that have file paths
      for (const s of dataSources) {
        if (s.file_path) {
          watchFileForSource(s.file_path as string, [s.id as string])
        }
      }

      return {
        ...board,
        microapps: microapps.map((m) => ({
          ...m,
          state: JSON.parse(m.state as string || '{}')
        })),
        dataSources: dataSources.map((s) => {
          // File-backed: parse the file fresh — it's the source of truth
          if (s.file_path) {
            const fresh = readFileSource(s)
            return {
              ...s,
              columns_def: fresh?.columns ?? JSON.parse(s.columns_def as string || '[]'),
              data: fresh?.rows ?? []
            }
          }
          // Manual source: read from DB
          return {
            ...s,
            columns_def: JSON.parse(s.columns_def as string || '[]'),
            data: JSON.parse(s.data as string || '[]')
          }
        })
      }
    } catch (error) {
      return null
    }
  })

  ipcMain.handle('board:list', async () => {
    try {
      return await listBoards()
    } catch {
      return []
    }
  })

  ipcMain.handle('board:create', async (_event, name: string) => {
    const id = randomUUID()
    await saveBoard(id, name || 'Untitled Board', '{}')
    return { id, name: name || 'Untitled Board' }
  })

  ipcMain.handle('board:delete', async (_event, id: string) => {
    // For now, just acknowledge
    return { success: true }
  })

  ipcMain.handle('board:reset', async () => {
    const { resetDatabase } = await import('../data/database')
    await resetDatabase()
    return { success: true }
  })
}
