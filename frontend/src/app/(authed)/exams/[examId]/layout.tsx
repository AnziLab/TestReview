'use client'

import { use } from 'react'
import { SideNav } from '@/components/SideNav'

export default function ExamLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ examId: string }>
}) {
  const { examId } = use(params)
  return (
    <div className="flex flex-1 overflow-hidden">
      <SideNav examId={examId} />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
