// Typed wrappers around the preload API

function getApi() {
  return (window as Window & { api: typeof window.api }).api
}

export const getPathForFile = (file: File): string => getApi().getPathForFile(file)

export const windowControls = {
  minimize: () => getApi().windowMinimize(),
  maximize: () => getApi().windowMaximize(),
  close: () => getApi().windowClose(),
  isMaximized: () => getApi().windowIsMaximized() as Promise<boolean>,
  onMaximizeChange: (cb: (maximized: boolean) => void): (() => void) => {
    const cleanup = getApi().onWindowMaximizeChange(cb)
    return () => { cleanup() }
  }
}

export const ipc = {
  ai: {
    getConfig: () => getApi().aiGetConfig() as Promise<{
      provider: 'local' | 'anthropic'
      hasApiKey: boolean
      anthropicModel: string
      hardware: { totalRamGB: number; freeRamGB: number; hasNvidiaGPU: boolean; gpuVramGB: number | null; sufficient: boolean }
    }>,
    setConfig: (config: { provider?: string; anthropicApiKey?: string | null; anthropicModel?: string }) =>
      getApi().aiSetConfig(config) as Promise<{ success: boolean }>,
    validateKey: (apiKey: string) =>
      getApi().aiValidateKey(apiKey) as Promise<{ valid: boolean; error?: string }>,
    retrySetup: () => getApi().aiRetrySetup() as Promise<{ success: boolean }>
  },
  ollama: {
    status: () => getApi().ollamaStatus(),
    generate: (prompt: string, system?: string) => getApi().ollamaGenerate(prompt, system),
    generateQuick: (prompt: string, system?: string) =>
      getApi().ollamaGenerateQuick(prompt, system) as Promise<{ text?: string; error?: string }>,
    onStream: (cb: (chunk: string) => void): (() => void) => { const c = getApi().onOllamaStream(cb); return () => { c() } },
    onStreamDone: (cb: (text: string) => void): (() => void) => { const c = getApi().onOllamaStreamDone(cb); return () => { c() } },
    onStreamError: (cb: (error: string) => void): (() => void) => { const c = getApi().onOllamaStreamError(cb); return () => { c() } },
    setModel: (model: string) => getApi().ollamaSetModel(model),
    listModels: () => getApi().ollamaListModels(),
    pullModel: (model: string) => getApi().ollamaPullModel(model),
    onPullProgress: (cb: (progress: number) => void): (() => void) => { const c = getApi().onOllamaPullProgress(cb); return () => { c() } },
    onPullStatus: (cb: (status: { model: string; status: string; completed?: number; total?: number }) => void): (() => void) => { const c = getApi().onOllamaPullStatus(cb); return () => { c() } },
    onStartupStatus: (cb: (status: { phase: string; message: string; progress?: number; model?: string }) => void): (() => void) => {
      const c = getApi().onOllamaStartupStatus(cb); return () => { c() }
    }
  },
  data: {
    importFile: (boardId: string) => getApi().dataImportFile(boardId),
    importFilePath: (path: string, boardId: string) => getApi().dataImportFilePath(path, boardId),
    onSourceUpdated: (cb: (update: { id: string; name: string; columns: { name: string; type: string }[]; rowCount: number; rows: unknown[] }) => void): (() => void) => {
      const cleanup = getApi().onDataSourceUpdated(cb as (update: { id: string; name: string; columns: unknown[]; rowCount: number; rows: unknown[] }) => void)
      return () => { cleanup() }
    },
    querySource: (sourceId: string, query?: string) => getApi().dataQuerySource(sourceId, query),
    saveManualTable: (data: unknown) => getApi().dataSaveManualTable(data),
    getSources: (boardId: string) => getApi().dataGetSources(boardId),
    updateRows: (sourceId: string, rows: Record<string, unknown>[]) => getApi().dataUpdateRows(sourceId, rows),
    deleteSource: (sourceId: string) => getApi().dataDeleteSource(sourceId)
  },
  file: {
    readDrop: (filePath: string) =>
      getApi().fileReadDrop(filePath) as Promise<
        | { type: 'image'; name: string; path: string; dataUrl: string }
        | { type: 'document'; name: string; path: string; content: string; ext: string }
        | { type: 'file'; name: string; path: string; ext: string }
        | { error: string }
      >,
    readText: (filters?: { name: string; extensions: string[] }[]) =>
      getApi().fileReadText(filters) as Promise<{ path: string; content: string } | { canceled: true } | { error: string }>,
    readJSON: () =>
      getApi().fileReadJSON() as Promise<{ path: string; data: unknown } | { canceled: true } | { error: string }>,
    writeText: (content: string, defaultName?: string) =>
      getApi().fileWriteText(content, defaultName) as Promise<{ path: string } | { canceled: true } | { error: string }>,
    writeJSON: (data: unknown, defaultName?: string) =>
      getApi().fileWriteJSON(data, defaultName) as Promise<{ path: string } | { canceled: true } | { error: string }>,
    writeCSV: (rows: Record<string, unknown>[], defaultName?: string) =>
      getApi().fileWriteCSV(rows, defaultName) as Promise<{ path: string } | { canceled: true } | { error: string }>,
    update: (filePath: string, content: string) =>
      getApi().fileUpdate(filePath, content) as Promise<{ path: string } | { error: string }>
  },
  board: {
    save: (state: unknown) => getApi().boardSave(state),
    load: (id: string) => getApi().boardLoad(id),
    list: () => getApi().boardList(),
    create: (name: string) => getApi().boardCreate(name),
    delete: (id: string) => getApi().boardDelete(id),
    reset: () => getApi().boardReset()
  },
  agent: {
    chat: (message: string, boardId?: string) =>
      getApi().agentChat(message, boardId) as Promise<{ text?: string; error?: string }>,
    newSession: () => getApi().agentNewSession() as Promise<{ success: boolean }>,
    history: () => getApi().agentHistory() as Promise<{ role: string; content: string; toolName?: string }[]>,
    onStream: (cb: (chunk: string) => void): (() => void) => {
      const c = getApi().onAgentStream(cb); return () => { c() }
    },
    onToolStart: (cb: (data: { name: string; input: string }) => void): (() => void) => {
      const c = getApi().onAgentToolStart(cb); return () => { c() }
    },
    onToolEnd: (cb: (data: { name: string; result: string }) => void): (() => void) => {
      const c = getApi().onAgentToolEnd(cb); return () => { c() }
    },
    onReasoning: (cb: (text: string) => void): (() => void) => {
      const c = getApi().onAgentReasoning(cb); return () => { c() }
    },
    onNavigateBoard: (cb: (data: { boardId: string; boardName: string }) => void): (() => void) => {
      const c = getApi().onAgentNavigateBoard(cb); return () => { c() }
    },
    onFocusNode: (cb: (data: { nodeId: string }) => void): (() => void) => {
      const c = getApi().onAgentFocusNode(cb); return () => { c() }
    },
    onCreateMicroapp: (cb: (data: {
      boardId: string; prompt: string; code: string;
      metadata: { name: string; icon: string; color: string; width: number; height: number };
      position: { x: number; y: number } | null;
      dataSourceIds: string[]
    }) => void): (() => void) => {
      const c = getApi().onAgentCreateMicroapp(cb); return () => { c() }
    },
    onUpdateMicroapp: (cb: (data: { microappId: string; code: string }) => void): (() => void) => {
      const c = getApi().onAgentUpdateMicroapp(cb); return () => { c() }
    }
  },
  app: {
    onUpdateAvailable: (cb: (info: { currentVersion: string; latestVersion: string; url: string }) => void): (() => void) => {
      const cleanup = getApi().onUpdateAvailable(cb)
      return () => { cleanup() }
    },
    openExternal: (url: string) => getApi().openExternal(url)
  }
}
