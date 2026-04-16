/**
 * Slack Block Kit for inbound SMS replies — opens modal to send Sinch SMS (order comms log).
 * Handlers run inside signed `slackActions` only; uses SLACK_BOT_TOKEN / channel from caller.
 */
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { sendSinchSms } = require('./sinchSms')
const { viewSubmissionErrorsBody } = require('./slackModalShared')

const MODAL_SMS_REPLY = 'modal_sms_reply_customer'
const ACTION_SMS_REPLY = 'sms_reply_open'

function escapeSlackMrkdwn(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function slackApiPost(token, method, body) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!json.ok) {
    throw new Error(json.error || `${method} failed`)
  }
  return json
}

async function slackViewsOpen(token, triggerId, view) {
  return slackApiPost(token, 'views.open', { trigger_id: triggerId, view })
}

function smsReplyModalView(orderId, customerName) {
  return {
    type: 'modal',
    callback_id: MODAL_SMS_REPLY,
    private_metadata: JSON.stringify({ orderId }),
    title: { type: 'plain_text', text: 'Reply via SMS' },
    submit: { type: 'plain_text', text: 'Send' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Sending to *${escapeSlackMrkdwn(customerName || 'customer')}* for order \`${escapeSlackMrkdwn(orderId)}\`.`,
        },
      },
      {
        type: 'input',
        block_id: 'sms_body_block',
        label: { type: 'plain_text', text: 'Message' },
        element: {
          type: 'plain_text_input',
          action_id: 'sms_body_field',
          multiline: true,
          placeholder: { type: 'plain_text', text: 'Short reply (1600 char max)' },
        },
      },
    ],
  }
}

function inputValue(view, blockId, elementActionId) {
  const el = view?.state?.values?.[blockId]?.[elementActionId]
  return String(el?.value || '').trim()
}

const ACTIVE_ORDER_STATUSES = new Set(['pending', 'available', 'scheduled', 'in_transit'])

/**
 * @returns {Promise<{ handled: boolean, kind?: string, body?: object }>}
 */
async function tryHandleSmsReplyViewSubmission(db, token, envChannel, payload) {
  if (payload.type !== 'view_submission') return { handled: false }
  const view = payload.view
  if (view?.callback_id !== MODAL_SMS_REPLY) return { handled: false }

  let meta = {}
  try {
    meta = JSON.parse(view.private_metadata || '{}')
  } catch {
    return { handled: true, kind: 'json', body: { response_action: 'clear' } }
  }
  const orderId = String(meta.orderId || '').trim()
  if (!orderId) {
    return { handled: true, kind: 'json', body: { response_action: 'clear' } }
  }

  try {
    const text = inputValue(view, 'sms_body_block', 'sms_body_field')
    if (!text) {
      return {
        handled: true,
        kind: 'json',
        body: {
          response_action: 'errors',
          errors: { sms_body_block: 'Enter a message to send.' },
        },
      }
    }

    const ref = db.collection('orders').doc(orderId)
    const snap = await ref.get()
    if (!snap.exists) {
      return { handled: true, kind: 'json', body: { response_action: 'clear' } }
    }
    const to = String(snap.get('customerContact') || '').trim()
    if (!to) {
      return {
        handled: true,
        kind: 'json',
        body: {
          response_action: 'errors',
          errors: { sms_body_block: 'Order has no customer phone on file.' },
        },
      }
    }

    try {
      await sendSinchSms({ to, body: text })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return {
        handled: true,
        kind: 'json',
        body: {
          response_action: 'errors',
          errors: { sms_body_block: msg.slice(0, 250) },
        },
      }
    }

    await ref.update({
      commsLog: FieldValue.arrayUnion({
        at: Timestamp.now(),
        kind: 'sms_reply_slack',
        text,
        slackUserId: String(payload.user?.id || ''),
      }),
      updatedAt: FieldValue.serverTimestamp(),
    })

    const ch = String(envChannel || '').trim()
    if (ch && token) {
      try {
        await slackApiPost(token, 'chat.postMessage', {
          channel: ch,
          text: `SMS sent for order ${orderId}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: [
                  '*📱 SMS reply sent*',
                  `*Order:* \`${escapeSlackMrkdwn(orderId)}\``,
                  `*By:* ${escapeSlackMrkdwn(payload.user?.name || payload.user?.id || '—')}`,
                  `*Message:* ${escapeSlackMrkdwn(text.slice(0, 500))}`,
                ].join('\n'),
              },
            },
          ],
        })
      } catch (e) {
        console.error('smsReplySlack follow-up post', e)
      }
    }

    return { handled: true, kind: 'json', body: { response_action: 'clear' } }
  } catch (e) {
    console.error('smsReplyViewSubmission', e)
    return { handled: true, kind: 'json', body: viewSubmissionErrorsBody('sms_body_block', e, view) }
  }
}

/**
 * @returns {Promise<{ handled: boolean, kind?: string, body?: object }>}
 */
async function tryHandleSmsReplyBlockActions(db, token, envChannel, payload) {
  if (payload.type !== 'block_actions') return { handled: false }
  const actions = payload.actions || []
  const action = actions[0]
  if (!action || action.action_id !== ACTION_SMS_REPLY) return { handled: false }

  const orderId = String(action.value || '').trim()
  if (!orderId) return { handled: true, kind: 'empty' }

  const triggerId = payload.trigger_id
  if (!triggerId) return { handled: true, kind: 'empty' }

  const snap = await db.collection('orders').doc(orderId).get()
  if (!snap.exists) return { handled: true, kind: 'empty' }
  const name = String(snap.get('customerName') || '').trim() || 'Customer'

  await slackViewsOpen(token, triggerId, smsReplyModalView(orderId, name))
  return { handled: true, kind: 'empty' }
}

module.exports = {
  MODAL_SMS_REPLY,
  ACTION_SMS_REPLY,
  tryHandleSmsReplyViewSubmission,
  tryHandleSmsReplyBlockActions,
}
