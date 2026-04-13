import { TABS } from './lib/config.js';
import { el, $, $$ } from './lib/utils.js';
import { loadData, loadState, saveState } from './lib/data.js';
import { renderOverview }  from './tabs/overview.js';
import { renderMonsters }  from './tabs/monsters.js';
import { renderMaps }      from './tabs/maps.js';
import { renderSkills }    from './tabs/skills.js';
import { renderCrafting }  from './tabs/crafting.js';
import { renderItems }     from './tabs/items.js';
import { renderEquipment } from './tabs/equipment.js';
import { renderCashShop }  from './tabs/cashshop.js';
import { renderBeautyStyles } from './tabs/beauty.js';
import { renderQuests }    from './tabs/quests.js';
import { renderFormulas }  from './tabs/formulas.js';

// Apply theme immediately to avoid flash
(function () {
  try {
    const stored = JSON.parse(localStorage.getItem('mscw-datamine-state') || '{}');
    const theme = stored.theme || 'mapletip';
    if (theme === 'mapletip') document.documentElement.setAttribute('data-theme', 'mapletip');
  } catch {}
})();

let appData = null;
let activeTab = 'overview';
const panelCache = {};

let navigateMonsters = null;
let navigateMaps = null;
const navigators = {};

function parseDeepLink(hash) {
  const [tabPart, qPart] = hash.split('?q=');
  return { tab: tabPart, query: qPart ? decodeURIComponent(qPart) : null };
}

// Renderers are thunks so switchTab is captured by closure (defined below)
const renderers = {
  overview:  () => renderOverview(appData, { switchTab }),
  monsters:  () => renderMonsters(appData, {
    setNavigate: (fn) => { navigateMonsters = fn; navigators.monsters = fn; },
    onMapClick: (mapId) => {
      switchTab('maps');
      if (navigateMaps) navigateMaps({ id: mapId, autoExpand: true });
    },
  }),
  maps:      () => renderMaps(appData, {
    setNavigate: (fn) => { navigateMaps = fn; navigators.maps = fn; },
    onMobClick: (mobId) => {
      switchTab('monsters');
      if (navigateMonsters) navigateMonsters({ id: mobId, autoExpand: true });
    },
  }),
  skills:    () => renderSkills(appData, { setNavigate: (fn) => { navigators.skills = fn; } }),
  crafting:  () => renderCrafting(appData, { setNavigate: (fn) => { navigators.crafting = fn; } }),
  items:     () => renderItems(appData, { setNavigate: (fn) => { navigators.items = fn; } }),
  equipment: () => renderEquipment(appData, { setNavigate: (fn) => { navigators.equipment = fn; } }),
  cashshop:  () => renderCashShop(appData, { setNavigate: (fn) => { navigators.cashshop = fn; } }),
  quests:    () => renderQuests(appData, { setNavigate: (fn) => { navigators.quests = fn; } }),
  formulas:  () => renderFormulas(),
  beauty:    () => renderBeautyStyles(appData),
};

function switchTab(tabId, pushState = true, query = null) {
  activeTab = tabId;
  if (pushState) {
    history.pushState(null, '', `#${tabId}`);
  } else {
    history.replaceState(null, '', `#${tabId}`);
  }
  $$('.tab-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabId);
  });

  const panels = $('#tabPanels');
  [...panels.children].forEach((panel) => {
    panel.style.display = 'none';
  });

  if (!panelCache[tabId]) {
    const panel = el('div', { className: 'tab-panel' });
    panel.appendChild(renderers[tabId]());
    panels.appendChild(panel);
    panelCache[tabId] = panel;
  }

  panelCache[tabId].style.display = 'block';
  window.scrollTo(0, 0);
  if (query && navigators[tabId]) {
    navigators[tabId](query);
  }
}

window.addEventListener('hashchange', () => {
  const { tab, query } = parseDeepLink(location.hash.slice(1));
  let tabId = tab === 'cash_shop' ? 'cashshop' : tab;
  if (tabId && renderers[tabId]) switchTab(tabId, false, query);
});

async function showMapleTip() {
  try {
    const tips = await fetch('./data/tips.json').then(r => r.json());
    if (!Array.isArray(tips) || !tips.length) return;
    const tip = tips[Math.floor(Math.random() * tips.length)];

    const toast = document.createElement('div');
    toast.className = 'mapletip-toast';
    toast.innerHTML = `<span class="mapletip-label">[MapleTip]</span> ${tip}`;
    document.body.appendChild(toast);

    // Trigger fade-in
    requestAnimationFrame(() => toast.classList.add('mapletip-toast--visible'));

    // Auto-fade after 4s
    const hide = () => {
      toast.classList.remove('mapletip-toast--visible');
      toast.removeEventListener('click', onClick);
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    };
    const onClick = () => hide();
    toast.addEventListener('click', onClick);
    setTimeout(hide, 4000);
  } catch {}
}

async function init() {
  const panels = $('#tabPanels');
  panels.innerHTML = '';
  panels.appendChild(
    el('div', { className: 'info-banner', innerHTML: '<p>Loading parsed data...</p>' })
  );

  try {
    appData = await loadData();
  } catch (error) {
    console.error(error);
    panels.innerHTML = '';
    panels.appendChild(
      el('div', {
        className: 'warning-banner',
        innerHTML:
          '<h3>Failed to load parsed data</h3><p>Serve this folder over HTTP and make sure ./data/*.json exists.</p>',
      })
    );
    return;
  }

  panels.innerHTML = '';
  const nav = $('#tabNav');
  nav.innerHTML = '';
  TABS.forEach((tab) => {
    const button = el('button', {
      className: `tab-btn${tab.id === activeTab ? ' active' : ''}`,
      'data-tab': tab.id,
      innerHTML: `${tab.icon}<span>${tab.label}</span>`,
    });
    button.addEventListener('click', () => switchTab(tab.id));
    nav.appendChild(button);
  });

  const _state = loadState();
  let showIds = _state.showIds;
  if (!showIds) document.body.classList.add('hide-ids');

  let theme = _state.theme;
  if (theme === 'mapletip') {
    document.documentElement.setAttribute('data-theme', 'mapletip');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  const idToggle = el('button', {
    className: `id-toggle${showIds ? ' active' : ''}`,
    title: 'Show/hide IDs',
    textContent: 'Show IDs',
  });
  idToggle.addEventListener('click', () => {
    showIds = !showIds;
    document.body.classList.toggle('hide-ids', !showIds);
    idToggle.classList.toggle('active', showIds);
    saveState('showIds', showIds);
  });

  const themeToggle = el('button', {
    className: `id-toggle theme-toggle${theme === 'mapletip' ? '' : ' active'}`,
    title: 'Toggle dark/light theme',
    innerHTML: theme === 'mapletip' ? '🌙 Dark Mode' : '☀️ Light Mode',
  });
  themeToggle.addEventListener('click', () => {
    if (theme === 'dark') {
      theme = 'mapletip';
      document.documentElement.setAttribute('data-theme', 'mapletip');
      themeToggle.innerHTML = '🌙 Dark Mode';
      themeToggle.classList.remove('active');
    } else {
      theme = 'dark';
      document.documentElement.removeAttribute('data-theme');
      themeToggle.innerHTML = '☀️ Light Mode';
      themeToggle.classList.add('active');
    }
    saveState('theme', theme);
  });

  const toggleDock = el('div', { className: 'toggle-dock' });
  toggleDock.appendChild(idToggle);
  toggleDock.appendChild(themeToggle);
  document.body.appendChild(toggleDock);

  const { tab: rawHashTab, query: hashQuery } = parseDeepLink(location.hash.slice(1));
  const hashTab = rawHashTab === 'cash_shop' ? 'cashshop' : rawHashTab;
  switchTab(hashTab && renderers[hashTab] ? hashTab : 'overview', false, hashQuery);

  showMapleTip();
}

init();
