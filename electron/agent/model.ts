/**
 * Model provider factory — returns the right Strands model
 * based on the current AI provider setting (local Ollama or Anthropic).
 */
import { type Model } from '@strands-agents/sdk'
import { AnthropicModel } from '@strands-agents/sdk/anthropic'
import { OllamaModel } from './ollama-model'
import {
  getProvider,
  getActiveModel,
  getAnthropicApiKey,
  getAnthropicModel,
  getRecommendedNumCtx
} from '../ollama/manager'

/**
 * Create a Strands model matching the user's current provider config.
 * Called fresh each chat invocation so provider switches take effect immediately.
 */
export function createModel(): Model {
  const provider = getProvider()

  if (provider === 'anthropic') {
    const apiKey = getAnthropicApiKey()
    if (!apiKey) throw new Error('No Anthropic API key configured')

    return new AnthropicModel({
      apiKey,
      modelId: getAnthropicModel(),
      maxTokens: 4096
    })
  }

  // Local Ollama — use native /api/chat endpoint for proper tool calling
  const model = getActiveModel()
  if (!model) throw new Error('No local model available')

  return new OllamaModel({
    modelId: model,
    maxTokens: 4096,
    numCtx: getRecommendedNumCtx()
  })
}
