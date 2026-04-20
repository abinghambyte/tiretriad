/**
 * CRM leads, accounts, jobs, dispatch, and related triggers.
 */
const { onRequest } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { crmStaleCheckRun } = require('./crmStaleCheck')
const { crmAccountTrigger } = require('./crmAccountTrigger')
const { crmJobTrigger } = require('./crmJobTrigger')
const { submitMechanicIntake } = require('./mechanicIntake')
const { taskDispatcher } = require('./taskDispatcher')
const { expenseAuditTrigger, reorderQueueAuditTrigger } = require('./adminAuditTriggers')
const { handleCreateSinchChatLead } = require('./sinchChatLead')
const { SLACK_SECRETS } = require('./slackSecrets')

exports.taskDispatcher = taskDispatcher

exports.crmStaleCheck = onSchedule(
  {
    schedule: '0 14 * * *',
    timeZone: 'Etc/UTC',
    region: 'us-central1',
    secrets: SLACK_SECRETS,
  },
  async () => {
    await crmStaleCheckRun()
  },
)

exports.crmAccountTrigger = crmAccountTrigger
exports.crmJobTrigger = crmJobTrigger

exports.expenseAuditTrigger = expenseAuditTrigger
exports.reorderQueueAuditTrigger = reorderQueueAuditTrigger
exports.submitMechanicIntake = submitMechanicIntake

exports.createSinchChatLead = onRequest({ cors: true }, async (req, res) => {
  try {
    await handleCreateSinchChatLead(req, res)
  } catch (e) {
    console.error('createSinchChatLead', e)
    if (!res.headersSent) res.status(500).json({ error: 'error' })
  }
})
