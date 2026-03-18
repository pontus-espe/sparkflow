import { registerOllamaHandlers } from './ollama-handlers'
import { registerDataHandlers, registerFileHandlers, registerBoardHandlers } from './data-handlers'
import { registerAgentHandlers } from './agent-handlers'

export function registerIpcHandlers(): void {
  registerOllamaHandlers()
  registerDataHandlers()
  registerFileHandlers()
  registerBoardHandlers()
  registerAgentHandlers()
}
