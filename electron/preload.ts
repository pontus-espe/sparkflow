import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  // Ollama
  ollamaStatus: () => ipcRenderer.invoke('ollama:status'),
  ollamaGenerate: (prompt: string, system?: string) =>
    ipcRenderer.invoke('ollama:generate', prompt, system),
  onOllamaStream: (callback: (chunk: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: string) => callback(chunk)
    ipcRenderer.on('ollama:generate:stream', handler)
    return () => ipcRenderer.removeListener('ollama:generate:stream', handler)
  },
  onOllamaStreamDone: (callback: (fullText: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, text: string) => callback(text)
    ipcRenderer.on('ollama:generate:done', handler)
    return () => ipcRenderer.removeListener('ollama:generate:done', handler)
  },
  onOllamaStreamError: (callback: (error: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, error: string) => callback(error)
    ipcRenderer.on('ollama:generate:error', handler)
    return () => ipcRenderer.removeListener('ollama:generate:error', handler)
  },
  ollamaGenerateQuick: (prompt: string, system?: string) =>
    ipcRenderer.invoke('ollama:generate-quick', prompt, system),
  ollamaSetModel: (model: string) => ipcRenderer.invoke('ollama:set-model', model),
  ollamaListModels: () => ipcRenderer.invoke('ollama:list-models'),
  ollamaPullModel: (model: string) => ipcRenderer.invoke('ollama:pull-model', model),
  onOllamaPullStatus: (callback: (status: { model: string; status: string; completed?: number; total?: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: { model: string; status: string; completed?: number; total?: number }) => callback(status)
    ipcRenderer.on('ollama:pull-status', handler)
    return () => ipcRenderer.removeListener('ollama:pull-status', handler)
  },
  onOllamaPullProgress: (callback: (progress: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: number) => callback(progress)
    ipcRenderer.on('ollama:pull-progress', handler)
    return () => ipcRenderer.removeListener('ollama:pull-progress', handler)
  },
  onOllamaStartupStatus: (callback: (status: { phase: string; message: string; progress?: number; model?: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: { phase: string; message: string; progress?: number; model?: string }) => callback(status)
    ipcRenderer.on('ollama:startup-status', handler)
    return () => ipcRenderer.removeListener('ollama:startup-status', handler)
  },

  // AI provider config
  aiGetConfig: () => ipcRenderer.invoke('ai:get-config'),
  aiSetConfig: (config: { provider?: string; anthropicApiKey?: string | null; anthropicModel?: string }) =>
    ipcRenderer.invoke('ai:set-config', config),
  aiValidateKey: (apiKey: string) => ipcRenderer.invoke('ai:validate-key', apiKey),
  aiRetrySetup: () => ipcRenderer.invoke('ai:retry-setup'),

  // Data
  dataImportFile: (boardId: string) => ipcRenderer.invoke('data:import-file', boardId),
  dataImportFilePath: (path: string, boardId: string) => ipcRenderer.invoke('data:import-file-path', path, boardId),
  onDataSourceUpdated: (callback: (update: { id: string; name: string; columns: unknown[]; rowCount: number; rows: unknown[] }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, update: { id: string; name: string; columns: unknown[]; rowCount: number; rows: unknown[] }) => callback(update)
    ipcRenderer.on('data:source-updated', handler)
    return () => ipcRenderer.removeListener('data:source-updated', handler)
  },
  dataQuerySource: (sourceId: string, query?: string) =>
    ipcRenderer.invoke('data:query-source', sourceId, query),
  dataSaveManualTable: (data: unknown) =>
    ipcRenderer.invoke('data:save-manual-table', data),
  dataGetSources: (boardId: string) =>
    ipcRenderer.invoke('data:get-sources', boardId),
  dataUpdateRows: (sourceId: string, rows: Record<string, unknown>[]) =>
    ipcRenderer.invoke('data:update-rows', sourceId, rows),
  dataDeleteSource: (sourceId: string) =>
    ipcRenderer.invoke('data:delete-source', sourceId),

  // File operations (dialog-gated for security)
  fileReadDrop: (filePath: string) =>
    ipcRenderer.invoke('file:read-drop', filePath),
  fileReadText: (filters?: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('file:read-text', filters),
  fileReadJSON: () => ipcRenderer.invoke('file:read-json'),
  fileWriteText: (content: string, defaultName?: string) =>
    ipcRenderer.invoke('file:write-text', content, defaultName),
  fileWriteJSON: (data: unknown, defaultName?: string) =>
    ipcRenderer.invoke('file:write-json', data, defaultName),
  fileWriteCSV: (rows: Record<string, unknown>[], defaultName?: string) =>
    ipcRenderer.invoke('file:write-csv', rows, defaultName),
  fileUpdate: (filePath: string, content: string) =>
    ipcRenderer.invoke('file:update', filePath, content),

  // Window controls
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onWindowMaximizeChange: (callback: (maximized: boolean) => void) => {
    // Listen for maximize/unmaximize to update button state
    const onMax = () => callback(true)
    const onUnmax = () => callback(false)
    ipcRenderer.on('window:maximized', onMax)
    ipcRenderer.on('window:unmaximized', onUnmax)
    return () => {
      ipcRenderer.removeListener('window:maximized', onMax)
      ipcRenderer.removeListener('window:unmaximized', onUnmax)
    }
  },

  // File utils
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  // Board
  boardSave: (state: unknown) => ipcRenderer.invoke('board:save', state),
  boardLoad: (id: string) => ipcRenderer.invoke('board:load', id),
  boardList: () => ipcRenderer.invoke('board:list'),
  boardCreate: (name: string) => ipcRenderer.invoke('board:create', name),
  boardDelete: (id: string) => ipcRenderer.invoke('board:delete', id),
  boardReset: () => ipcRenderer.invoke('board:reset'),

  // Agent chat
  agentChat: (message: string, boardId?: string) => ipcRenderer.invoke('agent:chat', message, boardId),
  agentNewSession: () => ipcRenderer.invoke('agent:new-session'),
  agentHistory: () => ipcRenderer.invoke('agent:history'),
  onAgentStream: (callback: (chunk: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: string) => callback(chunk)
    ipcRenderer.on('agent:chat:stream', handler)
    return () => ipcRenderer.removeListener('agent:chat:stream', handler)
  },
  onAgentToolStart: (callback: (data: { name: string; input: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { name: string; input: string }) => callback(data)
    ipcRenderer.on('agent:chat:tool-start', handler)
    return () => ipcRenderer.removeListener('agent:chat:tool-start', handler)
  },
  onAgentToolEnd: (callback: (data: { name: string; result: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { name: string; result: string }) => callback(data)
    ipcRenderer.on('agent:chat:tool-end', handler)
    return () => ipcRenderer.removeListener('agent:chat:tool-end', handler)
  },
  onAgentReasoning: (callback: (text: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, text: string) => callback(text)
    ipcRenderer.on('agent:chat:reasoning', handler)
    return () => ipcRenderer.removeListener('agent:chat:reasoning', handler)
  },
  onAgentNavigateBoard: (callback: (data: { boardId: string; boardName: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { boardId: string; boardName: string }) => callback(data)
    ipcRenderer.on('agent:navigate-board', handler)
    return () => ipcRenderer.removeListener('agent:navigate-board', handler)
  },
  onAgentFocusNode: (callback: (data: { nodeId: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { nodeId: string }) => callback(data)
    ipcRenderer.on('agent:focus-node', handler)
    return () => ipcRenderer.removeListener('agent:focus-node', handler)
  },
  onAgentCreateMicroapp: (callback: (data: {
    boardId: string; prompt: string; code: string;
    metadata: { name: string; icon: string; color: string; width: number; height: number };
    position: { x: number; y: number } | null;
    dataSourceIds: string[]
  }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: Parameters<typeof callback>[0]) => callback(data)
    ipcRenderer.on('agent:create-microapp', handler)
    return () => ipcRenderer.removeListener('agent:create-microapp', handler)
  },
  onAgentUpdateMicroapp: (callback: (data: { microappId: string; code: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { microappId: string; code: string }) => callback(data)
    ipcRenderer.on('agent:update-microapp', handler)
    return () => ipcRenderer.removeListener('agent:update-microapp', handler)
  },

  // Updates
  onUpdateAvailable: (callback: (info: { currentVersion: string; latestVersion: string; url: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { currentVersion: string; latestVersion: string; url: string }) => callback(info)
    ipcRenderer.on('app:update-available', handler)
    return () => ipcRenderer.removeListener('app:update-available', handler)
  },
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url)
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
