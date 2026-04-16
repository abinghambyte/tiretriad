const envUrl = import.meta.env.VITE_WORKFORCE_URL

/** Production Workforce dispatcher URL; override with `VITE_WORKFORCE_URL` for previews. */
export const WORKFORCE_URL =
  typeof envUrl === 'string' && envUrl.trim().length > 0
    ? envUrl.trim()
    : 'https://workforce-abinghambyte.vercel.app'
