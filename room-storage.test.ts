import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { expect, it } from 'vitest'
import { invitationToken } from './src/rooms/invitation-input'

// A standalone test Worker: no platform credentials, OAuth, or development data.
// Synthetic identities are accepted ONLY by this inline, unshipped harness.
const worker = `
import { RecordRoom, authenticatedRoomRequest } from 'deepspace/worker'
import { schemas } from './src/schemas'
import { actions } from './src/actions'
import { createActionTools } from './src/server/action-routes'
export class TestRoom extends RecordRoom {
  constructor(state, env) { super(state, env, schemas, { ownerUserId: 'test-platform-owner' }) }
}
export default {
  async fetch(request, env) {
    const userId = request.headers.get('test-identity') || ''
    if (new URL(request.url).pathname === '/socket') {
      const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName('app:test-room-storage'))
      return stub.fetch(authenticatedRoomRequest(new Request('http://internal/ws', {
        headers: { Upgrade:'websocket' }
      }), userId ? { userId, claims: {} } : null))
    }
    const body = await request.json()
    if (new URL(request.url).pathname === '/action') {
      const result = await actions[body.name]({ userId, params: body.params, env,
        callerJwt: 'unused', tools: createActionTools(env, userId, 'unused') })
      return Response.json(result)
    }
    const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName('app:test-room-storage'))
    return stub.fetch(new Request('https://internal/api/tools/execute', {
      method:'POST', headers:{'Content-Type':'application/json','X-User-Id':userId,
        ...(new URL(request.url).pathname === '/privileged-records' ? {'X-App-Action':'true'} : {})},
      body:JSON.stringify(body)
    }))
  }
}`

type Stored = { title?: string; optionId?: string; message?: string; userId?: string }
type Result = { success: boolean; error?: string; data?: { roomId?: string; optionId?: string; token?: string; records?: { data: Stored }[]; members?: unknown[] } }

it('persists real SQLite rooms across Worker restarts and enforces member access', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'decisionroom-storage-'))
  const bundle = await build({
    stdin: { contents: worker, loader: 'ts', resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
    bundle: true, write: false, format: 'esm', target: 'es2022', platform: 'browser',
  })
  // Installed Miniflare 5 exposes the documented V4-options adapter.
  const options = convertV4MiniflareOptions({
    modules: true,
    script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-01-01',
    compatibilityFlags: ['nodejs_compat'],
    durableObjects: { RECORD_ROOMS: { className: 'TestRoom', useSQLite: true } },
    resourcePersistencePath: temp,
    bindings: { DEEPSPACE_APP_ID: 'test-room-storage' },
  })
  let runtime: Miniflare | undefined
  async function call(identity: string, path: string, body: object): Promise<Result> {
    const response = await runtime!.dispatchFetch(`http://test${path}`, {
      method: 'POST', headers: { 'test-identity': identity, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    return response.json() as Promise<Result>
  }
  const action = (identity: string, name: string, params: object) => call(identity, '/action', { name, params })
  const list = (identity: string, collection = 'decision_rooms') => call(identity, '/records', { tool: 'records.query', params: { collection } })
  async function liveClient(identity: string) {
    const response = await runtime!.dispatchFetch('http://test/socket', { headers: { Upgrade: 'websocket', 'test-identity': identity } })
    const socket = response.webSocket!
    socket.accept()
    const rows = new Map<string, Map<string, Stored>>()
    const collections = ['room_options', 'option_comments', 'room_votes']
    await new Promise<void>((done, reject) => {
      const timer = setTimeout(() => reject(new Error('Live client snapshot timed out')), 4000)
      const loaded = new Set<string>()
      socket.addEventListener('message', event => {
        if (typeof event.data !== 'string') return
        const message = JSON.parse(event.data)
        if (message.type === 'core.query_result' && collections.includes(message.payload.subscriptionId)) {
          rows.set(message.payload.subscriptionId, new Map(message.payload.records.map((record: { recordId: string; data: Stored }) => [record.recordId, record.data])))
          loaded.add(message.payload.subscriptionId)
          if (loaded.size === collections.length) { clearTimeout(timer); done() }
        }
        if (message.type === 'core.record_change' && collections.includes(message.payload.collection)) {
          const { collection, record, changeType } = message.payload
          const data = rows.get(collection)!
          if (changeType === 'delete') data.delete(record.recordId)
          else data.set(record.recordId, record.data)
        }
      })
      for (const collection of collections) socket.send(JSON.stringify({ type: 'core.subscribe', payload: { subscriptionId: collection, query: { collection } } }))
    })
    return { rows, close: () => socket.close(1000) }
  }
  async function subscribedRooms(identity: string) {
    const response = await runtime!.dispatchFetch('http://test/socket', { headers: { Upgrade: 'websocket', 'test-identity': identity } })
    const socket = response.webSocket!
    expect(socket).toBeTruthy()
    socket.accept()
    try {
      return await new Promise<unknown[]>((done, reject) => {
        const timeout = setTimeout(() => reject(new Error('Room subscription timed out')), 4000)
        socket.addEventListener('message', event => {
          if (typeof event.data !== 'string') return
          const message = JSON.parse(event.data)
          if (message.type === 'core.query_result' && message.payload.subscriptionId === 'room-test') {
            clearTimeout(timeout)
            done(message.payload.records)
          }
        })
        socket.send(JSON.stringify({ type: 'core.subscribe', payload: { subscriptionId: 'room-test', query: { collection: 'decision_rooms' } } }))
      })
    } finally { socket.close(1000) }
  }
  try {
    runtime = new Miniflare(options)
    const created = await action('alice', 'createRoom', { title: 'Persistent decision', description: 'Actual SQLite data', category: 'Engineering' })
    expect(created.success, created.error).toBe(true)
    const roomId = created.data!.roomId!
    expect((await list('alice')).data?.records).toHaveLength(1)
    expect((await list('bob')).data?.records).toHaveLength(0)
    expect((await list('')).data?.records).toHaveLength(0)
    expect((await list('test-platform-owner')).data?.records).toHaveLength(0)
    expect(await subscribedRooms('alice')).toHaveLength(1)
    expect(await subscribedRooms('bob')).toHaveLength(0)
    expect((await call('bob', '/records', { tool: 'records.get', params: { collection: 'decision_rooms', recordId: roomId } })).success).toBe(false)
    expect((await call('alice', '/records', { tool: 'records.update', params: { collection: 'decision_rooms', recordId: roomId, data: { creatorId: 'bob' } } })).success).toBe(false)
    expect((await call('bob', '/records', { tool: 'records.create', params: { collection: 'team_members', data: { teamId: roomId, userId: 'bob', status: 'active' } } })).success).toBe(false)
    expect((await action('bob', 'getRoomMembers', { roomId })).success).toBe(false)
    expect((await action('bob', 'updateRoom', { roomId, title: 'Stolen', category: 'Product' })).success).toBe(false)

    const invitation = await action('alice', 'createRoomInvite', { roomId })
    expect(invitation.success, invitation.error).toBe(true)
    expect((await list('alice', 'room_invites')).data?.records).toHaveLength(0)
    const pastedToken = invitationToken(`https://decision-room.app.space/join#${invitation.data!.token}`)
    expect(pastedToken).toBe(invitation.data!.token)
    expect((await action('bob', 'joinRoom', { token: pastedToken })).success).toBe(true)
    expect((await action('bob', 'joinRoom', { token: invitation.data!.token })).success).toBe(true)
    expect((await list('bob')).data?.records).toHaveLength(1)
    expect(await subscribedRooms('bob')).toHaveLength(1)
    expect(await subscribedRooms('stranger')).toHaveLength(0)
    expect((await action('bob', 'getRoomMembers', { roomId })).data?.members).toHaveLength(2)
    expect((await action('bob', 'createRoomInvite', { roomId })).success).toBe(false)
    expect((await list('stranger')).data?.records).toHaveLength(0)
    expect((await action('alice', 'updateRoom', { roomId, title: 'Confirmed change', description: 'Saved', category: 'Design' })).success).toBe(true)

    // Three simultaneously connected clients, with genuine SDK WebSocket
    // snapshots and incremental messages. No polling of the database.
    const alice = await liveClient('alice'), bob = await liveClient('bob'), stranger = await liveClient('stranger')
    let firstOption: string
    let secondOption: string
    try {
      const first = await action('alice', 'proposeOption', { roomId, title: 'PostgreSQL', description: 'Strong constraints' })
      const second = await action('bob', 'proposeOption', { roomId, title: 'SQLite', description: 'Simple operations' })
      expect(first.success, first.error).toBe(true)
      expect(second.success, second.error).toBe(true)
      firstOption = first.data!.optionId!; secondOption = second.data!.optionId!
      await expect.poll(() => alice.rows.get('room_options')!.size).toBe(2)
      await expect.poll(() => bob.rows.get('room_options')!.size).toBe(2)
      expect((await action('bob', 'postComment', { roomId, optionId: firstOption, message: 'Useful for our workload' })).success).toBe(true)
      await expect.poll(() => alice.rows.get('option_comments')!.size).toBe(1)
      await expect.poll(() => bob.rows.get('option_comments')!.size).toBe(1)

      const attempts = await Promise.all(Array.from({ length: 12 }, (_, index) => action('alice', 'castVote', { roomId, optionId: index % 2 ? firstOption : secondOption })))
      expect(attempts.every(result => result.success)).toBe(true)
      expect((await list('alice', 'room_votes')).data!.records).toHaveLength(1)
      // Even an accidental privileged insert with a different ID cannot
      // bypass the database's composite uniqueness constraint.
      expect((await call('alice', '/privileged-records', { tool: 'records.create', params: {
        collection: 'room_votes', recordId: 'duplicate-vote-id', data: { roomId, optionId: firstOption, userId: 'alice', updatedAt: new Date().toISOString() },
      } })).success).toBe(false)
      expect((await action('alice', 'castVote', { roomId, optionId: secondOption })).success).toBe(true)
      expect((await action('bob', 'castVote', { roomId, optionId: firstOption })).success).toBe(true)
      await expect.poll(() => alice.rows.get('room_votes')!.size).toBe(2)
      await expect.poll(() => bob.rows.get('room_votes')!.size).toBe(2)
      expect([...bob.rows.get('room_votes')!.values()].find(vote => vote.userId === 'alice')?.optionId).toBe(secondOption)
      for (const collection of ['room_options', 'option_comments', 'room_votes']) {
        expect((await list('stranger', collection)).data!.records).toHaveLength(0)
        expect(stranger.rows.get(collection)!.size).toBe(0)
        expect((await call('bob', '/records', { tool: 'records.create', params: { collection, data: { roomId, optionId: firstOption, userId: 'bob' } } })).success).toBe(false)
      }
      expect((await action('stranger', 'proposeOption', { roomId, title: 'Intrusion' })).success).toBe(false)
      expect((await action('stranger', 'postComment', { roomId, optionId: firstOption, message: 'Intrusion' })).success).toBe(false)
      expect((await action('stranger', 'castVote', { roomId, optionId: firstOption })).success).toBe(false)
      const other = await action('alice', 'createRoom', { title: 'Other room', category: 'Product' })
      const foreign = await action('alice', 'proposeOption', { roomId: other.data!.roomId, title: 'Foreign option' })
      for (const name of ['castVote', 'postComment']) expect((await action('alice', name, { roomId, optionId: foreign.data!.optionId, ...(name === 'postComment' ? { message: 'Cross-room' } : {}) })).success).toBe(false)
    } finally { alice.close(); bob.close(); stranger.close() }

    await runtime.dispose()
    runtime = new Miniflare(options)
    expect((await list('alice')).data?.records?.some(record => record.data.title === 'Confirmed change')).toBe(true)
    expect((await list('bob')).data?.records?.[0]?.data.title).toBe('Confirmed change')
    expect((await list('stranger')).data?.records).toHaveLength(0)
    expect((await list('bob', 'room_options')).data?.records).toHaveLength(2)
    expect((await list('bob', 'option_comments')).data?.records).toHaveLength(1)
    expect((await list('bob', 'room_votes')).data?.records).toHaveLength(2)
    const reconnected = await liveClient('bob')
    try {
      expect(reconnected.rows.get('room_votes')!.size).toBe(2)
      expect((await action('alice', 'castVote', { roomId, optionId: firstOption! })).success).toBe(true)
      await expect.poll(() => [...reconnected.rows.get('room_votes')!.values()].filter(vote => vote.optionId === firstOption).length).toBe(2)
    } finally { reconnected.close() }
  } finally {
    await runtime?.dispose()
    // Only delete the exact absolute temporary directory created by this test.
    if (resolve(temp).startsWith(resolve(tmpdir()) + '\\') || resolve(temp).startsWith(resolve(tmpdir()) + '/')) rmSync(temp, { recursive: true, force: true })
  }
}, 60000)
