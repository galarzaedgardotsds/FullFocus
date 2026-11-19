// ── API Client ────────────────────────────────────────────
const API = {
  base: '/api',

  _headers() {
    const h = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('token');
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  },

  async request(method, path, body) {
    const opts = { method, headers: this._headers() };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(this.base + path, opts);
    const data = await res.json().catch(() => null);

    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login.html';
      throw new Error('No autorizado');
    }
    if (!res.ok) throw new Error(data?.error || 'Error del servidor');
    return data;
  },

  get(path)       { return this.request('GET', path); },
  post(path, b)   { return this.request('POST', path, b); },
  put(path, b)    { return this.request('PUT', path, b); },
  patch(path, b)  { return this.request('PATCH', path, b); },
  delete(path)    { return this.request('DELETE', path); },
};
