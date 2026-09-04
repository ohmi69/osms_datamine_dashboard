// TabManager.js
// Encapsulates tab state and rendering for the OSMS Data Explorer frontend.
// Pure JS, no transpilation required.

import { tabHref, onLinkActivate } from './utils.js';

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
      if (tab.hidden) return;
      // An <a> rather than a <button>, so a tab can be middle-clicked or
      // ctrl-clicked open in a new browser tab; plain clicks stay in-page.
      const btn = document.createElement('a');
      btn.className = `tab-btn tab-link${tab.id === this.activeTab ? ' active' : ''}`;
      btn.dataset.tab = tab.id;
      btn.href = tabHref(tab.id);
      btn.innerHTML = `${tab.icon}<span>${tab.label}</span>`;
      onLinkActivate(btn, () => {
        // Top-level navigation always means "start at this section's index",
        // even when the section is already active or has a cached detail view.
        this.resetTab(tab.id);
        this.switchTab(tab.id);
      });
      this.navContainer.appendChild(btn);
    });
  }

  _revealActiveTab(tabId) {
    const active = this.navContainer.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (!active) return;
    requestAnimationFrame(() => {
      const left = active.offsetLeft - (this.navContainer.clientWidth - active.offsetWidth) / 2;
      this.navContainer.scrollTo({ left: Math.max(0, left), behavior: 'instant' });
    });
  }

  resetTab(tabId) {
    this.panelCache[tabId]?.remove();
    delete this.panelCache[tabId];
    delete this.navigators[tabId];
  }

  switchTab(tabId, pushState = true, query = null) {
    this.activeTab = tabId;
    if (pushState) {
      history.pushState(null, '', `#${tabId}`);
    } else {
      // A router-driven or initial deep link may already carry meaningful
      // parameters (for example #formulas?page=dealing-damage). Keep them when
      // they belong to the tab being rendered instead of canonicalizing them
      // away before the renderer can consume them.
      const hashTab = window.location.hash.replace(/^#/, '').split('?')[0];
      if (hashTab !== tabId) history.replaceState(null, '', `#${tabId}`);
    }
    [...this.navContainer.querySelectorAll('.tab-btn')].forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    this._revealActiveTab(tabId);
    [...this.panelContainer.children].forEach(panel => {
      panel.classList.add('hidden');
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
    this.panelCache[tabId].classList.remove('hidden');
    window.scrollTo(0, 0);
    if (query && this.navigators[tabId]) {
      this.navigators[tabId](query);
    }
    if (this.onTabSwitch) this.onTabSwitch(tabId);
  }
}
