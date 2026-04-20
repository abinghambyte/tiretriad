import { useEffect } from 'react'

const SDK_URL = 'https://cdn.sinch.com/sinch-chat/latest/sdk.js'

/**
 * Lazy-load the Sinch Chat SDK and mount the widget. Renders nothing itself;
 * the widget attaches to document.body in its own Shadow DOM.
 *
 * Mounts once per page lifetime via `window.__skedaddleSinchMounted` guard,
 * so dropping `<SinchChatMount />` into multiple routes via a shared layout
 * won't double-mount.
 *
 * Required env vars at build time (Vite):
 *   VITE_SINCH_CHAT_CLIENT_ID  — public client ID from Sinch dashboard
 *   VITE_SINCH_CHAT_PROJECT_ID — public project UUID from Sinch dashboard
 * Optional:
 *   VITE_SINCH_CHAT_REGION     — 'US' (default) or 'EU'
 *   VITE_SINCH_CHAT_LEAD_URL   — override the lead-capture Cloud Function URL
 *
 * When the visitor fills in the initial-screen form and submits, the
 * `submitInitialForm` event fires client-side. We POST the field values to
 * `createSinchChatLead`, which writes a Firestore `crmLeads` doc so the
 * conversation shows up in /crm?tab=leads alongside Sinch's own inbox.
 *
 * @param {{
 *   brandText?: string
 *   brandColor?: string
 *   disabled?: boolean
 *   vipMode?: boolean
 *   vipContext?: { accountId: string, displayName: string, tier: string } | null
 * }} props
 */
export function SinchChatMount({
  brandText = 'Skedaddle Tires',
  brandColor = '#f59e0b',
  disabled = false,
  vipMode = false,
  vipContext = null,
} = {}) {
  const resolvedBrandText = vipMode ? 'VIP concierge' : brandText
  const vipCtxKey = vipContext ? JSON.stringify(vipContext) : ''

  useEffect(() => {
    if (disabled) return undefined
    if (typeof window === 'undefined') return undefined
    if (window.__skedaddleSinchMounted) return undefined

    const clientId = import.meta.env.VITE_SINCH_CHAT_CLIENT_ID
    const projectId = import.meta.env.VITE_SINCH_CHAT_PROJECT_ID
    if (!clientId || !projectId) {
      console.warn('SinchChatMount: VITE_SINCH_CHAT_CLIENT_ID / VITE_SINCH_CHAT_PROJECT_ID not set; skipping mount.')
      return undefined
    }
    const region = String(import.meta.env.VITE_SINCH_CHAT_REGION || 'US')
    const projectIdFirebase = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'skedaddle-inventory'
    const leadUrl =
      import.meta.env.VITE_SINCH_CHAT_LEAD_URL ||
      `https://us-central1-${projectIdFirebase}.cloudfunctions.net/createSinchChatLead`

    window.__skedaddleSinchMounted = true

    let cancelled = false
    let onSubmit = null

    const script = document.createElement('script')
    script.async = true
    script.src = SDK_URL

    script.addEventListener('load', async () => {
      if (cancelled) return
      const sdk = window.SinchSdk
      if (!sdk) {
        console.warn('SinchChatMount: SDK loaded but window.SinchSdk is undefined.')
        return
      }
      try {
        await sdk.initialize()
        await sdk.setIdentity({ clientId, projectId, region })

        const darkmode = readTheme()
        sdk.Chat.mount({
          brandText: resolvedBrandText,
          brandColor,
          darkmode,
          chatPosition: 'bottom-right',
          initialScreenConfig: {
            enabled: true,
            form: {
              fields: [
                {
                  name: 'business_name',
                  type: 'text',
                  label: 'Business name (optional)',
                  placeholder: 'Your company',
                  required: false,
                },
                {
                  name: 'phone',
                  type: 'tel',
                  label: 'Phone',
                  placeholder: '(970) 555-0123',
                  required: true,
                },
                {
                  name: 'inquiry',
                  type: 'text',
                  label: 'What are you looking for?',
                  placeholder: 'e.g. 4x MICHELIN 295/75R22.5',
                  required: false,
                },
              ],
            },
          },
        })

        sdk.Chat.setTranslation?.({
          typeMessageHere: 'Type your message…',
          initialScreen: {
            title: vipMode ? 'VIP concierge' : 'Talk to Skedaddle',
            description: vipMode
              ? 'We are here to help with priority support.'
              : 'Tell us what you need and we will come back fast.',
            startButton: 'Start chat',
          },
        })

        const vipOnce =
          vipMode && vipContext
            ? {
                vip_account_id: String(vipContext.accountId || ''),
                vip_tier: String(vipContext.tier || ''),
                vip_display_name: String(vipContext.displayName || ''),
                acquired_via: 'vip_concierge_link',
              }
            : {
                acquired_via: 'sinch_chat_widget',
              }

        sdk.Chat.setConversationMetadata?.({
          once: {
            ...vipOnce,
            referrer: document.referrer || '',
            landed_at: new Date().toISOString(),
          },
          eachMessage: {
            pageUrl: window.location.href,
            theme: darkmode ? 'dark' : 'light',
            ...(vipMode && vipContext
              ? {
                  vip_account_id: String(vipContext.accountId || ''),
                  vip_tier: String(vipContext.tier || ''),
                }
              : {}),
          },
        })

        onSubmit = (evt) => {
          const detail = evt?.detail || {}
          const fields = detail.fields || detail.form || detail.values || {}
          const conversationId = detail.conversationId || detail.conversation_id || ''
          const payload = {
            fields,
            conversationId: String(conversationId),
            pageUrl: window.location.href,
            referrer: document.referrer || '',
          }
          fetch(leadUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true,
          }).catch((err) => {
            console.warn('SinchChatMount: lead POST failed', err)
          })
        }
        sdk.Chat.addEventListener?.('submitInitialForm', onSubmit)
      } catch (err) {
        console.error('SinchChatMount: mount failed', err)
      }
    })
    script.addEventListener('error', () => {
      console.warn('SinchChatMount: SDK failed to load from', SDK_URL)
    })
    document.head.appendChild(script)

    return () => {
      cancelled = true
      const sdk = window.SinchSdk
      if (sdk?.Chat && onSubmit) {
        try { sdk.Chat.removeEventListener?.('submitInitialForm', onSubmit) } catch { /* ignore */ }
      }
      if (sdk?.Chat?.demount) {
        try { sdk.Chat.demount() } catch { /* ignore */ }
      }
      window.__skedaddleSinchMounted = false
    }
  }, [resolvedBrandText, brandColor, disabled, vipMode, vipContext, vipCtxKey])

  return null
}

function readTheme() {
  try {
    return localStorage.getItem('skedaddle-theme') === 'dark'
  } catch {
    return false
  }
}

export default SinchChatMount
