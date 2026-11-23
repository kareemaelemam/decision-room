import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canCreate, canRead, canUpdate } from 'deepspace/worker'
import type { ActionContext, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { createRoom, createRoomInvite, getRoomMembers, inviteHash, joinRoom, updateRoom } from './rooms'
import { roomInvitesSchema, roomMembersSchema, roomsSchema } from '../schemas/rooms-schema'

const roomId = 'f6d2fa84-0633-433d-bdd7-24f919c68109'
const room = { roomId, title: 'Database?', description: 'Compare constraints', category: 'Engineering', creatorId: 'alice', createdAt: new Date().toISOString(), status: 'Open' }
const get = vi.fn()
const query = vi.fn()
const create = vi.fn()
const update = vi.fn()
const remove = vi.fn()
function context(params: Record<string, unknown>, userId = 'alice'): ActionContext<Env> {
  return { params, userId, callerJwt: 'unused-test-value', env: {} as Env, tools: { get, query, create, update, remove } as unknown as ActionTools }
}
beforeEach(() => {
  vi.resetAllMocks()
  get.mockResolvedValue({ success: true, data: { record: { recordId: roomId, data: room } } })
  query.mockResolvedValue({ success: true, data: { records: [], count: 0 } })
  create.mockResolvedValue({ success: true, data: { recordId: roomId } })
  update.mockResolvedValue({ success: true, data: { recordId: roomId } })
  remove.mockResolvedValue({ success: true, data: { recordId: roomId } })
})

describe('validated room creation', () => {
  it('uses verified creator identity and server timestamps, then initializes membership', async () => {
    const result = await createRoom(context({ title: '  Database?  ', description: '  Context  ', category: 'Engineering' }))
    expect(result.success).toBe(true)
    expect(create).toHaveBeenNthCalledWith(1, 'decision_rooms', expect.objectContaining({ title: 'Database?', description: 'Context', creatorId: 'alice', status: 'Open', createdAt: expect.any(String) }), expect.any(String))
    expect(create).toHaveBeenNthCalledWith(2, 'team_members', expect.objectContaining({ userId: 'alice', status: 'active' }), expect.stringMatching(/^member_[a-f0-9]{64}$/))
  })
  it.each([
    { title: '   ', category: 'Product' },
    { title: 'a'.repeat(101), category: 'Product' },
    { title: 'Title', description: 'a'.repeat(601), category: 'Product' },
    { title: 'Title', category: 'Invalid' },
    { title: 'Title', category: 'Product', creatorId: 'bob' },
  ])('refuses invalid or identity-forging input before writing: %j', async params => {
    expect((await createRoom(context(params))).success).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })
  it('removes the room if owner-membership initialization fails', async () => {
    create.mockResolvedValueOnce({ success: true, data: { recordId: roomId } }).mockResolvedValueOnce({ success: false, error: 'offline' })
    expect((await createRoom(context({ title: 'Title', category: 'Product' }))).success).toBe(false)
    expect(remove).toHaveBeenCalledWith('decision_rooms', expect.any(String))
  })
})

describe('Worker authorization', () => {
  it('refuses member and stranger edits or invitations, including app-admin identities', async () => {
    for (const user of ['bob', 'stranger', 'platform-owner']) {
      expect((await updateRoom(context({ roomId, title: 'Changed', category: 'Design' }, user))).success).toBe(false)
      expect((await createRoomInvite(context({ roomId }, user))).success).toBe(false)
    }
    expect(update).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
  it('lets only the creator edit validated fields', async () => {
    expect((await updateRoom(context({ roomId, title: 'Updated', description: 'New', category: 'Design' }))).success).toBe(true)
    expect(update).toHaveBeenCalledWith('decision_rooms', roomId, { title: 'Updated', description: 'New', category: 'Design' })
    expect((await updateRoom(context({ roomId, title: 'Updated', category: 'Design', creatorId: 'bob' }))).success).toBe(false)
  })
  it('returns no roster to strangers', async () => {
    expect((await getRoomMembers(context({ roomId }, 'stranger'))).success).toBe(false)
    expect(query).toHaveBeenCalledExactlyOnceWith('team_members', { where: { teamId: roomId, userId: 'stranger', status: 'active' }, limit: 1 })
  })
  it('projects only membership IDs and dates for an authorized member', async () => {
    query.mockResolvedValueOnce({ success: true, data: { records: [{ data: { userId: 'bob' } }] } })
      .mockResolvedValueOnce({ success: true, data: { records: [{ data: { userId: 'alice', joinedAt: 'now', email: 'private@example.com' } }] } })
    expect(await getRoomMembers(context({ roomId }, 'bob'))).toEqual({ success: true, data: { members: [{ userId: 'alice', joinedAt: 'now' }] } })
  })
})

describe('invitation capabilities', () => {
  it('stores a hash and expiry, never the raw token', async () => {
    const result = await createRoomInvite(context({ roomId }))
    expect(result.success).toBe(true)
    if (!result.success) return
    const data = result.data as { token: string; expiresAt: string }
    expect(data.token).toMatch(/^[a-f0-9]{64}$/)
    expect(create).toHaveBeenCalledWith('room_invites', { roomId, creatorId: 'alice', expiresAt: data.expiresAt }, await inviteHash(data.token))
    expect(JSON.stringify(create.mock.calls)).not.toContain(data.token)
  })
  it('rejects malformed, missing, and expired invitations', async () => {
    expect((await joinRoom(context({ token: 'guess' }, 'bob'))).success).toBe(false)
    get.mockResolvedValueOnce({ success: false, error: 'not found' })
    expect((await joinRoom(context({ token: 'a'.repeat(64) }, 'bob'))).success).toBe(false)
    get.mockResolvedValueOnce({ success: true, data: { record: { data: { roomId, creatorId: 'alice', expiresAt: '2020-01-01' } } } })
    expect((await joinRoom(context({ token: 'b'.repeat(64) }, 'bob'))).success).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })
  it('binds membership to the accepting identity and handles repeated acceptance', async () => {
    const invite = { roomId, creatorId: 'alice', expiresAt: new Date(Date.now() + 60000).toISOString() }
    get.mockResolvedValueOnce({ success: true, data: { record: { data: invite } } })
      .mockResolvedValueOnce({ success: true, data: { record: { data: room } } })
      .mockResolvedValueOnce({ success: false, error: 'not found' })
    expect(await joinRoom(context({ token: 'c'.repeat(64) }, 'bob'))).toEqual({ success: true, data: { roomId } })
    expect(create).toHaveBeenCalledWith('team_members', expect.objectContaining({ userId: 'bob', teamId: roomId }), expect.any(String))
    create.mockClear()
    get.mockResolvedValueOnce({ success: true, data: { record: { data: invite } } })
      .mockResolvedValueOnce({ success: true, data: { record: { data: room } } })
      .mockResolvedValueOnce({ success: true, data: { record: { data: { status: 'active' } } } })
    expect((await joinRoom(context({ token: 'c'.repeat(64) }, 'bob'))).success).toBe(true)
    expect(create).not.toHaveBeenCalled()
  })
})

describe('actual installed SDK permission evaluator', () => {
  const record = { data: room, createdBy: 'alice' }
  const membership = { isTeamMember: (team: string, user: string) => team === roomId && user === 'bob' }
  it('allows creator and active member reads while excluding other identities', () => {
    for (const role of ['viewer', 'member', 'admin']) {
      expect(canRead(roomsSchema, role, record, 'alice', membership)).toBe(true)
      expect(canRead(roomsSchema, role, record, 'bob', membership)).toBe(true)
      expect(canRead(roomsSchema, role, record, 'stranger', membership)).toBe(false)
    }
    expect(canRead(roomsSchema, '*', record, '', membership)).toBe(false)
  })
  it('denies direct writes and invite reads for all client roles', () => {
    for (const schema of [roomsSchema, roomMembersSchema, roomInvitesSchema]) {
      for (const role of ['*', 'viewer', 'member', 'admin']) {
        expect(canCreate(schema, role)).toBe(false)
        expect(canUpdate(schema, role, record, 'alice', membership)).toBe(false)
      }
    }
    expect(canRead(roomInvitesSchema, 'admin', { data: {}, createdBy: 'alice' }, 'alice')).toBe(false)
  })
})
