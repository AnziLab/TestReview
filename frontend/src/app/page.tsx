'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  const retries = useRef(0)

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

    function checkSetup() {
      fetch(`${apiUrl}/setup/status`)
        .then((r) => r.json())
        .then((data) => {
          if (data.setup_required) {
            router.replace('/setup')
          } else {
            router.replace('/dashboard')
          }
        })
        .catch(() => {
          // 백엔드가 아직 준비 안 됐으면 재시도 (최대 30초)
          if (retries.current < 15) {
            retries.current++
            setTimeout(checkSetup, 2000)
          } else {
            router.replace('/dashboard')
          }
        })
    }

    checkSetup()
  }, [router])

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <div className="h-8 w-8 rounded-full border-4 border-indigo-100 border-t-indigo-500 animate-spin mx-auto" />
        <p className="text-sm text-slate-400 mt-4">서버 연결 중...</p>
      </div>
    </div>
  )
}
