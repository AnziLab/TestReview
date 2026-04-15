'use client'
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { cn } from './cn'

type ToastTone = 'success' | 'danger' | 'warning' | 'info'
interface Toast { id: number; message: string; tone: ToastTone }
interface ToastFn { (message: string, tone?: ToastTone): void }

const ToastContext = createContext<ToastFn>(() => {})

let counter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const toast: ToastFn = useCallback((message, tone = 'info') => {
    const id = ++counter
    setToasts(p => [...p, { id, message, tone }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000)
  }, [])

  const toneStyles: Record<ToastTone, string> = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    danger:  'bg-rose-50 border-rose-200 text-rose-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info:    'bg-indigo-50 border-indigo-200 text-indigo-800',
  }
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={cn('px-4 py-3 rounded-xl border shadow-card text-sm font-medium pointer-events-auto animate-in slide-in-from-right-4', toneStyles[t.tone])}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
export const useToast = () => useContext(ToastContext)
