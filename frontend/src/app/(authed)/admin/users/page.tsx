'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { adminApi } from '@/lib/api/exams'
import { useAuth } from '@/lib/context/AuthContext'
import { useRouter } from 'next/navigation'
import type { User } from '@/lib/types'

type Tab = 'pending' | 'approved' | 'rejected'

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export default function AdminUsersPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('pending')

  if (user && user.role !== 'admin') {
    router.replace('/dashboard')
    return null
  }

  return (
    <div className="p-6 max-w-4xl mx-auto w-full">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">사용자 관리</h1>

      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {(['pending', 'approved', 'rejected'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {t === 'pending' ? '대기 중' : t === 'approved' ? '승인됨' : '거절됨'}
          </button>
        ))}
      </div>

      <UserList tab={tab} />
    </div>
  )
}

function UserList({ tab }: { tab: Tab }) {
  const { data: users, isLoading, error, mutate } = useSWR(
    `admin/users/${tab}`,
    () => adminApi.getUsers(tab)
  )
  const [actionId, setActionId] = useState<number | null>(null)

  const handleApprove = async (id: number) => {
    setActionId(id)
    try {
      await adminApi.approveUser(id)
      mutate()
    } catch (e) {
      alert(e instanceof Error ? e.message : '승인 실패')
    } finally {
      setActionId(null)
    }
  }

  const handleReject = async (id: number) => {
    if (!confirm('이 사용자를 거절하시겠습니까?')) return
    setActionId(id)
    try {
      await adminApi.rejectUser(id)
      mutate()
    } catch (e) {
      alert(e instanceof Error ? e.message : '거절 실패')
    } finally {
      setActionId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        사용자 목록을 불러오는데 실패했습니다.
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">이름</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">아이디</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">이메일</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">학교</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">가입일</th>
            {tab === 'pending' && <th className="px-4 py-3 w-32" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {users?.map((u: User) => (
            <tr key={u.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{u.full_name}</td>
              <td className="px-4 py-3 text-gray-600 font-mono">{u.username}</td>
              <td className="px-4 py-3 text-gray-600">{u.email}</td>
              <td className="px-4 py-3 text-gray-500">{u.school ?? '-'}</td>
              <td className="px-4 py-3 text-gray-400 text-xs">
                {/* User created_at is not in our User type but we show a fallback */}
                -
              </td>
              {tab === 'pending' && (
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(u.id)}
                      disabled={actionId === u.id}
                      className="bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded text-xs disabled:opacity-50"
                    >
                      승인
                    </button>
                    <button
                      onClick={() => handleReject(u.id)}
                      disabled={actionId === u.id}
                      className="border border-red-300 text-red-600 hover:bg-red-50 px-2.5 py-1 rounded text-xs disabled:opacity-50"
                    >
                      거절
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {(!users || users.length === 0) && (
        <div className="py-8 text-center text-gray-400 text-sm">해당하는 사용자가 없습니다.</div>
      )}
    </div>
  )
}
