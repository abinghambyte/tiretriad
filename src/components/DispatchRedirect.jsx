import { useEffect } from 'react'
import { WORKFORCE_URL } from '../constants/externalUrls'

/** Sends the browser to the standalone Workforce app (external origin). */
export function DispatchRedirect() {
  useEffect(() => {
    window.location.replace(WORKFORCE_URL)
  }, [])
  return null
}
