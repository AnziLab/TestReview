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
  const isProcessing = cls.ocr_status === 'pending' || cls.ocr_status === 'processing'
  const { data: statusData } = usePolling<{
    ocr_status: Class['ocr_status']
    students_count?: number
  }>(
    isProcessing ? `/classes/${cls.id}/ocr-status` : null,
    3000,
    (d) => {
      if (d.ocr_status === 'done' || d.ocr_status === 'failed') {
        onRefresh()
        return true
      }
      return false
    }
  )

  const currentStatus = statusData?.ocr_status ?? cls.ocr_status
  const studentsCount = statusData?.students_count

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">{cls.name}</h3>
          <p className="text-sm text-gray-500">
            {cls.scan_mode === 'single' ? '단면' : '양면'} · {cls.student_count ?? 0}명
          </p>
        </div>
        <span className={`text-sm font-medium ${ocrStatusColors[currentStatus]}`}>
          {ocrStatusLabels[currentStatus]}
        </span>
      </div>

      {(currentStatus === 'pending' || currentStatus === 'processing') && (
        <div className="mb-3">
          {studentsCount != null ? (
            <p className="text-xs text-blue-600">{studentsCount}명 처리됨</p>
          ) : (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all duration-500 w-[30%]" />
            </div>
          )}
        </div>
      )}

      {cls.ocr_error && (
        <p className="text-sm text-red-600 mb-2">{cls.ocr_error}</p>
      )}

      <Link
        href={`/exams/${examId}/classes/${cls.id}`}
        className="text-sm text-blue-600 hover:underline"
      >
        학생 목록 보기 →
      </Link>
    </div>
  )
}

interface AddClassModalProps {
  examId: string
  onClose: () => void
  onAdded: () => void
}

function AddClassModal({ examId, onClose, onAdded }: AddClassModalProps) {
  const [name, setName] = useState('')
  const [scanMode, setScanMode] = useState<'single' | 'double'>('single')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) { setError('파일을 선택하세요.'); return }
    if (!name.trim()) { setError('반 이름을 입력하세요.'); return }
    setUploading(true)
    setError('')
    try {
      await classesApi.create(Number(examId), { name, scan_mode: scanMode }, file)
      onAdded()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드 실패')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="font-semibold text-gray-900 text-lg mb-4">반 추가</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
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
                  <input
                    type="radio"
                    name="scanMode"
                    checked={scanMode === mode}
                    onChange={() => setScanMode(mode)}
                    className="accent-blue-600"
                  />
                  <span className="text-sm">{mode === 'single' ? '단면' : '양면'}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">PDF 파일 *</label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-gray-600"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
            >
              {uploading ? '업로드 중...' : '추가'}
            </button>
          </div>
        </form>
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
