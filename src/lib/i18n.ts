import { useAIStore, type AppLanguage } from '@/stores/ai-store'

const translations: Record<AppLanguage, Record<string, string>> = {
  en: {
    // Board / Navigation
    'board.open': 'Open board',
    'board.search': 'Search boards...',
    'board.noBoards': 'No boards found',
    'board.new': 'New Board',
    'board.untitled': 'Untitled Board',
    'board.resetDev': 'Reset all board data (dev)',
    'board.open.badge': 'open',

    // Canvas
    'canvas.addSticky': 'Add Sticky Note',
    'canvas.aiMicroapp': 'AI Microapp (/)',
    'canvas.importData': 'Import Data Source',
    'canvas.newMicroapp': 'New Microapp',
    'canvas.orPress': 'or press /',

    // Command Palette
    'command.placeholder': 'Describe a microapp...',
    'command.placeholderDisabled': 'AI is not ready yet...',
    'command.hint': 'Press Enter to generate — the app will appear on canvas',

    // Microapp Node
    'microapp.regenerate': 'Regenerate',
    'microapp.delete': 'Delete',
    'microapp.moreOptions': 'More options',
    'microapp.regenerateAI': 'Regenerate with AI',
    'microapp.editCode': 'Edit code',
    'microapp.hideData': 'Hide data source',
    'microapp.showData': 'Show data source',
    'microapp.customize': 'Customize',
    'microapp.generationFailed': 'Generation Failed',
    'microapp.retry': 'Retry',
    'microapp.saveRecompile': 'Save & Recompile',
    'microapp.cancel': 'Cancel',
    'microapp.queued': 'Queued...',
    'microapp.building': 'Building app...',
    'microapp.autoFixing': 'Auto-fixing...',
    'microapp.color': 'Color',
    'microapp.icon': 'Icon',
    'microapp.compilationError': 'Compilation Error',
    'microapp.noComponent': 'No component loaded',

    // Data Source Node
    'data.rows': 'rows',
    'data.cols': 'cols',
    'data.inMemory': 'in-memory',
    'data.moreRows': '{n} more rows',
    'data.moreCols': '+{n} more',
    'data.showLess': 'show less',

    // Model Settings
    'settings.local': 'Local',
    'settings.noModels': 'No models installed',
    'settings.pullModel': 'Pull model...',
    'settings.language': 'Language',
    'settings.anthropic': 'Anthropic',
    'settings.connectKey': 'Connect API key',
    'settings.disconnect': 'Disconnect',

    // AI Status
    'ai.label': 'AI',
    'ai.starting': 'AI is starting...',
    'ai.downloadingRuntime': 'Downloading Ollama runtime...',
    'ai.downloadingModel': 'Downloading AI model...',
    'ai.downloadingModelLong': 'Downloading AI model... This may take a few minutes.',
    'ai.connectionError': 'AI connection error. Is Ollama running?',
    'ai.connecting': 'Connecting to AI...',

    // Theme
    'theme.light': 'Switch to light mode',
    'theme.dark': 'Switch to dark mode',

    // Updates
    'update.available': 'Update to v{version}',
  },

  sv: {
    // Board / Navigation
    'board.open': 'Öppna board',
    'board.search': 'Sök boards...',
    'board.noBoards': 'Inga boards hittades',
    'board.new': 'Ny Board',
    'board.untitled': 'Namnlös Board',
    'board.resetDev': 'Återställ all data (dev)',
    'board.open.badge': 'öppen',

    // Canvas
    'canvas.addSticky': 'Lägg till anteckning',
    'canvas.aiMicroapp': 'AI Microapp (/)',
    'canvas.importData': 'Importera datakälla',
    'canvas.newMicroapp': 'Ny Microapp',
    'canvas.orPress': 'eller tryck /',

    // Command Palette
    'command.placeholder': 'Beskriv en microapp...',
    'command.placeholderDisabled': 'AI är inte redo ännu...',
    'command.hint': 'Tryck Enter för att generera — appen visas på canvasen',

    // Microapp Node
    'microapp.regenerate': 'Generera om',
    'microapp.delete': 'Ta bort',
    'microapp.moreOptions': 'Fler alternativ',
    'microapp.regenerateAI': 'Generera om med AI',
    'microapp.editCode': 'Redigera kod',
    'microapp.hideData': 'Dölj datakälla',
    'microapp.showData': 'Visa datakälla',
    'microapp.customize': 'Anpassa',
    'microapp.generationFailed': 'Generering misslyckades',
    'microapp.retry': 'Försök igen',
    'microapp.saveRecompile': 'Spara & kompilera',
    'microapp.cancel': 'Avbryt',
    'microapp.queued': 'I kö...',
    'microapp.building': 'Bygger app...',
    'microapp.autoFixing': 'Automatisk fix...',
    'microapp.color': 'Färg',
    'microapp.icon': 'Ikon',
    'microapp.compilationError': 'Kompileringsfel',
    'microapp.noComponent': 'Ingen komponent laddad',

    // Data Source Node
    'data.rows': 'rader',
    'data.cols': 'kolumner',
    'data.inMemory': 'i minnet',
    'data.moreRows': '{n} rader till',
    'data.moreCols': '+{n} till',
    'data.showLess': 'visa mindre',

    // Model Settings
    'settings.local': 'Lokal',
    'settings.noModels': 'Inga modeller installerade',
    'settings.pullModel': 'Hämta modell...',
    'settings.language': 'Språk',
    'settings.anthropic': 'Anthropic',
    'settings.connectKey': 'Anslut API-nyckel',
    'settings.disconnect': 'Koppla från',

    // AI Status
    'ai.label': 'AI',
    'ai.starting': 'AI startar...',
    'ai.downloadingRuntime': 'Laddar ner Ollama...',
    'ai.downloadingModel': 'Laddar ner AI-modell...',
    'ai.downloadingModelLong': 'Laddar ner AI-modell... Det kan ta några minuter.',
    'ai.connectionError': 'AI-anslutningsfel. Körs Ollama?',
    'ai.connecting': 'Ansluter till AI...',

    // Theme
    'theme.light': 'Byt till ljust läge',
    'theme.dark': 'Byt till mörkt läge',

    // Updates
    'update.available': 'Uppdatera till v{version}',
  }
}

/** Get a translated string, with optional {key} interpolation */
export function t(key: string, params?: Record<string, string | number>): string {
  const lang = useAIStore.getState().language
  let str = translations[lang]?.[key] ?? translations.en[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(`{${k}}`, String(v))
    }
  }
  return str
}

/** React hook that re-renders when language changes */
export function useTranslation() {
  const language = useAIStore((s) => s.language)
  return {
    t: (key: string, params?: Record<string, string | number>): string => {
      let str = translations[language]?.[key] ?? translations.en[key] ?? key
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          str = str.replace(`{${k}}`, String(v))
        }
      }
      return str
    },
    language
  }
}
