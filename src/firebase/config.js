import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'

// Use `||` (not `??`) so empty env vars like VITE_FIREBASE_API_KEY= fall back to defaults.
const firebaseConfig = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ||
    'AIzaSyD_KDZmOsvbt2hsDTXTI8VTJM29Ikuo5bw',
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    'skedaddle-inventory.firebaseapp.com',
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID || 'skedaddle-inventory',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    'skedaddle-inventory.firebasestorage.app',
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '469881157452',
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    '1:469881157452:web:6a99ab6bd091a3287581e9',
  measurementId:
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-2WQ1W7MCFD',
}

export const firebaseProjectId = firebaseConfig.projectId

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)

const region = import.meta.env.VITE_FUNCTIONS_REGION || 'us-central1'
export const functions = getFunctions(app, region)
