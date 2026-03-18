import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { ElectronOllama } from 'electron-ollama'

const OLLAMA_BASE = 'http://127.0.0.1:11434'
const SETTINGS_FILE = () => join(app.getPath('userData'), 'ollama-settings.json')

import { detectHardware } from './hardware'

let ollamaInstance: InstanceType<typeof ElectronOllama> | null = null
let managedByUs = false // true if we started this Ollama process
let cachedNumCtx: number = 8192 // safe default, updated on startup

export function getRecommendedNumCtx(): number {
  return cachedNumCtx
}

export function refreshHardwareConfig(): void {
  const hw = detectHardware()
  cachedNumCtx = hw.recommendedCtx
}

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

/** Wait for Ollama to become reachable, polling every intervalMs */
async function waitForOllama(timeoutMs: number, intervalMs = 500): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isOllamaRunning()) return true
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return false
}

export async function ensureOllamaRunning(
  onLog?: (message: string) => void,
  onDownloadProgress?: (percent: number, message: string) => void
): Promise<void> {
  // Check if already running (system install or previous app session)
  if (await isOllamaRunning()) {
    managedByUs = false // We didn't start it, but we can use it
    onLog?.('Ollama already running')
    return
  }

  // Kill any stale ollama processes before starting fresh
  await killStaleOllama()


  const ollama = getOllama()

  // Download if needed
  let versions: string[] = []
  try {
    versions = await ollama.downloadedVersions()
    console.log('[Ollama] Downloaded versions:', versions)
  } catch (err) {
    console.warn('[Ollama] Failed to list versions:', err)
  }

  if (versions.length === 0) {
    onLog?.('Downloading Ollama...')
    try {
      await ollama.download('latest', undefined, {
        log: (percent, message) => {
          onDownloadProgress?.(percent, message)
        }
      })
    } catch (err) {
      console.error('[Ollama] Download failed:', err)
      throw new Error(`Failed to download Ollama: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  let allVersions: string[] = []
  try {
    allVersions = await ollama.downloadedVersions()
  } catch { /* ignore */ }
  console.log('[Ollama] Available versions after download:', allVersions)

  if (allVersions.length === 0) {
    throw new Error('Failed to download Ollama — no versions found after download')
  }

  const version = allVersions[allVersions.length - 1] as `v${number}.${number}.${number}`
  onLog?.(`Starting Ollama ${version}...`)
  console.log(`[Ollama] Starting serve for version ${version}...`)

  try {
    await ollama.serve(version, {
      serverLog: (message) => {
        console.log('[Ollama Server]', message)
        onLog?.(message)
      },
      timeoutSec: 60 // 60s timeout — first start can be slow
    })
    managedByUs = true
    onLog?.('Ollama is running')
    console.log('[Ollama] serve() completed successfully')
  } catch (serveErr) {
    console.warn('[Ollama] serve() threw, but process may still be starting:', serveErr)
    // The serve() timeout may fire before the server is actually ready.
    // Give it extra time — poll for up to 30 more seconds.
    onLog?.('Waiting for Ollama to become ready...')
    const reachable = await waitForOllama(30_000)
    if (reachable) {
      managedByUs = true
      onLog?.('Ollama is running')
      console.log('[Ollama] Server became reachable after extended wait')
    } else {
      throw new Error('Ollama server failed to start. The process was launched but never became reachable.')
    }
  }
}

/** Kill orphaned ollama processes that may be left from a previous crashed session */
async function killStaleOllama(): Promise<void> {
  try {
    const { execSync } = await import('child_process')
    if (process.platform === 'win32') {
      // Only kill ollama_runners / ollama.exe that are children of our app data path
      execSync('taskkill /F /IM ollama_llama_server.exe 2>nul', { timeout: 5000 })
      execSync('taskkill /F /IM ollama.exe 2>nul', { timeout: 5000 })
    } else {
      execSync('pkill -f ollama 2>/dev/null || true', { timeout: 5000 })
    }
    // Give OS time to release the port
    await new Promise((r) => setTimeout(r, 1000))
  } catch {
    // Ignore — no stale processes to kill
  }
}

export async function stopOllama(): Promise<void> {
  try {
    const ollama = getOllama()
    const server = ollama.getServer()
    if (server) server.stop()
  } catch { /* ignore */ }

  if (managedByUs) {
    // Ensure the process is really dead
    await killStaleOllama()
  }
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
  console.log(`[Ollama] Pulling model: ${model}`)
  const response = await fetch(`${OLLAMA_BASE}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true })
  })

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Failed to pull model (${response.status}): ${errText || response.statusText}`)
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
        if (data.error) {
          throw new Error(`Model pull error: ${data.error}`)
        }
        onProgress?.(data.status, data.completed, data.total)
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('Model pull error:')) throw e
        // skip malformed JSON lines
      }
    }
  }
  console.log(`[Ollama] Model ${model} pull completed`)
}

/** Warm up the model so it's loaded and ready when the user generates */
export async function warmModel(model: string): Promise<void> {
  try {
    console.log(`[Ollama] Warming model: ${model}`)
    const response = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: '', keep_alive: '10m', options: { num_ctx: cachedNumCtx } })
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
