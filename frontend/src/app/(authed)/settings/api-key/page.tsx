'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useForm } from 'react-hook-form'
import { meApi } from '@/lib/api/exams'
import { useAuth } from '@/lib/context/AuthContext'
import { apiFetch } from '@/lib/api/client'
import { Button, Card, Input, Spinner, Textarea, useConfirm, useToast } from '@/components/ui'

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

  return (
    <div className="p-6 max-w-2xl mx-auto w-full">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Gemini API 키 설정</h1>

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
