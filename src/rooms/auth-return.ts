const key = 'decisionroom.auth-return'
const returnPath = /^\/(?:join#[a-f0-9]{64}|rooms\/[a-f0-9-]{36})$/

// OAuth's scaffold callback lands on /home. Keep only a same-origin route in
// this tab for 15 minutes, then remove it. Never store a session/JWT here.
export function rememberRoomDestination(storage: Storage, path: string, now = Date.now()) {
  if (returnPath.test(path)) storage.setItem(key, JSON.stringify({ path, expiresAt: now + 15 * 60 * 1000 }))
}

export function consumeRoomDestination(storage: Storage, now = Date.now()): string | null {
  const raw = storage.getItem(key)
  storage.removeItem(key)
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || !('path' in value) || !('expiresAt' in value)) return null
    return typeof value.path === 'string' && returnPath.test(value.path) && typeof value.expiresAt === 'number' && value.expiresAt > now ? value.path : null
  } catch { return null }
}
