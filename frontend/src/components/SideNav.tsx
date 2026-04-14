'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Exam } from '@/lib/types'

interface SideNavProps {
  exam: Exam
}

const steps = [
  { label: '채점기준표', path: '/rubric' },
  { label: '학생 답안', path: '/classes' },
  { label: '채점기준 정제', path: '/refine' },
  { label: '채점', path: '/grading' },
]

const statusLabels: Record<Exam['status'], string> = {
  draft: '초안',
  rubric_ready: '기준표 완료',
  answers_uploaded: '답안 업로드됨',
  rubric_refined: '정제 완료',
  graded: '채점 완료',
}

export function SideNav({ exam }: SideNavProps) {
  const pathname = usePathname()
  const base = `/exams/${exam.id}`

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col py-4 flex-shrink-0">
      <div className="px-4 mb-4">
        <Link href={base} className="font-semibold text-gray-800 text-sm block hover:text-blue-600 leading-tight">
          {exam.title}
        </Link>
        <span className="text-xs text-gray-400 mt-0.5 block">{statusLabels[exam.status]}</span>
      </div>
      <nav className="flex-1">
        {steps.map((step, idx) => {
          const href = `${base}${step.path}`
          const active = pathname.startsWith(href)
          return (
            <Link
              key={step.path}
              href={href}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                active
                  ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-600 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {idx + 1}
              </span>
              {step.label}
            </Link>
          )
        })}
      </nav>
      <div className="px-4 pt-4 border-t border-gray-200">
        <Link href="/dashboard" className="text-xs text-gray-400 hover:text-gray-600">
          ← 대시보드
        </Link>
      </div>
    </aside>
  )
}
