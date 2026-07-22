const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api/v1';
const AUTH_TOKEN_KEY = 'boothbuzz_admin_session';

export function getApiUrl() {
  return API_URL.replace(/\/$/, '');
}

export function setAuthToken(token: string | null) {
  if (token) sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  else sessionStorage.removeItem(AUTH_TOKEN_KEY);
}

export function getAuthToken(): string | null {
  return sessionStorage.getItem(AUTH_TOKEN_KEY);
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
  const q = filePath ? `?path=${encodeURIComponent(filePath.replace(/\/[^/]+$/, '') || '')}` : '';
  return apiFetch<{ url: string; path: string }>(`/files/${bucket}${q}`, {
    method: 'POST',
    body: form,
  });
}

export function publicFileUrl(bucket: string, objectPath: string) {
  return `${getApiUrl()}/files/${bucket}/${objectPath.replace(/^\//, '')}`;
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
