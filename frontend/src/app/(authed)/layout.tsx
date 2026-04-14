'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/context/AuthContext'
import { TopBar } from '@/components/TopBar'
import { ApiKeyBanner } from '@/components/ApiKeyBanner'

export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.replace('/login')
      return
    }
    if (user.status === 'pending') {
      router.replace('/pending')
      return
    }
    if (user.status === 'rejected') {
      router.replace('/login')
      return
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  if (!user || user.status !== 'approved') return null

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <ApiKeyBanner />
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  )
}
