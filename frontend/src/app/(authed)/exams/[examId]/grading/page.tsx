'use client'

import { use, useState } from 'react'
import useSWR from 'swr'
import { examsApi, questionsApi } from '@/lib/api/exams'
import type { GradingExportOptions } from '@/lib/api/exams'
import { apiFetch } from '@/lib/api/client'
import type { GradingResult } from '@/lib/types'
import { Badge, Button, Card, Modal, ProgressBar, SegmentedControl, Spinner, useConfirm, useToast } from '@/components/ui'

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
  const confirm = useConfirm()
  const toast = useToast()
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
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<GradingResult | null>(null)
  const [selectedQuestionId, setSelectedQuestionId] = useState<number | null>(null)
  const [detail, setDetail] = useState<QuestionDetail[] | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const handleGrade = async () => {
    const ok = await confirm({
      title: '일괄 채점 실행',
      description: '모든 학생의 답안을 채점합니다. 계속하시겠습니까?',
      confirmLabel: '채점 시작',
    })
    if (!ok) return
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
          toast('채점이 완료되었습니다.', 'success')
        } else if (attempts < 60) {
          setTimeout(poll, 3000)
        } else {
          setGrading(false)
          toast('채점 결과를 확인할 수 없습니다. 페이지를 새로고침하세요.', 'warning')
        }
      }
      setTimeout(poll, 3000)
    } catch (e) {
      toast(e instanceof Error ? e.message : '채점 실패', 'danger')
      setGrading(false)
    }
  }

  const handleDownload = async (options: GradingExportOptions) => {
    setDownloading(true)
    try {
      const res = await examsApi.downloadGradingExcel(Number(examId), options)
      if (!res.ok) throw new Error('다운로드 실패')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `채점결과_${examId}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      setExportModalOpen(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : '다운로드 실패', 'danger')
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
              <h1 className="text-xl font-bold text-slate-900">채점 결과</h1>
              <SegmentedControl
                options={[
                  { value: 'student', label: '학생별' },
                  { value: 'question', label: '문항별' },
                ]}
                value={viewMode}
                onChange={(v) => { setViewMode(v); setSelectedStudent(null); setSelectedQuestionId(null) }}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleGrade} loading={grading}>
                {grading ? '채점 중...' : '일괄 채점 실행'}
              </Button>
              {results && results.length > 0 && (
                <Button variant="secondary" onClick={() => setExportModalOpen(true)} disabled={downloading}>
                  Excel 다운로드
                </Button>
              )}
            </div>
          </div>

          {/* 문항별 진행률 */}
          {questions && questions.length > 0 && (
            <Card padding="sm" className="mb-4">
              <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                {questions.map((q) => {
                  const prog = questionProgress[q.id]
                  const isRegrading = regradingQ === q.id
                  return (
                    <div key={q.id} className="text-center">
                      <p className="text-xs text-slate-500 mb-1">{q.number}번</p>
                      <ProgressBar value={prog?.scored ?? 0} max={prog?.total ?? 1} />
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={isRegrading}
                        disabled={isRegrading || grading}
                        onClick={async () => {
                          setRegradingQ(q.id)
                          try {
                            await apiFetch(`/questions/${q.id}/grade`, { method: 'POST' })
                            setTimeout(async () => {
                              const data = await examsApi.getGradingResults(Number(examId))
                              if (data) mutate(data)
                              setRegradingQ(null)
                            }, 15000)
                          } catch (e) {
                            toast(e instanceof Error ? e.message : '재채점 실패', 'danger')
                            setRegradingQ(null)
                          }
                        }}
                        className="mt-1 mx-auto"
                      >
                        재채점
                      </Button>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {isLoading && (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          )}

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700">
              채점 결과를 불러오는데 실패했습니다.
            </div>
          )}

          {/* 문항별 뷰 — 카드 목록만 */}
          {viewMode === 'question' && questions && questions.length > 0 && (
            <div className="space-y-2">
              {questions.map((q) => (
                <Card
                  key={q.id}
                  interactive
                  padding="sm"
                  className={`flex items-center justify-between ${
                    selectedQuestionId === q.id ? 'ring-2 ring-indigo-300' : ''
                  }`}
                  onClick={() => setSelectedQuestionId(selectedQuestionId === q.id ? null : q.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className={`font-medium ${selectedQuestionId === q.id ? 'text-indigo-700' : 'text-slate-900'}`}>{q.number}번</span>
                    <span className="text-sm text-slate-500">/{q.max_score}점</span>
                    {regradingQ === q.id && (
                      <span className="text-xs text-indigo-500 flex items-center gap-1">
                        <Spinner size="sm" />재채점 중
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
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
                  >
                    재채점
                  </Button>
                </Card>
              ))}
            </div>
          )}

          {viewMode === 'student' && results && results.length > 0 && questions && (
            <Card padding="sm" className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 sticky left-0 bg-slate-50">학번</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">이름</th>
                    {!selectedStudent && questions.map((q) => (
                      <th key={q.id} className="px-3 py-3 text-right text-xs font-medium text-slate-500 whitespace-nowrap">
                        {q.number}번<br />
                        <span className="text-slate-400 font-normal">/{q.max_score}</span>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // 반별로 그룹핑
                    const groups: { className: string; students: typeof results }[] = []
                    let currentClass = ''
                    for (const r of results) {
                      const cn = r.class_name ?? '미분류'
                      if (cn !== currentClass) {
                        groups.push({ className: cn, students: [] })
                        currentClass = cn
                      }
                      groups[groups.length - 1].students.push(r)
                    }
                    const multiClass = groups.length > 1

                    return groups.map(({ className, students: classStudents }) => (
                      <>
                        {multiClass && (
                          <tr key={`header-${className}`}>
                            <td
                              colSpan={2 + (selectedStudent ? 0 : questions.length) + 1}
                              className="px-4 py-2 bg-slate-100 text-xs font-semibold text-slate-600 border-t border-slate-200"
                            >
                              {className}
                              <span className="ml-2 font-normal text-slate-400">{classStudents.length}명</span>
                            </td>
                          </tr>
                        )}
                        {classStudents.map((r) => (
                          <tr
                            key={r.student_id}
                            onClick={() => handleSelectStudent(r)}
                            className={`cursor-pointer transition-colors border-t border-slate-100 ${
                              selectedStudent?.student_id === r.student_id
                                ? 'bg-indigo-50'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="px-4 py-2.5 sticky left-0 bg-inherit font-mono text-xs">
                              {r.student_number ?? '-'}
                            </td>
                            <td className="px-4 py-2.5 text-slate-800">{r.name ?? '-'}</td>
                            {!selectedStudent && questions.map((q) => (
                              <td key={q.id} className="px-3 py-2.5 text-right">
                                {r.scores?.[q.id] != null
                                  ? <span className="font-medium">{r.scores[q.id]}</span>
                                  : <span className="text-slate-300">-</span>}
                              </td>
                            ))}
                            <td className="px-4 py-2.5 text-right">
                              <Badge tone="primary">{r.total}</Badge>
                            </td>
                          </tr>
                        ))}
                      </>
                    ))
                  })()}
                </tbody>
              </table>
            </Card>
          )}

          {!isLoading && !error && viewMode === 'student' && (!results || results.length === 0) && (
            <Card className="text-center text-slate-500">
              채점 결과가 없습니다. 일괄 채점을 실행하세요.
            </Card>
          )}
        </div>
      </div>

      {/* 오른쪽: 문항별 패널 */}
      {viewMode === 'question' && selectedQuestionId && (() => {
        const q = questions?.find((q) => q.id === selectedQuestionId)
        if (!q) return null
        return (
          <div className="w-1/2 border-l border-slate-200 flex flex-col overflow-hidden bg-white">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
              <div>
                <p className="font-semibold text-slate-900">문항 {q.number}</p>
                <p className="text-sm text-slate-500">배점 {q.max_score}점</p>
              </div>
              <button onClick={() => setSelectedQuestionId(null)} className="text-slate-400 hover:text-slate-600 p-1">
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
        <div className="w-1/2 border-l border-slate-200 flex flex-col overflow-hidden bg-white">
          {/* 헤더 */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
            <div>
              <p className="font-semibold text-slate-900">
                {selectedStudent.name ?? '-'}
                <span className="ml-2 text-sm font-normal text-slate-500">{selectedStudent.student_number}</span>
              </p>
              <p className="text-sm text-indigo-700 font-medium">총점: {selectedStudent.total}점</p>
            </div>
            <button onClick={() => setSelectedStudent(null)} className="text-slate-400 hover:text-slate-600 p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 문항별 상세 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {detailLoading && (
              <div className="flex justify-center py-8">
                <Spinner size="md" />
              </div>
            )}
            {detail && detail.map((item) => (
              <div key={item.question_id}
                className={`rounded-xl border p-4 ${
                  item.score === item.max_score ? 'bg-emerald-50 border-emerald-100'
                  : item.score === 0 ? 'bg-rose-50 border-rose-100'
                  : item.score != null ? 'bg-amber-50 border-amber-100'
                  : 'border-slate-200'
                }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-slate-800 text-sm">{item.question_number}번</span>
                  <span className={`text-sm font-bold ${
                    item.score === item.max_score ? 'text-emerald-700'
                    : item.score === 0 ? 'text-rose-600'
                    : item.score != null ? 'text-amber-700'
                    : 'text-slate-400'
                  }`}>
                    {item.score != null ? `${item.score} / ${item.max_score}점` : '미채점'}
                  </span>
                </div>

                {/* 학생 답안 */}
                <div className="mb-2">
                  <p className="text-xs text-slate-500 mb-0.5">학생 답안</p>
                  <p className="text-sm text-slate-800 bg-white rounded-lg px-2 py-1.5 border border-slate-200">
                    {item.answer_text || <span className="text-slate-400 italic">무응답</span>}
                  </p>
                </div>

                {/* 모범답안 */}
                {item.model_answer && (
                  <div className="mb-2">
                    <p className="text-xs text-slate-500 mb-0.5">모범답안</p>
                    <p className="text-xs text-indigo-700 bg-indigo-50 rounded-lg px-2 py-1 border border-indigo-100">
                      {item.model_answer}
                    </p>
                  </div>
                )}

                {/* 채점 근거 */}
                {item.rationale && (
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">채점 근거</p>
                    <p className="text-xs text-slate-600 italic">{item.rationale}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <ExportOptionsModal
        open={exportModalOpen}
        downloading={downloading}
        onClose={() => setExportModalOpen(false)}
        onDownload={handleDownload}
      />
    </div>
  )
}

function ExportOptionsModal({
  open, downloading, onClose, onDownload,
}: {
  open: boolean
  downloading: boolean
  onClose: () => void
  onDownload: (options: GradingExportOptions) => void | Promise<void>
}) {
  const [score, setScore] = useState(true)
  const [rationale, setRationale] = useState(true)
  const [answer, setAnswer] = useState(false)
  const [modelAnswer, setModelAnswer] = useState(false)
  const [criteria, setCriteria] = useState(false)
  const [total, setTotal] = useState(true)

  const items: { key: string; label: string; hint?: string; checked: boolean; setter: (v: boolean) => void }[] = [
    { key: 'score', label: '점수', hint: '문항별 점수 (배점 표시 포함)', checked: score, setter: setScore },
    { key: 'rationale', label: '채점 이유', hint: 'AI가 적은 채점 근거', checked: rationale, setter: setRationale },
    { key: 'answer', label: '학생 답안 텍스트', hint: 'OCR로 읽은 학생 응답', checked: answer, setter: setAnswer },
    { key: 'modelAnswer', label: '모범답안', hint: '문항별 정답 (모든 행에 동일)', checked: modelAnswer, setter: setModelAnswer },
    { key: 'criteria', label: '매칭된 채점기준', hint: 'AI가 적용한 채점 기준 설명', checked: criteria, setter: setCriteria },
    { key: 'total', label: '합계', hint: '학생별 총점', checked: total, setter: setTotal },
  ]

  const anyChecked = score || rationale || answer || modelAnswer || criteria || total

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="엑셀 다운로드 옵션"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>취소</Button>
          <Button
            size="sm"
            loading={downloading}
            disabled={!anyChecked}
            onClick={() => onDownload({ score, rationale, answer, modelAnswer, criteria, total })}
          >
            다운로드
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600 mb-3">
        포함할 컬럼을 선택하세요. 반/학번/이름은 항상 포함됩니다.
      </p>
      <div className="space-y-2">
        {items.map((it) => (
          <label key={it.key} className="flex items-start gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50">
            <input
              type="checkbox"
              checked={it.checked}
              onChange={(e) => it.setter(e.target.checked)}
              className="mt-0.5 accent-indigo-500"
            />
            <div>
              <div className="text-sm font-medium text-slate-800">{it.label}</div>
              {it.hint && <div className="text-xs text-slate-500">{it.hint}</div>}
            </div>
          </label>
        ))}
      </div>
      {!anyChecked && (
        <p className="text-xs text-rose-600 mt-3">최소 하나 이상 선택해야 합니다.</p>
      )}
    </Modal>
  )
}

function QuestionAnswerList({ questionId }: { questionId: number }) {
  const { data, isLoading } = useSWR(
    `questions/${questionId}/grading`,
    () => apiFetch<StudentGradingRow[]>(`/questions/${questionId}/grading-results`)
  )

  if (isLoading) {
    return (
      <div className="flex justify-center py-6 border-t border-slate-100">
        <Spinner size="md" />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return <div className="px-4 py-4 text-sm text-slate-400 border-t border-slate-100">채점 결과 없음</div>
  }

  return (
    <div className="border-t border-slate-100 divide-y divide-slate-100">
      {data.map((row) => (
        <div key={row.student_id} className="px-4 py-3 flex gap-4">
          {/* 학생 정보 + 점수 */}
          <div className="w-24 flex-shrink-0">
            <p className="text-sm font-medium text-slate-800">{row.name ?? '-'}</p>
            <p className="text-xs text-slate-400">{row.student_number ?? '-'}</p>
            <p className={`text-sm font-bold mt-1 ${
              row.score === row.max_score ? 'text-emerald-600'
              : row.score === 0 ? 'text-rose-500'
              : row.score != null ? 'text-amber-600'
              : 'text-slate-400'
            }`}>
              {row.score != null ? `${row.score}점` : '-'}
            </p>
          </div>
          {/* 답안 + 근거 */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-2 py-1 mb-1">
              {row.answer_text || <span className="text-slate-400 italic">무응답</span>}
            </p>
            {row.rationale && (
              <p className="text-xs text-slate-500 italic">{row.rationale}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
