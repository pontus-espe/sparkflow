import { create } from 'zustand'

export interface Notification {
  id: string
  microappId: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  createdAt: number
}

export interface NotificationStore {
  notifications: Notification[]
  add: (microappId: string, message: string, type?: Notification['type']) => void
  dismiss: (id: string) => void
  clear: () => void
}

let counter = 0

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],

  add: (microappId, message, type = 'info') => {
    const id = `notif-${++counter}-${Date.now()}`
    set((state) => ({
      notifications: [...state.notifications, { id, microappId, message, type, createdAt: Date.now() }]
    }))
    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id)
      }))
    }, 4000)
  },

  dismiss: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id)
    }))
  },

  clear: () => set({ notifications: [] })
}))
