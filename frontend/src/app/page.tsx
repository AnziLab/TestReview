'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  const retries = useRef(0)
  const [status, setStatus] = useState('서버 연결 중...')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

    function checkSetup() {
      fetch(`${apiUrl}/setup/status`)
        .then((r) => {
          if (!r.ok) throw new Error(`서버 오류 (${r.status})`)
          return r.json()
        })
        .then((data) => {
          if (data.setup_required) {
            router.replace('/setup')
          } else {
            router.replace('/dashboard')
          }
        })
        .catch(() => {
          if (retries.current < 15) {
            retries.current++
            setStatus(`서버 연결 대기 중... (${retries.current}/15)`)
            setTimeout(checkSetup, 2000)
          } else {
            setFailed(true)
          }
        })
    }

    checkSetup()
  }, [router])

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        {failed ? (
          <>
            <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="font-semibold text-slate-900 mb-2">백엔드 서버에 연결할 수 없습니다</h2>
            <p className="text-sm text-slate-500 mb-4">
              서버가 정상적으로 실행 중인지 확인해주세요.
            </p>
            <div className="bg-slate-100 rounded-xl p-4 text-left text-xs text-slate-600 space-y-2">
              <p><strong>확인사항:</strong></p>
              <ul className="list-disc list-inside space-y-1">
                <li>start.bat (Windows) 또는 start.command (Mac)으로 실행했는지 확인</li>
                <li>백엔드 서버 창(cmd)이 열려있는지 확인</li>
                <li>오류 메시지가 있다면 관리자에게 전달</li>
              </ul>
            </div>
            <button
              onClick={() => { setFailed(false); retries.current = 0; setStatus('서버 연결 중...'); }}
              className="mt-4 px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm hover:bg-indigo-600"
            >
              다시 시도
            </button>
          </>
        ) : (
          <>
            <div className="h-8 w-8 rounded-full border-4 border-indigo-100 border-t-indigo-500 animate-spin mx-auto" />
            <p className="text-sm text-slate-400 mt-4">{status}</p>
          </>
        )}
      </div>
    </div>
  )
}
