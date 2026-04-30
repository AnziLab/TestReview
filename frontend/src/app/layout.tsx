import type { Metadata } from 'next'
import './globals.css'
import 'katex/dist/katex.min.css'
import { AuthProvider } from '@/lib/context/AuthContext'

export const metadata: Metadata = {
  title: '채점기준 정제 도구',
  description: '한국 중고등학교 교사용 서답형 시험 채점기준표 정제 도구',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="bg-slate-50 text-slate-900 antialiased" suppressHydrationWarning>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
