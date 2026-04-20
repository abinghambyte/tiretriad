import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { signVipToken, verifyVipToken } = require('./vipLinks.js')

const secret = 'test-secret-key-please-be-long-enough-12345'

describe('vipLinks token', () => {
  it('round-trips sign then verify', () => {
    const now = 1_700_000_000_000
    const token = signVipToken({
      accountId: 'acc1',
      tier: 'platinum',
      ttlMs: 3600_000,
      secret,
      nowMs: now,
    })
    const v = verifyVipToken(token, secret, now + 1000)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.payload.accountId).toBe('acc1')
      expect(v.payload.tier).toBe('platinum')
      expect(v.payload.v).toBe(1)
    }
  })

  it('returns bad-signature when sig is tampered', () => {
    const now = 1_700_000_000_000
    const token = signVipToken({
      accountId: 'acc1',
      tier: 'standard',
      ttlMs: 3600_000,
      secret,
      nowMs: now,
    })
    const [p, s] = token.split('.')
    const tampered = `${p}.${s.slice(0, -1)}x`
    const v = verifyVipToken(tampered, secret, now + 1000)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('bad-signature')
  })

  it('returns expired when exp is in the past', () => {
    const now = 1_700_000_000_000
    const token = signVipToken({
      accountId: 'acc1',
      tier: 'standard',
      ttlMs: 1000,
      secret,
      nowMs: now,
    })
    const v = verifyVipToken(token, secret, now + 5000)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('expired')
  })

  it('returns malformed for garbage', () => {
    const v = verifyVipToken('not-a-token', secret, Date.now())
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('malformed')
  })

  it('returns wrong-version when v is not 1', () => {
    const now = Date.now()
    const payload = { accountId: 'x', tier: 'standard', exp: now + 3600_000, iat: now, v: 0 }
    const payloadJson = JSON.stringify(payload)
    const payloadB64 = Buffer.from(payloadJson, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    const sigB64 = crypto
      .createHmac('sha256', secret)
      .update(payloadB64, 'utf8')
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    const token = `${payloadB64}.${sigB64}`
    const v = verifyVipToken(token, secret, now + 1000)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('wrong-version')
  })
})
