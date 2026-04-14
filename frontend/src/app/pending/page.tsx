'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/context/AuthContext'

export default function PendingPage() {
  const router = useRouter()
  const { logout } = useAuth()

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-10 w-full max-w-md text-center">
        <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-3">가입 신청 접수</h1>
        <p className="text-gray-600 mb-6">
          가입 신청이 접수되었습니다.
          <br />
          관리자 승인 후 이용 가능합니다.
        </p>
        <button
          onClick={handleLogout}
          className="border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg text-gray-700"
        >
          로그아웃
        </button>
      </div>
    </div>
  )
}
