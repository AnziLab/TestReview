'use client'

import { use, useState } from 'react'
import useSWR from 'swr'
import { examsApi, questionsApi } from '@/lib/api/exams'
import { apiFetch } from '@/lib/api/client'
import type { GradingResult } from '@/lib/types'

interface QuestionDetail {
  question_id: number
  question_number: string
  max_score: number
  model_answer?: string
  answer_text: string
  score: number | null
  rationale: string | null
  graded_by: string | null
}

interface StudentGradingRow {
  student_id: number
  student_number?: string
  name?: string
  answer_text: string
  score: number | null
  max_score: number
  rationale: string | null
  graded_by: string | null
}

export default function GradingPage({
  params,
}: {
  params: Promise<{ examId: string }>
}) {
  const { examId } = use(params)
  const { data: questions } = useSWR(
    `exams/${examId}/questions`,
    () => questionsApi.list(Number(examId))
  )
  const { data: results, isLoading, error, mutate } = useSWR<GradingResult[]>(
    `exams/${examId}/gradings`,
    () => examsApi.getGradingResults(Number(examId))
  )
  const [viewMode, setViewMode] = useState<'student' | 'question'>('student')
  const [grading, setGrading] = useState(false)
  const [regradingQ, setRegradingQ] = useState<number | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<GradingResult | null>(null)
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(null)
  const [detail, setDetail] = useState<QuestionDetail[] | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const handleGrade = async () => {
    if (!confirm('일괄 채점을 실행하시겠습니까?')) return
    setGrading(true)
    try {
      await examsApi.grade(Number(examId))
      let attempts = 0
      const poll = async () => {
        attempts++
        const data = await examsApi.getGradingResults(Number(examId))
        if (data && data.length > 0) {
          mutate(data)
          setGrading(false)
        } else if (attempts < 60) {
          setTimeout(poll, 3000)
        } else {
          setGrading(false)
        }
      }
      setTimeout(poll, 3000)
    } catch (e) {
      alert(e instanceof Error ? e.message : '채점 실패')
      setGrading(false)
    }
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const res = await examsApi.downloadGradingExcel(Number(examId))
      if (!res.ok) throw new Error('다운로드 실패')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `채점결과_${examId}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(e instanceof Error ? e.message : '다운로드 실패')
    } finally {
      setDownloading(false)
    }
  }

  const handleSelectStudent = async (r: GradingResult) => {
    setSelectedStudent(r)
    setDetail(null)
    setDetailLoading(true)
    try {
      const data = await apiFetch<QuestionDetail[]>(`/students/${r.student_id}/grading-detail`)
      setDetail(data)
    } catch {
      setDetail([])
    } finally {
      setDetailLoading(false)
    }
  }

  // 문항별 채점 진행률
  const questionProgress: Record<number, { total: number; scored: number }> = {}
  if (results && questions) {
    for (const q of questions) {
      questionProgress[q.id] = { total: results.length, scored: 0 }
    }
    for (const r of results) {
      for (const qId of Object.keys(r.scores ?? {})) {
        const id = Number(qId)
        if (questionProgress[id] && r.scores[id] != null) {
          questionProgress[id].scored++
        }
      }
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* 왼쪽: 결과 테이블 */}
      <div className={`flex flex-col overflow-hidden transition-all ${(selectedStudent || selectedQuestionId) ? 'w-1/2' : 'w-full'}`}>
        <div className="p-6 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">채점 결과</h1>
              <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
                {(['student', 'question'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => { setViewMode(mode); setSelectedStudent(null); setSelectedQuestionId(null) }}
                    className={`px-3 py-1.5 transition-colors ${
                      viewMode === mode ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {mode === 'student' ? '학생별' : '문항별'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleGrade} disabled={grading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50 flex items-center gap-2">
                {grading && <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
                {grading ? '채점 중...' : '일괄 채점 실행'}
              </button>
              {results && results.length > 0 && (
                <button onClick={handleDownload} disabled={downloading}
                  className="border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm disabled:opacity-50">
                  Excel 다운로드
                </button>
              )}
            </div>
          </div>

          {/* 문항별 진행률 */}
          {questions && questions.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-3 mb-4">
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                {questions.map((q) => {
                  const prog = questionProgress[q.id]
                  const pct = prog?.total > 0 ? Math.round((prog.scored / prog.total) * 100) : 0
                  const isRegrading = regradingQ === q.id
                  return (
                    <div key={q.id} className="text-center group relative">
                      <p className="text-xs text-gray-500 mb-1">{q.number}번</p>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mb-0.5">
                        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-gray-400 mb-1">{pct}%</p>
                      <button
                        onClick={async () => {
                          setRegradingQ(q.id)
                          try {
                            await apiFetch(`/questions/${q.id}/grade`, { method: 'POST' })
                            // 완료 대기 후 결과 갱신
                            setTimeout(async () => {
                              const data = await examsApi.getGradingResults(Number(examId))
                              if (data) mutate(data)
                              setRegradingQ(null)
                            }, 15000)
                          } catch (e) {
                            alert(e instanceof Error ? e.message : '재채점 실패')
                            setRegradingQ(null)
                          }
                        }}
                        disabled={isRegrading || grading}
                        className="text-xs text-blue-600 hover:underline disabled:opacity-40 flex items-center gap-1 mx-auto"
                      >
                        {isRegrading
                          ? <><div className="h-2.5 w-2.5 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />재채점 중</>
                          : '재채점'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {isLoading && (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              채점 결과를 불러오는데 실패했습니다.
            </div>
          )}

          {/* 문항별 뷰 — 카드 목록만 */}
          {viewMode === 'question' && questions && questions.length > 0 && (
            <div className="space-y-2">
              {questions.map((q) => (
                <div
                  key={q.id}
                  role="button"
                  tabIndex={0}
                  className={`bg-white rounded-lg border px-4 py-3 flex items-center justify-between cursor-pointer transition-colors ${
                    selectedQuestionId === q.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedQuestionId(selectedQuestionId === q.id ? null : q.id)}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedQuestionId(selectedQuestionId === q.id ? null : q.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className={`font-medium ${selectedQuestionId === q.id ? 'text-blue-700' : 'text-gray-900'}`}>{q.number}번</span>
                    <span className="text-sm text-gray-500">/{q.max_score}점</span>
                    {regradingQ === q.id && (
                      <span className="text-xs text-blue-500 flex items-center gap-1">
                        <div className="h-2.5 w-2.5 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />재채점 중
                      </span>
                    )}
                  </div>
                  <button
                    className="text-xs text-blue-600 hover:underline px-2"
                    onClick={async (e) => {
                      e.stopPropagation()
                      setRegradingQ(q.id)
                      try {
                        await apiFetch(`/questions/${q.id}/grade`, { method: 'POST' })
                        setTimeout(async () => {
                          const data = await examsApi.getGradingResults(Number(examId))
                          if (data) mutate(data)
                          setRegradingQ(null)
                        }, 15000)
                      } catch { setRegradingQ(null) }
                    }}
                    disabled={regradingQ === q.id || grading}
                  >재채점</button>
                </div>
              ))}
            </div>
          )}

          {viewMode === 'student' && results && results.length > 0 && questions && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 sticky left-0 bg-gray-50">학번</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">이름</th>
                    {!selectedStudent && questions.map((q) => (
                      <th key={q.id} className="px-3 py-3 text-right text-xs font-medium text-gray-500 whitespace-nowrap">
                        {q.number}번<br />
                        <span className="text-gray-400 font-normal">/{q.max_score}</span>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">합계</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.map((r) => (
                    <tr
                      key={r.student_id}
                      onClick={() => handleSelectStudent(r)}
                      className={`cursor-pointer transition-colors ${
                        selectedStudent?.student_id === r.student_id
                          ? 'bg-blue-50'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-4 py-2.5 sticky left-0 bg-inherit font-mono text-xs">
                        {r.student_number ?? '-'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-800">{r.name ?? '-'}</td>
                      {!selectedStudent && questions.map((q) => (
                        <td key={q.id} className="px-3 py-2.5 text-right">
                          {r.scores?.[q.id] != null
                            ? <span className="font-medium">{r.scores[q.id]}</span>
                            : <span className="text-gray-300">-</span>}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-right font-bold text-blue-700">{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!isLoading && !error && viewMode === 'student' && (!results || results.length === 0) && (
            <div className="bg-white rounded-lg border border-gray-200 p-10 text-center text-gray-500">
              채점 결과가 없습니다. 일괄 채점을 실행하세요.
            </div>
          )}
        </div>
      </div>

      {/* 오른쪽: 문항별 패널 */}
      {viewMode === 'question' && selectedQuestionId && (() => {
        const q = questions?.find((q) => q.id === selectedQuestionId)
        if (!q) return null
        return (
          <div className="w-1/2 border-l border-gray-200 flex flex-col overflow-hidden bg-white">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <div>
                <p className="font-semibold text-gray-900">문항 {q.number}</p>
                <p className="text-sm text-gray-500">배점 {q.max_score}점</p>
              </div>
              <button onClick={() => setSelectedQuestionId(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <QuestionAnswerList questionId={selectedQuestionId} />
          </div>
        )
      })()}

      {/* 오른쪽: 학생 상세 패널 */}
      {viewMode === 'student' && selectedStudent && (
        <div className="w-1/2 border-l border-gray-200 flex flex-col overflow-hidden bg-white">
          {/* 헤더 */}
          <div className="p-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
            <div>
              <p className="font-semibold text-gray-900">
                {selectedStudent.name ?? '-'}
                <span className="ml-2 text-sm font-normal text-gray-500">{selectedStudent.student_number}</span>
              </p>
              <p className="text-sm text-blue-700 font-medium">총점: {selectedStudent.total}점</p>
            </div>
            <button onClick={() => setSelectedStudent(null)} className="text-gray-400 hover:text-gray-600 p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 문항별 상세 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {detailLoading && (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
              </div>
            )}
            {detail && detail.map((item) => (
              <div key={item.question_id}
                className={`rounded-lg border p-4 ${
                  item.score === item.max_score ? 'border-green-200 bg-green-50/40'
                  : item.score === 0 ? 'border-red-200 bg-red-50/40'
                  : item.score != null ? 'border-amber-200 bg-amber-50/40'
                  : 'border-gray-200'
                }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-800 text-sm">{item.question_number}번</span>
                  <span className={`text-sm font-bold ${
                    item.score === item.max_score ? 'text-green-700'
                    : item.score === 0 ? 'text-red-600'
                    : item.score != null ? 'text-amber-700'
                    : 'text-gray-400'
                  }`}>
                    {item.score != null ? `${item.score} / ${item.max_score}점` : '미채점'}
                  </span>
                </div>

                {/* 학생 답안 */}
                <div className="mb-2">
                  <p className="text-xs text-gray-500 mb-0.5">학생 답안</p>
                  <p className="text-sm text-gray-800 bg-white rounded px-2 py-1.5 border border-gray-200">
                    {item.answer_text || <span className="text-gray-400 italic">무응답</span>}
                  </p>
                </div>

                {/* 모범답안 */}
                {item.model_answer && (
                  <div className="mb-2">
                    <p className="text-xs text-gray-500 mb-0.5">모범답안</p>
                    <p className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1 border border-blue-100">
                      {item.model_answer}
                    </p>
                  </div>
                )}

                {/* 채점 근거 */}
                {item.rationale && (
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">채점 근거</p>
                    <p className="text-xs text-gray-600 italic">{item.rationale}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function QuestionAnswerList({ questionId }: { questionId: number }) {
  const { data, isLoading } = useSWR(
    `questions/${questionId}/grading`,
    () => apiFetch<StudentGradingRow[]>(`/questions/${questionId}/grading-results`)
  )

  if (isLoading) {
    return (
      <div className="flex justify-center py-6 border-t border-gray-100">
        <div className="h-5 w-5 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return <div className="px-4 py-4 text-sm text-gray-400 border-t border-gray-100">채점 결과 없음</div>
  }

  return (
    <div className="border-t border-gray-100 divide-y divide-gray-100">
      {data.map((row) => (
        <div key={row.student_id} className="px-4 py-3 flex gap-4">
          {/* 학생 정보 + 점수 */}
          <div className="w-24 flex-shrink-0">
            <p className="text-sm font-medium text-gray-800">{row.name ?? '-'}</p>
            <p className="text-xs text-gray-400">{row.student_number ?? '-'}</p>
            <p className={`text-sm font-bold mt-1 ${
              row.score === row.max_score ? 'text-green-600'
              : row.score === 0 ? 'text-red-500'
              : row.score != null ? 'text-amber-600'
              : 'text-gray-400'
            }`}>
              {row.score != null ? `${row.score}점` : '-'}
            </p>
          </div>
          {/* 답안 + 근거 */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-700 bg-gray-50 rounded px-2 py-1 mb-1">
              {row.answer_text || <span className="text-gray-400 italic">무응답</span>}
            </p>
            {row.rationale && (
              <p className="text-xs text-gray-500 italic">{row.rationale}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
