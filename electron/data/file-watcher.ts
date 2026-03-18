import { watchFile, unwatchFile as fsUnwatchFile, type StatWatcher } from 'fs'
import { BrowserWindow } from 'electron'
import { parseFile } from './file-parser'

interface WatchEntry {
  filePath: string
  sourceIds: string[]
  watcher: StatWatcher
  debounceTimer: ReturnType<typeof setTimeout> | null
  suppressed: boolean
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
    suppressed: false,
    // Use watchFile (stat polling) instead of watch — more reliable on Windows
    // where editors do atomic saves (write temp + rename) that break fs.watch
    watcher: watchFile(filePath, { interval: 1000 }, () => {
      // Skip if suppressed (we just wrote this file ourselves)
      if (entry.suppressed) return
      // Debounce: some editors write multiple times
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
      entry.debounceTimer = setTimeout(() => reloadFile(filePath), 500)
    })
  }

  watchers.set(filePath, entry)
}

function reloadFile(filePath: string): void {
  const entry = watchers.get(filePath)
  if (!entry) return

  try {
    const parsed = parseFile(filePath)

    // Match parsed sheets to existing source IDs by index
    for (let i = 0; i < Math.min(parsed.length, entry.sourceIds.length); i++) {
      const data = parsed[i]
      const sourceId = entry.sourceIds[i]

      // Push update to all renderer windows — no DB write needed,
      // the file is the source of truth
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
  } catch (err) {
    console.warn('[file-watcher] Failed to reload', filePath, err)
  }
}

/** Temporarily suppress the watcher for a file (e.g. during write-back) */
export function suppressWatcher(filePath: string, durationMs = 2000): void {
  const entry = watchers.get(filePath)
  if (!entry) return
  if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
  entry.debounceTimer = null
  entry.suppressed = true
  setTimeout(() => { entry.suppressed = false }, durationMs)
}

export function unwatchFile(filePath: string): void {
  const entry = watchers.get(filePath)
  if (!entry) return
  if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
  fsUnwatchFile(filePath)
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
