import { ipc } from './ipc-client'
import { useAIStore } from '@/stores/ai-store'

export async function checkOllamaStatus(): Promise<void> {
  const store = useAIStore.getState()
  const currentStatus = store.status

  // Don't override active download/pull phases or hardware prompt (managed by startup-status events)
  if (currentStatus === 'downloading-ollama' || currentStatus === 'pulling-model' || currentStatus === 'hardware-insufficient') return

  // If using Anthropic and already ready, skip polling
  if (store.provider === 'anthropic' && currentStatus === 'ready') return

  try {
    const result = await ipc.ollama.status()
    if (result.provider === 'anthropic') {
      store.setProvider('anthropic')
    }
    if (result.status === 'ready') {
      store.setStatus('ready')
      store.setModel(result.model)
      if (result.models) store.setModels(result.models)
    } else if (result.status === 'downloading') {
      store.setStatus('pulling-model')
      store.setModel(result.model)
    } else if (result.status === 'not-running') {
      store.setStatus('starting')
    }
    // Don't set error from polling — transient failures are normal during startup
  } catch {
    // Ignore polling failures
  }
}

export async function generateWithAI(
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const store = useAIStore.getState()
  store.resetStreaming()
  store.setIsGenerating(true)

  return new Promise((resolve, reject) => {
    const cleanupFns: (() => void)[] = []

    const cleanup = () => {
      cleanupFns.forEach((fn) => fn())
      store.setIsGenerating(false)
    }

    cleanupFns.push(
      ipc.ollama.onStream((chunk) => {
        store.appendStreamingText(chunk)
      })
    )

    cleanupFns.push(
      ipc.ollama.onStreamDone((fullText) => {
        cleanup()
        resolve(fullText)
      })
    )

    cleanupFns.push(
      ipc.ollama.onStreamError((error) => {
        cleanup()
        store.setError(error)
        reject(new Error(error))
      })
    )

    ipc.ollama.generate(prompt, systemPrompt).catch((err) => {
      cleanup()
      reject(err)
    })
  })
}

export function startStatusPolling(intervalMs = 5000): () => void {
  checkOllamaStatus()
  const timer = setInterval(checkOllamaStatus, intervalMs)
  return () => clearInterval(timer)
}
