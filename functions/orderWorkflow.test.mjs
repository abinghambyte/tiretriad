import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { FieldValue } = require('firebase-admin/firestore')
const {
  handleSlackPayload,
  cancelOrderFromPortal,
} = require('./orderWorkflow')

function createOrderRef(id, initial) {
  const state = { ...initial }
  const ref = {
    id,
    get: async () => ({
      id,
      exists: true,
      ref,
      get: (k) => state[k],
      data: () => ({ ...state }),
    }),
    update: async (patch) => {
      for (const [k, v] of Object.entries(patch)) {
        if (v === FieldValue.delete()) {
          delete state[k]
        } else {
          state[k] = v
        }
      }
    },
  }
  ref.ref = ref
  return { ref, state: () => ({ ...state }) }
}

/**
 * @param {Record<string, Record<string, unknown>>} ordersById
 * @param {Record<string, Record<string, unknown>>} [tiresByMspn]
 */
function createMockDb(ordersById, tiresByMspn = {}) {
  const handles = {}
  for (const [id, data] of Object.entries(ordersById)) {
    handles[id] = createOrderRef(id, data)
  }
  const metaSets = []
  return {
    handles,
    metaSets,
    collection(name) {
      if (name === 'orders') {
        return {
          doc(id) {
            const h = handles[id]
            if (!h) {
              return {
                get: async () => ({
                  id,
                  exists: false,
                  ref: { update: async () => {} },
                  get: () => undefined,
                  data: () => ({}),
                }),
              }
            }
            return h.ref
          },
        }
      }
      if (name === 'meta') {
        return {
          doc(id) {
            return {
              set: async (data, opts) => {
                metaSets.push({ id, data, opts })
              },
            }
          },
        }
      }
      if (name === 'tires') {
        return {
          doc(mspn) {
            const t = tiresByMspn[mspn]
            return {
              get: async () => ({
                id: mspn,
                exists: Boolean(t),
                get: (k) => (t || {})[k],
                data: () => t || {},
              }),
            }
          },
        }
      }
      throw new Error(`unexpected collection: ${name}`)
    },
  }
}

describe('orderWorkflow integration', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true }),
      })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('handleSlackPayload rejects block action with empty order id (guard)', async () => {
    const db = createMockDb({})
    const out = await handleSlackPayload(db, 'tok', '#fleet', {
      type: 'block_actions',
      actions: [{ action_id: 'confirm_availability', value: '   ' }],
      trigger_id: 'tr',
    })
    expect(out).toEqual({ kind: 'empty' })
  })

  it('handleSlackPayload price_check_match advances order to available and calls Slack chat.update', async () => {
    const createdAt = { toMillis: () => Date.now() - 120_000 }
    const db = createMockDb({
      ord1: {
        status: 'pending',
        pendingKylePriceCheck: true,
        priceCheckSnapshot: { sysPrice: 80, fet: 5, systemCombined: 85, description: 'Test', mspn: 'M1' },
        createdAt,
        mspn: 'M1',
        slackMessageTs: '111.222',
        slackChannelId: 'C777',
        quantity: 1,
      },
    })
    await handleSlackPayload(db, 'tok', '#fleet', {
      type: 'block_actions',
      actions: [{ action_id: 'price_check_match', value: 'ord1' }],
      trigger_id: 'tr',
    })
    const st = db.handles.ord1.state()
    expect(st.status).toBe('available')
    expect(st.pendingKylePriceCheck).toBeUndefined()
    expect(globalThis.fetch).toHaveBeenCalled()
    const slackCalls = globalThis.fetch.mock.calls.filter((c) => String(c[0]).includes('slack.com/api/chat.update'))
    expect(slackCalls.length).toBeGreaterThanOrEqual(1)
    const [, init] = slackCalls[0]
    const body = JSON.parse(init.body)
    expect(body.channel).toBe('C777')
    expect(body.ts).toBe('111.222')
  })

  it('cancelOrderFromPortal throws when order is missing (guard)', async () => {
    const db = createMockDb({})
    await expect(
      cancelOrderFromPortal(db, '', '', 'missing-id', 'ghost', ''),
    ).rejects.toThrow(/not found/i)
  })

  it('cancelOrderFromPortal throws on invalid disposition (validation)', async () => {
    const db = createMockDb({
      ord2: {
        status: 'pending',
        slackMessageTs: '1.2',
        slackChannelId: 'C1',
        customerContact: '+15551234567',
      },
    })
    await expect(
      cancelOrderFromPortal(db, 'tok', '#c', 'ord2', 'not_a_real_reason', ''),
    ).rejects.toThrow(/valid cancellation reason/i)
  })

  it('cancelOrderFromPortal completes a cancellable order with pricing disposition', async () => {
    const db = createMockDb({
      ord3: {
        status: 'pending',
        slackMessageTs: '9.9',
        slackChannelId: 'C9',
        customerContact: '+15559876543',
      },
    })
    await cancelOrderFromPortal(db, 'tok', '#c', 'ord3', 'pricing', '')
    expect(db.handles.ord3.state().status).toBe('cancelled')
    expect(db.handles.ord3.state().cancellationDisposition).toBe('pricing')
    expect(db.metaSets.length).toBeGreaterThanOrEqual(1)
    expect(db.metaSets[0].id).toBe('djStats')
  })
})
