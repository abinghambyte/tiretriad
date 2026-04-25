import { Timestamp, arrayRemove, arrayUnion, doc, updateDoc } from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from '../firebase/config'

export async function uploadTirePhoto({ mspn, file, uploadedBy }) {
  const id = crypto.randomUUID()
  const storagePath = `tires/${mspn}/${id}.jpg`
  const storageRef = ref(storage, storagePath)
  await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' })
  const url = await getDownloadURL(storageRef)
  const photo = {
    url,
    storagePath,
    uploadedAt: Timestamp.now(),
    uploadedBy: uploadedBy || 'unknown',
  }
  await updateDoc(doc(db, 'tires', mspn), { photos: arrayUnion(photo) })
  return photo
}

export async function deleteTirePhoto({ mspn, photo }) {
  await updateDoc(doc(db, 'tires', mspn), { photos: arrayRemove(photo) })
  if (photo?.storagePath) {
    try {
      await deleteObject(ref(storage, photo.storagePath))
    } catch (e) {
      console.warn('storage delete failed', e)
    }
  }
}
