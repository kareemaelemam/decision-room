/** Extract only the existing capability. Never navigate to a pasted host. */
export function invitationToken(input: string): string | null {
  const value = input.trim()
  if (/^[a-f0-9]{64}$/i.test(value)) return value.toLowerCase()
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !/^\/join\/?$/.test(url.pathname) || url.search) return null
    const token = url.hash.slice(1)
    return /^[a-f0-9]{64}$/i.test(token) ? token.toLowerCase() : null
  } catch { return null }
}
