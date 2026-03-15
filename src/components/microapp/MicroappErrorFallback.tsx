import { AlertTriangle, Code, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MicroappErrorFallbackProps {
  error: Error
  resetErrorBoundary: () => void
  onEditSource?: () => void
}

export function MicroappErrorFallback({
  error,
  resetErrorBoundary,
  onEditSource
}: MicroappErrorFallbackProps) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4 gap-3 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <p className="text-sm font-medium text-destructive">Microapp Error</p>
      <pre className="text-xs text-muted-foreground max-w-full overflow-auto bg-muted p-2 rounded max-h-24">
        {error.message}
      </pre>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={resetErrorBoundary}>
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Retry
        </Button>
        {onEditSource && (
          <Button variant="outline" size="sm" onClick={onEditSource}>
            <Code className="h-3.5 w-3.5 mr-1" />
            Edit Source
          </Button>
        )}
      </div>
    </div>
  )
}
