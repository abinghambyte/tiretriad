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

exports.getDashboardStats = require('./dashboardStats').getDashboardStats
