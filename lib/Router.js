// Router.js
// Handles deep link parsing and navigation

const listeners = [];


// Parse hash for tab and query (e.g., #tab?q=search)
function parseHash() {
  const hash = window.location.hash.replace(/^#/, '');
  const [tab, queryString] = hash.split('?q=');
  return {
    tab: tab || 'overview',
    query: queryString ? decodeURIComponent(queryString) : null
  };
}

export const Router = {
  navigateTo(tabId, query = null) {
    window.location.hash = query ? `#${tabId}?q=${encodeURIComponent(query)}` : `#${tabId}`;
  },
  getCurrentRoute() {
    const { tab } = parseHash();
    return tab;
  },
  getCurrentQuery() {
    const { query } = parseHash();
    return query;
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
