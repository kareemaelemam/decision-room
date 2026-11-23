import { describe, expect, it } from 'vitest'
import { consumeRoomDestination, rememberRoomDestination } from './auth-return'

function storage() {
  const values = new Map<string, string>()
  return { setItem: (key: string, value: string) => values.set(key, value), getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => values.delete(key) } as unknown as Storage
}

describe('OAuth room destination', () => {
  it('returns to an invite once, without accepting it automatically', () => {
    const store = storage()
    const path = `/join#${'a'.repeat(64)}`
    rememberRoomDestination(store, path, 0)
    expect(consumeRoomDestination(store, 100)).toBe(path)
    expect(consumeRoomDestination(store, 100)).toBe(null)
  })
  it('expires stale destinations and refuses external redirects', () => {
    const store = storage()
    rememberRoomDestination(store, `/join#${'b'.repeat(64)}`, 0)
    expect(consumeRoomDestination(store, 900001)).toBe(null)
    for (const path of ['https://example.com', '//example.com', '/api/auth/sign-out', '/join#invalid']) {
      rememberRoomDestination(store, path, 0)
      expect(consumeRoomDestination(store, 1)).toBe(null)
    }
  })
})
