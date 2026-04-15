import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Web NFC (People invite) requires a secure context — use `npm run dev:https` on LAN for phone testing.
const devHttps = process.env.VITE_DEV_HTTPS === '1'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), ...(devHttps ? [basicSsl()] : [])],
  server: {
    host: true,
    ...(devHttps ? { https: true } : {}),
  },
})
