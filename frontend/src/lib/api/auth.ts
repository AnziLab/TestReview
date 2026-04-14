import { apiFetch } from './client'
import type { User } from '../types'

export interface LoginRequest {
  username: string
  password: string
}

export interface SignupRequest {
  username: string
  email: string
  password: string
  full_name: string
  school?: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
  user?: User
}

export const authApi = {
  login: (data: LoginRequest) =>
    apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  signup: (data: SignupRequest) =>
    apiFetch<User>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  logout: () =>
    apiFetch<void>('/auth/logout', { method: 'POST' }),

  me: () => apiFetch<User>('/auth/me'),
}
