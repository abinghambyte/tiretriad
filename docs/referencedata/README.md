# docs/referencedata

Reference data the portal is built around. Not consumed at runtime - these
are source-of-truth documents for humans and for AI sessions that need the
underlying numbers.

## Files

### `Michelin_eFleet_Catalog_SKEDADDLE_v2.html`

Michelin eFleet catalog for Skedaddle Inc (Loveland). This is the **base
pricing source of truth** for the tire catalog. When tire prices, sizes,
or model entries disagree with the portal, this file wins and the portal
should be updated to match.

Open it in any browser to view the formatted catalog.

## Rules

- Update in place (rename with `_v3`, `_v4`, etc. when a new revision
  ships so history is preserved).
- Do not delete old versions silently - an audit trail of what price was
  in effect when matters for margin reconciliation.
- If you pull pricing out of this doc into structured form (JSON, CSV,
  Firestore seed), put the derived file right next to it with a note at
  the top of the derived file linking back to the source version.
