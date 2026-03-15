import { useMemo, useState, useCallback } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { compileMicroapp, createMicroappFactory } from '@/services/compiler'
import { buildStdlib } from './runtime'
import { MicroappErrorFallback } from './MicroappErrorFallback'
import { useMicroappStore } from '@/stores/microapp-store'
import type { MicroappColor } from '@/types/microapp'

// oklch values that override --color-primary per theme
const COLOR_OVERRIDES: Record<MicroappColor, { primary: string; primaryForeground: string } | null> = {
  default: null,
  blue: { primary: 'oklch(0.65 0.18 250)', primaryForeground: 'oklch(0.98 0 0)' },
  green: { primary: 'oklch(0.65 0.18 155)', primaryForeground: 'oklch(0.98 0 0)' },
  purple: { primary: 'oklch(0.65 0.18 300)', primaryForeground: 'oklch(0.98 0 0)' },
  orange: { primary: 'oklch(0.7 0.18 55)', primaryForeground: 'oklch(0.15 0.02 55)' },
  red: { primary: 'oklch(0.6 0.2 25)', primaryForeground: 'oklch(0.98 0 0)' },
  pink: { primary: 'oklch(0.65 0.18 340)', primaryForeground: 'oklch(0.98 0 0)' },
  yellow: { primary: 'oklch(0.75 0.15 85)', primaryForeground: 'oklch(0.15 0.02 85)' }
}

interface MicroappRendererProps {
  microappId: string
  onEditSource?: () => void
}

export function MicroappRenderer({ microappId, onEditSource }: MicroappRendererProps) {
  const instance = useMicroappStore((s) => s.instances[microappId])
  const [errorKey, setErrorKey] = useState(0)

  const { Component, error } = useMemo(() => {
    if (!instance?.source) {
      return { Component: null, error: 'No source code' }
    }

    const compileResult = compileMicroapp(instance.source)
    if (!compileResult.success || !compileResult.compiled) {
      return { Component: null, error: compileResult.error }
    }

    try {
      const factory = createMicroappFactory(compileResult.compiled) as React.ComponentType<{ __stdlib: unknown }>
      return { Component: factory, error: null }
    } catch (err) {
      return {
        Component: null,
        error: err instanceof Error ? err.message : 'Failed to create component'
      }
    }
  }, [instance?.source])

  const stdlib = useMemo(() => buildStdlib(microappId), [microappId])

  const handleReset = useCallback(() => {
    setErrorKey((k) => k + 1)
  }, [])

  const appColor = (instance?.color || 'default') as MicroappColor
  const overrides = COLOR_OVERRIDES[appColor]
  const themeStyle = overrides
    ? {
        '--color-primary': overrides.primary,
        '--color-primary-foreground': overrides.primaryForeground,
        '--color-ring': overrides.primary
      } as React.CSSProperties
    : undefined

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-4 gap-2 text-center">
        <p className="text-sm font-medium text-destructive">Compilation Error</p>
        <pre className="text-xs text-muted-foreground max-w-full overflow-auto bg-muted p-2 rounded max-h-24">
          {error}
        </pre>
      </div>
    )
  }

  if (!Component) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
        No component loaded
      </div>
    )
  }

  return (
    <ErrorBoundary
      key={errorKey}
      FallbackComponent={(props) => (
        <MicroappErrorFallback {...props} onEditSource={onEditSource} />
      )}
      onReset={handleReset}
    >
      <div className="w-full h-full" style={themeStyle}>
        <Component __stdlib={stdlib} />
      </div>
    </ErrorBoundary>
  )
}
