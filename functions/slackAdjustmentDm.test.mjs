import { createRequire } from 'node:module'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const require = createRequire(import.meta.url)

const fetchMock = vi.fn()
global.fetch = fetchMock

const { _testonly } = require('./slackAdjustmentDm.js')
const { postAdjustmentDm, postDm } = _testonly

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ status: 200, json: async () => ({ ok: true }) })
  process.env.SLACK_BOT_TOKEN = 'xoxb-test'
})

function makeFirestore({ users }) {
  return {
    collection: (name) => ({
      where: (field, _op, value) => ({
        get: async () => ({
          docs: name === 'users'
            ? users.filter((u) => u[field] === value).map((u) => ({ data: () => u }))
            : [],
        }),
      }),
    }),
  }
}

describe('postDm', () => {
  it('short-circuits when no token', async () => {
    delete process.env.SLACK_BOT_TOKEN
    const res = await postDm('U1', 'hi')
    expect(res).toEqual({ ok: false, skipped: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('short-circuits when no slackUserId', async () => {
    const res = await postDm('', 'hi')
    expect(res).toEqual({ ok: false, skipped: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns ok when Slack accepts the message', async () => {
    const res = await postDm('U1', 'hi')
    expect(res.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://slack.com/api/chat.postMessage')
    expect(opts.headers.Authorization).toBe('Bearer xoxb-test')
    const body = JSON.parse(opts.body)
    expect(body.channel).toBe('U1')
    expect(body.text).toBe('hi')
  })

  it('returns ok=false when Slack returns an error', async () => {
    fetchMock.mockResolvedValueOnce({ status: 200, json: async () => ({ ok: false, error: 'channel_not_found' }) })
    const res = await postDm('U1', 'hi')
    expect(res.ok).toBe(false)
    expect(res.error).toBe('channel_not_found')
  })
})

describe('postAdjustmentDm', () => {
  it('skips silently when no token', async () => {
    delete process.env.SLACK_BOT_TOKEN
    const fs = makeFirestore({ users: [{ crewKey: 'dj', slackUserId: 'U1' }] })
    await postAdjustmentDm({ firestore: fs, crewKey: 'dj', delta: -12.45, newBalance: 200, orderId: 'O1', invoiceDocNumber: 'DA1' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts a DM to each crew member with a slackUserId', async () => {
    const fs = makeFirestore({ users: [
      { crewKey: 'dj', slackUserId: 'U_DJ' },
      { crewKey: 'dj', slackUserId: null },
      { crewKey: 'dj', slackUserId: '' },
    ] })
    await postAdjustmentDm({ firestore: fs, crewKey: 'dj', delta: -12.45, newBalance: 200, orderId: 'O1', invoiceDocNumber: 'DA1' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, opts] = fetchMock.mock.calls[0]
    const body = JSON.parse(opts.body)
    expect(body.channel).toBe('U_DJ')
    expect(body.text).toContain('-$12.45')
    expect(body.text).toContain('O1')
    expect(body.text).toContain('DA1')
    expect(body.text).toContain('$200.00')
    expect(body.text).toContain('/people/earnings')
  })

  it('posts to multiple matching users', async () => {
    const fs = makeFirestore({ users: [
      { crewKey: 'dj', slackUserId: 'U_A' },
      { crewKey: 'dj', slackUserId: 'U_B' },
      { crewKey: 'alex', slackUserId: 'U_C' },
    ] })
    await postAdjustmentDm({ firestore: fs, crewKey: 'dj', delta: 5, newBalance: 100, orderId: 'O2', invoiceDocNumber: 'DA2' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const channels = fetchMock.mock.calls.map(([, o]) => JSON.parse(o.body).channel).sort()
    expect(channels).toEqual(['U_A', 'U_B'])
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.text).toContain('+$5.00')
  })

  it('does nothing when no users match', async () => {
    const fs = makeFirestore({ users: [{ crewKey: 'alex', slackUserId: 'U_A' }] })
    await postAdjustmentDm({ firestore: fs, crewKey: 'dj', delta: -10, newBalance: 50, orderId: 'O3', invoiceDocNumber: 'DA3' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns silently on non-finite delta', async () => {
    const fs = makeFirestore({ users: [{ crewKey: 'dj', slackUserId: 'U1' }] })
    await postAdjustmentDm({ firestore: fs, crewKey: 'dj', delta: NaN, newBalance: 50, orderId: 'O', invoiceDocNumber: 'DA' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to a generic invoice label when invoiceDocNumber is null', async () => {
    const fs = makeFirestore({ users: [{ crewKey: 'dj', slackUserId: 'U_DJ' }] })
    await postAdjustmentDm({ firestore: fs, crewKey: 'dj', delta: -1, newBalance: 0, orderId: 'O1', invoiceDocNumber: null })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.text).toContain('an eFleet invoice')
    expect(body.text).not.toContain('null')
  })
})
