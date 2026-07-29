import { apiClient } from './apiClient';

export type ExhibitorUploadResult = { url: string | null; error: string | null };

/**
 * Upload to exhibitor-images bucket.
 * Returns a host-free path (`/api/v1/files/...`) for DB storage.
 * Use resolveMediaUrl() when displaying in <img>.
 */
export async function uploadExhibitorPublicImage(
  file: File,
  folder: 'portfolio' | 'gallery',
  namePrefix: string
): Promise<ExhibitorUploadResult> {
  const ext = file.name.split('.').pop() || 'jpg';
  const safe = namePrefix.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  const filePath = `${folder}/${safe}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { data, error } = await apiClient.storage.from('exhibitor-images').upload(filePath, file, {
    upsert: false,
    contentType: file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    cacheControl: '3600',
  });
  if (error) {
    const msg = error.message || String(error);
    console.error('Exhibitor image upload failed:', msg, error);
    return { url: null, error: msg };
  }
  // Prefer API host-free path; fall back to getPublicUrl (also host-free now)
  const stored =
    data?.path ??
    apiClient.storage.from('exhibitor-images').getPublicUrl(filePath).data.publicUrl ??
    null;
  if (!stored) {
    return { url: null, error: 'Could not build storage path for uploaded file' };
  }
  return { url: stored, error: null };
}
