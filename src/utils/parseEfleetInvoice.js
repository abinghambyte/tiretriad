// Thin re-export so the bundler resolves the parser via `src/`. The
// authoritative implementation lives in scripts/import-efleet-invoice.mjs
// and is shared between the CLI importer and the admin UI.
export { parseEfleetInvoice } from '../../scripts/import-efleet-invoice.mjs'
