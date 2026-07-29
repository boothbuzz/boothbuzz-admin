/**
 * REST API data client for boothbuzz-api admin endpoints.
 */
import { adminPathForTable, apiFetch, apiUpload, getApiUrl, publicFileUrl, storedFilePath } from './api';

type Row = Record<string, unknown>;

function camelToSnakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

/** JSON/object columns whose nested keys must stay as stored (do not snake_case children). */
const LEAVE_NESTED_KEYS = new Set([
  'document_urls',
  'documentUrls',
  'social_media_links',
  'socialMediaLinks',
  'in_site_stalls',
  'inSiteStalls',
  'out_site_stalls',
  'outSiteStalls',
  'selected_facilities',
  'selectedFacilities',
  'selected_amenities',
  'selectedAmenities',
  'image_urls',
  'imageUrls',
  'benefits',
  'facilities',
  'amenities',
]);

export function toSnake<T>(value: T): T {
  if (value == null || value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => toSnake(v)) as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const snakeKey = camelToSnakeKey(k);
      if (LEAVE_NESTED_KEYS.has(k) || LEAVE_NESTED_KEYS.has(snakeKey)) {
        out[snakeKey] = v;
      } else {
        out[snakeKey] = toSnake(v);
      }
    }
    return out as T;
  }
  return value;
}

function enrichUserRow(row: Row): Row {
  const snake = toSnake(row) as Row;
  if (row.organizationName) {
    snake.organizations = { name: row.organizationName };
  }
  return snake;
}

class QueryBuilder {
  private filters: Array<{
    col: string;
    val: unknown;
    op: 'eq' | 'in' | 'gte' | 'lte' | 'gt' | 'lt' | 'neq' | 'ilike';
  }> = [];
  private orderCol?: string;
  private orderAsc = true;
  private limitN?: number;
  private singleMode: 'none' | 'single' | 'maybe' = 'none';
  private pendingInsert?: Row | Row[];
  private pendingUpdate?: Row;
  private pendingDelete = false;
  private headCount = false;

  constructor(private table: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.head) this.headCount = true;
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push({ col, val, op: 'eq' });
    return this;
  }

  in(col: string, vals: unknown[]) {
    this.filters.push({ col, val: vals, op: 'in' });
    return this;
  }

  gte(col: string, val: unknown) {
    this.filters.push({ col, val, op: 'gte' });
    return this;
  }

  lte(col: string, val: unknown) {
    this.filters.push({ col, val, op: 'lte' });
    return this;
  }

  gt(col: string, val: unknown) {
    this.filters.push({ col, val, op: 'gt' });
    return this;
  }

  lt(col: string, val: unknown) {
    this.filters.push({ col, val, op: 'lt' });
    return this;
  }

  neq(col: string, val: unknown) {
    this.filters.push({ col, val, op: 'neq' });
    return this;
  }

  ilike(col: string, val: unknown) {
    this.filters.push({ col, val, op: 'ilike' });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }

  single() {
    this.singleMode = 'single';
    return this;
  }

  maybeSingle() {
    this.singleMode = 'maybe';
    return this;
  }

  insert(rows: Row | Row[]) {
    this.pendingInsert = rows;
    return this;
  }

  update(patch: Row) {
    this.pendingUpdate = patch;
    return this;
  }

  delete() {
    this.pendingDelete = true;
    return this;
  }

  private basePath() {
    return adminPathForTable(this.table);
  }

  private idFilter(): string | null {
    const idF = this.filters.find((f) => f.col === 'id' && f.op === 'eq');
    return idF ? String(idF.val) : null;
  }

  private emailFilter(): string | null {
    const f = this.filters.find((x) => x.col === 'email' && x.op === 'eq');
    return f ? String(f.val) : null;
  }

  async then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
    try {
      resolve(await this.execute());
    } catch (e) {
      reject?.(e);
    }
  }

  private getRowValue(row: Row, col: string): unknown {
    return row[col] ?? row[camelToSnakeKey(col)];
  }

  private compareValues(a: unknown, b: unknown): number {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    if (a === b) return 0;
    return a > b ? 1 : -1;
  }

  private applyFilters(rows: Row[]): Row[] {
    let result = [...rows];
    for (const f of this.filters) {
      if (f.op === 'eq') {
        result = result.filter((r) => this.getRowValue(r, f.col) === f.val);
      } else if (f.op === 'in') {
        const vals = f.val as unknown[];
        result = result.filter((r) => vals.includes(this.getRowValue(r, f.col)));
      } else if (f.op === 'gte') {
        result = result.filter((r) => this.compareValues(this.getRowValue(r, f.col), f.val) >= 0);
      } else if (f.op === 'lte') {
        result = result.filter((r) => this.compareValues(this.getRowValue(r, f.col), f.val) <= 0);
      } else if (f.op === 'gt') {
        result = result.filter((r) => this.compareValues(this.getRowValue(r, f.col), f.val) > 0);
      } else if (f.op === 'lt') {
        result = result.filter((r) => this.compareValues(this.getRowValue(r, f.col), f.val) < 0);
      } else if (f.op === 'neq') {
        result = result.filter((r) => this.getRowValue(r, f.col) !== f.val);
      } else if (f.op === 'ilike') {
        const pattern = String(f.val ?? '').toLowerCase();
        result = result.filter((r) => {
          const value = String(this.getRowValue(r, f.col) ?? '').toLowerCase();
          return value === pattern || value.includes(pattern);
        });
      }
    }
    return result;
  }

  async execute(): Promise<{ data: unknown; error: { message: string } | null; count?: number }> {
    const path = this.basePath();

    if (this.pendingInsert) {
      const rows = Array.isArray(this.pendingInsert) ? this.pendingInsert : [this.pendingInsert];
      if (rows.length === 1) {
        const { data, error } = await apiFetch(path, { method: 'POST', body: JSON.stringify(rows[0]) });
        return { data: data ? toSnake(data) : null, error };
      }
      const results: Row[] = [];
      for (const row of rows) {
        const { data, error } = await apiFetch<Row>(path, { method: 'POST', body: JSON.stringify(row) });
        if (error) return { data: null, error };
        if (data) results.push(toSnake(data) as Row);
      }
      return { data: results, error: null };
    }

    const id = this.idFilter();
    if (this.pendingUpdate && id) {
      const { data, error } = await apiFetch(`${path}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(this.pendingUpdate),
      });
      return { data: data ? toSnake(data) : null, error };
    }

    if (this.pendingDelete) {
      const id = this.idFilter();
      if (id) {
        const { data, error } = await apiFetch(`${path}/${id}`, { method: 'DELETE' });
        return { data: data ?? { ok: true }, error };
      }
      // Support filtered deletes used by admin UI
      const eventId = this.filters.find((f) => (f.col === 'event_id' || f.col === 'eventId') && f.op === 'eq');
      if (this.table === 'event_sponsors' && eventId) {
        const { data, error } = await apiFetch(
          `${path}?event_id=${encodeURIComponent(String(eventId.val))}`,
          { method: 'DELETE' },
        );
        return { data: data ?? { ok: true }, error };
      }
      const poId = this.filters.find(
        (f) => (f.col === 'purchase_order_id' || f.col === 'purchaseOrderId') && f.op === 'eq',
      );
      if (this.table === 'purchase_order_lines' && poId) {
        const { data, error } = await apiFetch(
          `${path}?purchase_order_id=${encodeURIComponent(String(poId.val))}`,
          { method: 'DELETE' },
        );
        return { data: data ?? { ok: true }, error };
      }
      return { data: null, error: { message: 'Delete requires id (or supported filter)' } };
    }

    const email = this.emailFilter();
    if (this.table === 'users' && email && this.singleMode !== 'none') {
      const { data, error } = await apiFetch<Row[]>(`${path}?email=${encodeURIComponent(email)}`);
      if (error) return { data: null, error };
      const rows = (Array.isArray(data) ? data : []).map(enrichUserRow);
      if (this.singleMode === 'maybe') return { data: rows[0] ?? null, error: null };
      if (rows.length !== 1) return { data: null, error: { message: 'User not found' } };
      return { data: rows[0], error: null };
    }

    if (id) {
      const { data, error } = await apiFetch(`${path}/${id}`);
      if (error) {
        if (this.singleMode === 'maybe') return { data: null, error: null };
        return { data: null, error };
      }
      let row = toSnake(data) as Row;
      if (this.table === 'users') row = enrichUserRow(data as Row);
      return { data: row, error: null };
    }

    // Forward common eq filters as query params for list endpoints that support them
    const qs = new URLSearchParams();
    for (const f of this.filters) {
      if (f.op !== 'eq') continue;
      const key = camelToSnakeKey(f.col);
      if (
        [
          'event_id',
          'vendor_id',
          'purchase_order_id',
          'campaign_id',
          'organization_id',
          'email',
        ].includes(key)
      ) {
        qs.set(key, String(f.val));
      }
    }
    const listPath = qs.toString() ? `${path}?${qs.toString()}` : path;
    const { data, error } = await apiFetch<Row[]>(listPath);
    if (error) return { data: null, error };

    let rows = (Array.isArray(data) ? data : data ? [data] : []).map((r) => {
      const snake = toSnake(r) as Row;
      return this.table === 'users' ? enrichUserRow(r as Row) : snake;
    });

    rows = this.applyFilters(rows);

    if (this.orderCol) {
      rows.sort((a, b) => {
        const av = a[this.orderCol!] ?? a[camelToSnakeKey(this.orderCol!)];
        const bv = b[this.orderCol!] ?? b[camelToSnakeKey(this.orderCol!)];
        if (av === bv) return 0;
        const cmp = av! > bv! ? 1 : -1;
        return this.orderAsc ? cmp : -cmp;
      });
    }

    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    if (this.headCount) return { data: null, error: null, count: rows.length };

    if (this.singleMode === 'single') {
      if (rows.length !== 1) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } };
      return { data: rows[0], error: null };
    }
    if (this.singleMode === 'maybe') return { data: rows[0] ?? null, error: null };

    return { data: rows, error: null };
  }
}

export const apiClient = {
  from(table: string) {
    return new QueryBuilder(table);
  },

  storage: {
    from(bucket: string) {
      return {
        async upload(filePath: string, file: File | Blob, _opts?: unknown) {
          // filePath may be "flyers/name.jpg" or legacy "event-images/flyers/name.jpg"
          const dir = filePath.includes('/') ? filePath.replace(/\/[^/]+$/, '') : '';
          const { data, error } = await apiUpload(bucket, file, dir || undefined);
          if (error) return { data: null, error: { message: error.message } };
          // data.path is host-free `/api/v1/files/...` — save this in DB
          return { data: { path: data!.path }, error: null };
        },
        getPublicUrl(objectPath: string) {
          // Return host-free path for DB; use resolveMediaUrl() for <img src>
          const path =
            objectPath.startsWith('/api/v1/files/') || objectPath.startsWith('api/v1/files/')
              ? objectPath.startsWith('/')
                ? objectPath
                : `/${objectPath}`
              : storedFilePath(bucket, objectPath);
          return { data: { publicUrl: path } };
        },
        async list(_prefix: string) {
          return { data: [], error: null };
        },
        async createSignedUrl(objectPath: string) {
          return { data: { signedUrl: publicFileUrl(bucket, objectPath) } };
        },
        remove(_paths: string[]) {
          return Promise.resolve({ data: [], error: null });
        },
      };
    },
  },

  functions: {
    async invoke(name: string, opts?: { body?: unknown }) {
      if (name === 'generate-event-flyer') {
        const eventId = (opts?.body as Row)?.meta && (opts as { body: { meta: { eventId?: string } } }).body.meta?.eventId;
        if (!eventId) return { data: null, error: { message: 'eventId required' } };
        return apiFetch(`/admin/events/${eventId}/flyer`, { method: 'POST', body: JSON.stringify(opts?.body) });
      }
      return { data: null, error: { message: `Unknown function: ${name}` } };
    },
  },
};

export const generateEventFlyer = async (payload: unknown) => {
  const eventId = (payload as Row)?.meta && (payload as { meta: { eventId?: string } }).meta?.eventId;
  if (!eventId) return { data: null, error: { message: 'eventId required' } };
  return apiFetch(`/admin/events/${eventId}/flyer`, { method: 'POST', body: JSON.stringify(payload) });
};

export const isApiConfigured = () => !!getApiUrl();

export default apiClient;
