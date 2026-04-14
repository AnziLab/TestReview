'use client'

import { use, useRef, useState } from 'react'
import useSWR from 'swr'
import { examsApi, questionsApi } from '@/lib/api/exams'
import { usePolling } from '@/lib/hooks/usePolling'
import { RubricEditor } from '@/components/RubricEditor'
import type { Question } from '@/lib/types'

const emptyRubric = { criteria: [], notes: '' }

export default function RubricPage({
  params,
}: {
  params: Promise<{ examId: string }>
}) {
  const { examId } = use(params)
  const numericId = Number(examId)

  const { data: questions, isLoading, error, mutate } = useSWR(
    `exams/${examId}/questions`,
    () => questionsApi.list(numericId)
  )
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // File upload state
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [pollingUrl, setPollingUrl] = useState<string | null>(null)

  const { data: extractionStatus, error: pollingError } = usePolling<{
    status: 'pending' | 'processing' | 'done' | 'failed'
    questions?: Question[]
  }>(
    pollingUrl,
    2000,
    (d) => {
      if (d.status === 'done' || d.status === 'failed') {
        if (d.status === 'done') {
          mutate() // reload questions from server
        }
        setPollingUrl(null)
        return true
      }
      return false
    }
  )

  const isExtracting = pollingUrl && (!extractionStatus || extractionStatus.status === 'pending' || extractionStatus.status === 'processing')
  const extractFailed = (extractionStatus?.status === 'failed') || pollingError

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      await examsApi.uploadRubricFile(numericId, file)
      setPollingUrl(`/exams/${numericId}/rubric-extraction`)
      setUploading(false)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '업로드 실패')
      setUploading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="h-8 w-8 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          문항을 불러오는데 실패했습니다: {error.message}
        </div>
      </div>
    )
  }

  // 문항 없음 → 업로드 화면
  if (!questions || questions.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto w-full">
        <h2 className="text-xl font-bold text-gray-900 mb-2">채점기준표 업로드</h2>
        <p className="text-sm text-gray-500 mb-6">PDF 파일을 업로드하면 Gemini가 문항을 자동으로 추출합니다.</p>

        {isExtracting ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-10 text-center">
            <div className="h-10 w-10 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin mx-auto mb-4" />
            <p className="text-gray-700 font-medium">Gemini가 문항을 추출하고 있습니다...</p>
            <p className="text-sm text-gray-400 mt-1">잠시 기다려 주세요.</p>
          </div>
        ) : extractFailed ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <p className="font-medium text-red-700">추출 실패</p>
            <p className="text-sm text-red-600 mt-1">파일을 다시 확인하고 재시도해주세요.</p>
            <button
              onClick={() => { setPollingUrl(null); setFile(null) }}
              className="mt-3 border border-red-300 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm"
            >
              다시 시도
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors mb-4"
            >
              <svg className="w-10 h-10 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {file ? (
                <p className="text-sm font-medium text-blue-700">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm text-gray-600">클릭하여 파일 선택</p>
                  <p className="text-xs text-gray-400 mt-1">PDF 지원</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f) }}
              />
            </div>
            {uploadError && <p className="text-sm text-red-600 mb-3">{uploadError}</p>}
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg disabled:opacity-50 font-medium"
            >
              {uploading ? '업로드 중...' : '업로드 및 추출 시작'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // 문항 있음 → 기존 에디터 + 상단 재업로드 옵션
  const activeQuestion = selectedId ? questions.find((q) => q.id === selectedId) : questions[0]

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar — fixed height, scrolls independently */}
      <div className="w-48 border-r border-gray-200 bg-white flex-shrink-0 flex flex-col">
        <div className="p-3 border-b border-gray-200 space-y-1 flex-shrink-0">
          <p className="text-xs font-medium text-gray-500">문항 목록</p>
          <button
            onClick={() => fileRef.current?.click()}
            className="text-xs text-blue-600 hover:underline"
          >
            파일 재업로드
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              setFile(f)
              setUploading(true)
              try {
                await examsApi.uploadRubricFile(numericId, f)
                setPollingUrl(`/exams/${numericId}/rubric-extraction`)
              } catch (err) {
                setUploadError(err instanceof Error ? err.message : '업로드 실패')
              } finally {
                setUploading(false)
              }
            }}
          />
        </div>

        {isExtracting && (
          <div className="p-3 text-xs text-blue-600 flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin flex-shrink-0" />
            추출 중...
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
        {questions.map((q) => (
          <button
            key={q.id}
            onClick={() => setSelectedId(q.id)}
            className={`w-full text-left px-4 py-3 text-sm border-b border-gray-100 transition-colors ${
              (selectedId ? selectedId === q.id : q === questions[0])
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'hover:bg-gray-50 text-gray-700'
            }`}
          >
            <span className="block font-medium">문항 {q.number}</span>
            <span className="text-xs text-gray-400">{q.max_score}점</span>
          </button>
        ))}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeQuestion && (
          <div className="max-w-2xl">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">문항 {activeQuestion.number}</h2>
              <p className="text-sm text-gray-500">배점: {activeQuestion.max_score}점</p>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-4">
              <label className="text-sm font-medium text-gray-700 block mb-1">모범 답안</label>
              <textarea
                key={activeQuestion.id}
                className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                rows={4}
                defaultValue={activeQuestion.model_answer || ''}
                onBlur={async (e) => {
                  try {
                    await questionsApi.update(activeQuestion.id, { model_answer: e.target.value })
                  } catch {
                    // ignore
                  }
                }}
                placeholder="모범 답안을 입력하세요"
              />
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <RubricEditor
                key={activeQuestion.id}
                questionId={String(activeQuestion.id)}
                initialRubric={activeQuestion.rubric_draft_json ?? activeQuestion.rubric_json ?? emptyRubric}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
