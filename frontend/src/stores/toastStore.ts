import { create } from 'zustand'

export interface Toast {
  id: number
  message: string
  actionLabel?: string
  onAction?: () => void
}

interface ToastAction {
  label: string
  onAction: () => void
}

interface ToastState {
  toasts: Toast[]
  show: (message: string, action?: ToastAction) => void
  dismiss: (id: number) => void
}

let nextToastId = 1

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (message, action) => {
    const toast: Toast = {
      id: nextToastId++,
      message,
      actionLabel: action?.label,
      onAction: action?.onAction,
    }
    set((state) => ({ toasts: [...state.toasts, toast] }))
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}))
