'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { adminApi } from '@/lib/api/exams'
import { useAuth } from '@/lib/context/AuthContext'
import { useRouter } from 'next/navigation'
import type { User } from '@/lib/types'
import { Button, Card, SegmentedControl, Spinner, useConfirm, useToast } from '@/components/ui'

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

  useEffect(() => {
    if (user && user.role !== 'admin') router.replace('/dashboard')
  }, [user, router])

  if (!user || user.role !== 'admin') return null

  return (
    <div className="p-6 max-w-4xl mx-auto w-full">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">사용자 관리</h1>

      <div className="mb-4">
        <SegmentedControl
          options={[
            { value: 'pending', label: '대기 중' },
            { value: 'approved', label: '승인됨' },
            { value: 'rejected', label: '거절됨' },
          ]}
          value={tab}
          onChange={(v) => setTab(v as Tab)}
        />
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
  const confirm = useConfirm()
  const toast = useToast()
  const [actionId, setActionId] = useState<number | null>(null)

  const handleApprove = async (id: number) => {
    setActionId(id)
    try {
      await adminApi.approveUser(id)
      mutate()
      toast('사용자가 승인되었습니다.', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : '승인 실패', 'danger')
    } finally {
      setActionId(null)
    }
  }

  const handleReject = async (id: number) => {
    const ok = await confirm({
      title: '사용자 거절',
      description: '이 사용자를 거절하시겠습니까?',
      tone: 'danger',
      confirmLabel: '거절',
    })
    if (!ok) return
    setActionId(id)
    try {
      await adminApi.rejectUser(id)
      mutate()
      toast('사용자가 거절되었습니다.', 'info')
    } catch (e) {
      toast(e instanceof Error ? e.message : '거절 실패', 'danger')
    } finally {
      setActionId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700">
        사용자 목록을 불러오는데 실패했습니다.
      </div>
    )
  }

  return (
    <Card padding="sm" className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">이름</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">아이디</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">이메일</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">학교</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">가입일</th>
            {tab === 'pending' && <th className="px-4 py-3 w-32" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {users?.map((u: User) => (
            <tr key={u.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-900">{u.full_name}</td>
              <td className="px-4 py-3 text-slate-600 font-mono">{u.username}</td>
              <td className="px-4 py-3 text-slate-600">{u.email}</td>
              <td className="px-4 py-3 text-slate-500">{u.school ?? '-'}</td>
              <td className="px-4 py-3 text-slate-400 text-xs">-</td>
              {tab === 'pending' && (
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleApprove(u.id)}
                      disabled={actionId === u.id}
                      loading={actionId === u.id}
                    >
                      승인
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleReject(u.id)}
                      disabled={actionId === u.id}
                    >
                      거절
                    </Button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {(!users || users.length === 0) && (
        <div className="py-8 text-center text-slate-400 text-sm">해당하는 사용자가 없습니다.</div>
      )}
    </Card>
  )
}
