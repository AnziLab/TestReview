'use client'

import { use, useRef, useState } from 'react'
import useSWR from 'swr'
import { examsApi, questionsApi } from '@/lib/api/exams'
import { usePolling } from '@/lib/hooks/usePolling'
import { RubricEditor } from '@/components/RubricEditor'
import {
  Button, Card, FileDropzone, Modal, SegmentedControl, Spinner, Textarea,
} from '@/components/ui'
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
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [pollingUrl, setPollingUrl] = useState<string | null>(null)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)

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
      setUploadModalOpen(false)
      setFile(null)
      setUploading(false)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '업로드 실패')
      setUploading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Spinner size="lg" tone="primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700">
          문항을 불러오는데 실패했습니다: {error.message}
        </div>
      </div>
    )
  }

  // 문항 없음 → 업로드 화면
  if (!questions || questions.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto w-full">
        <h2 className="text-xl font-bold text-slate-900 mb-2">채점기준표 업로드</h2>
        <p className="text-sm text-slate-500 mb-6">PDF 파일을 업로드하면 Gemini가 문항을 자동으로 추출합니다.</p>

        {isExtracting ? (
          <Card padding="lg">
            <div className="text-center py-4">
              <Spinner size="lg" tone="primary" className="mx-auto mb-4" />
              <p className="text-slate-700 font-medium">Gemini가 문항을 추출하고 있습니다...</p>
              <p className="text-sm text-slate-400 mt-1">잠시 기다려 주세요.</p>
            </div>
          </Card>
        ) : extractFailed ? (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-6">
            <p className="font-medium text-rose-700">추출 실패</p>
            <p className="text-sm text-rose-600 mt-1">파일을 다시 확인하고 재시도해주세요.</p>
            <Button
              variant="danger"
              size="sm"
              className="mt-3"
              onClick={() => { setPollingUrl(null); setFile(null) }}
            >
              다시 시도
            </Button>
          </div>
        ) : (
          <Card padding="md">
            <FileDropzone
              accept=".pdf,application/pdf"
              value={file}
              onChange={setFile}
              hint="PDF 지원"
            />
            {uploadError && <p className="text-xs text-rose-600 mt-3">{uploadError}</p>}
            <Button
              variant="primary"
              className="w-full mt-4"
              onClick={handleUpload}
              disabled={!file || uploading}
              loading={uploading}
            >
              {uploading ? '업로드 중...' : '업로드 및 추출 시작'}
            </Button>
          </Card>
        )}
      </div>
    )
  }

  // 문항 있음 → 기존 에디터 + 상단 재업로드 옵션
  const activeQuestion = selectedId ? questions.find((q) => q.id === selectedId) : questions[0]

  return (
    <>
      {/* 재업로드 Modal */}
      <Modal
        open={uploadModalOpen}
        onClose={() => { setUploadModalOpen(false); setFile(null); setUploadError('') }}
        title="채점기준표 재업로드"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setUploadModalOpen(false); setFile(null); setUploadError('') }}>
              취소
            </Button>
            <Button variant="primary" onClick={handleUpload} disabled={!file || uploading} loading={uploading}>
              {uploading ? '업로드 중...' : '업로드 및 추출'}
            </Button>
          </>
        }
      >
        {isExtracting ? (
          <div className="text-center py-6">
            <Spinner size="lg" tone="primary" className="mx-auto mb-3" />
            <p className="text-slate-700 font-medium">Gemini가 문항을 추출하고 있습니다...</p>
          </div>
        ) : extractFailed ? (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-4">
            <p className="text-sm text-rose-700">추출에 실패했습니다. 파일을 확인하고 다시 시도해주세요.</p>
          </div>
        ) : (
          <>
            <FileDropzone
              accept=".pdf,application/pdf"
              value={file}
              onChange={setFile}
              hint="PDF 지원"
            />
            {uploadError && <p className="text-xs text-rose-600 mt-2">{uploadError}</p>}
          </>
        )}
      </Modal>

      <div className="flex flex-col h-full overflow-hidden">
        {/* Top bar with segmented control */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-white flex-shrink-0">
          <SegmentedControl
            options={[
              { value: 'edit', label: '편집' },
              { value: 'all', label: '전체 보기' },
            ]}
            value={viewMode}
            onChange={setViewMode}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setUploadModalOpen(true)}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            파일 재업로드
          </Button>
        </div>

        {viewMode === 'all' ? (
          <div className="flex-1 overflow-auto p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-3 py-2 text-left font-medium text-slate-600 w-16">번호</th>
                  <th className="px-3 py-2 text-center font-medium text-slate-600 w-14">배점</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 w-1/3">모범답안</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">채점기준</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {questions.map((q) => (
                  <tr key={q.id} className="hover:bg-indigo-50/30">
                    <td className="px-3 py-2 font-medium text-slate-800 align-top">{q.number}</td>
                    <td className="px-3 py-2 text-center text-slate-700 align-top">{q.max_score}</td>
                    <td className="px-3 py-2 text-slate-700 align-top whitespace-pre-wrap">{q.model_answer || '-'}</td>
                    <td className="px-3 py-2 align-top">
                      {(q.rubric_json?.criteria ?? []).length > 0 ? (
                        <ul className="space-y-0.5">
                          {q.rubric_json.criteria.map((c, i) => (
                            <li key={i} className="flex gap-2 text-slate-700">
                              <span className="text-indigo-500 font-medium flex-shrink-0">{c.points}점</span>
                              <span>{c.description}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-slate-400 text-xs">-</span>
                      )}
                      {q.rubric_json?.notes && (
                        <p className="text-xs text-slate-400 mt-1 italic">{q.rubric_json.notes}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <div className="w-48 border-r border-slate-100 bg-white flex-shrink-0 flex flex-col">
              {isExtracting && (
                <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-1.5 text-xs text-indigo-600">
                  <Spinner size="sm" tone="primary" />
                  추출 중...
                </div>
              )}
              <div className="flex-1 overflow-y-auto">
                {questions.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => setSelectedId(q.id)}
                    className={`w-full text-left px-4 py-3 text-sm border-b border-slate-100 transition-colors ${
                      (selectedId ? selectedId === q.id : q === questions[0])
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="block font-medium">문항 {q.number}</span>
                    <span className="text-xs text-slate-400">{q.max_score}점</span>
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
                      <h2 className="text-lg font-semibold text-slate-900">문항 {activeQuestion.number}</h2>
                      <p className="text-sm text-slate-500">배점: {activeQuestion.max_score}점</p>
                    </div>
                  </div>

                  {/* 시험지 업로드 (문항 맥락) */}
                  <ExamPaperUploader examId={numericId} hasContext={!!activeQuestion.question_text} onDone={mutate} />

                  {/* 문항 맥락 표시 */}
                  {activeQuestion.question_text && (
                    <details className="mb-4">
                      <summary className="cursor-pointer text-sm font-medium text-slate-700 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2 hover:bg-indigo-100">
                        문항 맥락 보기 (지문+질문)
                      </summary>
                      <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl p-4">
                        <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">{activeQuestion.question_text}</pre>
                      </div>
                    </details>
                  )}

                  <Card padding="md" className="mb-4">
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">모범 답안</label>
                    <Textarea
                      key={activeQuestion.id}
                      rows={4}
                      defaultValue={activeQuestion.model_answer || ''}
                      onBlur={async (e) => {
                        try {
                          await questionsApi.update(activeQuestion.id, { model_answer: e.target.value })
                        } catch { /* ignore */ }
                      }}
                      placeholder="모범 답안을 입력하세요"
                    />
                  </Card>

                  <Card padding="md">
                    <RubricEditor
                      key={activeQuestion.id}
                      questionId={String(activeQuestion.id)}
                      initialRubric={activeQuestion.rubric_draft_json ?? activeQuestion.rubric_json ?? emptyRubric}
                    />
                  </Card>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
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
      <Button
        variant="ghost"
        size="sm"
        className={`mb-4 ${!hasContext ? 'text-amber-600 hover:bg-amber-50' : ''}`}
        onClick={() => setOpen(true)}
      >
        {hasContext ? '시험지 재업로드' : '⚠ 시험지 업로드 (문항 맥락 없음)'}
      </Button>
    )
  }

  return (
    <Card padding="sm" className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-slate-800">시험지 업로드</p>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>닫기</Button>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        시험지 PDF를 올리면 Gemini가 지문과 문항 텍스트를 추출해 채점기준 정제 시 활용합니다.
      </p>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm text-slate-600">문항 범위:</span>
        <input type="number" min={1} value={from} onChange={e => setFrom(Number(e.target.value))}
          className="border border-slate-200 rounded-[10px] px-2 py-1 w-16 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-100" />
        <span className="text-sm text-slate-400">번 ~</span>
        <input type="number" min={from} value={to} onChange={e => setTo(Number(e.target.value))}
          className="border border-slate-200 rounded-[10px] px-2 py-1 w-16 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-100" />
        <span className="text-sm text-slate-600">번</span>
        <span className="text-xs text-slate-400">(하위 문항 포함)</span>
      </div>
      {isExtracting ? (
        <div className="flex items-center gap-2 text-sm text-indigo-600">
          <Spinner size="sm" tone="primary" />
          문항 텍스트 추출 중...
        </div>
      ) : (
        <>
          <Button
            variant="primary"
            size="sm"
            onClick={() => paperRef.current?.click()}
            disabled={uploading}
            loading={uploading}
          >
            {uploading ? '업로드 중...' : 'PDF 선택 및 업로드'}
          </Button>
          <input ref={paperRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleUpload} />
        </>
      )}
      {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}
    </Card>
  )
}
