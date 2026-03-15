import { transform } from 'sucrase'

export interface CompileResult {
  success: boolean
  compiled: string | null
  error: string | null
}

export function compileMicroapp(source: string): CompileResult {
  try {
    // Transform JSX/TS to JS using Sucrase
    const result = transform(source, {
      transforms: ['jsx', 'typescript'],
      jsxRuntime: 'classic',
      jsxPragma: 'React.createElement',
      jsxFragmentPragma: 'React.Fragment',
      production: true
    })

    return {
      success: true,
      compiled: result.code,
      error: null
    }
  } catch (err) {
    return {
      success: false,
      compiled: null,
      error: err instanceof Error ? err.message : 'Compilation failed'
    }
  }
}

export function createMicroappFactory(compiled: string): Function {
  // Wrap the compiled code in a function that receives the stdlib
  const wrapper = `
    return function MicroApp(props) {
      const { React, useState, useEffect, useCallback, useMemo, useRef, useAppState, useData, useTable, notify, file, utils, UI, cn } = props.__stdlib;
      ${compiled}
    }
  `
  // eslint-disable-next-line no-new-func
  return new Function(wrapper)()
}
