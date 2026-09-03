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
  navigateTo(tabId, query = null) {
    const qs = query ? `?q=${encodeURIComponent(query)}` : '';
    window.location.hash = `#${tabId}${qs}`;
  },
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
  onRouteChange(callback) {
    listeners.push(callback);
  },
  _notify() {
    const hash = window.location.hash;
    // hashchange + popstate can both fire for the same traversal; skip the dup.
    if (hash === this._lastHash) return;
    this._lastHash = hash;
    const { tab, query, params } = parseHash();
    listeners.forEach(cb => cb(tab, query, params));
  },
  init() {
    window.addEventListener('hashchange', () => this._notify());
    // Entries created via history.pushState (tab switches, filter pushes)
    // surface back/forward traversal as popstate rather than hashchange in
    // some browsers; listen to both and dedupe on the resulting hash.
    window.addEventListener('popstate', () => this._notify());
    this._notify();
  }
};

// Initialize router on load
Router.init();
