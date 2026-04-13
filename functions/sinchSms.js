/**
 * Outbound SMS via Sinch XMS (not Slack credentials — uses process.env).
 * @see https://developers.sinch.com/docs/sms/api-reference/sms/batches/sendsms
 */

function normalizeToE164(contact) {
  const digits = String(contact || '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
}

/**
 * @param {{ to: string, body: string }} opts — `to` may be raw contact; normalized to E.164.
 */
async function sendSinchSms(opts) {
  const plan = String(process.env.SINCH_SERVICE_PLAN_ID || '').trim()
  const bearer = String(process.env.SINCH_API_TOKEN || '').trim()
  const from = String(process.env.SINCH_FROM_NUMBER || '').trim()
  if (!plan || !bearer || !from) {
    throw new Error('Sinch is not configured (SINCH_SERVICE_PLAN_ID, SINCH_API_TOKEN, SINCH_FROM_NUMBER).')
  }
  const to = normalizeToE164(opts.to)
  if (!to) {
    throw new Error('Invalid recipient phone number.')
  }
  const body = String(opts.body || '').trim()
  if (!body) throw new Error('SMS body is empty.')

  const url = `https://us.sms.api.sinch.com/xms/v1/${encodeURIComponent(plan)}/batches`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      body: body.slice(0, 1600),
    }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Sinch SMS failed (${res.status}): ${t || res.statusText}`)
  }
}

module.exports = { sendSinchSms, normalizeToE164 }
