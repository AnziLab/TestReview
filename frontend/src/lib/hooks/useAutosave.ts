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

  useEffect(() => {
    latestRubricRef.current = rubric
    setIsDirty(true)
  }, [rubric])

  const save = useCallback(async () => {
    setStatus('saving')
    try {
      await questionsApi.saveRubricDraft(Number(questionId), latestRubricRef.current)
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
