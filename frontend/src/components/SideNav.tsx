'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import useSWR from 'swr'
import { examsApi } from '@/lib/api/exams'

interface SideNavProps {
  examId: string
}

const steps = [
  { label: '채점기준표', path: '/rubric' },
  { label: '학생 답안', path: '/classes' },
  { label: '채점기준 정제', path: '/refine' },
  { label: '채점', path: '/grading' },
]

export function SideNav({ examId }: SideNavProps) {
  const pathname = usePathname()
  const base = `/exams/${examId}`
  const { data: exam } = useSWR(`exams/${examId}`, () => examsApi.get(Number(examId)))

  return (
    <aside className="w-52 bg-slate-50 border-r border-slate-200 flex flex-col py-4 flex-shrink-0">
      <div className="px-4 mb-4">
        <Link href={base} className="font-semibold text-slate-800 text-sm block hover:text-indigo-600 leading-tight truncate">
          {exam?.title ?? '...'}
        </Link>
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
                  ? 'bg-indigo-50 text-indigo-600 font-medium'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                active ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-400'
              }`}>
                {idx + 1}
              </span>
              {step.label}
            </Link>
          )
        })}
      </nav>
      <div className="px-4 pt-4 border-t border-slate-200">
        <Link href="/dashboard" className="text-xs text-slate-400 hover:text-slate-600">
          ← 목록으로
        </Link>
      </div>
    </aside>
  )
}
