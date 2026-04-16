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
  ymdToSlashMmDd,
}
