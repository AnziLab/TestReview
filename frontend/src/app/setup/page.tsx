'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { Button, Card, Input } from '@/components/ui'
import { apiFetch } from '@/lib/api/client'

interface SetupForm {
  username: string
  email: string
  password: string
  full_name: string
}

export default function SetupPage() {
  const router = useRouter()
  const [done, setDone] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SetupForm>()

  const onSubmit = async (data: SetupForm) => {
    await apiFetch('/setup', { method: 'POST', body: JSON.stringify(data) })
    setDone(true)
    setTimeout(() => router.replace('/login'), 2000)
  }

  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card padding="lg" className="max-w-sm w-full text-center">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-semibold text-slate-900 mb-1">설정 완료!</h2>
          <p className="text-sm text-slate-500">로그인 페이지로 이동합니다...</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-indigo-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">채점기준 정제 도구</h1>
          <p className="text-slate-500 mt-1">처음 실행하셨군요. 관리자 계정을 만들어주세요.</p>
        </div>

        <Card padding="lg">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="아이디"
              placeholder="로그인에 사용할 아이디"
              error={errors.username?.message}
              {...register('username', { required: '아이디를 입력하세요.' })}
            />
            <Input
              label="이름"
              placeholder="홍길동"
              error={errors.full_name?.message}
              {...register('full_name', { required: '이름을 입력하세요.' })}
            />
            <Input
              label="이메일"
              type="email"
              placeholder="teacher@school.kr"
              error={errors.email?.message}
              {...register('email', { required: '이메일을 입력하세요.' })}
            />
            <Input
              label="비밀번호"
              type="password"
              placeholder="8자 이상"
              error={errors.password?.message}
              {...register('password', {
                required: '비밀번호를 입력하세요.',
                minLength: { value: 8, message: '8자 이상 입력하세요.' }
              })}
            />
            <Button type="submit" loading={isSubmitting} className="w-full" size="lg">
              시작하기
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
