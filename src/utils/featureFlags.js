// src/utils/featureFlags.js
// Simple build-time flags. Reads VITE_FLAG_* env vars. Values "1", "true", "on"
// are truthy; everything else is falsy. Defaults encode our rollout intent.

function readFlag(name, defaultValue) {
  try {
    const raw = import.meta.env?.[`VITE_FLAG_${name}`]
    if (raw == null) return defaultValue
    const s = String(raw).trim().toLowerCase()
    return s === '1' || s === 'true' || s === 'on'
  } catch {
    return defaultValue
  }
}

export const flags = Object.freeze({
  listingAdvisor: readFlag('LISTING_ADVISOR', import.meta.env?.DEV === true),
  /**
   * Aspirational multi-user features. False until Kyle (sourcer) and/or DJ
   * (mechanic) have active accounts and meaningful activity. When false:
   *   - CrewDirectoryWidget hides (Dashboard + People page)
   *   - AvailabilityBlocker hides (People page)
   *   - CRM Field Dispatch tab hidden in tab list and route redirect to Board
   * When true: everything renders as before.
   */
  multiUserMode: readFlag('MULTI_USER_MODE', false),
})
