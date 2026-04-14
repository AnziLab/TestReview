'use client'

import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../api/client'

export function usePolling<T>(
  url: string | null,
  intervalMs: number,
  stopCondition: (data: T) => boolean
) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(false)
  const stopped = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!url) return
    stopped.current = false

    const poll = async () => {
      if (stopped.current) return
      setLoading(true)
      try {
        const result = await apiFetch<T>(url)
        setData(result)
        setError(null)
        if (stopCondition(result)) {
          stopped.current = true
          setLoading(false)
          return
        }
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)))
      }
      setLoading(false)
      if (!stopped.current) {
        timerRef.current = setTimeout(poll, intervalMs)
      }
    }

    poll()

    return () => {
      stopped.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, intervalMs])

  return { data, error, loading }
}
