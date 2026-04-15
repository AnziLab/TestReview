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
  const [viewMode, setViewMode] = useState<'edit' | 'all'>('edit')

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

  if (viewMode === 'all') {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white flex-shrink-0">
          <h2 className="font-semibold text-gray-900">채점기준표 전체 보기</h2>
          <button
            onClick={() => setViewMode('edit')}
            className="text-sm border border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded-lg"
          >
            편집 모드로
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-300 px-3 py-2 text-left font-medium text-gray-600 w-16">번호</th>
                <th className="border border-gray-300 px-3 py-2 text-center font-medium text-gray-600 w-14">배점</th>
                <th className="border border-gray-300 px-3 py-2 text-left font-medium text-gray-600 w-1/3">모범답안</th>
                <th className="border border-gray-300 px-3 py-2 text-left font-medium text-gray-600">채점기준</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <tr key={q.id} className="hover:bg-blue-50/30">
                  <td className="border border-gray-300 px-3 py-2 font-medium text-gray-800 align-top">{q.number}</td>
                  <td className="border border-gray-300 px-3 py-2 text-center text-gray-700 align-top">{q.max_score}</td>
                  <td className="border border-gray-300 px-3 py-2 text-gray-700 align-top whitespace-pre-wrap">{q.model_answer || '-'}</td>
                  <td className="border border-gray-300 px-3 py-2 align-top">
                    {(q.rubric_json?.criteria ?? []).length > 0 ? (
                      <ul className="space-y-0.5">
                        {q.rubric_json.criteria.map((c, i) => (
                          <li key={i} className="flex gap-2 text-gray-700">
                            <span className="text-blue-600 font-medium flex-shrink-0">{c.points}점</span>
                            <span>{c.description}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
                    {q.rubric_json?.notes && (
                      <p className="text-xs text-gray-400 mt-1 italic">{q.rubric_json.notes}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar — fixed height, scrolls independently */}
      <div className="w-48 border-r border-gray-200 bg-white flex-shrink-0 flex flex-col">
        <div className="p-3 border-b border-gray-200 space-y-1 flex-shrink-0">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500">문항 목록</p>
            <button
              onClick={() => setViewMode('all')}
              className="text-xs text-blue-600 hover:underline"
            >
              전체 보기
            </button>
          </div>
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
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">문항 {activeQuestion.number}</h2>
                <p className="text-sm text-gray-500">배점: {activeQuestion.max_score}점</p>
              </div>
            </div>

            {/* 시험지 업로드 (문항 맥락) */}
            <ExamPaperUploader examId={numericId} hasContext={!!activeQuestion.question_text} onDone={mutate} />

            {/* 문항 맥락 표시 */}
            {activeQuestion.question_text && (
              <details className="mb-4">
                <summary className="cursor-pointer text-sm font-medium text-gray-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 hover:bg-blue-100">
                  문항 맥락 보기 (지문+질문)
                </summary>
                <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{activeQuestion.question_text}</pre>
                </div>
              </details>
            )}

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
                  } catch { /* ignore */ }
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

// ── 시험지 업로드 컴포넌트 ─────────────────────────────────────────────────

function ExamPaperUploader({ examId, hasContext, onDone }: {
  examId: number
  hasContext: boolean
  onDone: () => void
}) {
  const paperRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(9)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [pollingUrl, setPollingUrl] = useState<string | null>(null)

  const { data: status } = usePolling<{ status: string }>(
    pollingUrl,
    2000,
    (d) => {
      if (d.status === 'done') { onDone(); setPollingUrl(null); setOpen(false); return true }
      if (d.status === 'failed') { setError('추출 실패. 다시 시도해주세요.'); setPollingUrl(null); return true }
      return false
    }
  )

  const isExtracting = !!pollingUrl && status?.status === 'processing'

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', f)
      const { apiFetch } = await import('@/lib/api/client')
      await apiFetch(`/exams/${examId}/exam-paper?question_from=${from}&question_to=${to}`, {
        method: 'POST',
        body: form,
        skipContentType: true,
      } as Parameters<typeof apiFetch>[1])
      setPollingUrl(`/exams/${examId}/exam-paper-status`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드 실패')
    } finally {
      setUploading(false)
      if (paperRef.current) paperRef.current.value = ''
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`mb-4 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
          hasContext
            ? 'border-blue-200 text-blue-600 hover:bg-blue-50'
            : 'border-orange-200 text-orange-600 hover:bg-orange-50'
        }`}
      >
        {hasContext ? '시험지 재업로드' : '⚠ 시험지 업로드 (문항 맥락 없음)'}
      </button>
    )
  }

  return (
    <div className="mb-4 bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-gray-800">시험지 업로드</p>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-xs">닫기</button>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        시험지 PDF를 올리면 Gemini가 지문과 문항 텍스트를 추출해 채점기준 정제 시 활용합니다.
      </p>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm text-gray-600">문항 범위:</span>
        <input type="number" min={1} value={from} onChange={e => setFrom(Number(e.target.value))}
          className="border border-gray-300 rounded px-2 py-1 w-16 text-sm text-center" />
        <span className="text-sm text-gray-400">번 ~</span>
        <input type="number" min={from} value={to} onChange={e => setTo(Number(e.target.value))}
          className="border border-gray-300 rounded px-2 py-1 w-16 text-sm text-center" />
        <span className="text-sm text-gray-600">번</span>
        <span className="text-xs text-gray-400">(하위 문항 포함)</span>
      </div>
      {isExtracting ? (
        <div className="flex items-center gap-2 text-sm text-blue-600">
          <div className="h-4 w-4 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
          문항 텍스트 추출 중...
        </div>
      ) : (
        <>
          <button
            onClick={() => paperRef.current?.click()}
            disabled={uploading}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {uploading ? '업로드 중...' : 'PDF 선택 및 업로드'}
          </button>
          <input ref={paperRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleUpload} />
        </>
      )}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}
