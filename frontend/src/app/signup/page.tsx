'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { authApi } from '@/lib/api/auth'
import { Button, Card, Input } from '@/components/ui'

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
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-8">
      <div className="w-full max-w-[400px] px-4">
        <Card padding="lg">
          <h1 className="text-2xl font-bold text-slate-900 mb-6 text-center">회원가입</h1>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="아이디"
              placeholder="사용할 아이디"
              error={errors.username?.message}
              {...register('username', {
                required: '아이디를 입력하세요.',
                minLength: { value: 3, message: '3자 이상 입력하세요.' },
              })}
            />
            <Input
              type="email"
              label="이메일"
              placeholder="이메일 주소"
              error={errors.email?.message}
              {...register('email', {
                required: '이메일을 입력하세요.',
                pattern: { value: /^\S+@\S+\.\S+$/, message: '올바른 이메일 형식이 아닙니다.' },
              })}
            />
            <Input
              label="이름"
              placeholder="실명"
              error={errors.full_name?.message}
              {...register('full_name', { required: '이름을 입력하세요.' })}
            />
            <Input
              label="학교"
              placeholder="소속 학교 (선택)"
              {...register('school')}
            />
            <Input
              type="password"
              label="비밀번호"
              placeholder="비밀번호 (8자 이상)"
              error={errors.password?.message}
              {...register('password', {
                required: '비밀번호를 입력하세요.',
                minLength: { value: 8, message: '8자 이상 입력하세요.' },
              })}
            />
            <Input
              type="password"
              label="비밀번호 확인"
              placeholder="비밀번호 재입력"
              error={errors.password_confirm?.message}
              {...register('password_confirm', {
                required: '비밀번호를 재입력하세요.',
                validate: (v) => v === watch('password') || '비밀번호가 일치하지 않습니다.',
              })}
            />
            {errors.root && (
              <p className="text-xs text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{errors.root.message}</p>
            )}
            <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="w-full">
              {isSubmitting ? '가입 중...' : '가입 신청'}
            </Button>
          </form>
          <p className="text-sm text-center text-slate-500 mt-4">
            이미 계정이 있으신가요?{' '}
            <Link href="/login" className="text-indigo-600 hover:underline">
              로그인
            </Link>
          </p>
        </Card>
      </div>
    </div>
  )
}
