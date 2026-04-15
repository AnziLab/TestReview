'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { useAuth } from '@/lib/context/AuthContext'
import { Button, Card, Input } from '@/components/ui'

interface FormData {
  username: string
  password: string
}

export default function LoginPage() {
  const router = useRouter()
  const { user, loading, login } = useAuth()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormData>()

  useEffect(() => {
    if (!loading && user) {
      if (user.status === 'pending') router.replace('/pending')
      else router.replace('/dashboard')
    }
  }, [user, loading, router])

  const onSubmit = async (data: FormData) => {
    try {
      await login(data.username, data.password)
      // redirect handled by useEffect
    } catch (e) {
      setError('root', {
        message: e instanceof Error ? e.message : '로그인에 실패했습니다.',
      })
    }
  }

  if (loading) return null

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-[400px] px-4">
        <Card padding="lg">
          <h1 className="text-2xl font-bold text-slate-900 mb-6 text-center">로그인</h1>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="아이디"
              placeholder="아이디 입력"
              error={errors.username?.message}
              {...register('username', { required: '아이디를 입력하세요.' })}
            />
            <Input
              type="password"
              label="비밀번호"
              placeholder="비밀번호 입력"
              error={errors.password?.message}
              {...register('password', { required: '비밀번호를 입력하세요.' })}
            />
            {errors.root && (
              <p className="text-xs text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{errors.root.message}</p>
            )}
            <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="w-full">
              {isSubmitting ? '로그인 중...' : '로그인'}
            </Button>
          </form>
          <p className="text-sm text-center text-slate-500 mt-4">
            계정이 없으신가요?{' '}
            <Link href="/signup" className="text-indigo-600 hover:underline">
              회원가입
            </Link>
          </p>
        </Card>
      </div>
    </div>
  )
}
