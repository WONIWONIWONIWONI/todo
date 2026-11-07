/* Independent resource client. Preserve last good data, deduplicate and bound requests. */
(function (root) {
  'use strict';
  async function fetchJSON(url, { timeout = 12000, ...options } = {}) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  function createResourceClient({ storage = null, now = Date.now, fetcher = fetchJSON } = {}) {
    const entries = new Map();
    function get(key, fallback) {
      if (!entries.has(key)) {
        const entry = { data: fallback, successAt: 0, attemptedAt: 0, error: '', loading: false, failures: 0, promise: null };
        try { const saved = JSON.parse(storage?.getItem('rs-resource:' + key) || 'null'); if (saved && Number.isFinite(saved.at)) { entry.data = saved.data; entry.successAt = saved.at; } } catch (_) { /* optional storage */ }
        entries.set(key, entry);
      }
      return entries.get(key);
    }
    function load(key, url, { fallback = {}, ttl = 10 * 60e3, force = false, transform = x => x, onChange = () => {} } = {}) {
      const entry = get(key, fallback), age = now() - entry.attemptedAt;
      if (entry.loading) return entry.promise;
      const retry = Math.min(5 * 60e3, 15e3 * 2 ** Math.min(entry.failures, 5));
      if (!force && entry.attemptedAt && age < (entry.error ? retry : ttl)) return Promise.resolve(entry);
      entry.attemptedAt = now(); entry.loading = true;
      entry.promise = Promise.resolve().then(() => fetcher(url, { cache: 'no-cache' })).then(raw => {
        const data = transform(raw);
        entry.data = data; entry.successAt = now(); entry.error = ''; entry.failures = 0;
        try { storage?.setItem('rs-resource:' + key, JSON.stringify({ data, at: entry.successAt })); } catch (_) { /* optional storage */ }
      }).catch(error => { entry.error = error.name === 'AbortError' ? 'timeout' : error.message; entry.failures++; })
        .finally(() => { entry.loading = false; entry.promise = null; onChange(entry); });
      return entry.promise;
    }
    return { get, load };
  }
  root.RSRuntime = Object.freeze({ fetchJSON, createResourceClient });
})(globalThis);
