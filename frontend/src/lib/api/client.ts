const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.access_token) {
      localStorage.setItem('access_token', data.access_token)
      return data.access_token
    }
    return null
  } catch {
    return null
  }
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit & { skipContentType?: boolean }
): Promise<T> {
  const { skipContentType, ...restOptions } = options ?? {}
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('access_token') : null

  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(restOptions.headers as Record<string, string>),
  }

  if (!skipContentType && !(restOptions.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...restOptions,
    credentials: 'include',
    headers,
  })

  if (res.status === 401) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      const retryHeaders: Record<string, string> = {
        Authorization: `Bearer ${newToken}`,
        ...(headers['Content-Type']
          ? { 'Content-Type': headers['Content-Type'] }
          : {}),
      }
      const retryRes = await fetch(`${API_URL}${path}`, {
        ...restOptions,
        credentials: 'include',
        headers: retryHeaders,
      })
      if (!retryRes.ok) {
        throw new Error(await retryRes.text())
      }
      if (retryRes.status === 204) return undefined as T
      return retryRes.json()
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token')
      window.location.href = '/login'
    }
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const text = await res.text()
    let message = text
    try {
      const json = JSON.parse(text)
      message = json.detail || json.message || text
    } catch {
      // use raw text
    }
    throw new Error(message)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}
