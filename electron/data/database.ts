import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import initSqlJs, { type Database } from 'sql.js'

let db: Database | null = null

function getDbPath(): string {
  const dir = join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, 'board.db')
}

export async function getDatabase(): Promise<Database> {
  if (db) return db

  const SQL = await initSqlJs()
  const dbPath = getDbPath()

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      canvas_state TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS microapps (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      name TEXT NOT NULL,
      prompt TEXT,
      source TEXT,
      state TEXT DEFAULT '{}',
      position_x REAL DEFAULT 0,
      position_y REAL DEFAULT 0,
      width REAL DEFAULT 360,
      height REAL DEFAULT 320,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (board_id) REFERENCES boards(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS data_sources (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      columns_def TEXT DEFAULT '[]',
      row_count INTEGER DEFAULT 0,
      data TEXT DEFAULT '[]',
      config TEXT DEFAULT '{}',
      file_path TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (board_id) REFERENCES boards(id)
    )
  `)

  // Migration: add file_path column if missing
  try {
    db.run(`ALTER TABLE data_sources ADD COLUMN file_path TEXT`)
  } catch {
    // Column already exists
  }

  // Migration: add icon and color columns to microapps
  try {
    db.run(`ALTER TABLE microapps ADD COLUMN icon TEXT DEFAULT 'sparkles'`)
  } catch {
    // Column already exists
  }
  try {
    db.run(`ALTER TABLE microapps ADD COLUMN color TEXT DEFAULT 'default'`)
  } catch {
    // Column already exists
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      microapp_id TEXT,
      messages TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (board_id) REFERENCES boards(id)
    )
  `)

  saveDatabase()
  return db
}

export function saveDatabase(): void {
  if (!db) return
  const data = db.export()
  const buffer = Buffer.from(data)
  writeFileSync(getDbPath(), buffer)
}

// Board CRUD
export async function saveBoard(
  id: string,
  name: string,
  canvasState: string
): Promise<void> {
  const database = await getDatabase()
  const now = Date.now()
  database.run(
    `INSERT OR REPLACE INTO boards (id, name, canvas_state, created_at, updated_at)
     VALUES (?, ?, ?, COALESCE((SELECT created_at FROM boards WHERE id = ?), ?), ?)`,
    [id, name, canvasState, id, now, now]
  )
  saveDatabase()
}

export async function loadBoard(id: string): Promise<Record<string, unknown> | null> {
  const database = await getDatabase()
  const result = database.exec(`SELECT * FROM boards WHERE id = ?`, [id])
  if (result.length === 0 || result[0].values.length === 0) return null
  const cols = result[0].columns
  const row = result[0].values[0]
  const obj: Record<string, unknown> = {}
  cols.forEach((col, i) => {
    obj[col] = row[i]
  })
  return obj
}

export async function listBoards(): Promise<Record<string, unknown>[]> {
  const database = await getDatabase()
  const result = database.exec(`SELECT id, name, updated_at FROM boards ORDER BY updated_at DESC`)
  if (result.length === 0) return []
  return result[0].values.map((row) => {
    const obj: Record<string, unknown> = {}
    result[0].columns.forEach((col, i) => {
      obj[col] = row[i]
    })
    return obj
  })
}

// Data source CRUD
export async function saveDataSource(
  id: string,
  boardId: string,
  name: string,
  type: string,
  columns: string,
  rowCount: number,
  data: string,
  filePath?: string
): Promise<void> {
  const database = await getDatabase()
  const now = Date.now()
  database.run(
    `INSERT OR REPLACE INTO data_sources (id, board_id, name, type, columns_def, row_count, data, file_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM data_sources WHERE id = ?), ?), ?)`,
    [id, boardId, name, type, columns, rowCount, data, filePath ?? null, id, now, now]
  )
  saveDatabase()
}

export async function getDataSources(boardId: string): Promise<Record<string, unknown>[]> {
  const database = await getDatabase()
  const result = database.exec(`SELECT * FROM data_sources WHERE board_id = ?`, [boardId])
  if (result.length === 0) return []
  return result[0].values.map((row) => {
    const obj: Record<string, unknown> = {}
    result[0].columns.forEach((col, i) => {
      obj[col] = row[i]
    })
    return obj
  })
}

export async function getDataSource(id: string): Promise<Record<string, unknown> | null> {
  const database = await getDatabase()
  const result = database.exec(`SELECT * FROM data_sources WHERE id = ?`, [id])
  if (result.length === 0 || result[0].values.length === 0) return null
  const obj: Record<string, unknown> = {}
  result[0].columns.forEach((col, i) => {
    obj[col] = result[0].values[0][i]
  })
  return obj
}

export async function deleteDataSource(id: string): Promise<void> {
  const database = await getDatabase()
  database.run(`DELETE FROM data_sources WHERE id = ?`, [id])
  saveDatabase()
}

// Microapp persistence
export async function saveMicroapp(microapp: {
  id: string
  boardId: string
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
}): Promise<void> {
  const database = await getDatabase()
  const now = Date.now()
  database.run(
    `INSERT OR REPLACE INTO microapps (id, board_id, name, prompt, source, state, position_x, position_y, width, height, icon, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM microapps WHERE id = ?), ?), ?)`,
    [
      microapp.id, microapp.boardId, microapp.name, microapp.prompt,
      microapp.source, microapp.state, microapp.positionX, microapp.positionY,
      microapp.width, microapp.height, microapp.icon || 'sparkles', microapp.color || 'default',
      microapp.id, now, now
    ]
  )
  saveDatabase()
}

export async function getMicroapps(boardId: string): Promise<Record<string, unknown>[]> {
  const database = await getDatabase()
  const result = database.exec(`SELECT * FROM microapps WHERE board_id = ?`, [boardId])
  if (result.length === 0) return []
  return result[0].values.map((row) => {
    const obj: Record<string, unknown> = {}
    result[0].columns.forEach((col, i) => {
      obj[col] = row[i]
    })
    return obj
  })
}
