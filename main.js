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

// Renderers are thunks so switchTab is captured by closure (defined below)
const renderers = {
  overview:  () => renderOverview(appData, { switchTab }),
  monsters:  () => renderMonsters(appData, {
    setNavigate: (fn) => { navigateMonsters = fn; },
    onMapClick: (mapId) => {
      switchTab('maps');
      if (navigateMaps) navigateMaps({ id: mapId, autoExpand: true });
    },
  }),
  maps:      () => renderMaps(appData, {
    setNavigate: (fn) => { navigateMaps = fn; },
    onMobClick: (mobId) => {
      switchTab('monsters');
      if (navigateMonsters) navigateMonsters({ id: mobId, autoExpand: true });
    },
  }),
  skills:    () => renderSkills(appData),
  crafting:  () => renderCrafting(appData),
  items:     () => renderItems(appData),
  equipment: () => renderEquipment(appData),
  cashshop:  () => renderCashShop(appData),
  quests:    () => renderQuests(appData),
  formulas:  () => renderFormulas(),
};

function switchTab(tabId, pushState = true) {
  activeTab = tabId;
  if (pushState) {
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
}

window.addEventListener('hashchange', () => {
  let tab = location.hash.slice(1);
  if (tab === 'cash_shop') tab = 'cashshop';
  if (tab && renderers[tab]) switchTab(tab, false);
});

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

  let hashTab = location.hash.slice(1);
  if (hashTab === 'cash_shop') hashTab = 'cashshop';
  switchTab(hashTab && renderers[hashTab] ? hashTab : 'overview');
}

init();
