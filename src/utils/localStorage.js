function warnOnce(message, err) {
  console.warn(message, err)
}

export function safeGetJSON(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null || raw === '') return fallback
    return JSON.parse(raw)
  } catch (err) {
    warnOnce(`[localStorage] safeGetJSON failed for key "${key}"`, err)
    return fallback
  }
}

export function safeSetJSON(key, value) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    warnOnce(`[localStorage] safeSetJSON failed for key "${key}"`, err)
  }
}

export function safeGetString(key, fallback = '') {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    return raw
  } catch (err) {
    warnOnce(`[localStorage] safeGetString failed for key "${key}"`, err)
    return fallback
  }
}

export function safeSetString(key, value) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch (err) {
    warnOnce(`[localStorage] safeSetString failed for key "${key}"`, err)
  }
}
