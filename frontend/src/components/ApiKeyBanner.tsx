'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/context/AuthContext'

export function ApiKeyBanner() {
  const { user } = useAuth()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted || !user || user.has_api_key) return null

  return (
    <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-2 flex items-center gap-2">
      <svg className="w-4 h-4 text-yellow-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <span className="text-sm text-yellow-800">
        Gemini API 키가 설정되지 않았습니다.{' '}
        <Link href="/settings/api-key" className="font-medium underline hover:no-underline">
          설정하기
        </Link>
      </span>
    </div>
  )
}
