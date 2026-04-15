'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/setup/status`)
      .then((r) => r.json())
      .then((data) => {
        if (data.setup_required) {
          router.replace('/setup')
        } else {
          router.replace('/dashboard')
        }
      })
      .catch(() => router.replace('/dashboard'))
  }, [router])

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="h-8 w-8 rounded-full border-4 border-indigo-100 border-t-indigo-500 animate-spin" />
    </div>
  )
}
