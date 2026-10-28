const SESSION_KEY = 'zen-admin-session'
const TOKEN_KEY = 'zen-admin-session-token'

export async function mockLogin(
  email: string,
  password: string
): Promise<boolean> {
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
      }),
    })

    const json = await response.json()
    if (!response.ok || !json.success || !json.token) {
      return false
    }

    sessionStorage.setItem(SESSION_KEY, 'true')
    sessionStorage.setItem(TOKEN_KEY, String(json.token))
    return true
  } catch (error) {
    console.error('Server admin login request failed:', error)
    return false
  }
}

export function isAdminLoggedIn(): boolean {
  if (typeof window === 'undefined') return false
  return (
    sessionStorage.getItem(SESSION_KEY) === 'true' &&
    Boolean(sessionStorage.getItem(TOKEN_KEY))
  )
}

export function getAdminAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = sessionStorage.getItem(TOKEN_KEY)
  if (!token) return {}

  return {
    Authorization: `Bearer ${token}`,
    'x-admin-token': token,
  }
}

export async function mockLogout(): Promise<void> {
  try {
    const headers = getAdminAuthHeaders()
    if (Object.keys(headers).length > 0) {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers,
      })
    }
  } catch {
    // Ignore server error on logout
  } finally {
    sessionStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
    window.location.replace('/admin/login')
  }
}
