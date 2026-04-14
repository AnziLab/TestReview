'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { authApi } from '../api/auth'
import type { User } from '../types'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const me = await authApi.me()
      setUser(me)
    } catch {
      localStorage.removeItem('access_token')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const login = async (username: string, password: string) => {
    const res = await authApi.login({ username, password })
    localStorage.setItem('access_token', res.access_token)
    if (res.user) {
      setUser(res.user)
    } else {
      const me = await authApi.me()
      setUser(me)
    }
  }

  const logout = async () => {
    try {
      await authApi.logout()
    } catch {
      // ignore
    }
    localStorage.removeItem('access_token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
