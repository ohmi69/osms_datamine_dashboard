// TabManager.js
// Encapsulates tab state and rendering for the OSMS Data Explorer frontend.
// Pure JS, no transpilation required.

export class TabManager {
  constructor({
    tabs, // Array of tab configs: [{ id, label, icon, render, ... }]
    panelContainer, // DOM element for tab panels
    navContainer,   // DOM element for tab navigation
    initialTab = null,
    onTabSwitch = null, // Optional callback(tabId)
  }) {
    this.tabs = tabs;
    this.panelContainer = panelContainer;
    this.navContainer = navContainer;
    this.onTabSwitch = onTabSwitch;
    this.activeTab = initialTab || tabs[0].id;
    this.panelCache = {};
    this.navigators = {};
    this._initNav();
    this.switchTab(this.activeTab, false);
  }

  _initNav() {
    this.navContainer.innerHTML = '';
    this.tabs.forEach(tab => {
      const btn = document.createElement('button');
      btn.className = `tab-btn${tab.id === this.activeTab ? ' active' : ''}`;
      btn.dataset.tab = tab.id;
      btn.innerHTML = `${tab.icon}<span>${tab.label}</span>`;
      btn.addEventListener('click', () => this.switchTab(tab.id));
      this.navContainer.appendChild(btn);
    });
  }

  switchTab(tabId, pushState = true, query = null) {
    this.activeTab = tabId;
    if (pushState) {
      history.pushState(null, '', `#${tabId}`);
    } else {
      history.replaceState(null, '', `#${tabId}`);
    }
    [...this.navContainer.querySelectorAll('.tab-btn')].forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    [...this.panelContainer.children].forEach(panel => {
      panel.style.display = 'none';
    });
    if (!this.panelCache[tabId]) {
      const tab = this.tabs.find(t => t.id === tabId);
      const panel = document.createElement('div');
      panel.className = 'tab-panel';
      // tab.render should be a function returning a DOM node
      panel.appendChild(tab.render({ switchTab: this.switchTab.bind(this), setNavigate: fn => this.navigators[tabId] = fn, navigators: this.navigators, query }));
      this.panelContainer.appendChild(panel);
      this.panelCache[tabId] = panel;
    }
    this.panelCache[tabId].style.display = 'block';
    window.scrollTo(0, 0);
    if (query && this.navigators[tabId]) {
      this.navigators[tabId](query);
    }
    if (this.onTabSwitch) this.onTabSwitch(tabId);
  }
}
