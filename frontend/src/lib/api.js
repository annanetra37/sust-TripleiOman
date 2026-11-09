const BASE = import.meta.env.VITE_API_URL || window.__API_URL__ || '/api';
const K = { access: 'tio_access', refresh: 'tio_refresh', org: 'tio_org' };

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* ignore */ } },
};

export const session = {
  get access() { return store.get(K.access); },
  get refresh() { return store.get(K.refresh); },
  get orgId() { return store.get(K.org); },
  setTokens(a, r) { store.set(K.access, a); store.set(K.refresh, r); },
  setOrg(id) { store.set(K.org, id); },
  clear() { store.set(K.access, null); store.set(K.refresh, null); },
};

let refreshing = null;
async function refresh() {
  if (!session.refresh) return false;
  refreshing = refreshing || fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: session.refresh }) })
    .then(async (r) => { if (!r.ok) return false; const d = await r.json(); session.setTokens(d.accessToken, d.refreshToken); return true; })
    .catch(() => false)
    .finally(() => { setTimeout(() => { refreshing = null; }, 0); });
  return refreshing;
}

export class ApiError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

export async function request(path, { method = 'GET', body, form, raw, org = true, headers = {} } = {}) {
  const h = { ...headers };
  if (session.access) h.Authorization = `Bearer ${session.access}`;
  if (org && session.orgId) h['X-Org-Id'] = session.orgId;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const opts = { method, headers: h, body: form || (body !== undefined ? JSON.stringify(body) : undefined) };
  let res;
  try { res = await fetch(BASE + path, opts); } catch { throw new ApiError(0, 'Cannot reach the server. Check your connection.'); }
  if (res.status === 401 && session.refresh && !path.startsWith('/auth/')) {
    if (await refresh()) {
      h.Authorization = `Bearer ${session.access}`;
      res = await fetch(BASE + path, { ...opts, headers: h });
    } else {
      session.clear();
      window.dispatchEvent(new Event('tio:logout'));
    }
  }
  if (raw) {
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new ApiError(res.status, e.error || res.statusText); }
    return res;
  }
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || `Error ${res.status}`, data?.details);
  return data;
}

export const api = {
  get: (p, o) => request(p, o),
  post: (p, body, o) => request(p, { ...o, method: 'POST', body: body ?? {} }),
  patch: (p, body, o) => request(p, { ...o, method: 'PATCH', body }),
  put: (p, body, o) => request(p, { ...o, method: 'PUT', body }),
  del: (p, o) => request(p, { ...o, method: 'DELETE' }),
  upload: (p, formData, o) => request(p, { ...o, method: 'POST', form: formData }),
  async download(p, filename) {
    const res = await request(p, { raw: true });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
