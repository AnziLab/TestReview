'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/context/AuthContext'

export function TopBar() {
  const { user, logout } = useAuth()
  const router = useRouter()

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  return (
    <header className="bg-white border-b border-gray-200 h-14 flex items-center px-6 gap-4 z-10">
      <Link href="/dashboard" className="font-bold text-blue-600 text-lg flex-shrink-0">
        채점기준 정제 도구
      </Link>
      <div className="flex-1" />
      {user && (
        <>
          <span className="text-sm text-gray-700">{user.full_name}</span>
          <Link
            href="/settings/api-key"
            className="text-sm text-gray-500 hover:text-gray-800 border border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded-lg"
          >
            설정
          </Link>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-800 border border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded-lg"
          >
            로그아웃
          </button>
        </>
      )}
    </header>
  )
}
