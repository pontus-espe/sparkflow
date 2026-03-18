import { ipcMain, BrowserWindow } from 'electron'
import {
  ensureOllamaRunning,
  pullModel,
  getOllamaModels,
  stopOllama,
  getActiveModel,
  setActiveModel,
  warmModel,
  unloadModel,
  getProvider,
  setProvider,
  getAnthropicApiKey,
  setAnthropicApiKey,
  getAnthropicModel,
  setAnthropicModel,
  type AIProvider,
  getRecommendedNumCtx,
  refreshHardwareConfig
} from '../ollama/manager'
import { detectHardware } from '../ollama/hardware'

const OLLAMA_BASE = 'http://127.0.0.1:11434'

function getAllWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows()
}

function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of getAllWindows()) {
    win.webContents.send(channel, ...args)
  }
}

/** Resolve which model to use for generation */
async function resolveModel(): Promise<string | null> {
  const models = await getOllamaModels()
  if (models.length === 0) return null

  const active = getActiveModel()
  if (active && models.includes(active)) return active

  // Fallback: prefer smallest model to avoid OOM
  return models[0]
}

async function generateWithOllama(win: BrowserWindow, prompt: string, system?: string): Promise<void> {
  const model = await resolveModel()
  if (!model) {
    win.webContents.send('ollama:generate:error', 'No model available. Please wait for the model to finish downloading.')
    return
  }

  console.log(`[Ollama Generate] Using model: ${model}`)

  try {
    const response = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        system: system || undefined,
        stream: true,
        options: {
          temperature: 0.25,
          num_predict: 4096,
          num_ctx: getRecommendedNumCtx(),
          top_p: 0.9
        }
      })
    })

    if (!response.ok || !response.body) {
      const errBody = await response.text().catch(() => '')
      const msg = `Ollama error (${response.status}): ${errBody.slice(0, 200) || response.statusText}`
      console.error('[Ollama Generate]', msg)
      win.webContents.send('ollama:generate:error', msg)
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value, { stream: true })
      const lines = text.split('\n').filter(Boolean)

      for (const line of lines) {
        try {
          const data = JSON.parse(line)
          if (data.response) {
            fullText += data.response
            win.webContents.send('ollama:generate:stream', data.response)
          }
          if (data.done) {
            win.webContents.send('ollama:generate:done', fullText)
            return
          }
        } catch {
          // Skip malformed lines
        }
      }
    }

    win.webContents.send('ollama:generate:done', fullText)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Ollama Generate] Error:', message)
    win.webContents.send('ollama:generate:error', message)
  }
}

async function generateWithAnthropic(win: BrowserWindow, prompt: string, system?: string): Promise<void> {
  const apiKey = getAnthropicApiKey()
  if (!apiKey) {
    win.webContents.send('ollama:generate:error', 'No Anthropic API key configured. Please add your API key in settings.')
    return
  }

  const model = getAnthropicModel()
  console.log(`[Anthropic Generate] Using model: ${model}`)

  try {
    const messages: { role: string; content: string }[] = [
      { role: 'user', content: prompt }
    ]

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: system || undefined,
        messages,
        stream: true
      })
    })

    if (!response.ok || !response.body) {
      const errBody = await response.text().catch(() => '')
      const msg = `Anthropic error (${response.status}): ${errBody.slice(0, 300) || response.statusText}`
      console.error('[Anthropic Generate]', msg)
      win.webContents.send('ollama:generate:error', msg)
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const jsonStr = line.slice(6).trim()
        if (jsonStr === '[DONE]') continue

        try {
          const event = JSON.parse(jsonStr)
          if (event.type === 'content_block_delta' && event.delta?.text) {
            fullText += event.delta.text
            win.webContents.send('ollama:generate:stream', event.delta.text)
          }
        } catch {
          // Skip malformed SSE lines
        }
      }
    }

    win.webContents.send('ollama:generate:done', fullText)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Anthropic Generate] Error:', message)
    win.webContents.send('ollama:generate:error', message)
  }
}

export function registerOllamaHandlers(): void {
  ipcMain.handle('ollama:status', async () => {
    // If using Anthropic, report ready if key is configured
    if (getProvider() === 'anthropic') {
      const hasKey = !!getAnthropicApiKey()
      return {
        status: hasKey ? 'ready' : 'not-running',
        model: hasKey ? getAnthropicModel() : null,
        models: [],
        provider: 'anthropic'
      }
    }

    try {
      const response = await fetch(`${OLLAMA_BASE}/api/tags`)
      if (!response.ok) return { status: 'error', model: null, models: [] }

      const data = await response.json()
      const models = (data.models || []).map((m: { name: string }) => m.name)

      if (models.length === 0) {
        return { status: 'downloading', model: null, models: [] }
      }

      const active = getActiveModel()
      const currentModel = active && models.includes(active) ? active : models[0]

      return { status: 'ready', model: currentModel, models }
    } catch {
      return { status: 'not-running', model: null, models: [] }
    }
  })

  ipcMain.handle('ollama:set-model', async (_event, model: string) => {
    const previousModel = getActiveModel()
    setActiveModel(model) // persisted to disk
    console.log(`[Ollama] Model changed: ${previousModel} → ${model}`)

    // Unload previous model to free memory, then warm new one
    if (previousModel && previousModel !== model) {
      await unloadModel(previousModel)
    }
    // Warm in background — don't block the UI
    warmModel(model).catch(() => {})

    return { success: true, model }
  })

  ipcMain.handle('ollama:list-models', async () => {
    try {
      const models = await getOllamaModels()
      return { models }
    } catch {
      return { models: [] }
    }
  })

  ipcMain.handle('ollama:generate', async (event, prompt: string, system?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    const provider = getProvider()

    if (provider === 'anthropic') {
      await generateWithAnthropic(win, prompt, system)
    } else {
      await generateWithOllama(win, prompt, system)
    }
  })

  // Quick non-streaming generate (for metadata, short responses)
  ipcMain.handle('ollama:generate-quick', async (_event, prompt: string, system?: string) => {
    const provider = getProvider()

    if (provider === 'anthropic') {
      const apiKey = getAnthropicApiKey()
      if (!apiKey) return { error: 'No API key' }
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: getAnthropicModel(),
            max_tokens: 256,
            system: system || undefined,
            messages: [{ role: 'user', content: prompt }]
          })
        })
        if (!response.ok) return { error: `Anthropic error: ${response.status}` }
        const data = await response.json()
        const text = data.content?.[0]?.text || ''
        return { text }
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Unknown error' }
      }
    } else {
      // Ollama non-streaming
      const model = await resolveModel()
      if (!model) return { error: 'No model available' }
      try {
        const response = await fetch(`${OLLAMA_BASE}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            prompt,
            system: system || undefined,
            stream: false,
            options: { temperature: 0.3, num_predict: 256, num_ctx: getRecommendedNumCtx() }
          })
        })
        if (!response.ok) return { error: `Ollama error: ${response.status}` }
        const data = await response.json()
        return { text: data.response || '' }
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'Unknown error' }
      }
    }
  })

  // --- AI provider config ---

  ipcMain.handle('ai:get-config', async () => {
    const hardware = detectHardware()
    return {
      provider: getProvider(),
      hasApiKey: !!getAnthropicApiKey(),
      anthropicModel: getAnthropicModel(),
      hardware: {
        totalRamGB: hardware.totalRamGB,
        freeRamGB: hardware.freeRamGB,
        hasNvidiaGPU: hardware.hasNvidiaGPU,
        gpuVramGB: hardware.gpuVramGB,
        sufficient: hardware.sufficient
      }
    }
  })

  ipcMain.handle('ai:retry-setup', async () => {
    console.log('[IPC] Retry setup requested')
    startupInProgress = false // Allow retry
    startOllamaWithApp()
    return { success: true }
  })

  ipcMain.handle('ai:set-config', async (_event, config: {
    provider?: AIProvider
    anthropicApiKey?: string | null
    anthropicModel?: string
  }) => {
    if (config.provider != null) setProvider(config.provider)
    if (config.anthropicApiKey !== undefined) setAnthropicApiKey(config.anthropicApiKey)
    if (config.anthropicModel) setAnthropicModel(config.anthropicModel)
    return { success: true }
  })

  ipcMain.handle('ai:validate-key', async (_event, apiKey: string) => {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }]
        })
      })
      // 200 = valid, 401 = invalid key, other = some error but key format may be ok
      if (response.ok) return { valid: true }
      if (response.status === 401) return { valid: false, error: 'Invalid API key' }
      return { valid: true } // Non-auth errors mean key is probably fine
    } catch (err) {
      return { valid: false, error: 'Could not reach Anthropic API' }
    }
  })

  ipcMain.handle('ollama:pull-model', async (event, model: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    try {
      await pullModel(model, (status, completed, total) => {
        if (total && completed) {
          const percent = Math.round((completed / total) * 100)
          win.webContents.send('ollama:pull-progress', percent)
        }
        broadcast('ollama:pull-status', { model, status, completed, total })
      })
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { error: message }
    }
  })
}

let startupInProgress = false

export async function startOllamaWithApp(): Promise<void> {
  if (startupInProgress) {
    console.log('[Startup] Already in progress — skipping duplicate call')
    return
  }
  startupInProgress = true
  try {
    // If using Anthropic provider, skip Ollama startup entirely
    const provider = getProvider()
    console.log(`[Startup] Provider: ${provider}`)

    if (provider === 'anthropic') {
      const apiKey = getAnthropicApiKey()
      if (apiKey) {
        broadcast('ollama:startup-status', { phase: 'ready', message: `AI is ready (Anthropic API)` })
        return
      }
      // No API key set — fall through to check hardware
    }

    // Check hardware capability
    const hardware = detectHardware()
    refreshHardwareConfig()
    console.log(`[Startup] Hardware: ${hardware.totalRamGB}GB total, ${hardware.freeRamGB}GB free RAM, GPU VRAM: ${hardware.gpuVramGB}GB, sufficient: ${hardware.sufficient}, num_ctx: ${getRecommendedNumCtx()}`)

    if (!hardware.sufficient && provider === 'local') {
      broadcast('ollama:startup-status', {
        phase: 'hardware-insufficient',
        message: `Your system has ${hardware.freeRamGB}GB free RAM — local AI requires at least 4GB. Please provide an Anthropic API key.`
      })
      return
    }

    broadcast('ollama:startup-status', { phase: 'starting', message: 'Starting AI engine...' })

    let isDownloading = false
    await ensureOllamaRunning(
      (msg) => {
        console.log('[Ollama]', msg)
        // If we're in the download phase, log messages should use downloading-ollama phase
        if (msg.includes('Downloading') || msg.includes('Download')) {
          isDownloading = true
        }
        if (msg === 'Ollama is running' || msg.includes('Starting Ollama')) {
          isDownloading = false
          broadcast('ollama:startup-status', { phase: 'starting', message: msg })
        } else if (isDownloading) {
          broadcast('ollama:startup-status', { phase: 'downloading-ollama', message: msg, progress: 0 })
        } else {
          broadcast('ollama:startup-status', { phase: 'starting', message: msg })
        }
      },
      (percent, msg) => {
        isDownloading = true
        console.log(`[Ollama Download] ${percent}% - ${msg}`)
        broadcast('ollama:startup-status', {
          phase: 'downloading-ollama',
          message: `Downloading AI engine: ${percent}%`,
          progress: percent
        })
      }
    )

    console.log('[Startup] Ollama is running, checking models...')

    // Check if a model is available, auto-pull if not
    const models = await getOllamaModels()
    console.log('[Startup] Installed models:', models)

    if (models.length === 0) {
      const model = hardware.recommendedModel
      console.log(`[Startup] No models found. Pulling ${model}...`)

      broadcast('ollama:startup-status', {
        phase: 'pulling-model',
        message: `Downloading AI model (${model})... This may take a few minutes.`,
        model,
        progress: 0
      })

      await pullModel(model, (status, completed, total) => {
        let percent = 0
        if (total && completed) {
          percent = Math.round((completed / total) * 100)
        }
        broadcast('ollama:startup-status', {
          phase: 'pulling-model',
          message: `Downloading ${model}: ${percent ? percent + '%' : status}`,
          model,
          progress: percent
        })
      })

      console.log(`[Startup] Model ${model} pulled successfully`)
    }

    // Set active model if not already set (first launch or settings cleared)
    const finalModels = await getOllamaModels()
    console.log('[Startup] Final models:', finalModels)
    const currentActive = getActiveModel()
    if (finalModels.length > 0 && (!currentActive || !finalModels.includes(currentActive))) {
      setActiveModel(finalModels[0])
      console.log(`[Startup] Default model set to: ${finalModels[0]}`)
    }

    // Warm the active model so first generation is fast — fire and forget
    const modelToWarm = getActiveModel()
    if (modelToWarm) {
      console.log(`[Startup] Warming model: ${modelToWarm}`)
      broadcast('ollama:startup-status', { phase: 'warming-model', message: 'Loading AI model into memory...', model: modelToWarm })
      warmModel(modelToWarm)
        .then(() => {
          broadcast('ollama:startup-status', { phase: 'ready', message: 'AI is ready' })
          console.log('[Startup] AI startup complete')
        })
        .catch(() => {
          // Warming failed but AI is still usable — first generation will just be slower
          broadcast('ollama:startup-status', { phase: 'ready', message: 'AI is ready' })
          console.log('[Startup] Warm failed, but AI is ready')
        })
      return // Don't broadcast ready here — the warm callback will do it
    }

    broadcast('ollama:startup-status', { phase: 'ready', message: 'AI is ready' })
    console.log('[Startup] AI startup complete')
  } catch (error) {
    console.error('[Startup] Failed:', error)
    broadcast('ollama:startup-status', {
      phase: 'error',
      message: error instanceof Error ? error.message : 'Failed to start AI engine'
    })
  } finally {
    startupInProgress = false
  }
}

export async function stopOllamaWithApp(): Promise<void> {
  await stopOllama()
}
