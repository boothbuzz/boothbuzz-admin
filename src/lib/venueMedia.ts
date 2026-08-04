import { resolveMediaUrl } from './api';

export type VenueMediaEntry = {
  name: string;
  url: string;
  /** Host-free path for DB writes (`/api/v1/files/...`). */
  storedUrl: string;
  type: string;
  size: number;
};

function asArray(value: unknown): unknown[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : parsed != null ? [parsed] : [];
    } catch {
      return [trimmed];
    }
  }
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>);
  return [];
}

/**
 * Normalize venue photos/documents from DB/API into display + storage shapes.
 * Always resolves browser URLs via VITE_API_URL.
 */
export function parseVenueMediaEntries(value: unknown): VenueMediaEntry[] {
  const out: VenueMediaEntry[] = [];
  for (const item of asArray(value)) {
    if (item == null) continue;

    if (typeof item === 'string') {
      const storedUrl = item.trim();
      const url = resolveMediaUrl(storedUrl);
      if (!url) continue;
      out.push({
        name: storedUrl.split('/').pop() || 'file',
        url,
        storedUrl,
        type: '',
        size: 0,
      });
      continue;
    }

    if (typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const rawPath = String(obj.url ?? obj.path ?? '').trim();
    if (!rawPath) continue;
    const url = resolveMediaUrl(rawPath);
    if (!url) continue;
    out.push({
      name: String(obj.name ?? url.split('/').pop() ?? 'file'),
      url,
      storedUrl: rawPath.startsWith('/api/') || rawPath.startsWith('api/') ? (rawPath.startsWith('/') ? rawPath : `/${rawPath}`) : rawPath,
      type: String(obj.type ?? ''),
      size: Number(obj.size) || 0,
    });
  }
  return out;
}

/** Shape used by venue create/update payloads. */
export function toVenueMediaPayload(entries: Array<{ name?: string; url?: string; storedUrl?: string; type?: string; size?: number } | string>) {
  return entries
    .map((item) => {
      if (typeof item === 'string') {
        return { name: item.split('/').pop() || 'file', url: item, type: '', size: 0 };
      }
      const url = item.storedUrl || item.url || '';
      if (!url) return null;
      return {
        name: item.name || url.split('/').pop() || 'file',
        url,
        type: item.type || '',
        size: item.size || 0,
      };
    })
    .filter(Boolean);
}
