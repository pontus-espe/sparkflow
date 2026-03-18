import { ipcMain, BrowserWindow } from 'electron'
import { chat, newSession, getConversationHistory } from '../agent/agent'

function getWin(): BrowserWindow | null {
  const win = BrowserWindow.getAllWindows()[0]
  return win && !win.isDestroyed() ? win : null
}

export function registerAgentHandlers(): void {
  ipcMain.handle('agent:chat', async (_event, message: string, boardId?: string) => {
    try {
      const fullText = await chat(message, boardId, {
        onChunk: (chunk) => getWin()?.webContents.send('agent:chat:stream', chunk),
        onToolStart: (name, input) => getWin()?.webContents.send('agent:chat:tool-start', { name, input }),
        onToolEnd: (name, result) => getWin()?.webContents.send('agent:chat:tool-end', { name, result }),
        onReasoning: (text) => getWin()?.webContents.send('agent:chat:reasoning', text)
      })
      return { text: fullText }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Chat failed' }
    }
  })

  ipcMain.handle('agent:new-session', async () => {
    newSession()
    return { success: true }
  })

  ipcMain.handle('agent:history', async () => {
    return getConversationHistory()
  })
}
