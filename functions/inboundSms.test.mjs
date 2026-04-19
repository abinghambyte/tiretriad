import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { isAuthorizedInbound } = require('./inboundSms')

const SHARED = 'test-secret-value'

function mkReq({ query = {}, headers = {} } = {}) {
  const norm = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  )
  return { query, get: (k) => norm[String(k).toLowerCase()] }
}

describe('isAuthorizedInbound', () => {
  it('accepts any request when no secret is configured', () => {
    expect(isAuthorizedInbound(mkReq(), '', '')).toBe(true)
  })

  it('rejects when secret is set and no auth is present', () => {
    expect(isAuthorizedInbound(mkReq(), '', SHARED)).toBe(false)
  })

  it('accepts ?k= query string matching the secret', () => {
    expect(isAuthorizedInbound(mkReq({ query: { k: SHARED } }), '', SHARED)).toBe(true)
  })

  it('also accepts ?key= as an alias', () => {
    expect(isAuthorizedInbound(mkReq({ query: { key: SHARED } }), '', SHARED)).toBe(true)
  })

  it('rejects wrong query string value', () => {
    expect(isAuthorizedInbound(mkReq({ query: { k: 'wrong' } }), '', SHARED)).toBe(false)
  })

  it('accepts Bearer token', () => {
    expect(
      isAuthorizedInbound(mkReq({ headers: { Authorization: `Bearer ${SHARED}` } }), '', SHARED),
    ).toBe(true)
  })

  it('accepts Basic auth (password is the secret)', () => {
    const creds = Buffer.from(`sinch:${SHARED}`).toString('base64')
    expect(
      isAuthorizedInbound(mkReq({ headers: { Authorization: `Basic ${creds}` } }), '', SHARED),
    ).toBe(true)
  })

  it('accepts X-Inbound-Secret header', () => {
    expect(
      isAuthorizedInbound(mkReq({ headers: { 'X-Inbound-Secret': SHARED } }), '', SHARED),
    ).toBe(true)
  })

  it('accepts HMAC-SHA256 signature over the raw body', () => {
    const body = '{"type":"mo_text","from":"+15551234567","body":"hi","id":"abc"}'
    const sig = crypto.createHmac('sha256', SHARED).update(body).digest('hex')
    expect(
      isAuthorizedInbound(mkReq({ headers: { 'X-Signature': sig } }), body, SHARED),
    ).toBe(true)
  })

  it('accepts X-Sinch-Signature as HMAC header name', () => {
    const body = '{"id":"x"}'
    const sig = crypto.createHmac('sha256', SHARED).update(body).digest('hex')
    expect(
      isAuthorizedInbound(mkReq({ headers: { 'X-Sinch-Signature': sig } }), body, SHARED),
    ).toBe(true)
  })

  it('rejects HMAC with wrong body', () => {
    const sig = crypto.createHmac('sha256', SHARED).update('{"id":"a"}').digest('hex')
    expect(
      isAuthorizedInbound(mkReq({ headers: { 'X-Signature': sig } }), '{"id":"b"}', SHARED),
    ).toBe(false)
  })

  it('rejects HMAC with wrong secret', () => {
    const sig = crypto.createHmac('sha256', 'other').update('{"id":"x"}').digest('hex')
    expect(
      isAuthorizedInbound(mkReq({ headers: { 'X-Signature': sig } }), '{"id":"x"}', SHARED),
    ).toBe(false)
  })
})
