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

let appData = null;
let activeTab = 'overview';
const panelCache = {};

// Renderers are thunks so switchTab is captured by closure (defined below)
const renderers = {
  overview:  () => renderOverview(appData, { switchTab }),
  monsters:  () => renderMonsters(appData),
  maps:      () => renderMaps(appData),
  skills:    () => renderSkills(appData),
  crafting:  () => renderCrafting(appData),
  items:     () => renderItems(appData),
  equipment: () => renderEquipment(appData),
  cashshop:  () => renderCashShop(appData),
  quests:    () => renderQuests(appData),
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

  const idToggle = el('button', {
    className: `id-toggle${showIds ? ' active' : ''}`,
    title: 'Show/hide IDs',
    textContent: 'IDs',
  });
  idToggle.addEventListener('click', () => {
    showIds = !showIds;
    document.body.classList.toggle('hide-ids', !showIds);
    idToggle.classList.toggle('active', showIds);
    saveState('showIds', showIds);
  });
  nav.appendChild(idToggle);

  let hashTab = location.hash.slice(1);
  if (hashTab === 'cash_shop') hashTab = 'cashshop';
  switchTab(hashTab && renderers[hashTab] ? hashTab : 'overview');
}

init();
