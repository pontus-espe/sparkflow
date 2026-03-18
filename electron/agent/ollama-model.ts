/**
 * Custom Strands model provider for Ollama's native /api/chat endpoint.
 * Uses native tool calling format instead of the OpenAI-compatible layer,
 * which is more reliable for models like qwen2.5, llama3.1, etc.
 */
import { Model, type BaseModelConfig, type StreamOptions } from '@strands-agents/sdk'
import type { Message } from '@strands-agents/sdk'
import type { ModelStreamEvent } from '@strands-agents/sdk'

const OLLAMA_BASE = 'http://127.0.0.1:11434'

export interface OllamaModelConfig extends BaseModelConfig {
  numCtx?: number
}

export class OllamaModel extends Model<OllamaModelConfig> {
  private _config: OllamaModelConfig

  constructor(config: OllamaModelConfig) {
    super()
    this._config = config
  }

  updateConfig(config: OllamaModelConfig): void {
    this._config = { ...this._config, ...config }
  }

  getConfig(): OllamaModelConfig {
    return this._config
  }

  /** Convert Strands messages to Ollama /api/chat format */
  private formatMessages(messages: Message[], systemPrompt?: string): OllamaChatMessage[] {
    const result: OllamaChatMessage[] = []

    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt })
    }

    for (const msg of messages) {
      if (msg.role === 'user') {
        const text = (msg.content as unknown[])
          .filter((b): b is { text: string } => b != null && typeof b === 'object' && 'text' in b)
          .map((b) => b.text)
          .join('')
        if (text) result.push({ role: 'user', content: text })
      } else if (msg.role === 'assistant') {
        const text = (msg.content as unknown[])
          .filter((b): b is { text: string } => b != null && typeof b === 'object' && 'text' in b)
          .map((b) => b.text)
          .join('')

        const toolCalls = (msg.content as unknown[])
          .filter((b): b is { type: 'toolUseBlock'; name: string; toolUseId: string; input: unknown } =>
            b != null && typeof b === 'object' && 'type' in b && (b as { type: string }).type === 'toolUseBlock'
          )
          .map((b) => ({
            function: {
              name: b.name,
              arguments: b.input as Record<string, unknown>
            }
          }))

        result.push({
          role: 'assistant',
          content: text || '',
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
        })
      } else if (msg.role === 'tool') {
        // Tool results
        for (const block of msg.content as unknown[]) {
          if (block != null && typeof block === 'object' && 'type' in block && (block as { type: string }).type === 'toolResultBlock') {
            const resultBlock = block as unknown as { content: Array<{ text?: string }> }
            const text = resultBlock.content
              ?.map((c) => c.text || '')
              .join('') || ''
            result.push({ role: 'tool', content: text })
          }
        }
      }
    }

    return result
  }

  /** Convert Strands ToolSpec[] to Ollama tools format */
  private formatTools(toolSpecs?: StreamOptions['toolSpecs']): OllamaTool[] | undefined {
    if (!toolSpecs || toolSpecs.length === 0) return undefined

    return toolSpecs.map((spec) => ({
      type: 'function' as const,
      function: {
        name: spec.name,
        description: spec.description,
        parameters: spec.inputSchema || { type: 'object', properties: {} }
      }
    }))
  }

  async *stream(messages: Message[], options?: StreamOptions): AsyncIterable<ModelStreamEvent> {
    const ollamaMessages = this.formatMessages(
      messages,
      typeof options?.systemPrompt === 'string' ? options.systemPrompt : undefined
    )
    const tools = this.formatTools(options?.toolSpecs)

    const body: Record<string, unknown> = {
      model: this._config.modelId,
      messages: ollamaMessages,
      stream: true,
      options: {
        num_ctx: this._config.numCtx || 16384,
        ...(this._config.temperature != null ? { temperature: this._config.temperature } : {})
      }
    }

    if (tools && tools.length > 0) {
      body.tools = tools
    }

    const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`)
    }

    // Emit message start
    yield { type: 'modelMessageStartEvent', role: 'assistant' } as ModelStreamEvent

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let hasToolCalls = false
    let blockStarted = false
    let toolBlockIndex = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue

          let chunk: OllamaStreamChunk
          try {
            chunk = JSON.parse(line)
          } catch {
            continue
          }

          const msg = chunk.message

          // Text content
          if (msg?.content) {
            if (!blockStarted) {
              yield { type: 'modelContentBlockStartEvent' } as ModelStreamEvent
              blockStarted = true
            }
            yield {
              type: 'modelContentBlockDeltaEvent',
              delta: { type: 'textDelta', text: msg.content }
            } as ModelStreamEvent
          }

          // Tool calls
          if (msg?.tool_calls && msg.tool_calls.length > 0) {
            // Close text block if open
            if (blockStarted) {
              yield { type: 'modelContentBlockStopEvent' } as ModelStreamEvent
              blockStarted = false
            }

            hasToolCalls = true

            for (const tc of msg.tool_calls) {
              const toolUseId = `ollama_tc_${toolBlockIndex++}`

              // Emit tool use start
              yield {
                type: 'modelContentBlockStartEvent',
                start: {
                  type: 'toolUseStart',
                  toolUseId,
                  name: tc.function.name
                }
              } as ModelStreamEvent

              // Emit tool input as a single delta
              yield {
                type: 'modelContentBlockDeltaEvent',
                delta: {
                  type: 'toolUseInputDelta',
                  input: JSON.stringify(tc.function.arguments || {})
                }
              } as ModelStreamEvent

              // Close tool block
              yield { type: 'modelContentBlockStopEvent' } as ModelStreamEvent
            }
          }

          // Done
          if (chunk.done) {
            if (blockStarted) {
              yield { type: 'modelContentBlockStopEvent' } as ModelStreamEvent
            }
            yield {
              type: 'modelMessageStopEvent',
              stopReason: hasToolCalls ? 'toolUse' : 'endTurn'
            } as ModelStreamEvent
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}

// --- Ollama API types ---

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{
    function: {
      name: string
      arguments: Record<string, unknown>
    }
  }>
}

interface OllamaTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: unknown
  }
}

interface OllamaStreamChunk {
  model: string
  created_at: string
  message?: {
    role: string
    content?: string
    tool_calls?: Array<{
      function: {
        name: string
        arguments: Record<string, unknown>
      }
    }>
  }
  done: boolean
  done_reason?: string
}
