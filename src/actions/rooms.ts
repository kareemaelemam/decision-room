import { z } from 'zod'
import type { ActionContext, ActionHandler, ActionResult } from 'deepspace/worker'
import type { Env } from '../../worker'
import { roomCategories, type DecisionRoom, type RoomInvite, type RoomMember } from '../rooms/types'

const roomInput = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(600).default(''),
  category: z.enum(roomCategories),
}).strict()
const idInput = z.string().uuid()
const failure = (error: string, code = 'invalid_request'): ActionResult<never> => ({ success: false, error, code })
type Context = ActionContext<Env>

// Missing and unauthorized room IDs deliberately have the same public response.
export async function accessibleRoom(ctx: Context, roomId: string, ownerOnly = false) {
  const result = await ctx.tools.get<DecisionRoom>('decision_rooms', roomId)
  if (!result.success) return null
  const room = result.data.record.data
  if (room.creatorId === ctx.userId) return room
  if (ownerOnly) return null
  const members = await ctx.tools.query<RoomMember>('team_members', {
    where: { teamId: roomId, userId: ctx.userId, status: 'active' }, limit: 1,
  })
  return members.success && members.data.records.length > 0 ? room : null
}

export async function inviteHash(token: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function membershipId(roomId: string, userId: string) {
  return `member_${await inviteHash(JSON.stringify([roomId, userId]))}`
}

export const createRoom: ActionHandler<Env> = async ctx => {
  const input = roomInput.safeParse(ctx.params)
  if (!input.success) return failure('Enter a title (1–100 characters), context up to 600 characters, and a valid category.')
  const roomId = crypto.randomUUID()
  const now = new Date().toISOString()
  const room: DecisionRoom = { ...input.data, roomId, creatorId: ctx.userId, createdAt: now, status: 'Open' }
  const created = await ctx.tools.create('decision_rooms', room, roomId)
  if (!created.success) return failure('Could not save the room. Try again.', 'storage_error')
  const member = await ctx.tools.create('team_members', {
    teamId: roomId, userId: ctx.userId, status: 'active', joinedAt: now,
  }, await membershipId(roomId, ctx.userId))
  if (!member.success) {
    // SDK action calls are separate writes, not a multi-record transaction.
    await ctx.tools.remove('decision_rooms', roomId)
    return failure('Could not initialize room membership. Please retry.', 'storage_error')
  }
  return { success: true, data: { roomId } }
}

export const updateRoom: ActionHandler<Env> = async ctx => {
  const input = roomInput.extend({ roomId: idInput }).safeParse(ctx.params)
  if (!input.success) return failure('Invalid room details.')
  const { roomId, ...fields } = input.data
  if (!await accessibleRoom(ctx, roomId, true)) return failure('Room unavailable or you do not have permission.', 'not_found')
  const saved = await ctx.tools.update('decision_rooms', roomId, fields)
  return saved.success ? { success: true, data: { roomId } } : failure('Could not save changes. Try again.', 'storage_error')
}

export const getRoomMembers: ActionHandler<Env> = async ctx => {
  const input = z.object({ roomId: idInput }).strict().safeParse(ctx.params)
  if (!input.success) return failure('Invalid room ID.')
  if (!await accessibleRoom(ctx, input.data.roomId)) return failure('Room unavailable or you do not have permission.', 'not_found')
  const result = await ctx.tools.query<RoomMember>('team_members', {
    where: { teamId: input.data.roomId, status: 'active' }, limit: 500,
  })
  if (!result.success) return failure('Could not load members. Try again.', 'storage_error')
  // Return an explicit projection; no user emails, profile rows, or invite hashes.
  return { success: true, data: { members: result.data.records.map(({ data }) => ({ userId: data.userId, joinedAt: data.joinedAt })) } }
}

export const createRoomInvite: ActionHandler<Env> = async ctx => {
  const input = z.object({ roomId: idInput }).strict().safeParse(ctx.params)
  if (!input.success) return failure('Invalid room ID.')
  if (!await accessibleRoom(ctx, input.data.roomId, true)) return failure('Room unavailable or you do not have permission.', 'not_found')
  // A reusable 256-bit capability, valid for 7 days. Only its hash is stored.
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const result = await ctx.tools.create('room_invites', {
    roomId: input.data.roomId, creatorId: ctx.userId, expiresAt,
  }, await inviteHash(token))
  return result.success ? { success: true, data: { token, expiresAt } } : failure('Could not create invitation. Try again.', 'storage_error')
}

export const joinRoom: ActionHandler<Env> = async ctx => {
  const input = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict().safeParse(ctx.params)
  if (!input.success) return failure('This invitation is invalid or expired.', 'invalid_invite')
  const result = await ctx.tools.get<RoomInvite>('room_invites', await inviteHash(input.data.token))
  if (!result.success || !Number.isFinite(Date.parse(result.data.record.data.expiresAt)) || Date.parse(result.data.record.data.expiresAt) <= Date.now()) {
    return failure('This invitation is invalid or expired.', 'invalid_invite')
  }
  const invite = result.data.record.data
  const room = await ctx.tools.get<DecisionRoom>('decision_rooms', invite.roomId)
  if (!room.success || room.data.record.data.creatorId !== invite.creatorId) return failure('This invitation is invalid or expired.', 'invalid_invite')
  const recordId = await membershipId(invite.roomId, ctx.userId)
  const existing = await ctx.tools.get<RoomMember>('team_members', recordId)
  if (existing.success && existing.data.record.data.status === 'active') return { success: true, data: { roomId: invite.roomId } }
  // Deterministic ID + uniqueOn avoid duplicate membership, including replay.
  const joined = await ctx.tools.create('team_members', {
    teamId: invite.roomId, userId: ctx.userId, status: 'active', joinedAt: new Date().toISOString(),
  }, recordId)
  return joined.success ? { success: true, data: { roomId: invite.roomId } } : failure('Could not join the room. Try again.', 'storage_error')
}
