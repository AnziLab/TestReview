'use client'

import { useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAutosave } from '@/lib/hooks/useAutosave'
import { questionsApi } from '@/lib/api/exams'
import { AutosaveIndicator } from './AutosaveIndicator'
import type { RubricJson } from '@/lib/types'

interface RubricEditorProps {
  questionId: string
  initialRubric: RubricJson
}

function normalizeRubric(rubric: RubricJson | null | undefined): RubricJson {
  if (!rubric) return { criteria: [], notes: '' }
  return {
    ...rubric,
    notes: rubric.notes ?? '',
    criteria: (rubric.criteria ?? []).map((c) => ({
      ...c,
      id: c.id || uuidv4(),
      description: c.description ?? '',
      points: c.points ?? 0,
    })),
  }
}

export function RubricEditor({ questionId, initialRubric }: RubricEditorProps) {
  const [rubric, setRubric] = useState<RubricJson>(() => normalizeRubric(initialRubric))
  const { status, lastSavedAt } = useAutosave(questionId, rubric)

  useEffect(() => {
    setRubric(normalizeRubric(initialRubric))
  }, [questionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateCriterion = (idx: number, field: 'description' | 'points', value: string | number) => {
    setRubric((prev) => {
      const criteria = [...prev.criteria]
      criteria[idx] = { ...criteria[idx], [field]: value }
      return { ...prev, criteria }
    })
  }

  const addCriterion = () => {
    setRubric((prev) => ({
      ...prev,
      criteria: [...prev.criteria, { id: uuidv4(), description: '', points: 0 }],
    }))
  }

  const removeCriterion = (idx: number) => {
    setRubric((prev) => ({
      ...prev,
      criteria: prev.criteria.filter((_, i) => i !== idx),
    }))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-800">채점기준 편집</h3>
        <AutosaveIndicator status={status} lastSavedAt={lastSavedAt} />
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">채점기준 항목</label>
        <div className="space-y-2">
          {rubric.criteria.map((c, idx) => (
            <div key={c.id} className="flex gap-2 items-start">
              <input
                className="border border-gray-300 rounded-lg px-3 py-2 flex-1 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                placeholder="채점기준 설명"
                value={c.description}
                onChange={(e) => updateCriterion(idx, 'description', e.target.value)}
              />
              <input
                type="number"
                className="border border-gray-300 rounded-lg px-3 py-2 w-20 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                placeholder="배점"
                value={c.points ?? 0}
                min={0}
                onChange={(e) => updateCriterion(idx, 'points', Number(e.target.value))}
              />
              <button
                onClick={() => removeCriterion(idx)}
                className="text-red-500 hover:text-red-700 p-2 flex-shrink-0"
                title="삭제"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addCriterion}
          className="mt-2 text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          항목 추가
        </button>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">메모 (notes)</label>
        <textarea
          className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          rows={3}
          value={rubric.notes}
          onChange={(e) => setRubric((prev) => ({ ...prev, notes: e.target.value }))}
          placeholder="채점 시 참고할 메모"
        />
      </div>

    </div>
  )
}
