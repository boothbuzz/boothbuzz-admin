const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api/v1';
const AUTH_TOKEN_KEY = 'boothbuzz_admin_session';

export function getApiUrl() {
  return API_URL.replace(/\/$/, '');
}

/** API origin without `/api/v1` — used to build absolute file URLs. */
export function getApiOrigin() {
  return getApiUrl().replace(/\/api\/v1$/i, '');
}

export function setAuthToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    sessionStorage.removeItem(AUTH_TOKEN_KEY); // clear legacy key
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  const fromLocal = localStorage.getItem(AUTH_TOKEN_KEY);
  if (fromLocal) return fromLocal;
  // Migrate legacy sessionStorage token once
  const fromSession = sessionStorage.getItem(AUTH_TOKEN_KEY);
  if (fromSession) {
    localStorage.setItem(AUTH_TOKEN_KEY, fromSession);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    return fromSession;
  }
  return null;
}

type ApiError = { error: string };

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || res.statusText);
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T | null; error: { message: string } | null; status: number }> {
  try {
    const token = getAuthToken();
    const res = await fetch(`${getApiUrl()}${path}`, {
      credentials: 'include',
      ...init,
      headers: {
        ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    if (res.status === 204) return { data: null, error: null, status: res.status };
    const json = await parseJson<T | ApiError>(res);
    if (!res.ok) {
      if (res.status === 401 && !path.includes('/auth/login')) {
        setAuthToken(null);
      }
      const msg = (json as ApiError)?.error ?? res.statusText;
      return { data: null, error: { message: msg }, status: res.status };
    }
    return { data: json as T, error: null, status: res.status };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : 'Network error' }, status: 0 };
  }
}

export async function apiUpload(bucket: string, file: File | Blob, filePath?: string) {
  const form = new FormData();
  const name = file instanceof File ? file.name : 'upload.bin';
  form.append('file', file, name);
  // Only pass subdirectory (e.g. "flyers") — never re-include the bucket name
  let sub = (filePath ?? '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (sub === bucket) sub = '';
  if (sub.startsWith(`${bucket}/`)) sub = sub.slice(bucket.length + 1);
  // If a full file path was passed, keep parent dir only (upload assigns the filename)
  if (sub.includes('.')) {
    sub = sub.replace(/\/[^/]+$/, '') || '';
  }
  const q = sub ? `?path=${encodeURIComponent(sub)}` : '';
  return apiFetch<{ url: string; path: string }>(`/files/${bucket}${q}`, {
    method: 'POST',
    body: form,
  });
}

/** Host-free path for DB: `/api/v1/files/{bucket}/...` */
export function storedFilePath(bucket: string, objectPath: string) {
  let rel = objectPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (rel.startsWith('api/v1/files/')) return `/${rel}`;
  if (rel.startsWith('/api/v1/files/')) return rel;
  if (rel.startsWith(`${bucket}/`)) rel = rel.slice(bucket.length + 1);
  return `/api/v1/files/${bucket}/${rel}`.replace(/([^:])\/{2,}/g, '$1/');
}

export function publicFileUrl(bucket: string, objectPath: string) {
  return `${getApiOrigin()}${storedFilePath(bucket, objectPath)}`;
}

/**
 * Turn stored paths / legacy absolute URLs into a browser-loadable URL.
 * Rewrites any host's `/api/v1/files/...` to the current VITE_API_URL origin.
 */
export function resolveMediaUrl(url: string | null | undefined): string {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  if (/^(blob:|data:)/i.test(raw)) return raw;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (u.pathname.includes('/api/v1/files/')) {
        const p = u.pathname.slice(u.pathname.indexOf('/api/v1/files/'));
        return `${getApiOrigin()}${p}${u.search}`;
      }
      return raw;
    } catch {
      return raw;
    }
  }

  if (raw.startsWith('/api/') || raw.startsWith('/files/')) {
    return `${getApiOrigin()}${raw.startsWith('/') ? raw : `/${raw}`}`;
  }

  // Common storage path shapes: "event-images/..." or "bucket/path"
  const parts = raw.replace(/^\//, '').split('/');
  if (parts.length >= 2) {
    const bucket = parts[0];
    const objectPath = parts.slice(1).join('/');
    return publicFileUrl(bucket, objectPath);
  }
  return raw;
}

const TABLE_PATH: Record<string, string> = {
  users: '/admin/users',
  events: '/admin/events',
  venues: '/admin/venues',
  vendors: '/admin/vendors',
  exhibitors: '/admin/exhibitors',
  organizations: '/admin/organizations',
  testimonials: '/admin/testimonials',
  website_ads: '/admin/website-ads',
  sponsors: '/admin/sponsors',
  campaigns: '/admin/campaigns',
  advertisements: '/admin/advertisements',
  event_categories: '/admin/event-categories',
  event_registrations: '/admin/event-registrations',
  event_sponsors: '/admin/event-sponsors',
  campaign_ads: '/admin/campaign-ads',
  societies: '/admin/societies',
  vendor_subscription_plans: '/admin/vendor-subscription-plans',
  purchase_orders: '/admin/purchase-orders',
  purchase_order_lines: '/admin/purchase-order-lines',
};

export function adminPathForTable(table: string) {
  return TABLE_PATH[table] ?? `/admin/${table.replace(/_/g, '-')}`;
}
