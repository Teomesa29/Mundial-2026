const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1';

// ── Simple in-memory cache with TTL ─────────────────────────────────────────
const _cache = new Map();   // endpoint → { data, expiresAt }
const DEFAULT_TTL_MS = 30_000; // 30 seconds

function _cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _cache.delete(key); return null; }
  return entry.data;
}
function _cacheSet(key, data, ttl = DEFAULT_TTL_MS) {
  _cache.set(key, { data, expiresAt: Date.now() + ttl });
}
function _invalidatePrefix(prefix) {
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) _cache.delete(key);
  }
}

// ── Core fetch ───────────────────────────────────────────────────────────────
async function fetchWithAuth(endpoint, options = {}, { cache = false, ttl = DEFAULT_TTL_MS } = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const method = (options.method || 'GET').toUpperCase();

  // Serve from cache for GET requests
  if (cache && method === 'GET') {
    const cached = _cacheGet(endpoint);
    if (cached !== null) return cached;
  }

  const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });

  if (response.status === 401) {
    localStorage.removeItem('token');
    window.location.reload();
    throw new Error('Unauthorized');
  }
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
    const err = new Error(errorData.detail || 'API request failed');
    err.status = response.status;
    err.response = { data: errorData };
    throw err;
  }
  if (response.status === 204) return null;

  const data = await response.json();

  // Store in cache for successful GETs
  if (cache && method === 'GET') _cacheSet(endpoint, data, ttl);

  // Invalidate related cache entries on mutations
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const base = endpoint.split('/').slice(0, 3).join('/'); // e.g. /predictions
    _invalidatePrefix(base);
  }

  return data;
}

export const api = {
  baseUrl: API_URL,
  /** GETs are cached 30 s by default. Pass { cache: false } to skip. */
  get:    (endpoint, opts = { cache: true }) => fetchWithAuth(endpoint, { method: 'GET' },  opts),
  post:   (endpoint, body) => fetchWithAuth(endpoint, { method: 'POST',   body: JSON.stringify(body) }),
  put:    (endpoint, body) => fetchWithAuth(endpoint, { method: 'PUT',    body: JSON.stringify(body) }),
  patch:  (endpoint, body) => fetchWithAuth(endpoint, { method: 'PATCH',  body: JSON.stringify(body) }),
  delete: (endpoint)       => fetchWithAuth(endpoint, { method: 'DELETE' }),
  /** Force-invalidate a cache prefix (e.g. after optimistic update) */
  invalidate: (prefix) => _invalidatePrefix(prefix),
  /** Clear the entire cache */
  clearCache: () => _cache.clear(),
};
