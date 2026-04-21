'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useForm } from 'react-hook-form'
import { meApi } from '@/lib/api/exams'
import { useAuth } from '@/lib/context/AuthContext'
import { apiFetch } from '@/lib/api/client'
import { Button, Card, Input, Modal, Spinner, Textarea, useConfirm, useToast } from '@/components/ui'

interface FormData {
  api_key: string
}

export default function ApiKeySettingsPage() {
  const { data, isLoading, mutate } = useSWR('me/api-key', () => meApi.getApiKey())
  const { refreshUser } = useAuth()
  const confirm = useConfirm()
  const toast = useToast()
  const [testing, setTesting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<FormData>()

  const onSubmit = async (formData: FormData) => {
    try {
      await meApi.setApiKey(formData.api_key)
      reset()
      await Promise.all([mutate(), refreshUser()])
      toast('API 키가 저장되었습니다.', 'success')
    } catch (e) {
      setError('api_key', { message: e instanceof Error ? e.message : '저장 실패' })
    }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      const res = await meApi.testApiKey()
      if (res.success) {
        toast('키가 유효합니다.', 'success')
      } else {
        toast(`테스트 실패: ${res.message}`, 'danger')
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : '테스트 실패', 'danger')
    } finally {
      setTesting(false)
    }
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'API 키 삭제',
      description: '등록된 API 키를 삭제하시겠습니까?',
      tone: 'danger',
      confirmLabel: '삭제',
    })
    if (!ok) return
    setDeleting(true)
    try {
      await meApi.deleteApiKey()
      mutate()
      toast('API 키가 삭제되었습니다.', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : '삭제 실패', 'danger')
    } finally {
      setDeleting(false)
    }
  }

  const [showGuide, setShowGuide] = useState(false)

  return (
    <div className="p-6 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Gemini API 키 설정</h1>
        <Button variant="secondary" size="sm" onClick={() => setShowGuide(true)}>
          API 키 발급 안내
        </Button>
      </div>

      <ApiKeyGuideModal open={showGuide} onClose={() => setShowGuide(false)} />

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          <Card className="mb-4">
            <h2 className="font-medium text-slate-800 mb-3">현재 키</h2>
            {data?.has_api_key ? (
              <div className="flex items-center gap-3">
                <code className="bg-slate-100 px-3 py-1.5 rounded-lg text-sm text-slate-700 flex-1 font-mono">
                  {data.masked_key || '••••••••••••••••••••••••••••••••••••••••'}
                </code>
                <Button variant="secondary" onClick={handleTest} loading={testing}>
                  키 테스트
                </Button>
                <Button variant="danger" onClick={handleDelete} loading={deleting}>
                  삭제
                </Button>
              </div>
            ) : (
              <p className="text-slate-500 text-sm">등록된 API 키가 없습니다.</p>
            )}
          </Card>

          <Card className="mb-4">
            <h2 className="font-medium text-slate-800 mb-3">{data?.has_api_key ? '키 업데이트' : '키 등록'}</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
              <Input
                label="API 키"
                type="password"
                placeholder="AIzaSy..."
                error={errors.api_key?.message}
                {...register('api_key', { required: 'API 키를 입력하세요.' })}
              />
              <Button type="submit" loading={isSubmitting}>저장</Button>
            </form>
          </Card>

          <PromptSettings />
          <UpdateChecker />
        </>
      )}
    </div>
  )
}

function PromptSettings() {
  const { user, refreshUser } = useAuth()
  const toast = useToast()
  const [grading, setGrading] = useState(user?.grading_extra_instructions ?? '')
  const [clustering, setClustering] = useState(user?.clustering_extra_instructions ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiFetch('/me/profile', {
        method: 'PUT',
        body: JSON.stringify({
          grading_extra_instructions: grading || null,
          clustering_extra_instructions: clustering || null,
        }),
      })
      await refreshUser()
      toast('저장되었습니다.', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : '저장 실패', 'danger')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <h2 className="font-medium text-slate-800 mb-1">AI 채점 추가 지시사항</h2>
      <p className="text-xs text-slate-500 mb-4">
        모든 문항 채점/정제 시 기본 프롬프트에 추가됩니다. 과목 특성이나 특별 규칙을 입력하세요.
      </p>

      <div className="space-y-4">
        <Textarea
          label="채점 추가 지시사항"
          hint="일괄채점·문항별 재채점에 적용"
          rows={3}
          placeholder="예) 이 시험은 영어 과목으로, 문항에서 영어로 쓰라고 한 경우 반드시 영어로만 답해야 합니다."
          value={grading}
          onChange={(e) => setGrading(e.target.value)}
        />
        <Textarea
          label="채점기준 정제 추가 지시사항"
          hint="클러스터링에 적용"
          rows={3}
          placeholder="예) 수학 문항으로, 풀이 과정이 맞아도 최종 답이 틀리면 오답입니다."
          value={clustering}
          onChange={(e) => setClustering(e.target.value)}
        />
      </div>

      <div className="mt-4">
        <Button onClick={handleSave} loading={saving}>저장</Button>
      </div>
    </Card>
  )
}

interface UpdateInfo {
  update_available: boolean
  current_version?: string
  current_commit?: string
  latest_version?: string
  latest_commit?: string
  latest_date?: string
  latest_message?: string
  changelog?: string
  error?: string
}

function UpdateChecker() {
  const toast = useToast()
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [info, setInfo] = useState<UpdateInfo | null>(null)

  const { data: versionData } = useSWR('system/version',
    () => apiFetch<{ version: string; commit: string }>('/system/version')
  )

  const handleCheck = async () => {
    setChecking(true)
    try {
      const data = await apiFetch<UpdateInfo>('/system/update-check')
      setInfo(data)
      if (data.error) toast(`확인 실패: ${data.error}`, 'danger')
      else if (!data.update_available) toast('최신 버전입니다.', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : '확인 실패', 'danger')
    } finally {
      setChecking(false)
    }
  }

  const handleUpdate = async () => {
    setUpdating(true)
    try {
      const result = await apiFetch<{ success: boolean; message: string; restart_required: boolean }>(
        '/system/update', { method: 'POST' }
      )
      if (result.success) {
        toast('업데이트 완료! 앱을 재시작해주세요.', 'success')
        setInfo(null)
      } else {
        toast(result.message, 'danger')
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : '업데이트 실패', 'danger')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <Card className="mt-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-medium text-slate-800">앱 업데이트</h2>
          {versionData && (
            <p className="text-xs text-slate-400 mt-0.5">
              현재 버전 {versionData.version} ({versionData.commit})
            </p>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={handleCheck} loading={checking}>
          업데이트 확인
        </Button>
      </div>

      {info && !info.error && (
        <div className={`rounded-xl p-4 ${info.update_available ? 'bg-indigo-50 border border-indigo-200' : 'bg-emerald-50 border border-emerald-200'}`}>
          {info.update_available ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-indigo-800">
                    새 버전 {info.latest_version} 출시 ({info.latest_date})
                  </p>
                  <p className="text-xs text-indigo-600 mt-0.5">{info.latest_message}</p>
                </div>
                <Button size="sm" onClick={handleUpdate} loading={updating}>
                  {updating ? '업데이트 중...' : '지금 업데이트'}
                </Button>
              </div>
              {info.changelog && (
                <details className="mt-2">
                  <summary className="text-xs text-indigo-600 cursor-pointer hover:underline">변경 내용 보기</summary>
                  <pre className="text-xs text-slate-600 mt-2 whitespace-pre-wrap font-sans">{info.changelog}</pre>
                </details>
              )}
              <p className="text-xs text-indigo-500 mt-2">
                ※ 업데이트 후 앱을 재시작해야 반영됩니다. 데이터는 유지됩니다.
              </p>
            </>
          ) : (
            <p className="text-sm text-emerald-700 font-medium">✓ 최신 버전입니다.</p>
          )}
        </div>
      )}
    </Card>
  )
}

function ApiKeyGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Gemini API 키 발급 방법" footer={
      <Button variant="secondary" onClick={onClose}>닫기</Button>
    }>
      <ol className="space-y-4 text-sm text-slate-700">
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">1</span>
          <div>
            <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer"
              className="text-indigo-600 font-medium hover:underline">Google AI Studio</a>에 접속하여 Google 계정으로 로그인합니다.
          </div>
        </li>
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">2</span>
          <div>왼쪽 메뉴에서 <strong>Get API Key</strong>를 클릭합니다.</div>
        </li>
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">3</span>
          <div><strong>Create API key</strong> 버튼을 클릭하고, 프로젝트를 선택한 뒤 키를 생성합니다.</div>
        </li>
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">4</span>
          <div>생성된 키(<code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">AIzaSy...</code>)를 복사하여 이 페이지에 붙여넣으세요.</div>
        </li>
      </ol>
      <div className="mt-4 p-3 bg-emerald-50 rounded-xl">
        <p className="text-xs text-emerald-700">무료 티어로 충분히 사용 가능합니다. API 키는 본인 컴퓨터에만 암호화되어 저장됩니다.</p>
      </div>
    </Modal>
  )
}
