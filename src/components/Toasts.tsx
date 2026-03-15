import { useNotificationStore, type Notification } from '@/stores/notification-store'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const typeStyles: Record<Notification['type'], string> = {
  info: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  success: 'border-green-500/30 bg-green-500/10 text-green-300',
  warning: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300',
  error: 'border-red-500/30 bg-red-500/10 text-red-300'
}

export function Toasts() {
  const notifications = useNotificationStore((s) => s.notifications)
  const dismiss = useNotificationStore((s) => s.dismiss)

  if (notifications.length === 0) return null

  return (
    <div className="fixed top-3 right-3 z-50 flex flex-col gap-2 max-w-80">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={cn(
            'flex items-start gap-2 px-3 py-2 rounded-lg border text-sm shadow-lg backdrop-blur-sm animate-in slide-in-from-right-5 fade-in duration-200',
            typeStyles[n.type]
          )}
        >
          <span className="flex-1 break-words">{n.message}</span>
          <button
            onClick={() => dismiss(n.id)}
            className="shrink-0 mt-0.5 opacity-60 hover:opacity-100 transition-opacity"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
