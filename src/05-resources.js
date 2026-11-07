  // Resource IO is isolated from view state; only successfully parsed data replaces a snapshot.
  let resourceStorage = null;
  try { resourceStorage = localStorage; } catch (_) { /* private browsing */ }
  const resources = Runtime.createResourceClient({ storage: resourceStorage });
  const resourceReloaders = new Map();
  function resourceNotice() {
    let el = document.getElementById('resourceNotice');
    const failed = [...resourceReloaders.keys()].some(key => resources.get(key, {}).error);
    if (!el && failed) {
      el = document.createElement('div'); el.id = 'resourceNotice'; el.className = 'notice'; el.setAttribute('role', 'status');
      $notice.insertAdjacentElement('afterend', el);
    }
    if (el) { el.hidden = !failed; el.textContent = '일부 최신 정보를 확인하지 못했어요. 마지막으로 받은 내용이 있다면 표시하며, 자동으로 다시 확인해요.'; }
  }
  function loadResource(key, path, fallback, transform, refresh, force = false) {
    const entry = resources.get(key, fallback);
    const sync = () => {
      state[key] = { ...entry.data, error: entry.error, loading: entry.loading, successAt: entry.successAt };
      resourceNotice();
    };
    resourceReloaders.set(key, f => loadResource(key, path, fallback, transform, refresh, f));
    sync();
    resources.load(key, BASE + path, { fallback, transform, force, onChange() { sync(); refresh(); } });
    sync();
  }
  function refreshDataSources(force = false) {
    for (const reload of [...resourceReloaders.values()]) reload(force);
    if (state.schMonth) schLoad(state.schMonth, force);
  }
