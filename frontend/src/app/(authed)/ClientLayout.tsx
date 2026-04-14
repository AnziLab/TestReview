'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/context/AuthContext'
import { TopBar } from '@/components/TopBar'
import { ApiKeyBanner } from '@/components/ApiKeyBanner'

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <ApiKeyBanner />
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  )
}
