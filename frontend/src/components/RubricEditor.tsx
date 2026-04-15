'use client'

import { useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAutosave } from '@/lib/hooks/useAutosave'
import { AutosaveIndicator } from './AutosaveIndicator'
import { Button, EmptyState, Input, Textarea } from '@/components/ui'
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
        <h3 className="font-medium text-slate-800">채점기준 편집</h3>
        <AutosaveIndicator status={status} lastSavedAt={lastSavedAt} />
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1.5">채점기준 항목</label>
        {rubric.criteria.length === 0 ? (
          <EmptyState
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            }
            title="채점기준 없음"
            description="아래 버튼을 눌러 채점기준 항목을 추가하세요."
            action={
              <Button variant="ghost" size="sm" onClick={addCriterion}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                항목 추가
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {rubric.criteria.map((c, idx) => (
              <div key={c.id} className="flex gap-2 items-start">
                <Input
                  placeholder="채점기준 설명"
                  value={c.description}
                  onChange={(e) => updateCriterion(idx, 'description', e.target.value)}
                />
                <Input
                  type="number"
                  className="w-20"
                  placeholder="배점"
                  value={c.points ?? 0}
                  min={0}
                  onChange={(e) => updateCriterion(idx, 'points', Number(e.target.value))}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeCriterion(idx)}
                  title="삭제"
                  className="mt-0.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addCriterion} className="mt-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              항목 추가
            </Button>
          </div>
        )}
      </div>

      <div>
        <label className="text-sm font-medium text-slate-700 block mb-1.5">메모 (notes)</label>
        <Textarea
          rows={3}
          value={rubric.notes}
          onChange={(e) => setRubric((prev) => ({ ...prev, notes: e.target.value }))}
          placeholder="채점 시 참고할 메모"
        />
      </div>
    </div>
  )
}
