'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { examsApi, questionsApi } from '@/lib/api/exams'
import { usePolling } from '@/lib/hooks/usePolling'
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
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [pollingUrl, setPollingUrl] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }

  const handleUpload = async () => {
    if (!exam || !file) return
    setUploading(true)
    setUploadError('')
    try {
      await examsApi.uploadRubricFile(exam.id, file)
      setPollingUrl(`/exams/${exam.id}/rubric-extraction`)
      setUploading(false)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '업로드 실패')
      setUploading(false)
    }
  }

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
      <h1 className="text-2xl font-bold text-gray-900 mb-2">새 시험 만들기</h1>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {([1, 2, 3] as Step[]).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
              s <= step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              {s < step ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : s}
            </div>
            <span className={`text-sm ${s === step ? 'text-blue-700 font-medium' : 'text-gray-400'}`}>
              {s === 1 ? '기본 정보' : s === 2 ? '파일 업로드' : '문항 확인'}
            </span>
            {s < 3 && <div className="w-8 h-px bg-gray-300 mx-1" />}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="font-medium text-gray-800 mb-4">시험 기본 정보</h2>
          <form onSubmit={handleSubmit(onBasicSubmit)} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">시험 제목 *</label>
              <input
                className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="예: 2024년 1학기 중간고사"
                {...register('title', { required: '시험 제목을 입력하세요.' })}
              />
              {errors.title && <p className="text-sm text-red-600 mt-1">{errors.title.message}</p>}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">과목</label>
              <input
                className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="예: 국어"
                {...register('subject')}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">학교 급</label>
              <select
                className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                {...register('school_level')}
              >
                <option value="">선택</option>
                <option value="elementary">초등학교</option>
                <option value="middle">중학교</option>
                <option value="high">고등학교</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">학년</label>
              <select
                className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                {...register('grade')}
              >
                <option value="">선택</option>
                {[1, 2, 3, 4, 5, 6].map((g) => (
                  <option key={g} value={String(g)}>{g}학년</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
              >
                다음 →
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && exam && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="font-medium text-gray-800 mb-2">채점기준표 파일 업로드</h2>
          <p className="text-sm text-gray-500 mb-4">PDF 또는 HWPX 파일을 업로드하면 Gemini가 문항을 자동으로 추출합니다.</p>

          {!isExtracting && !extractFailed && (
            <>
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
              >
                <svg className="w-10 h-10 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                {file ? (
                  <p className="text-sm font-medium text-blue-700">{file.name}</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-600">파일을 클릭하거나 드래그하여 업로드</p>
                    <p className="text-xs text-gray-400 mt-1">PDF 지원</p>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
              {uploadError && <p className="text-sm text-red-600 mt-2">{uploadError}</p>}
              <div className="flex justify-between mt-4">
                <button
                  onClick={() => setStep(1)}
                  className="border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm"
                >
                  ← 이전
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  {uploading ? '업로드 중...' : '업로드 및 추출 시작'}
                </button>
              </div>
            </>
          )}

          {isExtracting && (
            <div className="text-center py-8">
              <svg className="animate-spin h-10 w-10 text-blue-600 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-gray-700 font-medium">Gemini가 문항을 추출하고 있습니다...</p>
              <p className="text-sm text-gray-400 mt-1">잠시 기다려 주세요.</p>
            </div>
          )}

          {extractFailed && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              <p className="font-medium">추출 실패</p>
              <p className="text-sm mt-1">파일을 다시 확인하고 재시도하세요.</p>
              <button
                onClick={() => {
                  setPollingUrl(null)
                  setFile(null)
                  setUploading(false)
                }}
                className="mt-3 border border-red-300 hover:bg-red-100 px-3 py-1.5 rounded-lg text-sm"
              >
                다시 시도
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="font-medium text-gray-800 mb-4">문항 확인 및 수정</h2>
          <p className="text-sm text-gray-500 mb-4">추출된 {questions.length}개 문항을 확인하고 필요시 수정하세요.</p>
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {questions.map((q, idx) => (
              <div key={q.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex gap-3 mb-2">
                  <div className="flex-shrink-0">
                    <label className="text-xs text-gray-500 block mb-0.5">문항 번호</label>
                    <input
                      className="border border-gray-300 rounded px-2 py-1 w-16 text-sm focus:ring-1 focus:ring-blue-500"
                      value={q.number}
                      onChange={(e) => handleUpdateQuestion(idx, 'number', e.target.value)}
                    />
                  </div>
                  <div className="flex-shrink-0">
                    <label className="text-xs text-gray-500 block mb-0.5">배점</label>
                    <input
                      type="number"
                      min={0}
                      className="border border-gray-300 rounded px-2 py-1 w-16 text-sm focus:ring-1 focus:ring-blue-500"
                      value={q.max_score}
                      onChange={(e) => handleUpdateQuestion(idx, 'max_score', Number(e.target.value))}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-0.5">모범 답안</label>
                  <textarea
                    className="border border-gray-300 rounded px-2 py-1 w-full text-sm focus:ring-1 focus:ring-blue-500"
                    rows={2}
                    value={q.model_answer || ''}
                    onChange={(e) => handleUpdateQuestion(idx, 'model_answer', e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-4">
            <button
              onClick={handleFinish}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
            >
              완료 →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
