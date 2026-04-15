'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { questionsApi } from '@/lib/api/exams'
import { apiFetch } from '@/lib/api/client'
import type { Question, RefinementSession } from '@/lib/types'
import { Badge, Button, Card, ProgressBar, Spinner, useToast } from '@/components/ui'

function sessionStatusLabel(status?: RefinementSession['status']) {
  if (!status) return '-'
  return { running: '실행 중', done: '완료', failed: '실패' }[status]
}

export default function RefinePage({
  params,
}: {
  params: Promise<{ examId: string }>
}) {
  const { examId } = use(params)
  const toast = useToast()
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
      toast(e instanceof Error ? e.message : '정제 시작 실패', 'danger')
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
      toast(e instanceof Error ? e.message : '정제 시작 실패', 'danger')
      setProgress(null)
    }
  }

  const isRefining = runningSessions.length > 0

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700">
          문항 목록을 불러오는데 실패했습니다.
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-900">채점기준 정제</h1>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={selected.size === 0 || isRefining}
            onClick={handleRefineSelected}
          >
            선택 정제 ({selected.size})
          </Button>
          <Button
            disabled={!questions?.length || isRefining}
            onClick={handleRefineAll}
          >
            전체 정제
          </Button>
        </div>
      </div>

      {/* 진행 상황 */}
      {progress && (
        <Card className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-800">
              {isRefining ? '정제 진행 중...' : '정제 완료'}
            </span>
            <span className="text-sm text-slate-600">
              {progress.done} / {progress.total} 문항
            </span>
          </div>
          <ProgressBar value={progress.done} max={progress.total} />
          {!isRefining && (
            <button
              onClick={() => setProgress(null)}
              className="mt-2 text-xs text-indigo-600 hover:underline"
            >
              닫기
            </button>
          )}
        </Card>
      )}

      <Card className="overflow-hidden" padding="sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  className="rounded accent-indigo-500"
                  checked={questions?.length ? selected.size === questions.length : false}
                  onChange={(e) => {
                    if (e.target.checked) setSelected(new Set(questions?.map((q) => q.id) ?? []))
                    else setSelected(new Set())
                  }}
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">문항</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">최근 정제 상태</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">판단불가</th>
              <th className="px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
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
          <div className="py-8 text-center text-slate-400 text-sm">문항이 없습니다.</div>
        )}
      </Card>
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
  const { data: sessions } = useSWR(
    `questions/${question.id}/sessions`,
    () => questionsApi.getRefinementSessions(question.id),
    { refreshInterval: isRunning ? 3000 : 0 }
  )
  const latest = sessions?.[0]

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3">
        <input type="checkbox" className="rounded accent-indigo-500" checked={checked} onChange={onToggle} />
      </td>
      <td className="px-4 py-3 font-medium text-slate-900">문항 {question.number}</td>
      <td className="px-4 py-3">
        {latest?.status === 'running' ? (
          <span className="inline-flex items-center gap-1.5 text-indigo-600">
            <Spinner size="sm" />
            {sessionStatusLabel(latest.status)}
          </span>
        ) : latest?.status === 'done' ? (
          <span className="text-emerald-600">{sessionStatusLabel(latest.status)}</span>
        ) : latest?.status === 'failed' ? (
          <span className="text-rose-600">{sessionStatusLabel(latest.status)}</span>
        ) : (
          <span className="text-slate-400">-</span>
        )}
      </td>
      <td className="px-4 py-3">
        {latest?.unjudgable_count != null ? (
          <Badge tone={latest.unjudgable_count > 0 ? 'danger' : 'success'}>
            {latest.unjudgable_count}개
          </Badge>
        ) : '-'}
      </td>
      <td className="px-4 py-3">
        <Link href={`/exams/${examId}/refine/${question.id}`} className="text-xs text-indigo-600 hover:underline">
          상세 보기
        </Link>
      </td>
    </tr>
  )
}
