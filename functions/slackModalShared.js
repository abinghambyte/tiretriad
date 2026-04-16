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

/**
 * Build Slack `view_submission` error payload. Each key must match an input `block_id`
 * on the submitted view or Slack will ignore the error.
 * @param {string} blockId
 * @param {unknown} err
 */
function viewSubmissionErrorsBody(blockId, err) {
  const id = String(blockId || '').trim()
  const msg = err instanceof Error ? err.message : String(err)
  if (!id) {
    console.error('viewSubmissionErrorsBody: empty blockId — use a callback-specific input block_id')
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
  viewSubmissionErrorsBody,
  ymdToSlashMmDd,
}
