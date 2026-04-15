import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { auth, db } from '../../firebase/config'
import { permissionMeets } from '../../constants/peoplePermissions'
import { addDaysToYmd } from '../../utils/isoWeekDenver.js'
import { portalCrewTagFromRole } from '../../utils/portalCrewTag.js'

const DENVER = 'America/Denver'
const OP_START = 8
const OP_END = 18

function denverYmd(ms = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DENVER,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms))
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  return `${y}-${m}-${d}`
}

function mondayYmdDenver(refMs = Date.now()) {
  let ymd = denverYmd(refMs)
  const backFromMon = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
  for (let i = 0; i < 7; i += 1) {
    const [y, mo, da] = ymd.split('-').map(Number)
    const utcNoon = Date.UTC(y, mo - 1, da, 12, 0, 0)
    const wd = new Intl.DateTimeFormat('en-US', {
      timeZone: DENVER,
      weekday: 'short',
    }).format(new Date(utcNoon))
    const off = backFromMon[wd]
    if (off === 0) return ymd
    if (off == null) break
    ymd = addDaysToYmd(ymd, -off)
  }
  return ymd
}

/** @param {string} ymd */
function formatAvailabilityDayHeader(ymd) {
  const [y, mo, da] = ymd.split('-').map(Number)
  const d = new Date(Date.UTC(y, mo - 1, da, 12, 0, 0))
  return new Intl.DateTimeFormat('en-US', {
    timeZone: DENVER,
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
  }).format(d)
}

function operatingHours() {
  const out = []
  for (let h = OP_START; h < OP_END; h += 1) out.push(h)
  return out
}

function parseClockToHour(clock) {
  const s = String(clock || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/)
  if (!m) return null
  let hh = Number(m[1])
  const mm = Number(m[2] || 0)
  const ap = m[3]
  if (!Number.isFinite(hh) || hh < 1 || hh > 12) return null
  if (ap === 'am') {
    if (hh === 12) hh = 0
  } else if (hh !== 12) {
    hh += 12
  }
  if (mm >= 30) hh = Math.min(23, hh + 1)
  return hh
}

function parseWindowToHourRange(windowStr) {
  const s = String(windowStr || '').trim()
  const parts = s.split(/\s*[-–—]\s*/)
  if (parts.length < 2) return null
  const a = parseClockToHour(parts[0])
  const b = parseClockToHour(parts[1])
  if (a == null || b == null) return null
  const startH = Math.min(a, b)
  let endH = Math.max(a, b)
  if (endH <= startH) endH = Math.min(OP_END, startH + 1)
  else endH = Math.max(startH + 1, endH)
  return { startH, endH }
}

function clampedHourSet(startH, endH) {
  const set = new Set()
  const lo = Math.max(OP_START, startH)
  const hi = Math.min(OP_END, endH)
  for (let h = lo; h < hi; h += 1) set.add(h)
  return set
}

function orderBlocksHours(order) {
  const w = order.scheduledWindow || order.fulfillmentScheduledTime || order.scheduledTime || ''
  const r = parseWindowToHourRange(String(w))
  if (!r) return new Set()
  return clampedHourSet(r.startH, r.endH)
}

function blocksFromSlots(blockedSlots) {
  const set = new Set()
  if (!Array.isArray(blockedSlots)) return set
  for (const b of blockedSlots) {
    const start = Number(b?.start)
    const end = Number(b?.end)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    for (const h of clampedHourSet(start, end)) set.add(h)
  }
  return set
}

function orderAppliesToCrew(order, crewUid, djUid) {
  const u = String(order.scheduledCrewUid || '').trim()
  if (u) return u === crewUid
  if (djUid && crewUid === djUid) return true
  return false
}

function formatHourAmpm(h) {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

function findBlockIndexForHour(slots, hour) {
  if (!Array.isArray(slots)) return -1
  return slots.findIndex((b) => {
    const lo = Number(b.start)
    const hi = Number(b.end)
    return Number.isFinite(lo) && Number.isFinite(hi) && hour >= lo && hour < hi
  })
}

/**
 * Week grid Mon–Sun × 8am–6pm for crew availability + order bookings.
 * @param {{ profile: any, initialSubjectUid: string, crewUsers: any[] }} props
 */
export function AvailabilityBlocker({ profile, initialSubjectUid, crewUsers }) {
  const [subjectUid, setSubjectUid] = useState(initialSubjectUid)
  const [weekOffset, setWeekOffset] = useState(0)
  const [djUid, setDjUid] = useState('')
  const [orders, setOrders] = useState([])
  const [dayBlocks, setDayBlocks] = useState(() => ({}))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const canPickSubject = permissionMeets(profile?.permissions?.people, 'manage')
  const viewerUid = auth.currentUser?.uid || ''

  useEffect(() => {
    setSubjectUid(initialSubjectUid)
  }, [initialSubjectUid])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const snap = await getDoc(doc(db, 'meta', 'scheduleSettings'))
      if (cancelled) return
      const id = snap.exists() ? String(snap.data()?.djUserId || '').trim() : ''
      setDjUid(id)
    })().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const weekMon = useMemo(() => addDaysToYmd(mondayYmdDenver(), weekOffset * 7), [weekOffset])
  const weekDays = useMemo(
    () => [...Array(7)].map((_, i) => ({ ymd: addDaysToYmd(weekMon, i), i })),
    [weekMon],
  )

  useEffect(() => {
    if (!subjectUid) return undefined
    const sun = addDaysToYmd(weekMon, 6)
    const q = query(
      collection(db, 'orders'),
      where('scheduledDate', '>=', weekMon),
      where('scheduledDate', '<=', sun),
    )
    const unsubOrders = onSnapshot(
      q,
      (snap) => {
        setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      },
      (e) => {
        console.error(e)
        setOrders([])
      },
    )

    const dayYmids = [...Array(7)].map((_, i) => addDaysToYmd(weekMon, i))
    const unsubs = dayYmids.map((ymd) => {
      const ref = doc(db, 'users', subjectUid, 'availability', ymd)
      return onSnapshot(
        ref,
        (snap) => {
          const slots = snap.exists() ? snap.data()?.blockedSlots : []
          setDayBlocks((prev) => ({
            ...prev,
            [ymd]: Array.isArray(slots) ? slots : [],
          }))
        },
        () => {
          setDayBlocks((prev) => ({ ...prev, [ymd]: [] }))
        },
      )
    })

    return () => {
      unsubOrders()
      unsubs.forEach((u) => u())
    }
  }, [subjectUid, weekMon])

  const canEdit = Boolean(
    viewerUid && (viewerUid === subjectUid || permissionMeets(profile?.permissions?.people, 'manage')),
  )

  const cellState = useCallback(
    (ymd, hour) => {
      const blocked = blocksFromSlots(dayBlocks[ymd] || [])
      if (blocked.has(hour)) {
        const booked = orders.some(
          (o) =>
            String(o.scheduledDate) === ymd &&
            orderAppliesToCrew(o, subjectUid, djUid) &&
            orderBlocksHours(o).has(hour),
        )
        if (booked) return 'booked'
        return 'blocked'
      }
      const booked = orders.some(
        (o) =>
          String(o.scheduledDate) === ymd &&
          orderAppliesToCrew(o, subjectUid, djUid) &&
          orderBlocksHours(o).has(hour),
      )
      if (booked) return 'booked'
      return 'open'
    },
    [orders, dayBlocks, subjectUid, djUid],
  )

  async function persistSlots(ymd, slots) {
    const ref = doc(db, 'users', subjectUid, 'availability', ymd)
    await setDoc(
      ref,
      { blockedSlots: slots, updatedAt: serverTimestamp() },
      { merge: true },
    )
  }

  async function onCellTap(ymd, hour) {
    if (!canEdit) return
    setErr('')
    const kind = cellState(ymd, hour)
    setBusy(true)
    try {
      const slots = [...(dayBlocks[ymd] || [])]
      if (kind === 'open') {
        const raw = window.prompt('Block reason (optional)')
        // Cancel returns null — never use `raw || ''` here or the block would still be saved.
        if (raw == null) return
        const reason = String(raw)
        slots.push({
          start: hour,
          end: Math.min(OP_END, hour + 1),
          reason: reason.slice(0, 200),
          blockedBy: viewerUid,
        })
        await persistSlots(ymd, slots)
      } else if (kind === 'blocked') {
        const idx = findBlockIndexForHour(slots, hour)
        if (idx >= 0) {
          slots.splice(idx, 1)
          await persistSlots(ymd, slots)
        }
      }
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const hours = operatingHours()

  return (
    <div className="mt-8 border-t border-zinc-800 pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">Availability</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Green = open · Slate = booked · Red = blocked (8am–6pm Denver)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setWeekOffset((w) => w - 1)}
            className="max-sm:min-h-[44px] rounded-lg border border-zinc-600 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800/80 sm:py-1"
          >
            ← Prev
          </button>
          <button
            type="button"
            disabled={busy || weekOffset === 0}
            onClick={() => setWeekOffset(0)}
            className="max-sm:min-h-[44px] rounded-lg border border-zinc-600 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800/80 sm:py-1 disabled:opacity-40"
          >
            This week
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setWeekOffset((w) => w + 1)}
            className="max-sm:min-h-[44px] rounded-lg border border-zinc-600 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800/80 sm:py-1"
          >
            Next →
          </button>
        </div>
      </div>

      {canPickSubject ? (
        <div className="mt-4">
          <label className="mb-1 block text-xs text-zinc-500">Crew member</label>
          <select
            value={subjectUid}
            onChange={(e) => setSubjectUid(e.target.value)}
            className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          >
            {(crewUsers || []).map((u) => {
              const fn = String(u.firstName || '').trim() || 'Crew'
              const tag = portalCrewTagFromRole(String(u.role || 'viewer'))
              return (
                <option key={u.id} value={u.id}>
                  {fn} ({tag})
                </option>
              )
            })}
          </select>
        </div>
      ) : null}

      {!canEdit ? (
        <p className="mt-3 text-xs text-zinc-600">View only — you can edit your own availability.</p>
      ) : null}

      {err ? <p className="mt-2 text-xs text-red-400">{err}</p> : null}

      <div className="mt-4 overflow-x-auto sm:overflow-visible">
        <div
          className="inline-grid min-w-[720px] gap-px bg-zinc-800/90 p-px sm:min-w-0 sm:w-full"
          style={{ gridTemplateColumns: `88px repeat(7, minmax(0,1fr))` }}
        >
          <div className="bg-zinc-950 p-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Hour
          </div>
          {weekDays.map(({ ymd }) => (
            <div key={ymd} className="bg-zinc-950 p-2 text-center text-[10px] font-medium text-zinc-400">
              {formatAvailabilityDayHeader(ymd)}
            </div>
          ))}

          {hours.map((h) => (
            <Fragment key={h}>
              <div className="flex items-center bg-zinc-950 px-2 py-1 text-[11px] text-zinc-500">
                {formatHourAmpm(h)}
              </div>
              {weekDays.map(({ ymd }) => {
                const st = cellState(ymd, h)
                const base =
                  st === 'open'
                    ? 'bg-emerald-950/50 ring-1 ring-emerald-800/40 hover:bg-emerald-900/40'
                    : st === 'booked'
                      ? 'bg-slate-700/80 ring-1 ring-slate-600/50'
                      : 'bg-red-950/55 ring-1 ring-red-900/50 hover:bg-red-900/40'
                const interactive = canEdit && (st === 'open' || st === 'blocked')
                return (
                  <button
                    key={`${ymd}-${h}`}
                    type="button"
                    disabled={!interactive || busy}
                    title={
                      st === 'open'
                        ? 'Tap to block'
                        : st === 'blocked'
                          ? 'Tap to unblock'
                          : 'Booked (order)'
                    }
                    aria-label={`${ymd} ${formatHourAmpm(h)} ${st}`}
                    onClick={() => void onCellTap(ymd, h)}
                    className={`min-h-[36px] w-full px-0 py-0 text-[10px] text-zinc-200/90 max-sm:min-h-[44px] ${base} ${!interactive ? 'cursor-default opacity-90' : 'cursor-pointer'}`}
                  />
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}
