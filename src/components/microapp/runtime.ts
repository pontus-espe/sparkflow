import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { BarChart, LineChart, AreaChart, PieChart } from '@/components/ui/charts'
import { cn } from '@/lib/utils'
import { useMicroappStore } from '@/stores/microapp-store'
import { useDataStore } from '@/stores/data-store'
import { useNotificationStore } from '@/stores/notification-store'
import { ipc } from '@/services/ipc-client'

// UI components exposed to microapps
export const UI = {
  Button,
  Input,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  CardFooter,
  Badge,
  Checkbox,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  BarChart,
  LineChart,
  AreaChart,
  PieChart
}

// useAppState hook factory — creates a hook bound to a specific microapp
export function createUseAppState(microappId: string) {
  return function useAppState<T>(key: string, defaultValue: T): [T, (value: T) => void] {
    const appState = useMicroappStore((s) => s.instances[microappId]?.state ?? {})
    const setAppState = useMicroappStore((s) => s.setAppState)

    const value = (key in appState ? appState[key] : defaultValue) as T
    const setValue = useCallback(
      (newValue: T) => {
        setAppState(microappId, key, newValue)
      },
      [key, setAppState]
    )

    return [value, setValue]
  }
}

// Helper: update cached data and persist to database
function commitRows(resolvedId: string, rows: unknown[]) {
  useDataStore.getState().setCachedData(resolvedId, rows)
  const source = useDataStore.getState().sources[resolvedId]
  if (source) {
    useDataStore.getState().updateSource(resolvedId, { rowCount: rows.length })
  }
  // Fire-and-forget persist to database
  ipc.data.updateRows(resolvedId, rows as Record<string, unknown>[])
}

// useData hook factory — creates a hook that accesses data sources with mutation support
export function createUseData(_microappId: string) {
  return function useData(sourceId?: string) {
    const sources = useDataStore((s) => s.sources)
    const cachedData = useDataStore((s) => s.cachedData)

    // Resolve the actual source ID (explicit or first available)
    const resolvedId = sourceId || Object.values(sources)[0]?.id || null
    const source = resolvedId ? sources[resolvedId] : null
    const rows = resolvedId ? (cachedData[resolvedId] ?? []) : []
    const columns = source?.columns ?? []

    const updateRow = useCallback(
      (rowIndex: number, updates: Record<string, unknown>) => {
        if (!resolvedId) return
        const current = useDataStore.getState().cachedData[resolvedId] ?? []
        if (rowIndex < 0 || rowIndex >= current.length) return
        const updated = [...current]
        updated[rowIndex] = { ...(updated[rowIndex] as Record<string, unknown>), ...updates }
        commitRows(resolvedId, updated)
      },
      [resolvedId]
    )

    const updateWhere = useCallback(
      (predicate: (row: Record<string, unknown>) => boolean, updates: Record<string, unknown>) => {
        if (!resolvedId) return
        const current = useDataStore.getState().cachedData[resolvedId] ?? []
        const updated = current.map((r) => {
          const row = r as Record<string, unknown>
          return predicate(row) ? { ...row, ...updates } : row
        })
        commitRows(resolvedId, updated)
      },
      [resolvedId]
    )

    const addRow = useCallback(
      (row: Record<string, unknown>) => {
        if (!resolvedId) return
        const current = useDataStore.getState().cachedData[resolvedId] ?? []
        commitRows(resolvedId, [...current, row])
      },
      [resolvedId]
    )

    const deleteRow = useCallback(
      (rowIndex: number) => {
        if (!resolvedId) return
        const current = useDataStore.getState().cachedData[resolvedId] ?? []
        if (rowIndex < 0 || rowIndex >= current.length) return
        commitRows(resolvedId, current.filter((_, i) => i !== rowIndex))
      },
      [resolvedId]
    )

    const deleteWhere = useCallback(
      (predicate: (row: Record<string, unknown>) => boolean) => {
        if (!resolvedId) return
        const current = useDataStore.getState().cachedData[resolvedId] ?? []
        commitRows(resolvedId, current.filter((r) => !predicate(r as Record<string, unknown>)))
      },
      [resolvedId]
    )

    if (!source) {
      const noopRow = () => {}
      const noopWhere = () => {}
      return {
        rows: [] as unknown[],
        columns: [] as { name: string; type: string }[],
        loading: false,
        error: sourceId ? `Data source "${sourceId}" not found` : null,
        updateRow: noopRow,
        updateWhere: noopWhere,
        addRow: noopRow,
        deleteRow: noopRow,
        deleteWhere: noopWhere
      }
    }

    return {
      rows,
      columns,
      loading: false,
      error: null,
      updateRow,
      updateWhere,
      addRow,
      deleteRow,
      deleteWhere
    }
  }
}

// useTable hook factory — microapp-scoped CRUD table stored in app state
// Data persists through the existing autosave mechanism via microapp state
export function createUseTable(microappId: string) {
  const useAppState = createUseAppState(microappId)

  return function useTable(tableName: string) {
    type Row = Record<string, unknown> & { _id: string }
    const stateKey = `__table:${tableName}`
    const [tableData, setTableData] = useAppState<Row[]>(stateKey, [])

    const addRow = useCallback(
      (row: Record<string, unknown>) => {
        const newRow: Row = { ...row, _id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
        setTableData([...tableData, newRow])
        return newRow._id
      },
      [tableData, setTableData]
    )

    const updateRow = useCallback(
      (id: string, updates: Record<string, unknown>) => {
        setTableData(tableData.map((r) => (r._id === id ? { ...r, ...updates } : r)))
      },
      [tableData, setTableData]
    )

    const deleteRow = useCallback(
      (id: string) => {
        setTableData(tableData.filter((r) => r._id !== id))
      },
      [tableData, setTableData]
    )

    const findRows = useCallback(
      (predicate: (row: Row) => boolean) => {
        return tableData.filter(predicate)
      },
      [tableData]
    )

    const clear = useCallback(() => {
      setTableData([])
    }, [setTableData])

    const result = {
      rows: tableData,
      addRow,
      updateRow,
      deleteRow,
      findRows,
      clear,
      count: tableData.length,
      // Support array destructuring: const [rows, setRows] = useTable('name')
      [Symbol.iterator]: function* () {
        yield tableData
        yield setTableData
      }
    }
    return result
  }
}

// Notification factory — bound to a specific microapp
export function createNotify(microappId: string) {
  return function notify(message: string, type?: 'info' | 'success' | 'warning' | 'error') {
    useNotificationStore.getState().add(microappId, message, type)
  }
}

// Utility formatters
export const utils = {
  formatDate(date: string | number | Date, options?: Intl.DateTimeFormatOptions): string {
    const d = date instanceof Date ? date : new Date(date)
    if (isNaN(d.getTime())) return String(date)
    return d.toLocaleDateString(undefined, options ?? { year: 'numeric', month: 'short', day: 'numeric' })
  },

  formatNumber(num: number, options?: Intl.NumberFormatOptions): string {
    if (typeof num !== 'number' || isNaN(num)) return String(num)
    return num.toLocaleString(undefined, options)
  },

  formatCurrency(num: number, currency = 'USD'): string {
    if (typeof num !== 'number' || isNaN(num)) return String(num)
    return num.toLocaleString(undefined, { style: 'currency', currency })
  },

  generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  },

  groupBy<T>(arr: T[], key: string): Record<string, T[]> {
    const result: Record<string, T[]> = {}
    for (const item of arr) {
      const k = String((item as Record<string, unknown>)[key] ?? 'undefined')
      if (!result[k]) result[k] = []
      result[k].push(item)
    }
    return result
  },

  sortBy<T>(arr: T[], key: string, direction: 'asc' | 'desc' = 'asc'): T[] {
    return [...arr].sort((a, b) => {
      const va = (a as Record<string, unknown>)[key]
      const vb = (b as Record<string, unknown>)[key]
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return direction === 'asc' ? cmp : -cmp
    })
  },

  sum(arr: unknown[], key?: string): number {
    return arr.reduce<number>((acc, item) => {
      const val = key ? (item as Record<string, unknown>)[key] : item
      const num = Number(val)
      return acc + (isNaN(num) ? 0 : num)
    }, 0)
  },

  average(arr: unknown[], key?: string): number {
    if (arr.length === 0) return 0
    return utils.sum(arr, key) / arr.length
  }
}

// File operations — async, dialog-gated for security
// Each operation opens a native OS dialog so the user controls file access
export const file = {
  /** Open a file picker and read text content. Returns { path, content } or null if canceled. */
  async readText(filters?: { name: string; extensions: string[] }[]): Promise<{ path: string; content: string } | null> {
    const result = await ipc.file.readText(filters)
    if ('canceled' in result || 'error' in result) return null
    return result
  },

  /** Open a file picker for JSON files. Returns { path, data } or null if canceled. */
  async readJSON(): Promise<{ path: string; data: unknown } | null> {
    const result = await ipc.file.readJSON()
    if ('canceled' in result || 'error' in result) return null
    return result
  },

  /** Open a save dialog and write text. Returns { path } or null if canceled. */
  async writeText(content: string, defaultName?: string): Promise<{ path: string } | null> {
    const result = await ipc.file.writeText(content, defaultName)
    if ('canceled' in result || 'error' in result) return null
    return result
  },

  /** Open a save dialog and write JSON. Returns { path } or null if canceled. */
  async writeJSON(data: unknown, defaultName?: string): Promise<{ path: string } | null> {
    const result = await ipc.file.writeJSON(data, defaultName)
    if ('canceled' in result || 'error' in result) return null
    return result
  },

  /** Open a save dialog and export rows as CSV. Returns { path } or null if canceled. */
  async writeCSV(rows: Record<string, unknown>[], defaultName?: string): Promise<{ path: string } | null> {
    const result = await ipc.file.writeCSV(rows, defaultName)
    if ('canceled' in result || 'error' in result) return null
    return result
  },

  /** Update an existing file at a known path (e.g. from a previous readText). Only text-based files. */
  async update(filePath: string, content: string): Promise<{ path: string } | null> {
    const result = await ipc.file.update(filePath, content)
    if ('error' in result) return null
    return result
  }
}

// Build the stdlib object for a specific microapp
export function buildStdlib(microappId: string) {
  return {
    React,
    useState,
    useEffect,
    useCallback,
    useMemo,
    useRef,
    useAppState: createUseAppState(microappId),
    useData: createUseData(microappId),
    useTable: createUseTable(microappId),
    notify: createNotify(microappId),
    file,
    utils,
    UI,
    cn
  }
}
