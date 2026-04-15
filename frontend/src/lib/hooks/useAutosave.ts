'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { questionsApi } from '../api/exams'
import type { RubricJson } from '../types'

type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function useAutosave(questionId: string, rubric: RubricJson) {
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [isDirty, setIsDirty] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const latestRubricRef = useRef(rubric)
  const isMountedRef = useRef(false)

  useEffect(() => {
    latestRubricRef.current = rubric
    // 마운트 직후 첫 렌더는 dirty로 처리하지 않음 (초기 데이터 덮어쓰기 방지)
    if (!isMountedRef.current) {
      isMountedRef.current = true
      return
    }
    setIsDirty(true)
  }, [rubric])

  const save = useCallback(async () => {
    setStatus('saving')
    try {
      await questionsApi.update(Number(questionId), { rubric_json: latestRubricRef.current })
      setStatus('saved')
      setIsDirty(false)
      setLastSavedAt(new Date())
    } catch {
      setStatus('error')
    }
  }, [questionId])

  useEffect(() => {
    if (!isDirty) return
    const timer = setTimeout(() => {
      save()
    }, 1000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rubric), isDirty])

  const triggerSave = useCallback(() => {
    save()
  }, [save])

  return { status, lastSavedAt, triggerSave }
}
