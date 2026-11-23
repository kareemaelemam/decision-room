import { z } from 'zod'
import type { ActionContext, ActionHandler, ActionResult } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { RoomOption } from '../rooms/collaboration'
import { accessibleRoom, inviteHash } from './rooms'

const roomId = z.string().uuid()
const target = z.object({ roomId, optionId: z.string().uuid() }).strict()
const refuse = (error: string, code = 'invalid_request'): ActionResult<never> => ({ success: false, error, code })

async function writableRoom(ctx: ActionContext<Env>, id: string) {
  if (!ctx.userId) return false
  const room = await accessibleRoom(ctx, id)
  return room?.status === 'Open'
}
async function matchingOption(ctx: ActionContext<Env>, id: string, optionId: string) {
  const option = await ctx.tools.get<RoomOption>('room_options', optionId)
  return option.success && option.data.record.data.roomId === id
}

export const proposeOption: ActionHandler<Env> = async ctx => {
  const parsed = z.object({ roomId, title: z.string().trim().min(1).max(100), description: z.string().trim().max(600).default('') }).strict().safeParse(ctx.params)
  if (!parsed.success) return refuse('Enter an option title (1–100 characters) and context up to 600 characters.')
  if (!await writableRoom(ctx, parsed.data.roomId)) return refuse('Room unavailable or not open for contributions.', 'not_found')
  const optionId = crypto.randomUUID()
  const result = await ctx.tools.create('room_options', {
    ...parsed.data, optionId, authorId: ctx.userId, createdAt: new Date().toISOString(),
  }, optionId)
  return result.success ? { success: true, data: { optionId } } : refuse('Could not save the option. Check your connection and room before retrying.', 'storage_error')
}

export const postComment: ActionHandler<Env> = async ctx => {
  const parsed = target.extend({ message: z.string().trim().min(1).max(600) }).safeParse(ctx.params)
  if (!parsed.success) return refuse('Enter a comment between 1 and 600 characters.')
  const { roomId, optionId } = parsed.data
  if (!await writableRoom(ctx, roomId) || !await matchingOption(ctx, roomId, optionId)) return refuse('Room or option unavailable.', 'not_found')
  const result = await ctx.tools.create('option_comments', {
    ...parsed.data, authorId: ctx.userId, createdAt: new Date().toISOString(),
  }, crypto.randomUUID())
  return result.success ? { success: true, data: {} } : refuse('Could not save the comment. Check the discussion before retrying.', 'storage_error')
}

export const castVote: ActionHandler<Env> = async ctx => {
  const parsed = target.safeParse(ctx.params)
  if (!parsed.success) return refuse('Choose a valid room option.')
  const { roomId, optionId } = parsed.data
  if (!await writableRoom(ctx, roomId) || !await matchingOption(ctx, roomId, optionId)) return refuse('Room or option unavailable.', 'not_found')
  const voteId = `vote_${await inviteHash(JSON.stringify([roomId, ctx.userId]))}`
  // One atomic DO upsert, never a read-then-insert or delete-then-create.
  // Deterministic ID + database uniqueOn protect repeated/concurrent calls.
  const result = await ctx.tools.create('room_votes', {
    roomId, optionId, userId: ctx.userId, updatedAt: new Date().toISOString(),
  }, voteId)
  return result.success ? { success: true, data: { optionId } } : refuse('Could not save your vote. Reconnect and try again.', 'storage_error')
}
