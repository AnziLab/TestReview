'use client'

import { useEffect, useState } from 'react'
import { Spinner } from '@/components/ui'

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
      <span className="flex items-center gap-1.5 text-sm text-slate-500">
        <Spinner size="sm" tone="primary" />
        저장 중...
      </span>
    )
  }

  if (status === 'error') {
    return (
      <span className="text-sm text-rose-500">저장 실패</span>
    )
  }

  return (
    <span className="text-sm text-slate-400">{elapsed}</span>
  )
}
