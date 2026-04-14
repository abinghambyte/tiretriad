/** Centered modal backdrop: full-viewport on narrow screens, padded dialog from `sm`. */
export const MODAL_CENTER_BACKDROP =
  'fixed inset-0 z-50 flex min-h-0 flex-col bg-black/75 p-0 backdrop-blur-sm sk-modal-backdrop-enter sm:flex sm:items-center sm:justify-center sm:p-4'

/** Same layout as {@link MODAL_CENTER_BACKDROP} but above other stacked dialogs (e.g. history on top of a drawer). */
export const MODAL_CENTER_BACKDROP_TOP =
  'fixed inset-0 z-[100] flex min-h-0 flex-col bg-black/75 p-0 backdrop-blur-sm sk-modal-backdrop-enter sm:flex sm:items-center sm:justify-center sm:p-4'

/** Shared panel layout (add `max-w-*` for width). Full-screen below `sm`, capped dialog from `sm`. */
export const MODAL_CENTER_PANEL_BASE =
  'mx-auto flex min-h-screen w-full flex-1 flex-col overflow-y-auto rounded-none border border-zinc-700/90 bg-zinc-900 shadow-2xl shadow-black/40 sk-modal-panel-enter sm:min-h-0 sm:max-h-[90vh] sm:flex-none sm:rounded-2xl'

/** Default width (most dialogs). */
export const MODAL_CENTER_PANEL = `${MODAL_CENTER_PANEL_BASE} max-w-lg`

/** Wider dialog (e.g. listing generator). */
export const MODAL_CENTER_PANEL_WIDE = `${MODAL_CENTER_PANEL_BASE} max-w-3xl`
