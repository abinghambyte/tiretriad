const LS_KEY = 'skedaddle-sound-enabled'

export function readSoundEnabled() {
  try {
    const v = localStorage.getItem(LS_KEY)
    if (v == null) return true
    return v !== 'false'
  } catch {
    return true
  }
}

export function writeSoundEnabled(on) {
  try {
    localStorage.setItem(LS_KEY, on ? 'true' : 'false')
  } catch {
    /* ignore */
  }
}

/** C3 → G3, sine, 0.2 gain, 1.2s exponential fade per note (Phase 5). */
export function playOrderCompleteSound() {
  if (!readSoundEnabled()) return
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return
  const ctx = new Ctx()
  const freqs = [130.81, 196.0]
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = freq
    const start = ctx.currentTime + i * 0.15
    gain.gain.setValueAtTime(0.2, start)
    gain.gain.exponentialRampToValueAtTime(0.001, start + 1.2)
    osc.start(start)
    osc.stop(start + 1.2)
  })
}
