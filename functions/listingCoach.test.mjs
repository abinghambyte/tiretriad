import { describe, expect, it, beforeEach } from 'vitest'
import { _testonly } from './listingCoach.js'

const { handle, addRuleHandler, toggleRuleHandler, removeRuleHandler } = _testonly

function fakeFirestore({ tire = null, payoutCfg = null, rules = [] } = {}) {
  return {
    collection: (name) => ({
      doc: (id) => ({
        get: async () => {
          if (name === 'users') return { exists: true, data: () => ({ role: 'admin' }) }
          if (name === 'meta' && id === 'payoutConfig') return { exists: !!payoutCfg, data: () => payoutCfg }
          if (name === 'meta' && id === 'listingCoachStyleGuide') {
            return { exists: rules.length > 0, data: () => ({ rules }) }
          }
          if (name === 'tires' && tire && tire.mspn === id) return { exists: true, data: () => tire, id }
          return { exists: false, data: () => null }
        },
        set: async () => {},
        update: async () => {},
      }),
      where: () => ({
        limit: () => ({ get: async () => ({ docs: [] }) }),
        orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }),
      }),
    }),
  }
}

function fakeAnthropic(replies) {
  let i = 0
  return async ({ system, messages, tools }) => {
    void system; void messages; void tools
    const r = replies[i++] || { stop_reason: 'end_turn', content: [{ type: 'text', text: '(empty)' }] }
    return r
  }
}

describe('handle (listingAdvisor)', () => {
  beforeEach(() => {
    _testonly.__resetRateBuckets()
  })

  it('throws unauthenticated when no auth', async () => {
    const fs = fakeFirestore()
    const fn = handle({ firestore: fs, callAnthropic: fakeAnthropic([]), nowFn: () => 0 })
    await expect(
      fn({ data: { messages: [{ role: 'user', content: 'hi' }] }, auth: null }),
    ).rejects.toThrow(/sign in/i)
  })

  it('throws permission-denied when role is not admin', async () => {
    const fs = {
      collection: () => ({
        doc: () => ({ get: async () => ({ exists: true, data: () => ({ role: 'viewer' }) }) }),
      }),
    }
    const fn = handle({ firestore: fs, callAnthropic: fakeAnthropic([]), nowFn: () => 0 })
    await expect(
      fn({ data: { messages: [{ role: 'user', content: 'hi' }] }, auth: { uid: 'u1' } }),
    ).rejects.toThrow(/admin/i)
  })

  it('end-turn reply returns text without tool loop', async () => {
    const fs = fakeFirestore()
    const replies = [{ stop_reason: 'end_turn', content: [{ type: 'text', text: 'hello world' }] }]
    const fn = handle({ firestore: fs, callAnthropic: fakeAnthropic(replies), nowFn: () => 0 })
    const r = await fn({ data: { messages: [{ role: 'user', content: 'hi' }] }, auth: { uid: 'u1' } })
    expect(r.reply).toBe('hello world')
  })

  it('tool_use loop dispatches to getTireByMspn and feeds back', async () => {
    const tire = {
      mspn: '81501',
      description: 'LT285/70R17 KO2 LRC',
      brand: 'BFGoodrich',
      lr: 'C',
      price: 247,
      fet: 0,
      priceIntel: { retailPrice: 385 },
      salesCount: 0,
      weeklyVelocity: 0,
    }
    const fs = fakeFirestore({ tire })
    const replies = [
      {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'tu_1', name: 'getTireByMspn', input: { mspn: '81501' } }],
      },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Found it - $247 catalog.' }] },
    ]
    const fn = handle({ firestore: fs, callAnthropic: fakeAnthropic(replies), nowFn: () => 0 })
    const r = await fn({
      data: { messages: [{ role: 'user', content: 'lookup 81501' }] },
      auth: { uid: 'u1' },
    })
    expect(r.reply).toContain('$247')
  })

  it('rate-limits at 30/hr', async () => {
    const fs = fakeFirestore()
    const replies = Array.from({ length: 35 }, () => ({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'x' }],
    }))
    let now = 0
    const fn = handle({ firestore: fs, callAnthropic: fakeAnthropic(replies), nowFn: () => now })
    for (let i = 0; i < 30; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await fn({ data: { messages: [{ role: 'user', content: `q${i}` }] }, auth: { uid: 'u1' } })
      now += 1000
    }
    await expect(
      fn({ data: { messages: [{ role: 'user', content: 'q31' }] }, auth: { uid: 'u1' } }),
    ).rejects.toThrow(/rate limit/i)
  })

  it('caps tool loop at 8 iterations to avoid infinite calls', async () => {
    const fs = fakeFirestore()
    const looping = {
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tu_x', name: 'getTireByMspn', input: { mspn: 'X' } }],
    }
    const replies = Array.from({ length: 20 }, () => looping)
    const fn = handle({ firestore: fs, callAnthropic: fakeAnthropic(replies), nowFn: () => 0 })
    await expect(
      fn({ data: { messages: [{ role: 'user', content: 'loop' }] }, auth: { uid: 'u1' } }),
    ).rejects.toThrow(/tool loop/i)
  })
})

function statefulFirestore({ role = 'admin', initialRules = [] } = {}) {
  const state = { rules: initialRules.slice(), exists: initialRules.length > 0 }
  return {
    state,
    collection: (name) => ({
      doc: (id) => ({
        get: async () => {
          if (name === 'users') {
            if (role === null) return { exists: false, data: () => null }
            return { exists: true, data: () => ({ role }) }
          }
          if (name === 'meta' && id === 'listingCoachStyleGuide') {
            return { exists: state.exists, data: () => ({ rules: state.rules }) }
          }
          return { exists: false, data: () => null }
        },
        set: async (val) => {
          if (name === 'meta' && id === 'listingCoachStyleGuide') {
            state.rules = Array.isArray(val?.rules) ? val.rules : []
            state.exists = true
          }
        },
      }),
    }),
  }
}

describe('addListingCoachRule', () => {
  it('rejects non-admin', async () => {
    const fs = statefulFirestore({ role: 'viewer' })
    const fn = addRuleHandler({ firestore: fs })
    await expect(
      fn({ data: { rule: 'x', audience: 'all' }, auth: { uid: 'u1' } }),
    ).rejects.toThrow(/admin/i)
  })

  it('rejects empty rule with invalid-argument', async () => {
    const fs = statefulFirestore()
    const fn = addRuleHandler({ firestore: fs })
    await expect(
      fn({ data: { rule: '   ', audience: 'all' }, auth: { uid: 'u1' } }),
    ).rejects.toThrow(/rule required/i)
  })

  it('persists a new rule and returns ok', async () => {
    const fs = statefulFirestore()
    const fn = addRuleHandler({ firestore: fs })
    const out = await fn({
      data: { rule: 'never mention eFleet', audience: 'all', reason: 'private' },
      auth: { uid: 'u1' },
    })
    expect(out.ok).toBe(true)
    expect(fs.state.rules).toHaveLength(1)
    expect(fs.state.rules[0].rule).toBe('never mention eFleet')
  })
})

describe('toggleListingCoachRule', () => {
  it('rejects non-admin', async () => {
    const fs = statefulFirestore({ role: 'viewer' })
    const fn = toggleRuleHandler({ firestore: fs })
    await expect(
      fn({ data: { id: 'rule_1', enabled: false }, auth: { uid: 'u1' } }),
    ).rejects.toThrow(/admin/i)
  })

  it('rejects missing id with invalid-argument', async () => {
    const fs = statefulFirestore()
    const fn = toggleRuleHandler({ firestore: fs })
    await expect(
      fn({ data: { id: '', enabled: true }, auth: { uid: 'u1' } }),
    ).rejects.toThrow(/id required/i)
  })

  it('flips enabled flag on existing rule', async () => {
    const fs = statefulFirestore({
      initialRules: [{ id: 'rule_1', rule: 'foo', audience: 'all', enabled: true }],
    })
    const fn = toggleRuleHandler({ firestore: fs })
    const out = await fn({ data: { id: 'rule_1', enabled: false }, auth: { uid: 'u1' } })
    expect(out.ok).toBe(true)
    expect(fs.state.rules[0].enabled).toBe(false)
  })
})

describe('removeListingCoachRule', () => {
  it('rejects non-admin', async () => {
    const fs = statefulFirestore({ role: 'viewer' })
    const fn = removeRuleHandler({ firestore: fs })
    await expect(
      fn({ data: { id: 'rule_1' }, auth: { uid: 'u1' } }),
    ).rejects.toThrow(/admin/i)
  })

  it('rejects missing id with invalid-argument', async () => {
    const fs = statefulFirestore()
    const fn = removeRuleHandler({ firestore: fs })
    await expect(
      fn({ data: {}, auth: { uid: 'u1' } }),
    ).rejects.toThrow(/id required/i)
  })

  it('removes the matching rule', async () => {
    const fs = statefulFirestore({
      initialRules: [
        { id: 'rule_1', rule: 'foo', audience: 'all', enabled: true },
        { id: 'rule_2', rule: 'bar', audience: 'all', enabled: true },
      ],
    })
    const fn = removeRuleHandler({ firestore: fs })
    const out = await fn({ data: { id: 'rule_1' }, auth: { uid: 'u1' } })
    expect(out.ok).toBe(true)
    expect(out.removed).toBe(1)
    expect(fs.state.rules).toHaveLength(1)
    expect(fs.state.rules[0].id).toBe('rule_2')
  })
})
