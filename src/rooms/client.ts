import { getAuthToken } from 'deepspace'

// Actions already verify the JWT at the Worker boundary. Never cache or log it.
export async function roomAction<T>(name: string, params: object): Promise<T> {
  const token = await getAuthToken()
  if (!token) throw new Error('Your session has expired. Sign in again to continue.')
  let response: Response
  try {
    response = await fetch(`/api/actions/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(20000),
    })
  } catch {
    throw new Error('Could not reach the server. Check your connection and look for any saved change in the room before retrying.')
  }
  if (response.status === 401) throw new Error('Your session has expired. Sign in again to continue.')
  const result = await response.json() as { success?: boolean; data?: T; error?: string }
  if (!response.ok || !result.success) throw new Error(result.error || 'The request failed. Please try again.')
  return result.data as T
}
