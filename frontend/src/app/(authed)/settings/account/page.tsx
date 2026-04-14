'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '@/lib/context/AuthContext'
import { meApi } from '@/lib/api/exams'

interface ProfileFormData {
  full_name: string
  email: string
  school: string
}

interface PasswordFormData {
  current_password: string
  new_password: string
  confirm_password: string
}

export default function AccountSettingsPage() {
  const { user, refreshUser } = useAuth()

  const {
    register: registerProfile,
    handleSubmit: handleProfile,
    reset: resetProfile,
    setError: setProfileError,
    formState: { errors: profileErrors, isSubmitting: profileSubmitting },
  } = useForm<ProfileFormData>()

  const {
    register: registerPw,
    handleSubmit: handlePw,
    watch: watchPw,
    reset: resetPw,
    setError: setPwError,
    formState: { errors: pwErrors, isSubmitting: pwSubmitting },
  } = useForm<PasswordFormData>()

  useEffect(() => {
    if (user) {
      resetProfile({
        full_name: user.full_name,
        email: user.email,
        school: user.school || '',
      })
    }
  }, [user, resetProfile])

  const onProfileSubmit = async (data: ProfileFormData) => {
    try {
      await meApi.updateProfile({
        full_name: data.full_name,
        email: data.email,
        school: data.school || undefined,
      })
      await refreshUser()
      alert('프로필이 저장되었습니다.')
    } catch (e) {
      setProfileError('root', { message: e instanceof Error ? e.message : '저장 실패' })
    }
  }

  const onPasswordSubmit = async (data: PasswordFormData) => {
    try {
      await meApi.changePassword({
        current_password: data.current_password,
        new_password: data.new_password,
      })
      resetPw()
      alert('비밀번호가 변경되었습니다.')
    } catch (e) {
      setPwError('root', { message: e instanceof Error ? e.message : '변경 실패' })
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto w-full space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">계정 설정</h1>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="font-medium text-gray-800 mb-4">프로필 정보</h2>
        <form onSubmit={handleProfile(onProfileSubmit)} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">이름</label>
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              {...registerProfile('full_name', { required: '이름을 입력하세요.' })}
            />
            {profileErrors.full_name && (
              <p className="text-sm text-red-600 mt-1">{profileErrors.full_name.message}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">이메일</label>
            <input
              type="email"
              className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              {...registerProfile('email', { required: '이메일을 입력하세요.' })}
            />
            {profileErrors.email && (
              <p className="text-sm text-red-600 mt-1">{profileErrors.email.message}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">학교</label>
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              {...registerProfile('school')}
            />
          </div>
          {profileErrors.root && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{profileErrors.root.message}</p>
          )}
          <button
            type="submit"
            disabled={profileSubmitting}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            {profileSubmitting ? '저장 중...' : '저장'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="font-medium text-gray-800 mb-4">비밀번호 변경</h2>
        <form onSubmit={handlePw(onPasswordSubmit)} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">현재 비밀번호</label>
            <input
              type="password"
              className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              {...registerPw('current_password', { required: '현재 비밀번호를 입력하세요.' })}
            />
            {pwErrors.current_password && (
              <p className="text-sm text-red-600 mt-1">{pwErrors.current_password.message}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">새 비밀번호</label>
            <input
              type="password"
              className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              {...registerPw('new_password', {
                required: '새 비밀번호를 입력하세요.',
                minLength: { value: 8, message: '8자 이상 입력하세요.' },
              })}
            />
            {pwErrors.new_password && (
              <p className="text-sm text-red-600 mt-1">{pwErrors.new_password.message}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">새 비밀번호 확인</label>
            <input
              type="password"
              className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              {...registerPw('confirm_password', {
                required: '비밀번호를 재입력하세요.',
                validate: (v) => v === watchPw('new_password') || '비밀번호가 일치하지 않습니다.',
              })}
            />
            {pwErrors.confirm_password && (
              <p className="text-sm text-red-600 mt-1">{pwErrors.confirm_password.message}</p>
            )}
          </div>
          {pwErrors.root && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{pwErrors.root.message}</p>
          )}
          <button
            type="submit"
            disabled={pwSubmitting}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            {pwSubmitting ? '변경 중...' : '비밀번호 변경'}
          </button>
        </form>
      </div>
    </div>
  )
}
