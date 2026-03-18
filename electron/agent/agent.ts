/**
 * SparkFlow AI Agent — conversational assistant with access to
 * the user's boards, data sources, and microapps.
 */
import { Agent } from '@strands-agents/sdk'
import { hostname, userInfo, platform } from 'os'
import { createModel } from './model'
import { allTools } from './tools'
import { getDataSources, getMicroapps, loadBoard, listBoards } from '../data/database'
import { parseFile } from '../data/file-parser'
import { existsSync } from 'fs'

function buildSystemPrompt(context: string): string {
  return `You are a helpful AI assistant embedded in SparkFlow — a canvas-based microapp builder.

Key facts about SparkFlow:
- Users create "boards" — infinite canvases where they place AI-generated microapps
- Microapps are small React components generated from natural language prompts
- Data sources are CSV/Excel files that microapps can read and visualise
- The app supports both local AI (Ollama) and Anthropic Claude models

## Current Context
${context}

## Guidelines
- Be concise and direct — this is a chat sidebar, not a document
- You already have context about the user's current board, data, and microapps above — use it to answer questions directly without making tool calls
- Only use tools when you need MORE detail than what's in the context (e.g. querying actual row data, or looking at a different board)
- When discussing data, reference specific column names and values from the context
- Do NOT call get_board_context, get_data_sources, get_microapps, list_boards, or get_system_context unless the user is asking about something not already covered above`
}

/** Gather context snapshot for the system prompt */
async function gatherContext(boardId?: string): Promise<string> {
  const parts: string[] = []

  // User & system
  try {
    const user = userInfo()
    parts.push(`User: ${user.username} on ${hostname()} (${platform()})`)
    parts.push(`Time: ${new Date().toISOString()}`)
  } catch { /* ignore */ }

  // All boards
  try {
    const boards = await listBoards()
    if (boards.length > 0) {
      parts.push(`\nBoards (${boards.length}):`)
      for (const b of boards) {
        const marker = (b.id as string) === boardId ? ' ← current' : ''
        parts.push(`  - "${b.name}" (id: ${b.id})${marker}`)
      }
    }
  } catch { /* ignore */ }

  // Current board details
  if (boardId) {
    try {
      const board = await loadBoard(boardId)
      if (board) {
        parts.push(`\nCurrent board: "${board.name}"`)

        // Data sources
        const sources = await getDataSources(boardId)
        if (sources.length > 0) {
          parts.push(`\nData sources (${sources.length}):`)
          for (const s of sources) {
            const cols = JSON.parse((s.columns_def as string) || '[]') as { name: string; type: string }[]
            const colStr = cols.map((c) => `${c.name}(${c.type})`).join(', ')
            parts.push(`  - "${s.name}" [${s.type}] — ${s.row_count} rows — columns: ${colStr}`)
            if (s.file_path) parts.push(`    file: ${s.file_path}`)

            // Include a few sample rows so the agent can answer data questions
            try {
              const filePath = s.file_path as string | null
              let sampleRows: Record<string, unknown>[] = []
              if (filePath && existsSync(filePath)) {
                const parsed = parseFile(filePath)
                const match = parsed.find((p) => p.name === s.name) || parsed[0]
                if (match) sampleRows = match.rows.slice(0, 5)
              } else {
                const data = JSON.parse((s.data as string) || '[]')
                sampleRows = data.slice(0, 5)
              }
              if (sampleRows.length > 0) {
                parts.push(`    sample: ${JSON.stringify(sampleRows)}`)
              }
            } catch { /* ignore */ }
          }
        } else {
          parts.push('\nNo data sources on this board.')
        }

        // Microapps with canvas positions
        const apps = await getMicroapps(boardId)
        let canvasNodes: Array<{ id: string; position: { x: number; y: number }; style?: { width?: number; height?: number } }> = []
        try {
          const canvasState = JSON.parse((board.canvas_state as string) || '{}')
          canvasNodes = canvasState.nodes || []
        } catch { /* ignore */ }

        if (apps.length > 0) {
          parts.push(`\nMicroapps (${apps.length}):`)
          for (const m of apps) {
            const node = canvasNodes.find((n) => n.id === m.id)
            const pos = node ? `pos(${Math.round(node.position.x)},${Math.round(node.position.y)})` : ''
            const size = node?.style ? `size(${node.style.width || 360}x${node.style.height || 320})` : ''
            parts.push(`  - id:"${m.id}" "${m.name}" ${pos} ${size} (prompt: "${m.prompt}")`)
          }
        } else {
          parts.push('\nNo microapps on this board.')
        }
      }
    } catch { /* ignore */ }
  }

  return parts.join('\n')
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool' | 'reasoning'
  content: string
  toolName?: string
}

let currentAgent: Agent | null = null
let currentBoardId: string | undefined = undefined
let conversationHistory: ChatMessage[] = []

/** Start a new conversation — clears agent and history */
export function newSession(): void {
  currentAgent = null
  currentBoardId = undefined
  conversationHistory = []
}

export interface StreamCallbacks {
  onChunk?: (text: string) => void
  onToolStart?: (toolName: string, input: string) => void
  onToolEnd?: (toolName: string, result: string) => void
  onReasoning?: (text: string) => void
}

/** Send a message and stream the response */
export async function chat(
  userMessage: string,
  boardId?: string,
  callbacks?: StreamCallbacks
): Promise<string> {
  // Recreate agent if board changed (context is stale)
  if (boardId !== currentBoardId) {
    currentAgent = null
    currentBoardId = boardId
  }

  if (!currentAgent) {
    const context = await gatherContext(boardId)
    currentAgent = new Agent({
      model: createModel(),
      tools: allTools,
      systemPrompt: buildSystemPrompt(context)
    })
  }

  conversationHistory.push({ role: 'user', content: userMessage })

  let fullText = ''

  try {
    const stream = currentAgent.stream(userMessage)
    for await (const event of stream) {
      if (event.type === 'modelStreamUpdateEvent') {
        const inner = (event as { type: string; event: { type: string; delta?: { type: string; text?: string } } }).event

        if (inner.type === 'modelContentBlockDeltaEvent' && inner.delta) {
          if (inner.delta.type === 'textDelta' && inner.delta.text) {
            fullText += inner.delta.text
            callbacks?.onChunk?.(inner.delta.text)
          } else if (inner.delta.type === 'reasoningContentDelta' && inner.delta.text) {
            callbacks?.onReasoning?.(inner.delta.text)
          }
        }
      } else if (event.type === 'beforeToolCallEvent') {
        const toolEvent = event as { type: string; toolUse: { name: string; input: unknown } }
        const name = toolEvent.toolUse?.name || 'unknown'
        const input = toolEvent.toolUse?.input ? JSON.stringify(toolEvent.toolUse.input) : '{}'
        callbacks?.onToolStart?.(name, input)
      } else if (event.type === 'afterToolCallEvent') {
        const toolEvent = event as { type: string; toolUse: { name: string }; result: { content: Array<{ text?: string }> } }
        const name = toolEvent.toolUse?.name || 'unknown'
        const resultText = toolEvent.result?.content
          ?.map((c: { text?: string }) => c.text || '')
          .join('')
          .slice(0, 500) || ''
        callbacks?.onToolEnd?.(name, resultText)
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Agent error: ${msg}`)
  }

  conversationHistory.push({ role: 'assistant', content: fullText })
  return fullText
}

export function getConversationHistory(): ChatMessage[] {
  return [...conversationHistory]
}
