import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase/config'

const recordLogin = httpsCallable(functions, 'recordLogin')

export async function callRecordLogin() {
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    await recordLogin({ userAgent: ua })
  } catch (e) {
    console.error('recordLogin', e)
  }
}
