import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { createRoom, updateRoom, getRoomMembers, createRoomInvite, joinRoom } from './rooms'
import { proposeOption, postComment, castVote } from './collaboration'

export const actions: Record<string, ActionHandler<Env>> = {
  createRoom, updateRoom, getRoomMembers, createRoomInvite, joinRoom,
  proposeOption, postComment, castVote,
}
