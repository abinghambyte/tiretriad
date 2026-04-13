import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useRef } from 'react'
import { db } from '../../firebase/config'
import { useToast } from '../../context/ToastContext.jsx'
import { playOrderCompleteSound } from '../../utils/playOrderCompleteSound'
import { denverYm, denverYmd } from '../../utils/isoWeekDenver.js'
import { formatPercent } from '../../utils/format'
import { marginPercentOfPayment } from '../../utils/orderPoolMargin.js'

const LS_MARGIN_RECORD = 'skedaddle-margin-record-pct'

function completedAtMs(data) {
  const t = data?.completedAt
  return t && typeof t.toMillis === 'function' ? t.toMillis() : null
}

/**
 * Listens for newly completed orders and fires milestone toasts + chime.
 */
export function OrderCompletionMilestones() {
  const { toast } = useToast()
  const prevTopId = useRef(/** @type {string | null} */ (null))

  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('status', '==', 'completed'),
      orderBy('completedAt', 'desc'),
      limit(20),
    )
    return onSnapshot(q, async (snap) => {
      const first = snap.docs[0]
      if (!first) return
      const id = first.id
      if (prevTopId.current === null) {
        prevTopId.current = id
        return
      }
      if (prevTopId.current === id) return
      prevTopId.current = id

      const o = { id, ...first.data() }
      const doneMs = completedAtMs(o)
      if (doneMs == null) return

      playOrderCompleteSound()

      const todayYmd = denverYmd(doneMs)
      const monthYm = denverYm(doneMs)

      try {
        const recent = await getDocs(
          query(
            collection(db, 'orders'),
            where('status', '==', 'completed'),
            orderBy('completedAt', 'desc'),
            limit(400),
          ),
        )
        const sameDay = recent.docs.filter((d) => {
          const ms = completedAtMs(d.data())
          return ms != null && denverYmd(ms) === todayYmd
        }).length
        if (sameDay === 1) {
          toast('First sale of the day', 'success', 4000)
        }
        const sameMonth = recent.docs.filter((d) => {
          const ms = completedAtMs(d.data())
          return ms != null && denverYm(ms) === monthYm
        }).length
        if (sameMonth === 10) {
          toast('10 this month', 'success', 4000)
        }
      } catch {
        /* ignore */
      }

      let tire = {}
      try {
        const mspn = String(o.mspn || '').trim()
        if (mspn) {
          const ts = await getDoc(doc(db, 'tires', mspn))
          if (ts.exists()) tire = ts.data() || {}
        }
      } catch {
        /* ignore */
      }
      const pct = marginPercentOfPayment(o, tire)
      if (pct != null && Number.isFinite(pct)) {
        let prev = 0
        try {
          prev = Number(localStorage.getItem(LS_MARGIN_RECORD) || '0') || 0
        } catch {
          prev = 0
        }
        if (pct > prev) {
          try {
            localStorage.setItem(LS_MARGIN_RECORD, String(pct))
          } catch {
            /* ignore */
          }
          toast(`New margin record — ${formatPercent(pct, 2)} on this order`, 'success', 4000)
        }
      }
    })
  }, [toast])

  return null
}
