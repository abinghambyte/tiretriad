import { describe, expect, it, vi, beforeEach } from 'vitest'
import { _testonly } from './salesAdvisor.js'

const { handle, buildSystemPrompt, RATE_LIMIT_PER_HOUR } = _testonly

const mkCtx = (overrides) => ({
  brandAggregates: { total: 100, brands: [{ brand: 'MICHELIN', count: 60, avgListingMarginPct: 22, avgResearchedRetail: 200, offProgramCount: 0 }], missingBrands: [] },
  revenueStats: null,
  selectedTire: null,
  ...overrides,
})

describe('salesAdvisor handler', () => {
  let firestore
  let callAnthropic
  let now

  beforeEach(() => {
    _testonly.__resetRateBuckets()
    const docStub = {
      get: vi.fn(async () => ({ exists: true, data: () => ({ role: 'admin' }) })),
    }
    const collectionStub = { doc: vi.fn(() => docStub) }
    firestore = { collection: vi.fn(() => collectionStub) }
    callAnthropic = vi.fn(async () => ({ text: 'Sample reply.', model: 'claude-haiku-4-5' }))
    now = 1714560000000
  })

  it('throws unauthenticated when request.auth missing', async () => {
    const run = handle({ firestore, callAnthropic, nowFn: () => now })
    await expect(
      run({ data: { messages: [{ role: 'user', content: 'hi' }], context: mkCtx() }, auth: null }),
    ).rejects.toMatchObject({ code: 'unauthenticated' })
  })

  it('throws permission-denied when role !== admin', async () => {
    firestore.collection().doc().get = vi.fn(async () => ({ exists: true, data: () => ({ role: 'viewer' }) }))
    const run = handle({ firestore, callAnthropic, nowFn: () => now })
    await expect(
      run({ data: { messages: [{ role: 'user', content: 'hi' }], context: mkCtx() }, auth: { uid: 'U1' } }),
    ).rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('throws invalid-argument when messages is empty', async () => {
    const run = handle({ firestore, callAnthropic, nowFn: () => now })
    await expect(
      run({ data: { messages: [], context: mkCtx() }, auth: { uid: 'U1' } }),
    ).rejects.toMatchObject({ code: 'invalid-argument' })
  })

  it('throws invalid-argument when last message role is not user', async () => {
    const run = handle({ firestore, callAnthropic, nowFn: () => now })
    await expect(
      run({
        data: { messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }], context: mkCtx() },
        auth: { uid: 'U1' },
      }),
    ).rejects.toMatchObject({ code: 'invalid-argument' })
  })

  it('throws invalid-argument when total content exceeds 16 KB', async () => {
    const big = 'x'.repeat(17 * 1024)
    const run = handle({ firestore, callAnthropic, nowFn: () => now })
    await expect(
      run({ data: { messages: [{ role: 'user', content: big }], context: mkCtx() }, auth: { uid: 'U1' } }),
    ).rejects.toMatchObject({ code: 'invalid-argument' })
  })

  it('returns reply + model on happy path', async () => {
    const run = handle({ firestore, callAnthropic, nowFn: () => now })
    const out = await run({
      data: { messages: [{ role: 'user', content: 'help' }], context: mkCtx() },
      auth: { uid: 'U1' },
    })
    expect(out).toEqual({ reply: 'Sample reply.', model: 'claude-haiku-4-5' })
    expect(callAnthropic).toHaveBeenCalledTimes(1)
  })

  it('falls back to sonnet when haiku errors', async () => {
    callAnthropic = vi.fn()
      .mockRejectedValueOnce(new Error('haiku boom'))
      .mockResolvedValueOnce({ text: 'sonnet reply', model: 'claude-sonnet-4-6' })
    const run = handle({ firestore, callAnthropic, nowFn: () => now })
    const out = await run({
      data: { messages: [{ role: 'user', content: 'help' }], context: mkCtx() },
      auth: { uid: 'U1' },
    })
    expect(out).toEqual({ reply: 'sonnet reply', model: 'claude-sonnet-4-6' })
    expect(callAnthropic).toHaveBeenCalledTimes(2)
  })

  it('throws internal when both models fail', async () => {
    callAnthropic = vi.fn().mockRejectedValue(new Error('both boom'))
    const run = handle({ firestore, callAnthropic, nowFn: () => now })
    await expect(
      run({ data: { messages: [{ role: 'user', content: 'help' }], context: mkCtx() }, auth: { uid: 'U1' } }),
    ).rejects.toMatchObject({ code: 'internal' })
  })

  it('rate-limits after 30 requests in 60min', async () => {
    const run = handle({ firestore, callAnthropic, nowFn: () => now })
    for (let i = 0; i < RATE_LIMIT_PER_HOUR; i += 1) {
      await run({
        data: { messages: [{ role: 'user', content: `q${i}` }], context: mkCtx() },
        auth: { uid: 'U1' },
      })
    }
    await expect(
      run({ data: { messages: [{ role: 'user', content: 'over' }], context: mkCtx() }, auth: { uid: 'U1' } }),
    ).rejects.toMatchObject({ code: 'resource-exhausted' })
  })

  it('rate-limit window slides — old timestamps drop off', async () => {
    let nowVal = now
    const run = handle({ firestore, callAnthropic, nowFn: () => nowVal })
    for (let i = 0; i < RATE_LIMIT_PER_HOUR; i += 1) {
      await run({
        data: { messages: [{ role: 'user', content: `q${i}` }], context: mkCtx() },
        auth: { uid: 'U1' },
      })
    }
    nowVal = now + 61 * 60 * 1000 // 61 minutes later
    const out = await run({
      data: { messages: [{ role: 'user', content: 'after window' }], context: mkCtx() },
      auth: { uid: 'U1' },
    })
    expect(out.reply).toBe('Sample reply.')
  })
})

describe('buildSystemPrompt', () => {
  it('uses tires persona block by default', () => {
    const prompt = buildSystemPrompt({ surface: 'tires', context: mkCtx() })
    expect(prompt).toMatch(/sales coach/i)
    expect(prompt).toMatch(/Skedaddle/i)
    expect(prompt).toMatch(/MICHELIN/)
  })

  it('falls back to tires persona when surface is unknown', () => {
    const prompt = buildSystemPrompt({ surface: 'bogus', context: mkCtx() })
    expect(prompt).toMatch(/sales coach/i)
  })

  it('renders revenueStats when provided', () => {
    const prompt = buildSystemPrompt({
      surface: 'tires',
      context: mkCtx({ revenueStats: { mtdRevenue: 12345, ytdRevenue: 99999, completedCount30d: 8, completedCount90d: 22 } }),
    })
    expect(prompt).toMatch(/12345/)
  })

  it('marks no-tire-selected explicitly', () => {
    const prompt = buildSystemPrompt({ surface: 'tires', context: mkCtx() })
    expect(prompt).toMatch(/No tire is currently selected/i)
  })

  it('renders selectedTire when provided', () => {
    const prompt = buildSystemPrompt({
      surface: 'tires',
      context: mkCtx({ selectedTire: { mspn: '12345', brand: 'MICHELIN', description: 'P255/55R18', category: 'passenger', price: 100, retailPrice: 200, listingMarginPct: 50 } }),
    })
    expect(prompt).toMatch(/12345/)
    expect(prompt).toMatch(/MICHELIN/)
  })
})
