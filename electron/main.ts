import { app, BrowserWindow, Menu, shell, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc/handlers'
import { startOllamaWithApp, stopOllamaWithApp } from './ipc/ollama-handlers'
import { startUpdateChecker } from './ipc/update-checker'

// Prevent fetch/network errors from crashing the app with an error dialog
process.on('uncaughtException', (err) => {
  console.error('[Uncaught]', err.message)
  // "terminated" errors come from fetch/undici when connections drop — not fatal
  if (err.message === 'terminated' || err.message === 'aborted') return
  // Other errors: log but don't crash
})
process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason)
})

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: 'SparkFlow',
    frame: false,
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    if (is.dev) mainWindow?.webContents.openDevTools()
  })

  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximized'))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:unmaximized'))

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)

  // Window control handlers
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.on('window:close', () => mainWindow?.close())
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)

  registerIpcHandlers()

  ipcMain.handle('app:open-external', (_event, url: string) => {
    shell.openExternal(url)
  })

  createWindow()
  startUpdateChecker()

  // Start Ollama AFTER the renderer has loaded and can receive events
  // This avoids the race where startup-status broadcasts fire before the listener is registered
  mainWindow?.webContents.on('did-finish-load', () => {
    console.log('[Main] Renderer loaded — starting Ollama setup')
    startOllamaWithApp()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', async () => {
  await stopOllamaWithApp()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
