/**
 * People, auth, invites, and permission schedules.
 */
const { onSchedule } = require('firebase-functions/v2/scheduler')
const {
  checkAccessExpiryRun,
  processElevationRevertsRun,
} = require('./peopleScheduled')
const { SLACK_SECRETS } = require('./slackSecrets')
const {
  ensureUserDocument,
  createPortalUser,
  updatePortalUser,
  scheduleElevationRevert,
  revokeInvite,
  reissueInvite,
  deletePortalUser,
} = require('./peopleCallables')

exports.ensureUserDocument = ensureUserDocument
exports.createPortalUser = createPortalUser
exports.updatePortalUser = updatePortalUser
exports.scheduleElevationRevert = scheduleElevationRevert
exports.revokeInvite = revokeInvite
exports.reissueInvite = reissueInvite
exports.deletePortalUser = deletePortalUser

const inviteFlow = require('./inviteFlow')
exports.resolveInvite = inviteFlow.resolveInvite
exports.getInviteGreeting = inviteFlow.getInviteGreeting
exports.previewInviteGreeting = inviteFlow.previewInviteGreeting
exports.sendInviteRegistrationCode = inviteFlow.sendInviteRegistrationCode
exports.completeInviteRegistration = inviteFlow.completeInviteRegistration
exports.recordLogin = inviteFlow.recordLogin

/** Midnight Mountain Standard Time ≈ 07:00 UTC — lock users past accessExpiry. */
exports.checkAccessExpiry = onSchedule(
  {
    schedule: '0 7 * * *',
    timeZone: 'Etc/UTC',
    region: 'us-central1',
    secrets: SLACK_SECRETS,
  },
  async () => {
    await checkAccessExpiryRun()
  },
)

/** Revert timed permission elevations after expiresAt. */
exports.processElevationReverts = onSchedule(
  {
    schedule: '0 * * * *',
    timeZone: 'Etc/UTC',
    region: 'us-central1',
  },
  async () => {
    await processElevationRevertsRun()
  },
)
