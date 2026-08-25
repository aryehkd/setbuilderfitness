export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (res.status === 401) {
    throw new ApiError('Unauthorized', 401)
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(body.error || res.statusText, res.status)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
