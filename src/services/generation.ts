import { ipc } from './ipc-client'
import { compileMicroapp, createMicroappFactory } from './compiler'
import { buildPrompt, buildRetryPrompt, cleanAIResponse, METADATA_SYSTEM_PROMPT } from '@/lib/prompt-templates'
import { useMicroappStore } from '@/stores/microapp-store'
import { useBoardStore } from '@/stores/board-store'
import { useDataStore } from '@/stores/data-store'
import { log } from '@/stores/log-store'

const MAX_RETRIES = 2

async function fetchMetadata(prompt: string, microappId: string): Promise<void> {
  try {
    log.info('generation', 'Fetching metadata', `microapp: ${microappId}`)
    const result = await ipc.ollama.generateQuick(prompt, METADATA_SYSTEM_PROMPT)
    log.info('generation', 'Metadata response', JSON.stringify(result).slice(0, 200))

    if (result.error || !result.text) {
      log.warning('generation', 'Metadata call failed', result.error || 'no text')
      return
    }

    // Extract JSON from response (may have markdown fences or extra text)
    const jsonStr = result.text.trim()
    // Match JSON object, allowing nested content
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      log.warning('generation', 'No JSON in metadata response', jsonStr.slice(0, 100))
      return
    }

    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed || typeof parsed !== 'object') return

    log.info('generation', 'Metadata parsed', `icon=${parsed.icon} color=${parsed.color} w=${parsed.width} h=${parsed.height}`)

    const store = useMicroappStore.getState()
    const updates: Record<string, unknown> = {}

    if (typeof parsed.icon === 'string') updates.icon = parsed.icon
    if (typeof parsed.color === 'string') updates.color = parsed.color

    const width = typeof parsed.width === 'number' ? Math.min(800, Math.max(280, parsed.width)) : null
    const height = typeof parsed.height === 'number' ? Math.min(800, Math.max(200, parsed.height)) : null

    if (width || height) {
      const inst = store.instances[microappId]
      if (inst) {
        updates.size = {
          width: width || inst.size.width,
          height: height || inst.size.height
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      store.updateInstance(microappId, updates)
      log.info('generation', 'Metadata applied to instance', JSON.stringify(updates).slice(0, 200))
    }

    // Resize the canvas node to match
    if (width || height) {
      const boardStore = useBoardStore.getState()
      const node = boardStore.nodes.find((n) => n.id === microappId)
      if (node) {
        const w = width || (node.style?.width as number) || 360
        const h = height || (node.style?.height as number) || 320
        useBoardStore.setState({
          nodes: boardStore.nodes.map((n) =>
            n.id === microappId ? { ...n, style: { ...n.style, width: w, height: h } } : n
          )
        })
        log.info('generation', 'Node resized', `${w}x${h}`)
      } else {
        log.warning('generation', 'Node not found for resize', microappId)
      }
    }
  } catch (err) {
    log.error('generation', 'Metadata fetch error', err instanceof Error ? err.message : String(err))
  }
}

function validateCode(code: string): { valid: boolean; error: string | null } {
  const compileResult = compileMicroapp(code)
  if (!compileResult.success) {
    return { valid: false, error: `Compilation error: ${compileResult.error}` }
  }
  try {
    createMicroappFactory(compileResult.compiled!)
  } catch (err) {
    return { valid: false, error: `Runtime error: ${err instanceof Error ? err.message : String(err)}` }
  }
  return { valid: true, error: null }
}

const STREAM_TIMEOUT = 120_000 // 2 minutes

function streamGenerate(prompt: string, systemPrompt: string, microappId: string): Promise<string> {
  const store = useMicroappStore.getState()

  return new Promise((resolve, reject) => {
    const cleanupFns: (() => void)[] = []
    let settled = false
    const cleanup = () => {
      cleanupFns.forEach((fn) => fn())
      if (timer) clearTimeout(timer)
    }
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      fn()
    }

    const timer = setTimeout(() => {
      settle(() => {
        log.error('generation', 'Stream timed out', `microapp: ${microappId}`)
        reject(new Error('Generation timed out after 2 minutes'))
      })
    }, STREAM_TIMEOUT)

    cleanupFns.push(
      ipc.ollama.onStream((chunk) => {
        const inst = useMicroappStore.getState().instances[microappId]
        if (inst) {
          store.updateInstance(microappId, {
            streamingText: (inst.streamingText || '') + chunk
          })
        }
      })
    )

    cleanupFns.push(
      ipc.ollama.onStreamDone((fullText) => {
        settle(() => {
          log.info('generation', 'Stream completed', `${fullText.length} chars`)
          resolve(fullText)
        })
      })
    )

    cleanupFns.push(
      ipc.ollama.onStreamError((error) => {
        settle(() => {
          log.error('generation', 'Stream error', error)
          reject(new Error(error))
        })
      })
    )

    log.info('generation', 'Starting stream', `microapp: ${microappId}`)
    ipc.ollama.generate(prompt, systemPrompt).catch((err) => {
      settle(() => {
        log.error('generation', 'Generate invoke failed', err.message)
        reject(err)
      })
    })
  })
}

function buildDataSourceDescription(dataSourceIds?: string[]): string | undefined {
  if (!dataSourceIds || dataSourceIds.length === 0) return undefined

  const dataStore = useDataStore.getState()
  const descriptions = dataSourceIds.map((id) => {
    const source = dataStore.sources[id]
    if (!source) return null

    const cols = source.columns.map((c) => `${c.name}(${c.type})`).join(', ')
    const rows = dataStore.getCachedData(id)
    const sample = rows.slice(0, 3)
    const sampleStr = sample.length > 0
      ? `\nSample rows: ${JSON.stringify(sample)}`
      : ''

    const firstCol = source.columns[0]?.name || 'col'
    return `Source ID: "${id}" — ${source.name} (${source.type}, ${source.rowCount} rows)\nColumns: ${cols}${sampleStr}\nAccess: const { rows, columns } = useData('${id}')\nRows are objects keyed by column name — access as row.${firstCol} or row["${firstCol}"]. columns is { name, type }[] — use c.name to get the column name string.`
  }).filter(Boolean)

  return descriptions.length > 0 ? descriptions.join('\n\n') : undefined
}

export async function generateMicroapp(microappId: string, prompt: string, dataSourceIds?: string[]): Promise<void> {
  const store = useMicroappStore.getState()
  const dataDescription = buildDataSourceDescription(dataSourceIds)
  const systemPrompt = buildPrompt(prompt, dataDescription)

  log.info('generation', `Starting generation for "${prompt.slice(0, 50)}"`, `microapp: ${microappId}`)
  store.updateInstance(microappId, { status: 'generating', streamingText: '', error: null })

  // Fire metadata call in parallel — don't block code generation
  fetchMetadata(prompt, microappId)

  try {
    let raw = await streamGenerate(prompt, systemPrompt, microappId)
    let cleaned = cleanAIResponse(raw)
    log.info('generation', 'Code cleaned', `${cleaned.length} chars after cleanup`)

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const validation = validateCode(cleaned)
      if (validation.valid) {
        log.success('generation', 'Microapp ready', `attempt ${attempt + 1}`)
        store.updateInstance(microappId, {
          source: cleaned,
          status: 'ready',
          streamingText: '',
          error: null
        })
        return
      }

      log.warning('generation', `Validation failed (attempt ${attempt + 1}/${MAX_RETRIES})`, validation.error || undefined)

      // Last retry exhausted — place broken code so user can edit
      if (attempt === MAX_RETRIES - 1) {
        log.error('generation', 'Max retries exhausted', validation.error || undefined)
        store.updateInstance(microappId, {
          source: cleaned,
          status: 'error',
          streamingText: '',
          error: validation.error
        })
        return
      }

      // Retry with error feedback
      store.updateInstance(microappId, {
        status: 'retrying',
        streamingText: '',
        error: `Auto-fixing: ${validation.error}`
      })

      const retryPrompt = buildRetryPrompt(cleaned, validation.error!)
      raw = await streamGenerate(retryPrompt, systemPrompt, microappId)
      cleaned = cleanAIResponse(raw)
    }

    // If loop completes without returning (no retries needed), code was valid on first try
    log.success('generation', 'Microapp ready (first try)')
    store.updateInstance(microappId, {
      source: cleaned,
      status: 'ready',
      streamingText: '',
      error: null
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Generation failed'
    log.error('generation', 'Generation failed', msg)
    store.updateInstance(microappId, {
      status: 'error',
      streamingText: '',
      error: msg
    })
  }
}
