/* Validate the entire transfer before writing. Roll back partial writes on quota failures. */
(function (root) {
  'use strict';
  function decode(code) {
    const raw = String(code || '').replace(/\s+/g, '');
    if (!raw.startsWith('RS1.') || raw.length > 2e6) throw new Error('code');
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw.slice(4)), c => c.charCodeAt(0))));
    if (!data || data.v !== 1 || !data.checks || typeof data.checks !== 'object' || Array.isArray(data.checks)) throw new Error('shape');
    const list = values => {
      if (!Array.isArray(values) || values.length > 10000 || values.some(v => typeof v !== 'string' || v.length > 80)) throw new Error('list');
      return [...new Set(values)];
    };
    const updates = new Map(), entries = Object.entries(data.checks);
    if (entries.length > 1000) throw new Error('size');
    for (const [date, values] of entries) {
      if (!root.RSData.isDate(date)) throw new Error('date');
      updates.set('rs-check:' + date, list(values));
    }
    updates.set('rs-check-once', list(data.once || []));
    const days = list(data.done || []);
    if (days.some(d => !root.RSData.isDate(d))) throw new Error('date');
    updates.set('rs-done-days', days);
    return { updates, days: entries.length };
  }
  function merge(storage, decoded) {
    const before = new Map(), after = new Map();
    for (const [key, values] of decoded.updates) {
      const old = storage.getItem(key); before.set(key, old);
      const parsed = JSON.parse(old || '[]');
      if (!Array.isArray(parsed)) throw new Error('existing');
      let merged = [...new Set([...parsed, ...values])];
      if (key === 'rs-done-days') merged = merged.sort().slice(-400);
      after.set(key, JSON.stringify(merged));
    }
    try { for (const [key, value] of after) storage.setItem(key, value); }
    catch (error) {
      // Remove newly created keys first, making space for the original values.
      for (const [key, value] of before) if (value === null) storage.removeItem(key);
      for (const [key, value] of before) if (value !== null) storage.setItem(key, value);
      throw error;
    }
    return decoded.days;
  }
  root.RSRecords = Object.freeze({ decode, merge });
})(globalThis);
