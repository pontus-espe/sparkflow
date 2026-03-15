import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { readFileSync } from 'fs'
import { extname, basename } from 'path'

export interface ParsedData {
  name: string
  columns: { name: string; type: 'text' | 'number' | 'date' | 'boolean' }[]
  rows: Record<string, unknown>[]
}

function inferColumnType(values: unknown[]): 'text' | 'number' | 'date' | 'boolean' {
  const sample = values.filter((v) => v != null && v !== '').slice(0, 50)
  if (sample.length === 0) return 'text'

  const numCount = sample.filter((v) => !isNaN(Number(v))).length
  if (numCount / sample.length > 0.8) return 'number'

  const boolCount = sample.filter(
    (v) => typeof v === 'boolean' || v === 'true' || v === 'false'
  ).length
  if (boolCount / sample.length > 0.8) return 'boolean'

  return 'text'
}

export function parseExcel(filePath: string): ParsedData[] {
  const workbook = XLSX.readFile(filePath)
  const results: ParsedData[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

    if (jsonData.length === 0) continue

    const columnNames = Object.keys(jsonData[0])
    const columns = columnNames.map((name) => ({
      name,
      type: inferColumnType(jsonData.map((row) => row[name]))
    }))

    results.push({
      name: `${basename(filePath, extname(filePath))} - ${sheetName}`,
      columns,
      rows: jsonData
    })
  }

  return results
}

export function parseCsv(filePath: string): ParsedData {
  const content = readFileSync(filePath, 'utf-8')
  const result = Papa.parse<Record<string, unknown>>(content, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true
  })

  const rows = result.data
  const columnNames = result.meta.fields || []

  const columns = columnNames.map((name) => ({
    name,
    type: inferColumnType(rows.map((row) => row[name]))
  }))

  return {
    name: basename(filePath, extname(filePath)),
    columns,
    rows
  }
}

export function parseFile(filePath: string): ParsedData[] {
  const ext = extname(filePath).toLowerCase()

  switch (ext) {
    case '.xlsx':
    case '.xls':
    case '.xlsm':
    case '.xlsb':
      return parseExcel(filePath)
    case '.csv':
    case '.tsv':
      return [parseCsv(filePath)]
    default:
      throw new Error(`Unsupported file type: ${ext}`)
  }
}
