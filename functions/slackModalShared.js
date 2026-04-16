'use strict'

/**
 * Shared Slack modal helpers for slash commands (views.open + view state readers).
 */

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

function viewInputValue(view, blockId, actionId) {
  const el = view?.state?.values?.[blockId]?.[actionId]
  return String(el?.value || '').trim()
}

function viewDatepickerValue(view, blockId, actionId) {
  const el = view?.state?.values?.[blockId]?.[actionId]
  return String(el?.selected_date || '').trim()
}

function viewStaticSelectValue(view, blockId, actionId) {
  const el = view?.state?.values?.[blockId]?.[actionId]
  return String(el?.selected_option?.value || '').trim()
}

function viewTimepickerValue(view, blockId, actionId) {
  const el = view?.state?.values?.[blockId]?.[actionId]
  return String(el?.selected_time || '').trim()
}

function firstInputBlockIdFromView(view) {
  const blocks = view?.blocks
  if (Array.isArray(blocks)) {
    for (const b of blocks) {
      if (b && b.type === 'input' && String(b.block_id || '').trim()) {
        return String(b.block_id).trim()
      }
    }
  }
  const vals = view?.state?.values
  if (vals && typeof vals === 'object') {
    const keys = Object.keys(vals)
    if (keys.length) return String(keys[0]).trim()
  }
  return ''
}

/**
 * Build Slack `view_submission` error payload. Each key must match an input `block_id`
 * on the submitted view or Slack will ignore the error.
 * @param {string} blockId
 * @param {unknown} err
 * @param {object} [view] optional — if blockId is empty, uses first input block on the view
 */
function viewSubmissionErrorsBody(blockId, err, view) {
  let id = String(blockId || '').trim()
  if (!id && view) {
    id = firstInputBlockIdFromView(view)
  }
  const msg = err instanceof Error ? err.message : String(err)
  if (!id) {
    console.error('viewSubmissionErrorsBody: no input block_id on view', err)
    return { response_action: 'clear' }
  }
  return {
    response_action: 'errors',
    errors: { [id]: msg.slice(0, 250) },
  }
}

/** `YYYY-MM-DD` → `M/D` for parseMmDdToYmd-style slash text */
function ymdToSlashMmDd(ymd) {
  const m = String(ymd || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  const month = Number(m[2])
  const day = Number(m[3])
  if (!Number.isFinite(month) || !Number.isFinite(day)) return ''
  return `${month}/${day}`
}

module.exports = {
  slackApiPost,
  slackViewsOpen,
  viewInputValue,
  viewDatepickerValue,
  viewStaticSelectValue,
  viewTimepickerValue,
  firstInputBlockIdFromView,
  viewSubmissionErrorsBody,
  ymdToSlashMmDd,
}
