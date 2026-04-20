/**
 * Slack HTTP handlers, slash/interactivity, and scheduled jobs that post to Slack.
 */
const crypto = require('crypto')
const { admin, slackChannelWithSecretFallback, slackApiPost } = require('./_shared')
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const {
  SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET,
  SLACK_SECRETS,
  SLACK_ACTIONS_SECRETS,
  TIRE_PRICE_INTEL_SECRETS,
  GEMINI_API_KEY,
} = require('./slackSecrets')
const { tryHandleLookupUtilityViewSubmission } = require('./lookupUtilitySlackCommands')
const { tryHandleFieldViewSubmission } = require('./fieldSlackCommands')
const { tryHandleFinanceViewSubmission } = require('./financeSlackCommands')
const { handleSlackPayload } = require('./orderWorkflow')
const { handleCreditSlashCommand } = require('./creditTrackerSlack')
const { morningBriefRun } = require('./phase5Scheduled')
const { tirePriceResearchRun, escapeSlackMrkdwn } = require('./tirePriceResearch')
const { kyleScorecardRun } = require('./kyleScorecard')
const { handleInboundSmsRequest } = require('./inboundSms')
const { auditFromCallable } = require('./adminAuditLog')

function verifySlackSignature(signingSecret, rawBody, slackSignature, slackRequestTimestamp) {
  if (!signingSecret || !slackSignature || !slackRequestTimestamp) return false
  const ts = Number(slackRequestTimestamp)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 60 * 5) {
    return false
  }
  const sigBasestring = `v0:${slackRequestTimestamp}:${rawBody}`
  const hmac = crypto.createHmac('sha256', signingSecret)
  hmac.update(sigBasestring, 'utf8')
  const mySig = `v0=${hmac.digest('hex')}`
  try {
    return crypto.timingSafeEqual(Buffer.from(mySig, 'utf8'), Buffer.from(slackSignature, 'utf8'))
  } catch {
    return false
  }
}

// Dead stock radar disabled — Skedaddle is just-in-time, no held inventory.
// Replaced by manual listing tracking (platformListings on tire docs).
// exports.deadStockRadar = onSchedule(
//   {
//     schedule: '0 13 * * 1',
//     timeZone: 'Etc/UTC',
//     region: 'us-central1',
//     secrets: SLACK_SECRETS,
//   },
//   async () => {
//     const token = SLACK_BOT_TOKEN.value()
//     const channel = slackChannelWithSecretFallback()
//     await deadStockRadarRun({ token, channel })
//   },
// )

/** Weekdays 14:00 UTC ≈ 7:00 AM MT — morning digest to #fleet-ops. */
exports.morningBrief = onSchedule(
  {
    schedule: '0 14 * * 1-5',
    timeZone: 'Etc/UTC',
    region: 'us-central1',
    secrets: SLACK_SECRETS,
  },
  async () => {
    const token = SLACK_BOT_TOKEN.value()
    const channel = slackChannelWithSecretFallback()
    await morningBriefRun({ token, channel })
  },
)

async function runScheduledRetailResearch(triggerLabel, { silentIfEmpty = false } = {}) {
  const token = String(SLACK_BOT_TOKEN.value() || '').trim()
  const channel = String(slackChannelWithSecretFallback() || '').trim()
  const geminiKey = String(GEMINI_API_KEY.value() || '').trim()
  try {
    await tirePriceResearchRun({ token, channel, geminiKey, silentIfEmpty })
  } catch (err) {
    console.error(`tirePriceResearch ${triggerLabel} run failed`, err)
    const msg = escapeSlackMrkdwn(
      String(err instanceof Error ? err.message : err).slice(0, 300),
    )
    if (token && channel) {
      try {
        await slackApiPost(token, 'chat.postMessage', {
          channel,
          text: `:warning: *Retail price research (${triggerLabel}) failed*\n${msg}\n_Retail reference may be stale, check Firebase logs._`,
        })
      } catch (slackErr) {
        console.error(`tirePriceResearch ${triggerLabel} Slack alert failed`, slackErr)
      }
    }
  }
}

/** 2:00 AM America/Denver retail price research run. */
exports.tirePriceResearch = onSchedule(
  {
    schedule: '0 2 * * *',
    timeZone: 'America/Denver',
    region: 'us-central1',
    secrets: TIRE_PRICE_INTEL_SECRETS,
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  () => runScheduledRetailResearch('2am'),
)

/** 2:00 PM America/Denver second daily retail price research run (coverage). */
exports.tirePriceResearchAfternoon = onSchedule(
  {
    schedule: '0 14 * * *',
    timeZone: 'America/Denver',
    region: 'us-central1',
    secrets: TIRE_PRICE_INTEL_SECRETS,
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  () => runScheduledRetailResearch('2pm'),
)

/**
 * Hourly catch-up. Runs the research only if there's backlog; exits silently
 * otherwise (pickTiresForResearch returns an empty list once the catalog is
 * covered, and `silentIfEmpty: true` suppresses the Slack start/end posts).
 */
exports.tirePriceResearchCatchup = onSchedule(
  {
    schedule: '15 * * * *',
    timeZone: 'America/Denver',
    region: 'us-central1',
    secrets: TIRE_PRICE_INTEL_SECRETS,
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  () => runScheduledRetailResearch('catchup', { silentIfEmpty: true }),
)

/**
 * Manual admin trigger for the same price research the nightly cron runs.
 * Useful for testing after setting GEMINI_API_KEY or when buy prices look stale.
 * Admin-only. Respects `priceIntel.kyleConfirmed` as a freeze. Writes only to
 * `priceIntel.*` so CSV-sourced fields (price, cost) are untouched.
 */
exports.runTirePriceResearchNow = onCall(
  {
    secrets: TIRE_PRICE_INTEL_SECRETS,
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.')
    }
    const db = admin.firestore()
    const u = await db.collection('users').doc(request.auth.uid).get()
    if (!u.exists || String(u.get('role') || '') !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin only.')
    }
    const token = String(SLACK_BOT_TOKEN.value() || '').trim()
    const channel = String(slackChannelWithSecretFallback() || '').trim()
    const geminiKey = String(GEMINI_API_KEY.value() || '').trim()
    if (!geminiKey || geminiKey === '-') {
      throw new HttpsError(
        'failed-precondition',
        'GEMINI_API_KEY secret is not set. Run `firebase functions:secrets:set GEMINI_API_KEY` and redeploy.',
      )
    }
    try {
      await tirePriceResearchRun({ token, channel, geminiKey })
      await auditFromCallable(db, request, {
        action: 'price_research.run_now',
        payload: { scheduled: false },
      })
      return { ok: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new HttpsError('internal', msg)
    }
  },
)

/** 1st of month 8:00 AM America/Denver — Kyle sourcing scorecard to #fleet-ops. */
exports.kyleScorecard = onSchedule(
  {
    schedule: '0 8 1 * *',
    timeZone: 'America/Denver',
    region: 'us-central1',
    secrets: SLACK_SECRETS,
  },
  async () => {
    const token = SLACK_BOT_TOKEN.value()
    const channel = slackChannelWithSecretFallback()
    await kyleScorecardRun({ token, channel })
  },
)

exports.inboundSms = onRequest({ cors: true, secrets: SLACK_SECRETS }, async (req, res) => {
  try {
    await handleInboundSmsRequest(req, res, admin.firestore())
  } catch (e) {
    console.error('inboundSms', e)
    if (!res.headersSent) res.status(500).send('error')
  }
})

exports.slackActions = onRequest(
  { secrets: SLACK_ACTIONS_SECRETS },
  async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed')
    return
  }

  const signingSecret = SLACK_SIGNING_SECRET.value()
  if (!signingSecret) {
    console.error('slackActions: SLACK_SIGNING_SECRET not configured')
    res.status(500).send('Server misconfiguration')
    return
  }

  const rawBody =
    req.rawBody != null
      ? req.rawBody.toString('utf8')
      : typeof req.body === 'string'
        ? req.body
        : ''

  if (!rawBody) {
    res.status(400).send('Empty body')
    return
  }

  const slackSig = req.get('X-Slack-Signature')
  const slackTs = req.get('X-Slack-Request-Timestamp')
  if (!verifySlackSignature(signingSecret, rawBody, slackSig, slackTs)) {
    res.status(401).send('Invalid signature')
    return
  }

  let payload
  const params = new URLSearchParams(rawBody)
  const payloadStr = params.get('payload')

  const token = SLACK_BOT_TOKEN.value()
  if (!token) {
    res.status(500).send('SLACK_BOT_TOKEN not configured')
    return
  }

  const db = admin.firestore()
  const envChannel = slackChannelWithSecretFallback()

  if (!payloadStr) {
    const cmd = params.get('command')
    if (cmd) {
      try {
        const form = Object.fromEntries(params.entries())
        const slashBody = await handleCreditSlashCommand(db, token, envChannel, form)
        if (slashBody) {
          res.setHeader('Content-Type', 'application/json')
          res.status(200).send(JSON.stringify(slashBody))
          return
        }
      } catch (e) {
        console.error('slackActions slash', e)
      }
      res.status(200).send('')
      return
    }
    res.status(400).send('Missing payload')
    return
  }

  try {
    payload = JSON.parse(payloadStr)
  } catch (e) {
    console.error('slackActions: bad payload', e)
    res.status(400).send('Bad payload')
    return
  }

  try {
    if (payload.type === 'view_submission') {
      const lu = await tryHandleLookupUtilityViewSubmission(db, token, envChannel, payload)
      if (lu.handled) {
        if (lu.kind === 'json') {
          res.setHeader('Content-Type', 'application/json')
          res.status(200).send(JSON.stringify(lu.body))
          return
        }
        res.status(200).send('')
        return
      }
      const fi = await tryHandleFinanceViewSubmission(db, token, envChannel, payload)
      if (fi.handled) {
        if (fi.kind === 'json') {
          res.setHeader('Content-Type', 'application/json')
          res.status(200).send(JSON.stringify(fi.body))
          return
        }
        res.status(200).send('')
        return
      }
      const fld = await tryHandleFieldViewSubmission(db, token, envChannel, payload)
      if (fld.handled) {
        if (fld.kind === 'json') {
          res.setHeader('Content-Type', 'application/json')
          res.status(200).send(JSON.stringify(fld.body))
          return
        }
        res.status(200).send('')
        return
      }
    }
    const result = await handleSlackPayload(db, token, envChannel, payload)
    if (result.kind === 'json') {
      res.setHeader('Content-Type', 'application/json')
      res.status(200).send(JSON.stringify(result.body))
      return
    }
    res.status(200).send('')
  } catch (e) {
    console.error('slackActions:', e)
    if (payload?.type === 'view_submission') {
      res.setHeader('Content-Type', 'application/json')
      res.status(200).send(JSON.stringify({ response_action: 'clear' }))
      return
    }
    res.status(200).send('')
  }
  }
)
