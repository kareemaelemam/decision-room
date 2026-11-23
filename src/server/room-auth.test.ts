import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { registerActionRoutes } from './action-routes'
import type { AppContext } from '../../worker'

describe('room action HTTP authentication boundary', () => {
  it('rejects anonymous room creation and joining before any storage access', async () => {
    const app = new Hono<AppContext>()
    registerActionRoutes(app, async () => null)
    for (const name of ['createRoom', 'joinRoom', 'getRoomMembers', 'createRoomInvite', 'updateRoom', 'proposeOption', 'postComment', 'castVote']) {
      const response = await app.request(`/api/actions/${name}`, { method: 'POST', body: '{}' })
      expect(response.status).toBe(401)
    }
  })
})
