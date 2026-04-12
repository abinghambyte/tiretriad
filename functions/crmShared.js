/**
 * @param {FirebaseFirestore.DocumentData} data
 * @returns {number}
 */
function computeCrmScore(data) {
  const fleet = Math.min(25, (Number(data.fleetSize) || 0) * 2.5)
  const pain = Math.min(30, (Number(data.painScore) || 0) * 3)
  const stage = Math.min(24, (Number(data.pipelineStage) || 1) * 4)
  let recency = 10
  const lc = data.lastContactedAt
  if (lc && typeof lc.toMillis === 'function') {
    const days = (Date.now() - lc.toMillis()) / 86400000
    recency = Math.max(0, Math.min(21, 21 - Math.min(21, days)))
  }
  return Math.round(Math.min(100, fleet + pain + stage + recency))
}

module.exports = { computeCrmScore }
