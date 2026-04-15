'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { examsApi, questionsApi } from '@/lib/api/exams'
import { usePolling } from '@/lib/hooks/usePolling'
import {
  Button, Card, Input, Select, FileDropzone, StepIndicator, Spinner, Textarea,
} from '@/components/ui'
import type { Exam, Question } from '@/lib/types'

type Step = 1 | 2 | 3

interface BasicForm {
  title: string
  subject: string
  school_level: string
  grade: string
}

export default function NewExamPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [exam, setExam] = useState<Exam | null>(null)
  const [mode, setMode] = useState<'choose' | 'rubric' | 'generate'>('choose')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [pollingUrl, setPollingUrl] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [qFrom, setQFrom] = useState(1)
  const [qTo, setQTo] = useState(9)

  const { data: extractionStatus, error: pollingError } = usePolling<{
    status: 'pending' | 'processing' | 'done' | 'failed'
    questions?: Question[]
  }>(
    pollingUrl,
    2000,
    (d) => {
      if (d.status === 'done' || d.status === 'failed') {
        if (d.status === 'done' && d.questions) {
          setQuestions(d.questions)
          setStep(3)
        }
        return true
      }
      return false
    }
  )

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<BasicForm>()

  const onBasicSubmit = async (data: BasicForm) => {
    const created = await examsApi.create({
      title: data.title,
      subject: data.subject || undefined,
      school_level: data.school_level || undefined,
      grade: data.grade ? Number(data.grade) : undefined,
    })
    setExam(created)
    setStep(2)
  }

  const handleUpload = useCallback(async () => {
    if (!exam || !file) return
    setUploading(true)
    setUploadError('')
    try {
      if (mode === 'rubric') {
        await examsApi.uploadRubricFile(exam.id, file)
        setPollingUrl(`/exams/${exam.id}/rubric-extraction`)
      } else {
        const form = new FormData()
        form.append('file', file)
        const { apiFetch } = await import('@/lib/api/client')
        await apiFetch(`/exams/${exam.id}/generate-rubric?question_from=${qFrom}&question_to=${qTo}`, {
          method: 'POST', body: form, skipContentType: true,
        } as Parameters<typeof apiFetch>[1])
        setPollingUrl(`/exams/${exam.id}/rubric-extraction`)
      }
      setUploading(false)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '업로드 실패')
      setUploading(false)
    }
  }, [exam, file, mode, qFrom, qTo])

  const handleUpdateQuestion = (idx: number, field: 'number' | 'max_score' | 'model_answer', value: string | number) => {
    setQuestions((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  const handleFinish = async () => {
    if (!exam) return
    for (const q of questions) {
      try {
        await questionsApi.update(q.id, {
          number: q.number,
          max_score: q.max_score,
          model_answer: q.model_answer,
        })
      } catch {
        // continue
      }
    }
    router.push(`/exams/${exam.id}`)
  }

  const isExtracting = pollingUrl && (!extractionStatus || extractionStatus.status === 'pending' || extractionStatus.status === 'processing')
  const extractFailed = (extractionStatus?.status === 'failed') || pollingError

  return (
    <div className="p-6 max-w-2xl mx-auto w-full">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">새 시험 만들기</h1>

      {/* Step indicator */}
      <div className="mb-8">
        <StepIndicator
          steps={['기본 정보', '파일 업로드', '문항 확인']}
          current={step - 1}
        />
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <Card padding="md">
          <h2 className="font-medium text-slate-800 mb-4">시험 기본 정보</h2>
          <form onSubmit={handleSubmit(onBasicSubmit)} className="space-y-4">
            <Input
              label="시험 제목 *"
              placeholder="예: 2024년 1학기 중간고사"
              error={errors.title?.message}
              {...register('title', { required: '시험 제목을 입력하세요.' })}
            />
            <Input
              label="과목"
              placeholder="예: 국어"
              {...register('subject')}
            />
            <Select label="학교 급" {...register('school_level')}>
              <option value="">선택</option>
              <option value="elementary">초등학교</option>
              <option value="middle">중학교</option>
              <option value="high">고등학교</option>
            </Select>
            <Select label="학년" {...register('grade')}>
              <option value="">선택</option>
              {[1, 2, 3, 4, 5, 6].map((g) => (
                <option key={g} value={String(g)}>{g}학년</option>
              ))}
            </Select>
            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={isSubmitting}>
                다음 →
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Step 2 */}
      {step === 2 && exam && (
        <Card padding="md">

          {/* 모드 선택 */}
          {mode === 'choose' && (
            <>
              <h2 className="font-medium text-slate-800 mb-4">채점기준 설정 방식 선택</h2>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <Card
                  interactive
                  padding="md"
                  onClick={() => setMode('rubric')}
                  className="border-2 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors"
                >
                  <div className="mb-3 w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="font-medium text-slate-900 text-sm">채점기준표 파일 업로드</p>
                  <p className="text-xs text-slate-500 mt-1">이미 작성된 채점기준표 PDF가 있는 경우</p>
                </Card>
                <Card
                  interactive
                  padding="md"
                  onClick={() => setMode('generate')}
                  className="border-2 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors"
                >
                  <div className="mb-3 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <p className="font-medium text-slate-900 text-sm">시험지에서 초안 생성</p>
                  <p className="text-xs text-slate-500 mt-1">시험지 PDF만 있으면 Gemini가 채점기준 초안을 자동 생성</p>
                </Card>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>← 이전</Button>
            </>
          )}

          {/* 채점기준표 업로드 or 초안 생성 */}
          {(mode === 'rubric' || mode === 'generate') && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setMode('choose'); setFile(null); setPollingUrl(null); setUploadError('') }}
                >
                  ←
                </Button>
                <h2 className="font-medium text-slate-800">
                  {mode === 'rubric' ? '채점기준표 업로드' : '시험지에서 초안 생성'}
                </h2>
              </div>

              {mode === 'generate' && !isExtracting && !extractFailed && (
                <div className="flex items-center gap-2 mb-4 p-3 bg-indigo-50 rounded-xl">
                  <span className="text-sm text-slate-700">문항 범위:</span>
                  <Input
                    type="number"
                    min={1}
                    value={qFrom}
                    onChange={e => setQFrom(Number(e.target.value))}
                    className="w-16 text-center"
                  />
                  <span className="text-sm text-slate-500">번 ~</span>
                  <Input
                    type="number"
                    min={qFrom}
                    value={qTo}
                    onChange={e => setQTo(Number(e.target.value))}
                    className="w-16 text-center"
                  />
                  <span className="text-sm text-slate-700">번</span>
                  <span className="text-xs text-slate-400">(하위 문항 포함)</span>
                </div>
              )}

              {!isExtracting && !extractFailed && (
                <>
                  <FileDropzone
                    accept=".pdf,application/pdf"
                    value={file}
                    onChange={setFile}
                    hint="PDF 지원"
                  />
                  {uploadError && <p className="text-xs text-rose-600 mt-2">{uploadError}</p>}
                  <div className="flex justify-between mt-4">
                    <Button variant="secondary" size="sm" onClick={() => setStep(1)}>← 이전</Button>
                    <Button
                      variant="primary"
                      onClick={handleUpload}
                      disabled={!file || uploading}
                      loading={uploading}
                    >
                      {uploading ? '업로드 중...' : mode === 'rubric' ? '업로드 및 추출' : '업로드 및 초안 생성'}
                    </Button>
                  </div>
                </>
              )}

              {isExtracting && (
                <div className="text-center py-10">
                  <Spinner size="lg" tone="primary" className="mx-auto mb-4" />
                  <p className="text-slate-700 font-medium">
                    {mode === 'rubric' ? 'Gemini가 채점기준을 추출하고 있습니다...' : 'Gemini가 채점기준 초안을 생성하고 있습니다...'}
                  </p>
                  <p className="text-sm text-slate-400 mt-1">잠시 기다려 주세요. {mode === 'generate' && '(초안 생성은 1~2분 소요될 수 있습니다)'}</p>
                </div>
              )}

              {extractFailed && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700">
                  <p className="font-medium">실패</p>
                  <p className="text-sm mt-1">파일을 다시 확인하고 재시도하세요.</p>
                  <Button
                    variant="danger"
                    size="sm"
                    className="mt-3"
                    onClick={() => { setPollingUrl(null); setFile(null); setUploading(false) }}
                  >
                    다시 시도
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <Card padding="md">
          <h2 className="font-medium text-slate-800 mb-4">문항 확인 및 수정</h2>
          <p className="text-sm text-slate-500 mb-4">추출된 {questions.length}개 문항을 확인하고 필요시 수정하세요.</p>
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {questions.map((q, idx) => (
              <div key={q.id} className="border border-slate-100 rounded-xl p-4">
                <div className="flex gap-3 mb-2">
                  <Input
                    label="문항 번호"
                    className="w-16 text-center"
                    value={q.number}
                    onChange={(e) => handleUpdateQuestion(idx, 'number', e.target.value)}
                  />
                  <Input
                    type="number"
                    label="배점"
                    min={0}
                    className="w-16 text-center"
                    value={q.max_score}
                    onChange={(e) => handleUpdateQuestion(idx, 'max_score', Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-0.5">모범 답안</label>
                  <Textarea
                    rows={2}
                    value={q.model_answer || ''}
                    onChange={(e) => handleUpdateQuestion(idx, 'model_answer', e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-4">
            <Button variant="primary" onClick={handleFinish}>
              완료 →
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
