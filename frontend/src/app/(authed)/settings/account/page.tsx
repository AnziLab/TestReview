'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '@/lib/context/AuthContext'
import { meApi } from '@/lib/api/exams'
import { Button, Card, Input, useToast } from '@/components/ui'

interface ProfileFormData { full_name: string; email: string; school: string }
interface PasswordFormData { current_password: string; new_password: string; confirm_password: string }

export default function AccountSettingsPage() {
  const { user, refreshUser } = useAuth()
  const toast = useToast()

  const { register: rp, handleSubmit: hp, reset: resetP, setError: setEP,
    formState: { errors: ep, isSubmitting: submittingP } } = useForm<ProfileFormData>()

  const { register: rw, handleSubmit: hw, watch, reset: resetW, setError: setEW,
    formState: { errors: ew, isSubmitting: submittingW } } = useForm<PasswordFormData>()

  useEffect(() => {
    if (user) resetP({ full_name: user.full_name, email: user.email, school: user.school || '' })
  }, [user, resetP])

  const onProfile = async (data: ProfileFormData) => {
    try {
      await meApi.updateProfile({ full_name: data.full_name, email: data.email, school: data.school || undefined })
      await refreshUser()
      toast('프로필이 저장되었습니다.', 'success')
    } catch (e) {
      setEP('root', { message: e instanceof Error ? e.message : '저장 실패' })
    }
  }

  const onPassword = async (data: PasswordFormData) => {
    try {
      await meApi.changePassword({ current_password: data.current_password, new_password: data.new_password })
      resetW()
      toast('비밀번호가 변경되었습니다.', 'success')
    } catch (e) {
      setEW('root', { message: e instanceof Error ? e.message : '변경 실패' })
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto w-full space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">계정 설정</h1>

      <Card>
        <h2 className="font-medium text-slate-800 mb-4">프로필 정보</h2>
        <form onSubmit={hp(onProfile)} className="space-y-4">
          <Input label="이름" error={ep.full_name?.message}
            {...rp('full_name', { required: '이름을 입력하세요.' })} />
          <Input label="이메일" type="email" error={ep.email?.message}
            {...rp('email', { required: '이메일을 입력하세요.' })} />
          <Input label="학교" {...rp('school')} />
          {ep.root && <p className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{ep.root.message}</p>}
          <Button type="submit" loading={submittingP}>저장</Button>
        </form>
      </Card>

      <Card>
        <h2 className="font-medium text-slate-800 mb-4">비밀번호 변경</h2>
        <form onSubmit={hw(onPassword)} className="space-y-4">
          <Input label="현재 비밀번호" type="password" error={ew.current_password?.message}
            {...rw('current_password', { required: '현재 비밀번호를 입력하세요.' })} />
          <Input label="새 비밀번호" type="password" error={ew.new_password?.message}
            {...rw('new_password', { required: '새 비밀번호를 입력하세요.', minLength: { value: 8, message: '8자 이상 입력하세요.' } })} />
          <Input label="새 비밀번호 확인" type="password" error={ew.confirm_password?.message}
            {...rw('confirm_password', {
              required: '비밀번호를 재입력하세요.',
              validate: (v) => v === watch('new_password') || '비밀번호가 일치하지 않습니다.',
            })} />
          {ew.root && <p className="text-sm text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{ew.root.message}</p>}
          <Button type="submit" loading={submittingW}>비밀번호 변경</Button>
        </form>
      </Card>
    </div>
  )
}
