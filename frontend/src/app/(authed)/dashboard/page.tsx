'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { examsApi } from '@/lib/api/exams'
import type { Exam } from '@/lib/types'
import { Badge, Button, Card, EmptyState, Spinner, useConfirm, useToast } from '@/components/ui'

const statusLabels: Record<Exam['status'], string> = {
  draft: '초안',
  rubric_ready: '기준표 완료',
  answers_uploaded: '답안 업로드됨',
  rubric_refined: '정제 완료',
  graded: '채점 완료',
}

const statusTones: Record<Exam['status'], 'neutral' | 'info' | 'warning' | 'primary' | 'success'> = {
  draft: 'neutral',
  rubric_ready: 'info',
  answers_uploaded: 'warning',
  rubric_refined: 'primary',
  graded: 'success',
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export default function DashboardPage() {
  const { data: exams, error, isLoading, mutate } = useSWR('exams', () => examsApi.list())
  const [deleting, setDeleting] = useState<number | null>(null)
  const confirm = useConfirm()
  const toast = useToast()

  const handleDelete = async (id: number, title: string) => {
    const ok = await confirm({
      title: `"${title}" 삭제`,
      description: '이 시험을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
      tone: 'danger',
      confirmLabel: '삭제',
    })
    if (!ok) return
    setDeleting(id)
    try {
      await examsApi.delete(id)
      mutate()
      toast('시험이 삭제되었습니다.', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : '삭제 실패', 'danger')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">내 시험 목록</h1>
        <Link href="/exams/new">
          <Button>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            새 시험 만들기
          </Button>
        </Link>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700">
          시험 목록을 불러오는데 실패했습니다: {error.message}
        </div>
      )}

      {!isLoading && !error && exams && exams.length === 0 && (
        <EmptyState
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
          title="아직 시험이 없습니다."
          description="새 시험을 만들어 채점을 시작하세요."
          action={
            <Link href="/exams/new">
              <Button>첫 시험 만들기</Button>
            </Link>
          }
        />
      )}

      {exams && exams.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {exams.map((exam) => (
            <Link key={exam.id} href={`/exams/${exam.id}`}>
            <Card interactive className="flex flex-col h-full">
              <div className="flex items-start justify-between mb-3">
                <h2 className="font-semibold text-slate-900 text-lg leading-tight">{exam.title}</h2>
                <Badge tone={statusTones[exam.status]} className="ml-2 flex-shrink-0">
                  {statusLabels[exam.status]}
                </Badge>
              </div>
              <div className="text-sm text-slate-500 space-y-1 flex-1">
                {exam.subject && <p>과목: {exam.subject}</p>}
                {exam.grade && <p>학년: {exam.grade}학년</p>}
                {exam.question_count !== undefined && <p>문항 수: {exam.question_count}개</p>}
                <p>생성일: {formatDate(exam.created_at)}</p>
              </div>
              <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                <div className="flex-1" />
                <Button
                  variant="danger"
                  onClick={(e) => { e.preventDefault(); handleDelete(exam.id, exam.title) }}
                  disabled={deleting === exam.id}
                  loading={deleting === exam.id}
                >
                  삭제
                </Button>
              </div>
            </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
