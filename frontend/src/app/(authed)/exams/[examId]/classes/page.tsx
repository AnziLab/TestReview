'use client'

import { use, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { classesApi } from '@/lib/api/exams'
import { usePolling } from '@/lib/hooks/usePolling'
import type { Class } from '@/lib/types'

const ocrStatusLabels: Record<Class['ocr_status'], string> = {
  pending: '대기 중',
  processing: 'OCR 처리 중',
  done: '완료',
  failed: '실패',
}

const ocrStatusColors: Record<Class['ocr_status'], string> = {
  pending: 'text-gray-500',
  processing: 'text-blue-600',
  done: 'text-green-600',
  failed: 'text-red-600',
}

function ClassCard({
  cls,
  examId,
  onRefresh,
}: {
  cls: Class
  examId: string
  onRefresh: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const isProcessing = cls.ocr_status === 'pending' || cls.ocr_status === 'processing'
  const { data: statusData } = usePolling<{
    ocr_status: Class['ocr_status']
    students_count?: number
    students_processed?: number
    total_estimated?: number
  }>(
    isProcessing ? `/classes/${cls.id}/ocr-status` : null,
    2000,
    (d) => {
      if (d.ocr_status === 'done' || d.ocr_status === 'failed') {
        onRefresh()
        return true
      }
      return false
    }
  )

  const currentStatus = statusData?.ocr_status ?? cls.ocr_status
  const processed = statusData?.students_processed ?? 0
  const total = statusData?.total_estimated
  const pct = total ? Math.min(100, Math.round((processed / total) * 100)) : null

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">{cls.name}</h3>
          <p className="text-sm text-gray-500">
            {cls.scan_mode === 'single' ? '단면' : '양면'} · {cls.source_pdf_filename || ''}
          </p>
        </div>
        <span className={`text-sm font-medium ${ocrStatusColors[currentStatus]}`}>
          {ocrStatusLabels[currentStatus]}
        </span>
      </div>

      {(currentStatus === 'pending' || currentStatus === 'processing') && (
        <div className="mb-3 space-y-1">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: pct != null ? `${pct}%` : '15%' }}
            />
          </div>
          <p className="text-xs text-gray-500">
            {total
              ? `${processed} / ${total}명 처리 중 (${pct}%)`
              : 'OCR 준비 중...'}
          </p>
        </div>
      )}

      {cls.ocr_error && (
        <p className="text-sm text-red-600 mb-2">{cls.ocr_error}</p>
      )}

      <div className="flex items-center justify-between">
        <Link
          href={`/exams/${examId}/classes/${cls.id}`}
          className="text-sm text-blue-600 hover:underline"
        >
          학생 목록 보기 →
        </Link>
        <button
          onClick={async () => {
            if (!confirm(`"${cls.name}" 반을 삭제하시겠습니까? 학생 답안도 모두 삭제됩니다.`)) return
            setDeleting(true)
            try {
              await classesApi.delete(cls.id)
              onRefresh()
            } catch (e) {
              alert(e instanceof Error ? e.message : '삭제 실패')
              setDeleting(false)
            }
          }}
          disabled={deleting}
          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
        >
          {deleting ? '삭제 중...' : '삭제'}
        </button>
      </div>
    </div>
  )
}

interface AddClassModalProps {
  examId: string
  onClose: () => void
  onAdded: () => void
}

function AddClassModal({ examId, onClose, onAdded }: AddClassModalProps) {
  const [step, setStep] = useState<'form' | 'confirm'>('form')
  const [name, setName] = useState('')
  const [scanMode, setScanMode] = useState<'single' | 'double'>('single')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) { setError('파일을 선택하세요.'); return }
    if (!name.trim()) { setError('반 이름을 입력하세요.'); return }
    setError('')
    setStep('confirm')
  }

  const handleConfirm = async () => {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      await classesApi.create(Number(examId), { name, scan_mode: scanMode }, file)
      onAdded()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드 실패')
      setStep('form')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        {step === 'form' ? (
          <>
            <h2 className="font-semibold text-gray-900 text-lg mb-4">반 추가</h2>
            <form onSubmit={handleNext} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">반 이름 *</label>
                <input
                  className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="예: 3학년 2반"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">스캔 방식</label>
                <div className="flex gap-4">
                  {(['single', 'double'] as const).map((mode) => (
                    <label key={mode} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="scanMode" checked={scanMode === mode}
                        onChange={() => setScanMode(mode)} className="accent-blue-600" />
                      <span className="text-sm">{mode === 'single' ? '단면 (학생 1명 = 1페이지)' : '양면 (학생 1명 = 2페이지)'}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">PDF 파일 *</label>
                <input type="file" accept=".pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-gray-600" />
                {file && <p className="text-xs text-blue-600 mt-1">선택됨: {file.name}</p>}
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={onClose}
                  className="border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm">
                  취소
                </button>
                <button type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">
                  다음 →
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h2 className="font-semibold text-gray-900 text-lg mb-4">OCR 시작 확인</h2>
            <div className="space-y-3 mb-6">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">반 이름</span>
                  <span className="font-medium">{name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">스캔 방식</span>
                  <span className="font-medium">{scanMode === 'single' ? '단면' : '양면'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">파일</span>
                  <span className="font-medium text-blue-700">{file?.name}</span>
                </div>
              </div>
              <p className="text-sm text-gray-600">
                업로드 후 Gemini가 각 학생의 답안을 자동으로 인식합니다. 파일이 맞는지 확인해주세요.
              </p>
            </div>
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <div className="flex justify-between">
              <button onClick={() => setStep('form')}
                className="border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm">
                ← 수정
              </button>
              <button onClick={handleConfirm} disabled={uploading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">
                {uploading ? '업로드 중...' : 'OCR 시작'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function ClassesPage({
  params,
}: {
  params: Promise<{ examId: string }>
}) {
  const { examId } = use(params)
  const [showModal, setShowModal] = useState(false)
  const { data: classes, isLoading, error, mutate } = useSWR(
    `exams/${examId}/classes`,
    () => classesApi.list(Number(examId))
  )

  return (
    <div className="p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">학생 답안 업로드</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          반 추가
        </button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          반 목록을 불러오는데 실패했습니다.
        </div>
      )}

      {!isLoading && !error && classes && classes.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-10 text-center">
          <p className="text-gray-500 mb-4">등록된 반이 없습니다.</p>
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            첫 번째 반 추가
          </button>
        </div>
      )}

      {classes && classes.length > 0 && (
        <div className="grid gap-4">
          {classes.map((cls) => (
            <ClassCard key={cls.id} cls={cls} examId={examId} onRefresh={() => mutate()} />
          ))}
        </div>
      )}

      {showModal && (
        <AddClassModal
          examId={examId}
          onClose={() => setShowModal(false)}
          onAdded={() => mutate()}
        />
      )}
    </div>
  )
}
