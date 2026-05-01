/**
 * Gen2 functions — env via process.env (see functions/.env.example).
 * Slack bot/signing/channel for select handlers use Secret Manager (defineSecret).
 * Domain modules register exports; shared Firebase init lives in _shared.js.
 * @see docs/SKEDADDLE-MASTER.md · docs/PHASE2-ORDER-WORKFLOW-HANDOFF.md
 */
require('./_shared')

Object.assign(exports, require('./orders'))
Object.assign(exports, require('./people'))
Object.assign(exports, require('./crm'))
Object.assign(exports, require('./slack'))
Object.assign(exports, require('./payoutConfig'))

exports.advisorNarrate = require('./advisorNarrate').advisorNarrate
exports.salesAdvisorChat = require('./salesAdvisor').salesAdvisorChat
exports.backfillTireCreatedAt = require('./backfillTireCreatedAt').backfillTireCreatedAt

exports.getDashboardStats = require('./dashboardStats').getDashboardStats

const { generateVipLink, verifyVipLink } = require('./vipLinks')
exports.generateVipLink = generateVipLink
exports.verifyVipLink = verifyVipLink

exports.updatePresence = require('./presence').updatePresence

exports.editOrderDeliveredBy = require('./orderDeliveredByEdit').editOrderDeliveredBy

exports.importInvoice = require('./importInvoice').importInvoice
exports.attachInvoiceLine = require('./attachInvoiceLine').attachInvoiceLine
exports.acknowledgeAdjustment = require('./acknowledgeAdjustment').acknowledgeAdjustment

const {
  enqueueBelowMarginFloor,
  enqueueToResearch,
  resolveQueueItem,
} = require('./researchQueue')
exports.enqueueBelowMarginFloor = enqueueBelowMarginFloor
exports.enqueueToResearch = enqueueToResearch
exports.resolveQueueItem = resolveQueueItem
