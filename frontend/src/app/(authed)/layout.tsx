'use client'

import ClientLayout from './ClientLayout'

export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  return <ClientLayout>{children}</ClientLayout>
}
