// src/hooks/useAdvisorNarrate.js
import { useCallback } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase/config'

const advisorNarrateCallable = httpsCallable(functions, 'advisorNarrate')

export function useAdvisorNarrate() {
  return useCallback(async (tireId, mode) => {
    const res = await advisorNarrateCallable({ tireId, mode })
    return res.data || { narrative: '', shadowFlag: '' }
  }, [])
}
