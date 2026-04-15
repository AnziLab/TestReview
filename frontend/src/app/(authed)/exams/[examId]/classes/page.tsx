'use client'

import { use, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { classesApi } from '@/lib/api/exams'
import { usePolling } from '@/lib/hooks/usePolling'
import type { Class } from '@/lib/types'
import {
  Badge, Button, Card, EmptyState, Modal, ProgressBar, Spinner,
  FileDropzone, Input, useConfirm, useToast,
} from '@/components/ui'

const ocrStatusLabels: Record<Class['ocr_status'], string> = {
  pending: '대기 중',
  processing: 'OCR 처리 중',
  done: '완료',
  failed: '실패',
}

const ocrStatusTones: Record<Class['ocr_status'], 'neutral' | 'info' | 'success' | 'danger'> = {
  pending: 'neutral',
  processing: 'info',
  done: 'success',
  failed: 'danger',
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
  const confirm = useConfirm()
  const toast = useToast()
  const [deleting, setDeleting] = useState(false)
  const isProcessing = cls.ocr_status === 'pending' || cls.ocr_status === 'processing'
  const { data: statusData } = usePolling<{
    ocr_status: Class['ocr_status']
    students_count?: number
    students_processed?: number
    total_estimated?: number
  }>(
    isProcessing ? `/classes/${cls.id}/ocr-status` : null,
    500,
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

  return (
    <Card>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-slate-900">{cls.name}</h3>
          <p className="text-sm text-slate-500">
            {cls.scan_mode === 'single' ? '단면' : '양면'} · {cls.source_pdf_filename || ''}
          </p>
        </div>
        <Badge tone={ocrStatusTones[currentStatus]}>
          {ocrStatusLabels[currentStatus]}
        </Badge>
      </div>

      {(currentStatus === 'pending' || currentStatus === 'processing') && (
        <div className="mb-3 space-y-1">
          <ProgressBar
            value={processed}
            max={total ?? undefined}
            label={
              total
                ? processed < total
                  ? `${processed + 1}번째 학생 처리 중 (${processed}/${total}명 완료)`
                  : `${total}/${total}명 완료`
                : 'OCR 준비 중...'
            }
          />
        </div>
      )}

      {cls.ocr_error && (
        <p className="text-sm text-rose-600 mb-2">{cls.ocr_error}</p>
      )}

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
        <Link
          href={`/exams/${examId}/classes/${cls.id}`}
          className="text-sm text-indigo-600 hover:underline"
        >
          학생 목록 보기 →
        </Link>
        <Button
          variant="danger"
          size="sm"
          loading={deleting}
          onClick={async () => {
            const ok = await confirm({
              title: `"${cls.name}" 반 삭제`,
              description: '학생 답안도 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.',
              tone: 'danger',
              confirmLabel: '삭제',
            })
            if (!ok) return
            setDeleting(true)
            try {
              await classesApi.delete(cls.id)
              onRefresh()
              toast('반이 삭제되었습니다.', 'success')
            } catch (e) {
              toast(e instanceof Error ? e.message : '삭제 실패', 'danger')
              setDeleting(false)
            }
          }}
        >
          삭제
        </Button>
      </div>
    </Card>
  )
}

interface AddClassModalProps {
  examId: string
  open: boolean
  onClose: () => void
  onAdded: () => void
}

function AddClassModal({ examId, open, onClose, onAdded }: AddClassModalProps) {
  const toast = useToast()
  const [step, setStep] = useState<'form' | 'confirm'>('form')
  const [name, setName] = useState('')
  const [scanMode, setScanMode] = useState<'single' | 'double'>('single')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const handleClose = () => {
    setStep('form')
    setName('')
    setScanMode('single')
    setFile(null)
    setError('')
    onClose()
  }

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
      handleClose()
      toast('반이 추가되었습니다. OCR 처리가 시작됩니다.', 'success')
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드 실패')
      setStep('form')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={step === 'form' ? '반 추가' : 'OCR 시작 확인'}
      footer={
        step === 'form' ? (
          <>
            <Button variant="secondary" size="sm" onClick={handleClose}>취소</Button>
            <Button size="sm" onClick={(e) => handleNext(e as React.FormEvent)}>다음 →</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" size="sm" onClick={() => setStep('form')}>← 수정</Button>
            <Button size="sm" loading={uploading} onClick={handleConfirm}>OCR 시작</Button>
          </>
        )
      }
    >
      {step === 'form' ? (
        <form onSubmit={handleNext} className="space-y-4">
          <Input
            label="반 이름 *"
            placeholder="예: 3학년 2반"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-2">스캔 방식</label>
            <div className="flex gap-4">
              {(['single', 'double'] as const).map((mode) => (
                <label key={mode} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="scanMode" checked={scanMode === mode}
                    onChange={() => setScanMode(mode)} className="accent-indigo-500" />
                  <span className="text-sm text-slate-700">{mode === 'single' ? '단면 (학생 1명 = 1페이지)' : '양면 (학생 1명 = 2페이지)'}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">PDF 파일 *</label>
            <FileDropzone
              accept=".pdf"
              value={file}
              onChange={setFile}
              hint="PDF 파일을 클릭하거나 드래그하세요"
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </form>
      ) : (
        <div className="space-y-3">
          <div className="bg-slate-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">반 이름</span>
              <span className="font-medium text-slate-800">{name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">스캔 방식</span>
              <span className="font-medium text-slate-800">{scanMode === 'single' ? '단면' : '양면'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">파일</span>
              <span className="font-medium text-indigo-600">{file?.name}</span>
            </div>
          </div>
          <p className="text-sm text-slate-600">
            업로드 후 Gemini가 각 학생의 답안을 자동으로 인식합니다. 파일이 맞는지 확인해주세요.
          </p>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      )}
    </Modal>
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
        <h1 className="text-xl font-bold text-slate-900">학생 답안 업로드</h1>
        <Button onClick={() => setShowModal(true)}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          반 추가
        </Button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700">
          반 목록을 불러오는데 실패했습니다.
        </div>
      )}

      {!isLoading && !error && classes && classes.length === 0 && (
        <EmptyState
          title="등록된 반이 없습니다."
          description="학생 답안 PDF를 업로드하여 OCR 처리를 시작하세요."
          action={
            <Button onClick={() => setShowModal(true)}>첫 번째 반 추가</Button>
          }
        />
      )}

      {classes && classes.length > 0 && (
        <div className="grid gap-4">
          {classes.map((cls) => (
            <ClassCard key={cls.id} cls={cls} examId={examId} onRefresh={() => mutate()} />
          ))}
        </div>
      )}

      <AddClassModal
        examId={examId}
        open={showModal}
        onClose={() => setShowModal(false)}
        onAdded={() => mutate()}
      />
    </div>
  )
}
