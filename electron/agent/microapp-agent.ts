/**
 * Microapp Agent — specialist sub-agent that generates and edits
 * React microapp code. Invoked as a tool by the main chat agent.
 */
import { Agent, tool } from '@strands-agents/sdk'
import { z } from 'zod'
import { BrowserWindow } from 'electron'
import { createModel } from './model'
import { getMicroapps, getDataSources } from '../data/database'
import { parseFile } from '../data/file-parser'
import { existsSync } from 'fs'

// Import the system prompt and cleanup from the renderer's prompt templates
// We duplicate the essentials here to avoid cross-process import issues
import { MICROAPP_SYSTEM_PROMPT, RETRY_PROMPT, cleanAIResponse, buildPrompt } from './microapp-prompts'

function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  }
}

/** Build data source context string for a board */
async function buildDataContext(boardId: string, sourceIds?: string[]): Promise<string | undefined> {
  const allSources = await getDataSources(boardId)
  const sources = sourceIds
    ? allSources.filter((s) => sourceIds.includes(s.id as string))
    : allSources

  if (sources.length === 0) return undefined

  const descriptions = sources.map((s) => {
    const cols = JSON.parse((s.columns_def as string) || '[]') as { name: string; type: string }[]
    const colStr = cols.map((c) => `${c.name}(${c.type})`).join(', ')

    let sampleRows: Record<string, unknown>[] = []
    try {
      const filePath = s.file_path as string | null
      if (filePath && existsSync(filePath)) {
        const parsed = parseFile(filePath)
        const match = parsed.find((p) => p.name === s.name) || parsed[0]
        if (match) sampleRows = match.rows.slice(0, 3)
      } else {
        sampleRows = JSON.parse((s.data as string) || '[]').slice(0, 3)
      }
    } catch { /* ignore */ }

    const sampleStr = sampleRows.length > 0 ? `\nSample rows: ${JSON.stringify(sampleRows)}` : ''
    const firstCol = cols[0]?.name || 'col'

    return `Source ID: "${s.id}" — ${s.name} (${s.type}, ${s.row_count} rows)\nColumns: ${colStr}${sampleStr}\nAccess: const { rows, columns } = useData('${s.id}')\nRows are objects keyed by column name — access as row.${firstCol} or row["${firstCol}"].`
  })

  return descriptions.join('\n\n')
}

/** Extract text from an agent result */
function extractText(result: unknown): string {
  const r = result as { lastMessage?: { content?: unknown[] } }
  if (!r.lastMessage?.content) return ''
  return r.lastMessage.content
    .filter((b): b is { text: string } => b != null && typeof b === 'object' && 'text' in b && typeof (b as { text: unknown }).text === 'string')
    .map((b) => b.text)
    .join('')
}

// ---- Tools exposed to the main agent ----

export const createMicroapp = tool({
  name: 'create_microapp',
  description: 'Create a new microapp on the current board. Use this when the user asks you to build, create, or make a new app/widget/dashboard/tool. Provide a clear description of what the microapp should do. Place it at a position that avoids overlapping existing microapps — check the context for existing positions and sizes.',
  inputSchema: z.object({
    prompt: z.string().describe('Description of the microapp to create'),
    boardId: z.string().describe('The board ID to create the microapp on'),
    positionX: z.number().optional().describe('X position on canvas (check existing app positions to avoid overlap)'),
    positionY: z.number().optional().describe('Y position on canvas (check existing app positions to avoid overlap)'),
    dataSourceIds: z.array(z.string()).optional().describe('Optional data source IDs to connect')
  }),
  callback: async ({ prompt, boardId, positionX, positionY, dataSourceIds }) => {
    try {
      const dataContext = await buildDataContext(boardId, dataSourceIds)
      const systemPrompt = buildPrompt(prompt, dataContext)

      let userPrompt = prompt
      if (dataContext) {
        userPrompt = `${prompt}\n\nThe user has attached data source(s). You MUST use useData() to read the data.\n\n${dataContext}`
      }

      // Generate code with the microapp agent
      const codeAgent = new Agent({
        model: createModel(),
        systemPrompt,
        printer: false
      })

      const codeResult = await codeAgent.invoke(userPrompt)
      let code = cleanAIResponse(extractText(codeResult))

      if (!code) {
        return JSON.stringify({ error: 'No code generated' })
      }

      // Generate metadata in parallel-ish (name, icon, color, size)
      const metaAgent = new Agent({
        model: createModel(),
        systemPrompt: METADATA_SYSTEM_PROMPT,
        printer: false
      })

      let metadata = { name: 'New App', icon: 'sparkles', color: 'default', width: 400, height: 360 }
      try {
        const metaResult = await metaAgent.invoke(prompt)
        const metaText = extractText(metaResult)
        const jsonMatch = metaText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          if (parsed.name) metadata.name = parsed.name
          if (parsed.icon) metadata.icon = parsed.icon
          if (parsed.color) metadata.color = parsed.color
          if (parsed.width) metadata.width = Math.min(800, Math.max(280, parsed.width))
          if (parsed.height) metadata.height = Math.min(800, Math.max(200, parsed.height))
        }
      } catch { /* metadata is best-effort */ }

      // Broadcast to renderer to create the node
      broadcast('agent:create-microapp', {
        boardId,
        prompt,
        code,
        metadata,
        position: positionX != null && positionY != null ? { x: positionX, y: positionY } : null,
        dataSourceIds: dataSourceIds || []
      })

      return JSON.stringify({
        success: true,
        name: metadata.name,
        message: `Created "${metadata.name}" microapp on the board.`
      })
    } catch (err) {
      return JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to create microapp' })
    }
  }
})

export const editMicroapp = tool({
  name: 'edit_microapp',
  description: 'Edit or improve an existing microapp. Use this when the user asks to change, fix, update, or improve a microapp that already exists on the board.',
  inputSchema: z.object({
    microappId: z.string().describe('The microapp ID to edit'),
    instruction: z.string().describe('What to change or improve'),
    boardId: z.string().describe('The board ID the microapp is on')
  }),
  callback: async ({ microappId, instruction, boardId }) => {
    try {
      // Get the current microapp source from the database
      const apps = await getMicroapps(boardId)
      const app = apps.find((a) => a.id === microappId)
      if (!app || !app.source) {
        return JSON.stringify({ error: 'Microapp not found or has no source code' })
      }

      const dataContext = await buildDataContext(boardId)
      const systemPrompt = buildPrompt(instruction, dataContext)

      const editPrompt = `Here is the current code of the microapp "${app.name}":\n\`\`\`\n${app.source}\n\`\`\`\n\nThe user wants to make the following change:\n${instruction}\n\nReturn the COMPLETE updated function body. Not a diff — the full code.`

      const codeAgent = new Agent({
        model: createModel(),
        systemPrompt,
        printer: false
      })

      const codeResult = await codeAgent.invoke(editPrompt)
      const code = cleanAIResponse(extractText(codeResult))

      if (!code) {
        return JSON.stringify({ error: 'No code generated' })
      }

      // Broadcast to renderer to update the microapp
      broadcast('agent:update-microapp', {
        microappId,
        code
      })

      return JSON.stringify({
        success: true,
        message: `Updated "${app.name}" microapp.`
      })
    } catch (err) {
      return JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to edit microapp' })
    }
  }
})

const METADATA_SYSTEM_PROMPT = `You decide the name, visual appearance, and size for a microapp on a canvas. Given a user's description of the app, return ONLY a single JSON object with these fields:
- name: short, descriptive app name (2-4 words)
- icon: one of: sparkles, table, chart, list, calendar, mail, users, dollar, heart, star, clock, map, image, music, code, search, settings, shield, zap, briefcase
- color: one of: default, blue, green, purple, orange, red, pink, yellow
- width: pixel width (280-800)
- height: pixel height (200-800)

Return ONLY valid JSON. Example: {"name":"Revenue Dashboard","icon":"chart","color":"blue","width":480,"height":400}`

export const microappTools = [createMicroapp, editMicroapp]
