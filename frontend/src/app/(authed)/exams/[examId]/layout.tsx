'use client'

import { use } from 'react'
import useSWR from 'swr'
import { examsApi } from '@/lib/api/exams'
import { SideNav } from '@/components/SideNav'

export default function ExamLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ examId: string }>
}) {
  const { examId } = use(params)
  const { data: exam, isLoading, error } = useSWR(
    `exams/${examId}`,
    () => examsApi.get(Number(examId))
  )

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  if (error || !exam) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-red-600">시험을 불러올 수 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <SideNav exam={exam} />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
