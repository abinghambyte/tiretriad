import { useContext } from 'react'
import { UserProfileContext } from '../context/UserProfileContext.jsx'

export function useUserProfile() {
  const ctx = useContext(UserProfileContext)
  if (!ctx) {
    throw new Error('useUserProfile must be used within UserProfileProvider')
  }
  return ctx
}
