'use client'

import { useEffect, useState } from 'react'

interface AutosaveIndicatorProps {
  status: 'idle' | 'saving' | 'saved' | 'error'
  lastSavedAt: Date | null
}

export function AutosaveIndicator({ status, lastSavedAt }: AutosaveIndicatorProps) {
  const [elapsed, setElapsed] = useState<string>('')

  useEffect(() => {
    if (!lastSavedAt || status !== 'saved') return
    const update = () => {
      const secs = Math.floor((Date.now() - lastSavedAt.getTime()) / 1000)
      if (secs < 5) setElapsed('방금 저장됨')
      else if (secs < 60) setElapsed(`${secs}초 전 저장됨`)
      else setElapsed(`${Math.floor(secs / 60)}분 전 저장됨`)
    }
    update()
    const interval = setInterval(update, 5000)
    return () => clearInterval(interval)
  }, [lastSavedAt, status])

  if (status === 'idle') return null

  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1 text-sm text-gray-500">
        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        저장 중...
      </span>
    )
  }

  if (status === 'error') {
    return (
      <span className="text-sm text-red-600">저장 실패</span>
    )
  }

  return (
    <span className="text-sm text-gray-400">{elapsed}</span>
  )
}
