import { describe, expect, it } from 'vitest'
import { invitationToken } from './invitation-input'

describe('invitation input', () => {
  const token = 'ab'.repeat(32)
  it('accepts trimmed raw tokens and normalizes hex case', () => {
    expect(invitationToken(`  ${token.toUpperCase()}  `)).toBe(token)
  })
  it.each(['https://decision-room.app.space/join#', 'http://localhost:5173/join#', 'https://example.com/join/#'])('extracts the capability from %s without using its host', prefix => {
    expect(invitationToken(prefix + token)).toBe(token)
  })
  it.each(['', '  ', 'f6d2fa84-0633-433d-bdd7-24f919c68109', 'a'.repeat(63), 'z'.repeat(64), 'javascript:alert(1)', '/join#' + token, 'https://example.com/rooms#' + token, 'https://example.com/join?token=' + token, 'https://user:password@example.com/join#' + token])('rejects invalid input: %s', input => {
    expect(invitationToken(input)).toBeNull()
  })
})
