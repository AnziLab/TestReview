'use client'

import { use } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { examsApi, questionsApi, classesApi } from '@/lib/api/exams'
import type { Exam } from '@/lib/types'
import { Card, Spinner } from '@/components/ui'

const stepDefs = [
  {
    key: 'rubric',
    label: '채점기준표',
    desc: '문항별 채점기준 설정',
    path: '/rubric',
    doneStatuses: ['rubric_ready', 'answers_uploaded', 'rubric_refined', 'graded'] as Exam['status'][],
  },
  {
    key: 'classes',
    label: '학생 답안 업로드',
    desc: '학급별 OCR 처리',
    path: '/classes',
    doneStatuses: ['answers_uploaded', 'rubric_refined', 'graded'] as Exam['status'][],
  },
  {
    key: 'refine',
    label: '채점기준 정제',
    desc: '클러스터 분석 후 기준 완성',
    path: '/refine',
    doneStatuses: ['rubric_refined', 'graded'] as Exam['status'][],
  },
  {
    key: 'grading',
    label: '채점',
    desc: '일괄 채점 및 결과 확인',
    path: '/grading',
    doneStatuses: ['graded'] as Exam['status'][],
  },
]

export default function ExamHubPage({
  params,
}: {
  params: Promise<{ examId: string }>
}) {
  const { examId } = use(params)
  const numericId = Number(examId)
  const { data: exam, error: examError } = useSWR(`exams/${numericId}`, () => examsApi.get(numericId))
  const { data: questions } = useSWR(`exams/${numericId}/questions`, () => questionsApi.list(numericId))
  const { data: classes } = useSWR(`exams/${numericId}/classes`, () => classesApi.list(numericId))

  if (examError) return (
    <div className="p-6 text-center text-rose-600">시험 정보를 불러오지 못했습니다.</div>
  )
  if (!exam) return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  )

  const currentStepIdx = stepDefs.findIndex(
    (s) => !s.doneStatuses.includes(exam.status)
  )
  const activeIdx = currentStepIdx === -1 ? stepDefs.length - 1 : currentStepIdx

  return (
    <div className="p-6 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{exam.title}</h1>
        {exam.subject && (
          <p className="text-slate-500 text-sm mt-1">{exam.subject}{exam.grade ? ` · ${exam.grade}학년` : ''}</p>
        )}
      </div>

      <div className="grid gap-4">
        {stepDefs.map((step, idx) => {
          const isDone = step.doneStatuses.includes(exam.status)
          const isActive = idx === activeIdx
          const isLocked = idx > activeIdx && !isDone

          const cardContent = (
            <Card
              key={step.key}
              interactive={!isLocked}
              padding="md"
              className={`flex items-center gap-4 transition-colors ${isLocked ? 'opacity-50' : ''}`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                isDone ? 'bg-emerald-50 text-emerald-500'
                : isActive ? 'bg-indigo-500 text-white'
                : 'bg-slate-100 text-slate-400'
              }`}>
                {isDone ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="font-bold text-sm">{idx + 1}</span>
                )}
              </div>
              <div className="flex-1">
                <p className={`font-medium ${isActive ? 'text-indigo-700' : 'text-slate-800'}`}>{step.label}</p>
                <p className="text-sm text-slate-500">{step.desc}</p>
                {step.key === 'rubric' && questions && (
                  <p className="text-xs text-slate-400 mt-0.5">{questions.length}개 문항</p>
                )}
                {step.key === 'classes' && classes && (
                  <p className="text-xs text-slate-400 mt-0.5">{classes.length}개 반</p>
                )}
              </div>
              {isActive && (
                <span className="text-indigo-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              )}
            </Card>
          )

          return isLocked ? (
            <div key={step.key} aria-disabled="true">{cardContent}</div>
          ) : (
            <Link key={step.key} href={`/exams/${examId}${step.path}`}>{cardContent}</Link>
          )
        })}
      </div>
    </div>
  )
}
