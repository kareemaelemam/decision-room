import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionContext, ActionTools } from 'deepspace/worker'
import { canCreate, canRead, canUpdate } from 'deepspace/worker'
import type { Env } from '../../worker'
import { castVote, postComment, proposeOption } from './collaboration'
import { optionsSchema, commentsSchema, votesSchema } from '../schemas/collaboration-schema'
import { voteResults, type RoomOption } from '../rooms/collaboration'

const roomId = 'f6d2fa84-0633-433d-bdd7-24f919c68109'
const optionId = 'f6d2fa84-0633-433d-bdd7-24f919c68110'
const get = vi.fn(), query = vi.fn(), create = vi.fn()
const context = (params: Record<string, unknown>, userId = 'alice') => ({ params, userId, env: {}, callerJwt: 'unused', tools: { get, query, create } as unknown as ActionTools }) as ActionContext<Env>
beforeEach(() => {
  vi.resetAllMocks()
  get.mockImplementation(async (collection: string) => ({ success: true, data: { record: { data: collection === 'decision_rooms' ? { creatorId: 'alice', status: 'Open' } : { roomId } } } }))
  query.mockResolvedValue({ success: true, data: { records: [] } })
  create.mockResolvedValue({ success: true, data: { recordId: optionId } })
})

describe('collaboration action boundaries', () => {
  it('binds option/comment authors and vote identity to the verified caller', async () => {
    expect((await proposeOption(context({ roomId, title: '  PostgreSQL ', description: ' Durable ' }))).success).toBe(true)
    expect(create).toHaveBeenCalledWith('room_options', expect.objectContaining({ authorId: 'alice', title: 'PostgreSQL', description: 'Durable' }), expect.any(String))
    expect((await postComment(context({ roomId, optionId, message: ' Strong constraints ' }))).success).toBe(true)
    expect(create).toHaveBeenCalledWith('option_comments', expect.objectContaining({ authorId: 'alice', message: 'Strong constraints' }), expect.any(String))
    await castVote(context({ roomId, optionId }))
    const firstId = create.mock.calls.at(-1)![2]
    await castVote(context({ roomId, optionId }))
    expect(create.mock.calls.at(-1)![2]).toBe(firstId)
    expect(create).toHaveBeenLastCalledWith('room_votes', expect.objectContaining({ userId: 'alice', roomId, optionId }), expect.stringMatching(/^vote_[a-f0-9]{64}$/))
  })
  it.each([
    { roomId, title: '   ' }, { roomId, title: 'a'.repeat(101) },
    { roomId, title: 'Valid', description: 'a'.repeat(601) },
    { roomId, title: 'Valid', authorId: 'bob' },
  ])('rejects invalid options or forged authors: %j', async input => {
    expect((await proposeOption(context(input))).success).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })
  it('rejects blank/long comments and forged voter identities', async () => {
    for (const message of ['  ', 'a'.repeat(601)]) expect((await postComment(context({ roomId, optionId, message }))).success).toBe(false)
    expect((await postComment(context({ roomId, optionId, message: 'Hello', authorId: 'bob' }))).success).toBe(false)
    expect((await castVote(context({ roomId, optionId, userId: 'bob' }))).success).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })
  it('refuses all three writes for a nonmember', async () => {
    expect((await proposeOption(context({ roomId, title: 'Bad' }, 'stranger'))).success).toBe(false)
    expect((await postComment(context({ roomId, optionId, message: 'Bad' }, 'stranger'))).success).toBe(false)
    expect((await castVote(context({ roomId, optionId }, 'stranger'))).success).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })
  it('refuses cross-room option references and archived-room writes', async () => {
    get.mockImplementation(async (collection: string) => ({ success: true, data: { record: { data: collection === 'decision_rooms' ? { creatorId: 'alice', status: 'Open' } : { roomId: 'another-room' } } } }))
    expect((await postComment(context({ roomId, optionId, message: 'Bad link' }))).success).toBe(false)
    expect((await castVote(context({ roomId, optionId }))).success).toBe(false)
    get.mockResolvedValue({ success: true, data: { record: { data: { creatorId: 'alice', status: 'Archived' } } } })
    expect((await proposeOption(context({ roomId, title: 'Late' }))).success).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })
  it('surfaces database refusals instead of reporting success', async () => {
    create.mockResolvedValue({ success: false, error: 'offline' })
    expect((await castVote(context({ roomId, optionId }))).success).toBe(false)
  })
})

describe('database privacy and result math', () => {
  it('denies outsiders and all direct writes, including admin writes', () => {
    const record = { data: { roomId }, createdBy: 'alice' }
    const membership = { isTeamMember: (room: string, user: string) => room === roomId && user === 'bob' }
    for (const schema of [optionsSchema, commentsSchema, votesSchema]) for (const role of ['viewer', 'member', 'admin']) {
      expect(canRead(schema, role, record, 'bob', membership)).toBe(true)
      expect(canRead(schema, role, record, 'stranger', membership)).toBe(false)
      expect(canCreate(schema, role)).toBe(false)
      expect(canUpdate(schema, role, record, 'alice', membership)).toBe(false)
    }
  })
  it('handles zero votes and computes totals without a stored counter', () => {
    const options = [{ optionId: 'a' }, { optionId: 'b' }] as RoomOption[]
    expect(voteResults(options, []).options.map(result => result.percentage)).toEqual([0, 0])
    const result = voteResults(options, ['a', 'a', 'b'].map((optionId, index) => ({ optionId, roomId, userId: String(index), updatedAt: 'now' })))
    expect(result.total).toBe(3)
    expect(result.options[0].count).toBe(2)
    expect(result.options[0].percentage).toBeCloseTo(200 / 3)
  })
})
