'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { questionsApi } from '@/lib/api/exams'
import { apiFetch } from '@/lib/api/client'
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
  const { data: questions, isLoading, error, mutate } = useSWR(
    `exams/${examId}/questions`,
    () => questionsApi.list(Number(examId))
  )
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // 진행 상황 상태
  const [runningSessions, setRunningSessions] = useState<number[]>([]) // session ids
  const [progress, setProgress] = useState<{ total: number; done: number } | null>(null)

  // 실행 중인 세션들 폴링
  useEffect(() => {
    if (runningSessions.length === 0) return
    const interval = setInterval(async () => {
      const statuses = await Promise.all(
        runningSessions.map((id) =>
          apiFetch<RefinementSession>(`/refinement-sessions/${id}`).catch(() => null)
        )
      )
      const stillRunning = statuses
        .filter((s) => s?.status === 'running')
        .map((s) => s!.id)
      const done = statuses.filter((s) => s?.status !== 'running').length

      setProgress((prev) => prev ? { ...prev, done: prev.total - stillRunning.length } : null)
      setRunningSessions(stillRunning)

      if (stillRunning.length === 0) {
        mutate() // refresh question list
        clearInterval(interval)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [runningSessions, mutate])

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleRefineSelected = async () => {
    const ids = Array.from(selected)
    setProgress({ total: ids.length, done: 0 })
    try {
      const results = await Promise.all(ids.map((id) => questionsApi.refine(id)))
      const sessionIds = results.map((r) => r.id)
      setRunningSessions(sessionIds)
    } catch (e) {
      alert(e instanceof Error ? e.message : '정제 시작 실패')
      setProgress(null)
    }
  }

  const handleRefineAll = async () => {
    if (!questions?.length) return
    setProgress({ total: questions.length, done: 0 })
    try {
      const result = await apiFetch<{ session_ids: number[]; session_count: number }>(
        `/exams/${examId}/refine-all`,
        { method: 'POST' }
      )
      setRunningSessions(result.session_ids ?? [])
    } catch (e) {
      alert(e instanceof Error ? e.message : '정제 시작 실패')
      setProgress(null)
    }
  }

  const isRefining = runningSessions.length > 0

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="h-8 w-8 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">채점기준 정제</h1>
        <div className="flex gap-2">
          <button
            disabled={selected.size === 0 || isRefining}
            onClick={handleRefineSelected}
            className="border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm disabled:opacity-40"
          >
            선택 정제 ({selected.size})
          </button>
          <button
            disabled={!questions?.length || isRefining}
            onClick={handleRefineAll}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-40"
          >
            전체 정제
          </button>
        </div>
      </div>

      {/* 진행 상황 */}
      {progress && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-800">
              {isRefining ? '정제 진행 중...' : '정제 완료'}
            </span>
            <span className="text-sm text-blue-700">
              {progress.done} / {progress.total} 문항
            </span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
          {!isRefining && (
            <button
              onClick={() => setProgress(null)}
              className="mt-2 text-xs text-blue-600 hover:underline"
            >
              닫기
            </button>
          )}
        </div>
      )}

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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">판단불가</th>
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
                isRunning={isRefining}
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
  isRunning,
}: {
  question: Question
  examId: string
  checked: boolean
  onToggle: () => void
  isRunning: boolean
}) {
  const { data: sessions, mutate } = useSWR(
    `questions/${question.id}/sessions`,
    () => questionsApi.getRefinementSessions(question.id),
    { refreshInterval: isRunning ? 3000 : 0 }
  )
  const latest = sessions?.[0]

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <input type="checkbox" className="rounded accent-blue-600" checked={checked} onChange={onToggle} />
      </td>
      <td className="px-4 py-3 font-medium text-gray-900">문항 {question.number}</td>
      <td className={`px-4 py-3 ${sessionStatusColor(latest?.status)}`}>
        {latest?.status === 'running' && (
          <span className="inline-flex items-center gap-1">
            <div className="h-3 w-3 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
          </span>
        )}
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
        <Link href={`/exams/${examId}/refine/${question.id}`} className="text-xs text-blue-600 hover:underline">
          상세 보기
        </Link>
      </td>
    </tr>
  )
}
