'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { questionsApi } from '@/lib/api/exams'
import type { Question, RefinementSession } from '@/lib/types'

function sessionStatusLabel(status?: RefinementSession['status']) {
  if (!status) return '-'
  return { running: '실행 중', done: '완료', failed: '실패' }[status]
}

function sessionStatusColor(status?: RefinementSession['status']) {
  if (!status) return 'text-gray-400'
  return { running: 'text-blue-600', done: 'text-green-600', failed: 'text-red-600' }[status]
}

export default function RefinePage({
  params,
}: {
  params: Promise<{ examId: string }>
}) {
  const { examId } = use(params)
  const { data: questions, isLoading, error } = useSWR(
    `exams/${examId}/questions`,
    () => questionsApi.list(Number(examId))
  )
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [refining, setRefining] = useState(false)

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleRefine = async (ids: number[]) => {
    setRefining(true)
    try {
      await Promise.all(ids.map((id) => questionsApi.refine(id)))
      alert(`${ids.length}개 문항 정제가 시작되었습니다.`)
    } catch (e) {
      alert(e instanceof Error ? e.message : '정제 시작 실패')
    } finally {
      setRefining(false)
    }
  }

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
          문항 목록을 불러오는데 실패했습니다.
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">채점기준 정제</h1>
        <div className="flex gap-2">
          <button
            disabled={selected.size === 0 || refining}
            onClick={() => handleRefine(Array.from(selected))}
            className="border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm disabled:opacity-40"
          >
            선택 문항 정제 ({selected.size})
          </button>
          <button
            disabled={!questions?.length || refining}
            onClick={() => handleRefine(questions!.map((q) => q.id))}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-40"
          >
            {refining ? '정제 중...' : '전체 정제'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  className="rounded accent-blue-600"
                  checked={questions?.length ? selected.size === questions.length : false}
                  onChange={(e) => {
                    if (e.target.checked) setSelected(new Set(questions?.map((q) => q.id) ?? []))
                    else setSelected(new Set())
                  }}
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">문항</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">최근 정제 상태</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">판단불가 클러스터</th>
              <th className="px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {questions?.map((q) => (
              <QuestionRow
                key={q.id}
                question={q}
                examId={examId}
                checked={selected.has(q.id)}
                onToggle={() => toggleSelect(q.id)}
              />
            ))}
          </tbody>
        </table>
        {(!questions || questions.length === 0) && (
          <div className="py-8 text-center text-gray-400 text-sm">문항이 없습니다.</div>
        )}
      </div>
    </div>
  )
}

function QuestionRow({
  question,
  examId,
  checked,
  onToggle,
}: {
  question: Question
  examId: string
  checked: boolean
  onToggle: () => void
}) {
  const { data: sessions } = useSWR(
    `questions/${question.id}/sessions`,
    () => questionsApi.getRefinementSessions(question.id)
  )
  const latest = sessions?.[0]

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <input
          type="checkbox"
          className="rounded accent-blue-600"
          checked={checked}
          onChange={onToggle}
        />
      </td>
      <td className="px-4 py-3 font-medium text-gray-900">문항 {question.number}</td>
      <td className={`px-4 py-3 ${sessionStatusColor(latest?.status)}`}>
        {sessionStatusLabel(latest?.status)}
      </td>
      <td className="px-4 py-3 text-gray-500">
        {latest?.unjudgable_count != null ? (
          <span className={latest.unjudgable_count > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
            {latest.unjudgable_count}개
          </span>
        ) : '-'}
      </td>
      <td className="px-4 py-3">
        <Link
          href={`/exams/${examId}/refine/${question.id}`}
          className="text-xs text-blue-600 hover:underline"
        >
          상세 보기
        </Link>
      </td>
    </tr>
  )
}
