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
  onMaximizeChange: (cb: (maximized: boolean) => void) => getApi().onWindowMaximizeChange(cb)
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
    onStream: (cb: (chunk: string) => void) => getApi().onOllamaStream(cb),
    onStreamDone: (cb: (text: string) => void) => getApi().onOllamaStreamDone(cb),
    onStreamError: (cb: (error: string) => void) => getApi().onOllamaStreamError(cb),
    setModel: (model: string) => getApi().ollamaSetModel(model),
    listModels: () => getApi().ollamaListModels(),
    pullModel: (model: string) => getApi().ollamaPullModel(model),
    onPullProgress: (cb: (progress: number) => void) => getApi().onOllamaPullProgress(cb),
    onPullStatus: (cb: (status: { model: string; status: string; completed?: number; total?: number }) => void) =>
      getApi().onOllamaPullStatus(cb),
    onStartupStatus: (cb: (status: { phase: string; message: string; progress?: number; model?: string }) => void) =>
      getApi().onOllamaStartupStatus(cb)
  },
  data: {
    importFile: () => getApi().dataImportFile(),
    importFilePath: (path: string) => getApi().dataImportFilePath(path),
    onSourceUpdated: (cb: (update: { id: string; name: string; columns: { name: string; type: string }[]; rowCount: number; rows: unknown[] }) => void) =>
      getApi().onDataSourceUpdated(cb),
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
    delete: (id: string) => getApi().boardDelete(id)
  }
}
