import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { ElectronOllama } from 'electron-ollama'

const OLLAMA_BASE = 'http://127.0.0.1:11434'
const SETTINGS_FILE = () => join(app.getPath('userData'), 'ollama-settings.json')

let ollamaInstance: InstanceType<typeof ElectronOllama> | null = null
let managedByUs = false // true if we started this Ollama process

// --- Settings persistence ---

export type AIProvider = 'local' | 'anthropic'

interface OllamaSettings {
  activeModel: string | null
  provider: AIProvider
  anthropicApiKey: string | null
  anthropicModel: string
}

const DEFAULT_SETTINGS: OllamaSettings = {
  activeModel: null,
  provider: 'local',
  anthropicApiKey: null,
  anthropicModel: 'claude-sonnet-4-6'
}

function loadSettings(): OllamaSettings {
  try {
    const path = SETTINGS_FILE()
    if (existsSync(path)) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(path, 'utf-8')) }
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS }
}

function saveSettings(settings: OllamaSettings): void {
  try {
    writeFileSync(SETTINGS_FILE(), JSON.stringify(settings))
  } catch { /* ignore */ }
}

let currentSettings = loadSettings()
let activeModel: string | null = currentSettings.activeModel

export function getActiveModel(): string | null {
  return activeModel
}

export function setActiveModel(model: string): void {
  activeModel = model
  currentSettings.activeModel = model
  saveSettings(currentSettings)
}

export function getProvider(): AIProvider {
  return currentSettings.provider
}

export function setProvider(provider: AIProvider): void {
  currentSettings.provider = provider
  saveSettings(currentSettings)
}

export function getAnthropicApiKey(): string | null {
  return currentSettings.anthropicApiKey
}

export function setAnthropicApiKey(key: string | null): void {
  currentSettings.anthropicApiKey = key
  saveSettings(currentSettings)
}

export function getAnthropicModel(): string {
  return currentSettings.anthropicModel
}

export function setAnthropicModel(model: string): void {
  currentSettings.anthropicModel = model
  saveSettings(currentSettings)
}

// --- Ollama lifecycle ---

function getOllama(): InstanceType<typeof ElectronOllama> {
  if (!ollamaInstance) {
    ollamaInstance = new ElectronOllama({
      basePath: join(app.getPath('userData'), 'ollama')
    })
  }
  return ollamaInstance
}

export async function isOllamaRunning(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const response = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: controller.signal })
    clearTimeout(timeout)
    return response.ok
  } catch {
    return false
  }
}

export async function ensureOllamaRunning(
  onLog?: (message: string) => void,
  onDownloadProgress?: (percent: number, message: string) => void
): Promise<void> {
  // Check if already running (system install or previous app session)
  if (await isOllamaRunning()) {
    onLog?.('Ollama already running')
    return
  }

  const ollama = getOllama()

  // Download if needed
  const versions = await ollama.downloadedVersions()
  if (versions.length === 0) {
    onLog?.('Downloading Ollama...')
    await ollama.download('latest', undefined, {
      log: (percent, message) => {
        onDownloadProgress?.(percent, message)
        onLog?.(`Download: ${percent}% - ${message}`)
      }
    })
  }

  const allVersions = await ollama.downloadedVersions()
  if (allVersions.length === 0) {
    throw new Error('Failed to download Ollama')
  }

  const version = allVersions[allVersions.length - 1] as `v${number}.${number}.${number}`
  onLog?.(`Starting Ollama ${version}...`)
  await ollama.serve(version, {
    serverLog: (message) => onLog?.(message),
    timeoutSec: 30
  })
  managedByUs = true
  onLog?.('Ollama is running')
}

export async function stopOllama(): Promise<void> {
  if (!managedByUs) return // Don't kill a system-managed Ollama
  try {
    const ollama = getOllama()
    const server = ollama.getServer()
    if (server) server.stop()
  } catch { /* ignore */ }
}

// --- Model management ---

export async function getOllamaModels(): Promise<string[]> {
  try {
    const response = await fetch(`${OLLAMA_BASE}/api/tags`)
    if (!response.ok) return []
    const data = await response.json()
    return (data.models || []).map((m: { name: string }) => m.name)
  } catch {
    return []
  }
}

export async function pullModel(
  model: string,
  onProgress?: (status: string, completed?: number, total?: number) => void
): Promise<void> {
  const response = await fetch(`${OLLAMA_BASE}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true })
  })

  if (!response.ok || !response.body) {
    throw new Error(`Failed to pull model: ${response.statusText}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const text = decoder.decode(value, { stream: true })
    const lines = text.split('\n').filter(Boolean)

    for (const line of lines) {
      try {
        const data = JSON.parse(line)
        onProgress?.(data.status, data.completed, data.total)
      } catch { /* skip */ }
    }
  }
}

/** Warm up the model so it's loaded and ready when the user generates */
export async function warmModel(model: string): Promise<void> {
  try {
    console.log(`[Ollama] Warming model: ${model}`)
    const response = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: '', keep_alive: '10m' })
    })
    // Consume body to complete the request
    if (response.body) {
      const reader = response.body.getReader()
      while (true) {
        const { done } = await reader.read()
        if (done) break
      }
    }
    console.log(`[Ollama] Model ${model} warmed`)
  } catch (err) {
    console.warn(`[Ollama] Failed to warm model: ${err}`)
  }
}

/** Unload a model from memory */
export async function unloadModel(model: string): Promise<void> {
  try {
    await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: '', keep_alive: 0 })
    })
  } catch { /* ignore */ }
}
