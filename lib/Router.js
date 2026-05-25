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
  onRouteChange(callback) {
    listeners.push(callback);
  },
  _notify() {
    const { tab, query } = parseHash();
    listeners.forEach(cb => cb(tab, query));
  },
  init() {
    window.addEventListener('hashchange', () => this._notify());
    this._notify();
  }
};

// Initialize router on load
Router.init();
