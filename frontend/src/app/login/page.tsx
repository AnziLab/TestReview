'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { useAuth } from '@/lib/context/AuthContext'

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">로그인</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">아이디</label>
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="아이디 입력"
              {...register('username', { required: '아이디를 입력하세요.' })}
            />
            {errors.username && (
              <p className="text-sm text-red-600 mt-1">{errors.username.message}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">비밀번호</label>
            <input
              type="password"
              className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="비밀번호 입력"
              {...register('password', { required: '비밀번호를 입력하세요.' })}
            />
            {errors.password && (
              <p className="text-sm text-red-600 mt-1">{errors.password.message}</p>
            )}
          </div>
          {errors.root && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errors.root.message}</p>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg w-full font-medium disabled:opacity-50"
          >
            {isSubmitting ? '로그인 중...' : '로그인'}
          </button>
        </form>
        <p className="text-sm text-center text-gray-500 mt-4">
          계정이 없으신가요?{' '}
          <Link href="/signup" className="text-blue-600 hover:underline">
            회원가입
          </Link>
        </p>
      </div>
    </div>
  )
}
