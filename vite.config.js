import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Web NFC (People invite) needs a secure context — `npm run dev:https` on LAN for phone testing.
// Optional trusted certs: mkcert localhost 192.168.x.x then:
//   cross-env VITE_DEV_HTTPS=1 VITE_SSL_KEY_PATH=./.certs/localhost-key.pem VITE_SSL_CERT_PATH=./.certs/localhost.pem vite
const devHttps = process.env.VITE_DEV_HTTPS === '1'

function readCustomHttps() {
  const keyPath = process.env.VITE_SSL_KEY_PATH
  const certPath = process.env.VITE_SSL_CERT_PATH
  if (!keyPath || !certPath) return null
  try {
    const key = fs.readFileSync(path.resolve(process.cwd(), keyPath))
    const cert = fs.readFileSync(path.resolve(process.cwd(), certPath))
    return { key, cert }
  } catch {
    console.warn(
      '[vite] VITE_SSL_KEY_PATH / VITE_SSL_CERT_PATH set but files could not be read; using @vitejs/plugin-basic-ssl',
    )
    return null
  }
}

const customHttps = devHttps ? readCustomHttps() : null
const useBasicSsl = Boolean(devHttps && !customHttps)

// Auto-derive the release SHA from Vercel's system env at build time so we
// never have to manually update VITE_RELEASE_SHA in Vercel project settings.
// VERCEL_GIT_COMMIT_SHA is always present on Vercel deploys; falls back to
// 'dev' for local builds so Sentry tagging still works.
const releaseSha =
  process.env.VITE_RELEASE_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  'dev'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), ...(useBasicSsl ? [basicSsl()] : [])],
  define: {
    'import.meta.env.VITE_RELEASE_SHA': JSON.stringify(releaseSha),
  },
  server: {
    host: true,
    ...(devHttps ? { https: customHttps || true } : {}),
  },
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.{js,jsx}',
      'tests/**/*.test.{js,jsx}',
      'functions/**/*.test.mjs',
    ],
  },
})
