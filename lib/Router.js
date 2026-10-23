// Router.js
// Handles deep link parsing and navigation

const listeners = [];


// Parse hash for tab, query, and all params (e.g., #tab?q=search&filter=Scrolls)
function parseHash() {
  const hash = window.location.hash.replace(/^#/, '');
  const qIdx = hash.indexOf('?');
  const tab = qIdx === -1 ? hash : hash.slice(0, qIdx);
  const params = new URLSearchParams(qIdx === -1 ? '' : hash.slice(qIdx + 1));
  return {
    tab: tab || 'overview',
    query: params.has('q') ? decodeURIComponent(params.get('q')) : null,
    params,
  };
}

export const Router = {
  getCurrentRoute() {
    return parseHash().tab;
  },
  getCurrentQuery() {
    return parseHash().query;
  },
  getParams() {
    return parseHash().params;
  },
  updateFilter(tabId, params = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    history.replaceState(null, '', qs ? `#${tabId}?${qs}` : `#${tabId}`);
  },
  // Discrete filter navigation (e.g. class -> subclass drill-down). Unlike
  // updateFilter (replace, for transient states like typing), this pushes a
  // new history entry so the back button steps through each level instead of
  // skipping straight to the previous tab.
  pushFilter(tabId, params = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    const next = qs ? `#${tabId}?${qs}` : `#${tabId}`;
    if (window.location.hash === next) return;
    history.pushState(null, '', next);
  },
  // Record the expanded row as `open=<id>` on the current entry, keeping the
  // tab's filter/search params so Back restores the list as it was left.
  // A legacy `q=id:…` deep link is folded into `open` rather than kept as a
  // search, which would collapse the list to that one row on return.
  setOpenRow(tabId, id = null) {
    const { tab, params } = parseHash();
    const next = new URLSearchParams(tab === tabId ? params : '');
    if (next.has('q') && /^id:/i.test(next.get('q'))) next.delete('q');
    if (id != null) next.set('open', String(id));
    else next.delete('open');
    const qs = next.toString();
    const hash = qs ? `#${tabId}?${qs}` : `#${tabId}`;
    if (window.location.hash === hash) return;
    history.replaceState(null, '', hash);
  },
  onRouteChange(callback) {
    listeners.push(callback);
  },
  _notify() {
    const { tab, query, params } = parseHash();
    listeners.forEach(cb => cb(tab, query, params));
  },
  init() {
    // Entries created via history.pushState (tab switches, filter pushes)
    // surface back/forward traversal as popstate; fragment changes also fire
    // hashchange right after. Handle popstate and skip the hashchange that
    // follows it. Deduping against the last *notified* hash instead misses
    // pushState entries (which fire nothing), so Back to the first page was
    // swallowed.
    window.addEventListener('popstate', () => {
      this._poppedHash = window.location.hash;
      this._notify();
    });
    window.addEventListener('hashchange', () => {
      const popped = this._poppedHash === window.location.hash;
      this._poppedHash = null;
      if (!popped) this._notify();
    });
  }
};

// Initialize router on load
Router.init();
