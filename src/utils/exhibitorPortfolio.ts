import {
  getDefaultExhibitorProfileUrl,
  normalizePersistableImageUrl,
} from '../constants/exhibitorDefaultProfile';
import { normalizeExhibitorImageUrlsForWrite } from '../lib/exhibitorImageDb';
import { resolveMediaUrl } from '../lib/api';

function isLikelyImageUrl(s: string): boolean {
  const t = s.trim();
  return (
    t.startsWith('http://') ||
    t.startsWith('https://') ||
    t.startsWith('/') ||
    t.includes('/api/v1/files/')
  );
}

/**
 * Normalize image_urls from DB (jsonb array, double-encoded JSON string, legacy text, etc.).
 */
export function parseExhibitorImageUrls(raw: unknown): string[] {
  const collected: string[] = [];
  const visit = (v: unknown, depth: number) => {
    if (depth > 12) return;
    if (v == null) return;
    if (Array.isArray(v)) {
      v.forEach((x) => visit(x, depth + 1));
      return;
    }
    if (typeof v === 'string') {
      const t = v.trim();
      if (!t) return;
      if (t.startsWith('[') || t.startsWith('{') || (t.startsWith('"') && t.endsWith('"'))) {
        try {
          visit(JSON.parse(t), depth + 1);
        } catch {
          if (isLikelyImageUrl(t)) collected.push(t.trim());
        }
        return;
      }
      if (isLikelyImageUrl(t)) collected.push(t.trim());
      return;
    }
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.url === 'string') visit(o.url, depth + 1);
    }
  };
  visit(raw, 0);
  return normalizeExhibitorImageUrlsForWrite(collected);
}

export function exhibitorPortfolioDisplayUrl(input: {
  portfolioImageUrl?: string | null;
  imageUrls?: string[] | null;
  companyName?: string | null;
  id?: string;
}): string {
  const p = (input.portfolioImageUrl || '').trim();
  if (p) return resolveMediaUrl(p) || p;
  const first = parseExhibitorImageUrls(input.imageUrls)[0];
  if (first) return resolveMediaUrl(first) || first;
  return getDefaultExhibitorProfileUrl();
}

/**
 * All exhibitor-uploaded image URLs for gallery UI (excludes default placeholder only).
 * Combines cover + gallery with deduplication.
 */
export function exhibitorUploadedImageUrls(input: {
  portfolioImageUrl?: string | null;
  imageUrls?: string[] | null;
}): string[] {
  const gallery = normalizeExhibitorImageUrlsForWrite(parseExhibitorImageUrls(input.imageUrls));
  const cover = normalizePersistableImageUrl(input.portfolioImageUrl);
  const def = getDefaultExhibitorProfileUrl();
  const result: string[] = [];
  const seen = new Set<string>();
  const push = (u: string) => {
    if (!u || seen.has(u)) return;
    seen.add(u);
    result.push(u);
  };
  if (cover && cover !== def) push(cover);
  for (const u of gallery) push(u);
  return result;
}
