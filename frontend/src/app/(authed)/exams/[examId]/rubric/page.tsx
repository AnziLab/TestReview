'use client'

import { use, useState } from 'react'
import useSWR from 'swr'
import { questionsApi } from '@/lib/api/exams'
import { RubricEditor } from '@/components/RubricEditor'
import type { Question } from '@/lib/types'

const emptyRubric = { criteria: [], notes: '' }

export default function RubricPage({
  params,
}: {
  params: Promise<{ examId: string }>
}) {
  const { examId } = use(params)
  const { data: questions, isLoading, error } = useSWR(
    `exams/${examId}/questions`,
    () => questionsApi.list(Number(examId))
  )
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const selected: Question | undefined = questions?.find((q) => q.id === selectedId) ?? questions?.[0]

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          문항을 불러오는데 실패했습니다: {error.message}
        </div>
      </div>
    )
  }

  if (!questions || questions.length === 0) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-gray-500">등록된 문항이 없습니다.</p>
        </div>
      </div>
    )
  }

  const activeQuestion = selectedId ? questions.find((q) => q.id === selectedId) : questions[0]

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-48 border-r border-gray-200 bg-white flex-shrink-0 overflow-y-auto">
        <div className="p-3 border-b border-gray-200">
          <p className="text-xs font-medium text-gray-500">문항 목록</p>
        </div>
        {questions.map((q) => (
          <button
            key={q.id}
            onClick={() => setSelectedId(q.id)}
            className={`w-full text-left px-4 py-3 text-sm border-b border-gray-100 transition-colors ${
              (selectedId ? selectedId === q.id : q === questions[0])
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'hover:bg-gray-50 text-gray-700'
            }`}
          >
            <span className="block font-medium">문항 {q.number}</span>
            <span className="text-xs text-gray-400">{q.max_score}점</span>
          </button>
        ))}
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeQuestion && (
          <div className="max-w-2xl">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">문항 {activeQuestion.number}</h2>
              <p className="text-sm text-gray-500">배점: {activeQuestion.max_score}점</p>
            </div>

            {activeQuestion.question_text && (
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium text-gray-700 mb-1">문항 내용</p>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{activeQuestion.question_text}</p>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-4">
              <label className="text-sm font-medium text-gray-700 block mb-1">모범 답안</label>
              <textarea
                className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                rows={4}
                defaultValue={activeQuestion.model_answer || ''}
                onBlur={async (e) => {
                  try {
                    await questionsApi.update(activeQuestion.id, { model_answer: e.target.value })
                  } catch {
                    // ignore
                  }
                }}
                placeholder="모범 답안을 입력하세요"
              />
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <RubricEditor
                key={activeQuestion.id}
                questionId={String(activeQuestion.id)}
                initialRubric={activeQuestion.rubric_draft_json ?? activeQuestion.rubric_json ?? emptyRubric}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
