import { watch, type FSWatcher } from 'fs'
import { BrowserWindow } from 'electron'
import { parseFile } from './file-parser'
import { saveDataSource } from './database'

interface WatchEntry {
  filePath: string
  sourceIds: string[]
  watcher: FSWatcher
  debounceTimer: ReturnType<typeof setTimeout> | null
}

const watchers = new Map<string, WatchEntry>()

export function watchFileForSource(filePath: string, sourceIds: string[]): void {
  // Already watching this file — just add source IDs
  const existing = watchers.get(filePath)
  if (existing) {
    for (const id of sourceIds) {
      if (!existing.sourceIds.includes(id)) {
        existing.sourceIds.push(id)
      }
    }
    return
  }

  const entry: WatchEntry = {
    filePath,
    sourceIds: [...sourceIds],
    debounceTimer: null,
    watcher: watch(filePath, () => {
      // Debounce: some editors write multiple times
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
      entry.debounceTimer = setTimeout(() => reloadFile(filePath), 500)
    })
  }

  watchers.set(filePath, entry)
}

async function reloadFile(filePath: string): Promise<void> {
  const entry = watchers.get(filePath)
  if (!entry) return

  try {
    const parsed = parseFile(filePath)

    // Match parsed sheets to existing source IDs by index
    for (let i = 0; i < Math.min(parsed.length, entry.sourceIds.length); i++) {
      const data = parsed[i]
      const sourceId = entry.sourceIds[i]

      await saveDataSource(
        sourceId,
        'default',
        data.name,
        filePath.endsWith('.csv') || filePath.endsWith('.tsv') ? 'csv' : 'excel',
        JSON.stringify(data.columns),
        data.rows.length,
        JSON.stringify(data.rows),
        filePath
      )

      // Push update to all renderer windows
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('data:source-updated', {
          id: sourceId,
          name: data.name,
          columns: data.columns,
          rowCount: data.rows.length,
          rows: data.rows
        })
      }
    }
  } catch {
    // File might be mid-write or locked — ignore, next change event will retry
  }
}

export function unwatchFile(filePath: string): void {
  const entry = watchers.get(filePath)
  if (!entry) return
  if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
  entry.watcher.close()
  watchers.delete(filePath)
}

export function unwatchSource(sourceId: string): void {
  for (const [filePath, entry] of watchers) {
    entry.sourceIds = entry.sourceIds.filter((id) => id !== sourceId)
    if (entry.sourceIds.length === 0) {
      unwatchFile(filePath)
    }
  }
}
