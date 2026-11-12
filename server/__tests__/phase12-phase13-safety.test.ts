// Automated version of the live verification run by hand throughout
// Phase 12 and 13's development (see their commit messages). Spins up a
// real instance of the server (same server/index.ts a deploy runs) against
// a throwaway SQLite file, then exercises it over real HTTP exactly like a
// client would — no mocking of the sealed-content gate or the scoring
// path, since those are exactly what this file exists to prove.
//
// Covers the two things the spec's Definition of Done calls out by name:
// "tests proving sealed content cannot be read by non-authors before
// reveal, and that game scores cannot be set from the client."

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PORT = 5799
const BASE = `http://localhost:${PORT}`
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

let dataDir: string

// Node's fetch types return Promise<unknown> from Response.json(), which is
// exactly right for production code but just friction in a test file that
// immediately destructures ad hoc response shapes — every call site below
// casts it away explicitly rather than typing out each response shape.

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-test-'))
  process.env.DATA_DIR = dataDir
  process.env.PORT = String(PORT)
  await import('../index.js')
  // index.ts's app.listen is async; poll briefly rather than guessing a
  // fixed delay.
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${BASE}/api/me`)
      return
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  throw new Error('server never came up')
}, 20000)

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true })
})

async function signup(username: string): Promise<{ id: string; token: string }> {
  const res = await fetch(`${BASE}/api/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password: 'password123',
      displayName: username,
      accountType: 'individual',
      email: `${username}@example.com`,
      firstName: username,
    }),
  })
  const body = await res.json() as any
  if (!res.ok) throw new Error(`signup failed for ${username}: ${JSON.stringify(body)}`)
  return body
}

async function follow(token: string, username: string) {
  await fetch(`${BASE}/api/follow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ username }),
  })
}

describe('Phase 12: sealed group prompts never leak before reveal', () => {
  it('hides a sealed response from every role except its own author, and reveals it to everyone once complete', async () => {
    const sender = await signup('t12sender')
    const a = await signup('t12a')
    const b = await signup('t12b')
    const stranger = await signup('t12stranger')

    // Mutual follows so the default 'mutuals' permission allows the send.
    for (const other of [a, b]) {
      await follow(sender.token, other.id === a.id ? 't12a' : 't12b')
      await follow(other.token, 't12sender')
    }
    // stranger follows A (to test the "other recipient's follower" leak path)
    await follow(stranger.token, 't12a')

    const groupRes = await fetch(`${BASE}/api/prompts/group`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sender.token}` },
      body: JSON.stringify({ recipientUsernames: ['t12a', 't12b'], category: 'snap', text: 'sealed test prompt', sealed: true, deadlineHours: 48 }),
    })
    expect(groupRes.status).toBe(201)
    const { id: groupId } = await groupRes.json() as any

    // Only A completes; B stays pending, so the group is not yet revealed.
    const received = await (
      await fetch(`${BASE}/api/prompt-groups/received`, { headers: { Authorization: `Bearer ${a.token}` } })
    ).json() as any
    const aPromptId = received.find((r: { groupId: string }) => r.groupId === groupId).promptId

    const completeRes = await fetch(`${BASE}/api/prompts/${aPromptId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` },
      body: JSON.stringify({ mediaDataUrl: TINY_PNG, mediaType: 'photo', caption: 'a secret answer only A should see' }),
    })
    expect(completeRes.status).toBe(200)

    // --- Role 1: the sender sees only a progress count, never content ---
    const senderView = await (
      await fetch(`${BASE}/api/prompt-groups/${groupId}`, { headers: { Authorization: `Bearer ${sender.token}` } })
    ).json() as any
    expect(senderView.completed).toBe(1)
    expect(senderView.total).toBe(2)
    const aFromSender = senderView.responses.find((r: { username: string }) => r.username === 't12a')
    expect(aFromSender.mediaDataUrl).toBeUndefined()
    expect(aFromSender.userCaption).toBeUndefined()

    // --- Role 2: the other recipient (B) sees A has answered but not what ---
    const bView = await (
      await fetch(`${BASE}/api/prompt-groups/${groupId}`, { headers: { Authorization: `Bearer ${b.token}` } })
    ).json() as any
    const aFromB = bView.responses.find((r: { username: string }) => r.username === 't12a')
    expect(aFromB.mediaDataUrl).toBeUndefined()
    expect(aFromB.userCaption).toBeUndefined()

    // --- Role 3: a stranger who follows A can't see it via the following feed ---
    const strangerFeed = await (
      await fetch(`${BASE}/api/feed/following`, { headers: { Authorization: `Bearer ${stranger.token}` } })
    ).json() as any
    expect(strangerFeed.find((c: { id: string }) => c.id === aPromptId)).toBeUndefined()

    // --- Role 4: a stranger can't see it on A's public profile either ---
    const publicActivity = await (await fetch(`${BASE}/api/accounts/t12a/activity`, { headers: { Authorization: `Bearer ${stranger.token}` } })).json() as any
    expect(publicActivity.find((c: { id: string }) => c.id === aPromptId)).toBeUndefined()

    // --- Role 5: reacting to it as a non-author is refused (the route
    // reports a sealed/invisible completion as 404, same as a genuinely
    // nonexistent one, rather than confirming it exists via a 403) ---
    const reactRes = await fetch(`${BASE}/api/completions/${aPromptId}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stranger.token}` },
      body: JSON.stringify({ kind: 'laugh' }),
    })
    expect(reactRes.status).toBe(404)

    // --- Role 6: an unrelated account gets 404 on the group entirely ---
    const strangerGroupRes = await fetch(`${BASE}/api/prompt-groups/${groupId}`, { headers: { Authorization: `Bearer ${stranger.token}` } })
    expect(strangerGroupRes.status).toBe(404)

    // --- Role 7: unauthenticated gets 401 ---
    const anonRes = await fetch(`${BASE}/api/prompt-groups/${groupId}`)
    expect(anonRes.status).toBe(401)

    // A can always see their own content.
    const aOwnView = await (
      await fetch(`${BASE}/api/prompt-groups/${groupId}`, { headers: { Authorization: `Bearer ${a.token}` } })
    ).json() as any
    expect(aOwnView.responses.find((r: { username: string }) => r.username === 't12a').userCaption).toBe('a secret answer only A should see')

    // --- Now B completes too: the group should auto-reveal, and the
    // content becomes visible to everyone, including the sender. ---
    const bPromptId = received.find((r: { groupId: string }) => r.groupId === groupId)
      ? (
          await (await fetch(`${BASE}/api/prompt-groups/received`, { headers: { Authorization: `Bearer ${b.token}` } })).json() as any
        ).find((r: { groupId: string }) => r.groupId === groupId).promptId
      : null
    await fetch(`${BASE}/api/prompts/${bPromptId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${b.token}` },
      body: JSON.stringify({ mediaDataUrl: TINY_PNG, mediaType: 'photo', caption: 'b answer' }),
    })

    const revealedView = await (
      await fetch(`${BASE}/api/prompt-groups/${groupId}`, { headers: { Authorization: `Bearer ${sender.token}` } })
    ).json() as any
    expect(revealedView.revealedAt).not.toBeNull()
    expect(revealedView.responses.find((r: { username: string }) => r.username === 't12a').userCaption).toBe('a secret answer only A should see')
  })
})

describe('Phase 13: game scores cannot be set from the client', () => {
  it('has no request parameter that lets a client set its own or anyone else’s points', async () => {
    const owner = await signup('t13owner')
    const member = await signup('t13member')
    await follow(owner.token, 't13member')
    await follow(member.token, 't13owner')

    const boardRes = await fetch(`${BASE}/api/boards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ name: 'Test', description: 'd', category: 'interest', visibility: 'public' }),
    })
    const board = await boardRes.json() as any
    await fetch(`${BASE}/api/boards/${board.id}/subscribe`, { method: 'POST', headers: { Authorization: `Bearer ${member.token}` } })
    await fetch(`${BASE}/api/boards/${board.id}/game`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ enabled: true, timezone: 'UTC', hideRanks: false }),
    })

    // No completions have happened yet: the leaderboard must show zero
    // points regardless of what a crafted request claims.
    const before = await (
      await fetch(`${BASE}/api/boards/${board.id}/game/leaderboard`, { headers: { Authorization: `Bearer ${member.token}` } })
    ).json() as any
    expect(before.entries).toEqual([])

    // There is no endpoint that accepts a points value at all — the only
    // way points change is completing a real prompt, which the server
    // scores itself from the stored completion. Confirm a crafted
    // leaderboard-shaped POST (which doesn't exist) is rejected rather
    // than silently accepted by some other route.
    const craftedRes = await fetch(`${BASE}/api/boards/${board.id}/game/leaderboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
      body: JSON.stringify({ username: 't13member', points: 999999 }),
    })
    expect(craftedRes.status).toBe(404)

    // Complete one real prompt, then confirm the resulting score matches
    // exactly what gameScoring.ts's formula would produce (base + early +
    // first-category variety), not a client-influenced number.
    const challengeRes = await fetch(`${BASE}/api/boards/${board.id}/challenges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ category: 'snap', text: 'score test', cadence: 'one-off' }),
    })
    const challenge = await challengeRes.json() as any
    await fetch(`${BASE}/api/prompts/${challenge.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.token}` },
      // Even if a crafted body tries to smuggle a points field in, the
      // completion endpoint only ever reads mediaDataUrl/mediaType/caption.
      body: JSON.stringify({ mediaDataUrl: TINY_PNG, mediaType: 'photo', points: 999999 }),
    })

    const after = await (
      await fetch(`${BASE}/api/boards/${board.id}/game/leaderboard`, { headers: { Authorization: `Bearer ${member.token}` } })
    ).json() as any
    expect(after.entries).toHaveLength(1)
    expect(after.entries[0].points).toBe(16) // base 10 + early 3 + first-category variety 3
    expect(after.entries[0].points).not.toBe(999999)
  })
})
