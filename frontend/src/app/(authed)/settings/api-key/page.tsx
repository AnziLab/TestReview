'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useForm } from 'react-hook-form'
import { meApi } from '@/lib/api/exams'
import { useAuth } from '@/lib/context/AuthContext'
import { apiFetch } from '@/lib/api/client'

interface FormData {
  api_key: string
}

export default function ApiKeySettingsPage() {
  const { data, isLoading, mutate } = useSWR('me/api-key', () => meApi.getApiKey())
  const { refreshUser } = useAuth()
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<FormData>()

  const onSubmit = async (formData: FormData) => {
    try {
      await meApi.setApiKey(formData.api_key)
      reset()
      await Promise.all([mutate(), refreshUser()])
      setTestResult(null)
    } catch (e) {
      setError('api_key', { message: e instanceof Error ? e.message : '저장 실패' })
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await meApi.testApiKey()
      setTestResult(res)
    } catch (e) {
      setTestResult({ success: false, message: e instanceof Error ? e.message : '테스트 실패' })
    } finally {
      setTesting(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('API 키를 삭제하시겠습니까?')) return
    setDeleting(true)
    try {
      await meApi.deleteApiKey()
      mutate()
      setTestResult(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto w-full">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Gemini API 키 설정</h1>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <svg className="animate-spin h-6 w-6 text-blue-600" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-4">
            <h2 className="font-medium text-gray-800 mb-3">현재 키</h2>
            {data?.has_api_key ? (
              <div className="flex items-center gap-3">
                <code className="bg-gray-100 px-3 py-1.5 rounded text-sm text-gray-700 flex-1 font-mono">
                  {data.masked_key || '••••••••••••••••••••••••••••••••••••••••'}
                </code>
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                >
                  {testing ? '테스트 중...' : '키 테스트'}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="border border-red-300 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">등록된 API 키가 없습니다.</p>
            )}

            {testResult && (
              <div className={`mt-3 text-sm px-3 py-2 rounded-lg ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {testResult.success ? '키가 유효합니다.' : `테스트 실패: ${testResult.message}`}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="font-medium text-gray-800 mb-3">{data?.has_api_key ? '키 업데이트' : '키 등록'}</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">API 키</label>
                <input
                  type="password"
                  className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                  placeholder="AIzaSy..."
                  {...register('api_key', { required: 'API 키를 입력하세요.' })}
                />
                {errors.api_key && (
                  <p className="text-sm text-red-600 mt-1">{errors.api_key.message}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
              >
                {isSubmitting ? '저장 중...' : '저장'}
              </button>
            </form>
          </div>
        <PromptSettings />
      </>
      )}
    </div>
  )
}

function PromptSettings() {
  const { user, refreshUser } = useAuth()
  const [grading, setGrading] = useState(user?.grading_extra_instructions ?? '')
  const [clustering, setClustering] = useState(user?.clustering_extra_instructions ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-4">
      <h2 className="font-medium text-gray-800 mb-1">AI 채점 추가 지시사항</h2>
      <p className="text-xs text-gray-500 mb-4">
        모든 문항 채점/정제 시 기본 프롬프트에 추가됩니다. 과목 특성이나 특별 규칙을 입력하세요.
      </p>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            채점 추가 지시사항
            <span className="ml-2 text-xs text-gray-400 font-normal">일괄채점·문항별 재채점에 적용</span>
          </label>
          <textarea
            className="border border-gray-300 rounded-lg px-3 py-2 w-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={3}
            placeholder="예) 이 시험은 영어 과목으로, 문항에서 영어로 쓰라고 한 경우 반드시 영어로만 답해야 합니다."
            value={grading}
            onChange={(e) => setGrading(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            채점기준 정제 추가 지시사항
            <span className="ml-2 text-xs text-gray-400 font-normal">클러스터링에 적용</span>
          </label>
          <textarea
            className="border border-gray-300 rounded-lg px-3 py-2 w-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={3}
            placeholder="예) 수학 문항으로, 풀이 과정이 맞아도 최종 답이 틀리면 오답입니다."
            value={clustering}
            onChange={(e) => setClustering(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
        {saved && <span className="text-sm text-green-600">저장됐습니다.</span>}
      </div>
    </div>
  )
}
