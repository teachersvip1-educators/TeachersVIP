const API = import.meta.env.VITE_API_URL || '/api'

export class ApiError extends Error {
  constructor(message: string, public field?: string) { super(message) }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, { credentials: 'include', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(payload.error || 'Request failed.', payload.field)
  return payload as T
}

export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' })
