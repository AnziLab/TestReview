'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/context/AuthContext'
import { Button, Card } from '@/components/ui'

export default function PendingPage() {
  const router = useRouter()
  const { logout } = useAuth()

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md px-4">
        <Card padding="lg">
          <div className="text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-3">가입 신청 접수</h1>
            <p className="text-slate-500 mb-6">
              가입 신청이 접수되었습니다.
              <br />
              관리자 승인 후 이용 가능합니다.
            </p>
            <Button variant="secondary" onClick={handleLogout}>
              로그아웃
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
