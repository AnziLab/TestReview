'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { authApi } from '@/lib/api/auth'

interface FormData {
  username: string
  email: string
  password: string
  password_confirm: string
  full_name: string
  school: string
}

export default function SignupPage() {
  const router = useRouter()
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormData>()

  const onSubmit = async (data: FormData) => {
    try {
      await authApi.signup({
        username: data.username,
        email: data.email,
        password: data.password,
        full_name: data.full_name,
        school: data.school || undefined,
      })
      router.push('/pending')
    } catch (e) {
      setError('root', {
        message: e instanceof Error ? e.message : '회원가입에 실패했습니다.',
      })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-8">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">회원가입</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">아이디</label>
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="사용할 아이디"
              {...register('username', {
                required: '아이디를 입력하세요.',
                minLength: { value: 3, message: '3자 이상 입력하세요.' },
              })}
            />
            {errors.username && (
              <p className="text-sm text-red-600 mt-1">{errors.username.message}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">이메일</label>
            <input
              type="email"
              className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="이메일 주소"
              {...register('email', {
                required: '이메일을 입력하세요.',
                pattern: { value: /^\S+@\S+\.\S+$/, message: '올바른 이메일 형식이 아닙니다.' },
              })}
            />
            {errors.email && (
              <p className="text-sm text-red-600 mt-1">{errors.email.message}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">이름</label>
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="실명"
              {...register('full_name', { required: '이름을 입력하세요.' })}
            />
            {errors.full_name && (
              <p className="text-sm text-red-600 mt-1">{errors.full_name.message}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">학교</label>
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="소속 학교 (선택)"
              {...register('school')}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">비밀번호</label>
            <input
              type="password"
              className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="비밀번호 (8자 이상)"
              {...register('password', {
                required: '비밀번호를 입력하세요.',
                minLength: { value: 8, message: '8자 이상 입력하세요.' },
              })}
            />
            {errors.password && (
              <p className="text-sm text-red-600 mt-1">{errors.password.message}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">비밀번호 확인</label>
            <input
              type="password"
              className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="비밀번호 재입력"
              {...register('password_confirm', {
                required: '비밀번호를 재입력하세요.',
                validate: (v) => v === watch('password') || '비밀번호가 일치하지 않습니다.',
              })}
            />
            {errors.password_confirm && (
              <p className="text-sm text-red-600 mt-1">{errors.password_confirm.message}</p>
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
            {isSubmitting ? '가입 중...' : '가입 신청'}
          </button>
        </form>
        <p className="text-sm text-center text-gray-500 mt-4">
          이미 계정이 있으신가요?{' '}
          <Link href="/login" className="text-blue-600 hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </div>
  )
}
