'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/context/AuthContext'
import { TopBar } from '@/components/TopBar'
import { ApiKeyBanner } from '@/components/ApiKeyBanner'
import { ToastProvider } from '@/components/ui/useToast'
import { ConfirmProvider } from '@/components/ui/useConfirm'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    if (!user) { router.replace('/login'); return }
    if (user.status === 'pending') { router.replace('/pending'); return }
    if (user.status === 'rejected') { router.replace('/login'); return }
  }, [user, loading, router])

  if (loading || !user || user.status !== 'approved') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="h-8 w-8 rounded-full border-2 border-indigo-100 border-t-indigo-500 animate-spin" />
      </div>
    )
  }

  return (
    <ConfirmProvider>
      <ToastProvider>
        <div className="h-screen flex flex-col overflow-hidden">
          <TopBar />
          <ApiKeyBanner />
          <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
        </div>
      </ToastProvider>
    </ConfirmProvider>
  )
}
