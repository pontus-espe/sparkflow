export const IPC = {
  // Ollama
  OLLAMA_STATUS: 'ollama:status',
  OLLAMA_GENERATE: 'ollama:generate',
  OLLAMA_GENERATE_STREAM: 'ollama:generate:stream',
  OLLAMA_GENERATE_DONE: 'ollama:generate:done',
  OLLAMA_GENERATE_ERROR: 'ollama:generate:error',
  OLLAMA_PULL_MODEL: 'ollama:pull-model',
  OLLAMA_PULL_PROGRESS: 'ollama:pull-progress',

  // Data
  DATA_IMPORT_FILE: 'data:import-file',
  DATA_IMPORT_FILE_PATH: 'data:import-file-path',
  DATA_SOURCE_UPDATED: 'data:source-updated',
  DATA_QUERY_SOURCE: 'data:query-source',
  DATA_SAVE_MANUAL_TABLE: 'data:save-manual-table',
  DATA_GET_SOURCES: 'data:get-sources',
  DATA_DELETE_SOURCE: 'data:delete-source',

  // Board persistence
  BOARD_SAVE: 'board:save',
  BOARD_LOAD: 'board:load',
  BOARD_LIST: 'board:list',
  BOARD_CREATE: 'board:create',
  BOARD_DELETE: 'board:delete',
} as const
