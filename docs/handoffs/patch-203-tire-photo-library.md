---
id: 203
title: Per-tire photo library MVP (upload + gallery + per-card thumbnail count)
branch: tire-photo-library
depends_on: []
touches_shared:
  - src/components/tires/TireCardMobile.jsx
  - src/components/tires/MarginTable.jsx
  - firestore.rules
deploy:
  functions: []
  firestore_rules: true
  scripts: []
---

# Patch 203 — Per-tire photo library MVP

The single biggest mobile workflow gap is photo capture. Today, when Alex creates a listing he hunts photos online. When real users come online (Kyle / DJ at the shop), they need to be able to snap a photo of a tire that just arrived and have it stick to that tire's profile so the next listing job pulls from a real photo set.

This patch ships the MVP: per-tire photo upload, a small gallery, and a count badge on each catalog card. Listing-flow integration ships in a later patch.

## Branch

`tire-photo-library`

## Scope

**Create:**
- `src/components/tires/TirePhotoButton.jsx` — small button + camera input that uploads a photo to a tire's library
- `src/components/tires/TirePhotoGallery.jsx` — modal showing all photos for a tire with delete / replace
- `src/utils/tirePhotos.js` — shared upload / list / delete helpers
- `src/components/tires/TirePhotoButton.test.jsx`
- `src/utils/tirePhotos.test.js`

**Modify:**
- `src/components/tires/TireCardMobile.jsx` — add a small `📷 N` badge showing photo count + "Add photo" tap target
- `src/components/tires/MarginTable.jsx` — add a thumbnail-count column (small, inside the existing optional-columns set)
- `src/firebase/config.js` — export `storage` from `getStorage(app)`
- `firestore.rules` — allow authenticated users with `tires:edit` permission to write the `photos` array on a tire doc

## Data model

Each tire doc gets a new field:

```js
{
  // existing fields...
  photos: [
    {
      url: 'https://firebasestorage.googleapis.com/...',
      storagePath: 'tires/09100/abc123.jpg',
      uploadedAt: <Timestamp>,
      uploadedBy: 'test-bypass-admin', // user uid
      // Optional future: angle, condition, mileage, etc.
    },
    // ...
  ]
}
```

Storage layout: `gs://skedaddle-inventory/tires/{mspn}/{uuid}.jpg`. UUIDs from `crypto.randomUUID()` so collisions are impossible. Filenames stay opaque; the doc's `photos[].url` is the public reference.

## Tasks

### 1. Wire Firebase Storage

`src/firebase/config.js` already configures `storageBucket: 'skedaddle-inventory.firebasestorage.app'`. Add the SDK init:

```js
import { getStorage } from 'firebase/storage'
// alongside existing exports:
export const storage = getStorage(app)
```

### 2. Build the upload helper

`src/utils/tirePhotos.js`:

```js
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { doc, updateDoc, arrayUnion, arrayRemove, serverTimestamp } from 'firebase/firestore'
import { db, storage } from '../firebase/config'

export async function uploadTirePhoto({ mspn, file, uploadedBy }) {
  const id = crypto.randomUUID()
  const path = `tires/${mspn}/${id}.jpg`
  const r = ref(storage, path)
  await uploadBytes(r, file, { contentType: file.type || 'image/jpeg' })
  const url = await getDownloadURL(r)
  const photo = {
    url,
    storagePath: path,
    uploadedAt: serverTimestamp(),
    uploadedBy: uploadedBy || 'unknown',
  }
  await updateDoc(doc(db, 'tires', mspn), { photos: arrayUnion(photo) })
  return photo
}

export async function deleteTirePhoto({ mspn, photo }) {
  await updateDoc(doc(db, 'tires', mspn), { photos: arrayRemove(photo) })
  if (photo.storagePath) {
    try {
      await deleteObject(ref(storage, photo.storagePath))
    } catch (e) {
      // Best-effort: object may already be gone.
      console.warn('storage delete failed', e)
    }
  }
}
```

### 3. Build the upload button

`src/components/tires/TirePhotoButton.jsx`:

```jsx
import { useRef, useState } from 'react'
import { useUserProfile } from '../../hooks/useUserProfile.js'
import { uploadTirePhoto } from '../../utils/tirePhotos.js'

export function TirePhotoButton({ tire, count = 0, onUploaded }) {
  const inputRef = useRef(null)
  const { profile } = useUserProfile()
  const [busy, setBusy] = useState(false)

  async function handleChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const photo = await uploadTirePhoto({
        mspn: tire.mspn,
        file,
        uploadedBy: profile?.uid || 'unknown',
      })
      onUploaded?.(photo)
    } finally {
      setBusy(false)
      // Reset so picking the same file twice still fires
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={`Add photo for ${tire.description}`}
        className="inline-flex h-9 items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900/60 px-2 text-xs font-medium text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-50"
      >
        <span aria-hidden>📷</span>
        <span className="tabular-nums">{count}</span>
        {busy ? <span className="text-zinc-400">…</span> : <span>+</span>}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        className="sr-only"
      />
    </>
  )
}
```

The `capture="environment"` attribute hints to mobile browsers to use the back camera by default.

### 4. Wire into TireCardMobile

Add the photo button to each card. Place it on the action row alongside the existing Test offer button:

```jsx
<div className="mt-3 flex items-center gap-2">
  <TirePhotoButton
    tire={tire}
    count={tire.photos?.length || 0}
    onUploaded={onPhotoUploaded}
  />
  <button
    type="button"
    onClick={() => onTestOffer?.(tire)}
    className="flex-1 min-h-[44px] rounded-lg bg-amber-500 px-3 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
  >
    Test offer
  </button>
</div>
```

The card's existing checkbox-tap-to-select stays.

### 5. Build the gallery (deferred to inside this same PR or its own follow-up)

If you ship the gallery in this PR:

`src/components/tires/TirePhotoGallery.jsx` — a portal-rendered modal triggered by tapping the count badge (count > 0). Shows photos in a scrollable grid, each with a delete button.

If you defer the gallery: the upload still works (photos accumulate on the tire doc); they just aren't visible until a follow-up patch builds the viewer. Document this in the PR description.

**Decision:** include the gallery in this PR. The MVP needs both upload AND review or the user can't trust their uploads.

### 6. Update Firestore rules

In `firestore.rules`, find the `tires` collection rule. Add `photos` to the writable fields for users with the `tires` `edit` permission. Read access is already public (or auth-only depending on existing rules — preserve it).

The exact rule depends on what's already there. Read `firestore.rules` first and surgically add `photos` to the allowed-update fields. Don't open new write paths for unrelated fields.

### 7. Update MarginTable (desktop)

Add a small thumbnail/count column to MarginTable's column definitions, behind an optional toggle (off by default — desktop users typically don't need to upload photos from the catalog). Set this up so the user can opt in via Table options.

If this gets messy, defer the desktop column to a follow-up. The mobile card is the primary surface.

## Tests

### `src/utils/tirePhotos.test.js`

Mock Firebase storage and Firestore. Verify:
- `uploadTirePhoto` calls `uploadBytes` with the expected path
- `uploadTirePhoto` calls `arrayUnion` on the tire doc with the new photo metadata
- `deleteTirePhoto` calls both `arrayRemove` and `deleteObject`
- Filename uses `crypto.randomUUID()` so two uploads in a row never collide

### `TirePhotoButton.test.jsx`

- Initial render: shows `📷 N +`
- Clicking the button opens the file picker (test by asserting that `inputRef.current.click()` is called)
- Selecting a file calls `uploadTirePhoto` (mock the helper)
- onUploaded is fired with the resulting photo

## Out of scope

- Listing flow integration (auto-attach photos when generating listings) — separate patch
- Per-photo metadata editing (angle, condition, etc.) — future
- Drag-to-reorder photos — future
- Image optimization / thumbnail generation server-side — future (use Firebase extension)
- Bulk photo upload — separate
- Photo cropping / rotation in the upload UI — future

## Storage cost note

Firebase Storage is ~$0.026/GB/month. A typical phone photo is ~3MB JPEG. 1000 tires × 4 photos × 3MB = 12 GB ≈ $0.30/mo. Fine for now. If we ever need to compress on upload, plug in `browser-image-compression` later.

## Validation

```
npm run lint
npm run test
npm run build
```

Manual smoke (in dev mode with auth bypass):
1. Open `/tires` on mobile, find any tire card
2. Tap `📷 0 +`
3. Camera or photo picker opens
4. Select an image
5. Card shows `📷 1 +` after upload completes
6. Tap the badge → gallery modal shows the photo
7. Long-press a photo → delete confirm → photo disappears
8. Refresh page → count and gallery match what's in Firestore

## PR title

`Per-tire photo library MVP: upload + gallery + count badge on cards`

Execute this brief exactly. Branch from main, run all validation commands before opening the PR, and stop after the PR is open.
