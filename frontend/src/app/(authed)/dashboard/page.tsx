'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { examsApi } from '@/lib/api/exams'
import type { Exam } from '@/lib/types'

const statusLabels: Record<Exam['status'], string> = {
  draft: '초안',
  rubric_ready: '기준표 완료',
  answers_uploaded: '답안 업로드됨',
  rubric_refined: '정제 완료',
  graded: '채점 완료',
}

const statusColors: Record<Exam['status'], string> = {
  draft: 'bg-gray-100 text-gray-600',
  rubric_ready: 'bg-blue-100 text-blue-700',
  answers_uploaded: 'bg-yellow-100 text-yellow-700',
  rubric_refined: 'bg-purple-100 text-purple-700',
  graded: 'bg-green-100 text-green-700',
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export default function DashboardPage() {
  const { data: exams, error, isLoading, mutate } = useSWR('exams', () => examsApi.list())
  const [deleting, setDeleting] = useState<number | null>(null)

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`"${title}" 시험을 삭제하시겠습니까?`)) return
    setDeleting(id)
    try {
      await examsApi.delete(id)
      mutate()
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">내 시험 목록</h1>
        <Link
          href="/exams/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          새 시험 만들기
        </Link>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          시험 목록을 불러오는데 실패했습니다: {error.message}
        </div>
      )}

      {!isLoading && !error && exams && exams.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-gray-500 mb-4">아직 시험이 없습니다.</p>
          <Link
            href="/exams/new"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg inline-block"
          >
            첫 시험 만들기
          </Link>
        </div>
      )}

      {exams && exams.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {exams.map((exam) => (
            <div key={exam.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <h2 className="font-semibold text-gray-900 text-lg leading-tight">{exam.title}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ml-2 flex-shrink-0 ${statusColors[exam.status]}`}>
                  {statusLabels[exam.status]}
                </span>
              </div>
              <div className="text-sm text-gray-500 space-y-1 flex-1">
                {exam.subject && <p>과목: {exam.subject}</p>}
                {exam.grade && <p>학년: {exam.grade}학년</p>}
                {exam.question_count !== undefined && <p>문항 수: {exam.question_count}개</p>}
                <p>생성일: {formatDate(exam.created_at)}</p>
              </div>
              <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                <Link
                  href={`/exams/${exam.id}`}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm text-center"
                >
                  열기
                </Link>
                <button
                  onClick={() => handleDelete(exam.id, exam.title)}
                  disabled={deleting === exam.id}
                  className="border border-gray-300 hover:bg-red-50 hover:border-red-300 hover:text-red-600 px-3 py-1.5 rounded-lg text-sm text-gray-500 disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
