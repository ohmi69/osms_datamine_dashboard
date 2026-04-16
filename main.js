// Show a temporary tip modal (centered, above all modals) -- only once per page load
let zoomTipShownThisSession = false;
function showZoomTipModal() {
  if (zoomTipShownThisSession || document.getElementById('zoomTipModal')) return;
  zoomTipShownThisSession = true;
  const tip = document.createElement('div');
  tip.id = 'zoomTipModal';
  tip.style.position = 'fixed';
  tip.style.left = '50%';
  tip.style.top = '50%';
  tip.style.transform = 'translate(-50%, -50%)';
  tip.style.background = 'rgba(30,30,40,0.98)';
  tip.style.color = '#fff';
  tip.style.padding = '28px 38px';
  tip.style.borderRadius = '12px';
  tip.style.fontSize = '1.25rem';
  tip.style.fontWeight = 'bold';
  tip.style.boxShadow = '0 8px 32px rgba(0,0,0,0.45)';
  tip.style.zIndex = '20001';
  tip.style.textAlign = 'center';
  tip.textContent = 'Scroll/pinch to zoom';
  document.body.appendChild(tip);
  setTimeout(() => {
    tip.style.transition = 'opacity 0.5s';
    tip.style.opacity = '0';
    setTimeout(() => tip.remove(), 600);
  }, 1800);
}
import { TABS, ICONS } from './lib/config.js';
import { el, $, $$ } from './lib/utils.js';
import state, { loadData } from './lib/data.js';
import { TabManager } from './lib/TabManager.js';
import { ThemeManager } from './lib/ThemeManager.js';
import { Router } from './lib/Router.js';
import { createToggleButton } from './lib/ButtonFactory.js';
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


// Apply theme immediately
ThemeManager.applyTheme();


let appData = null;
let tabManager = null;


// Use Router for deep link parsing

// Tab renderers as a config array for TabManager
function getTabConfigs(appData) {
  return [
    {
      id: 'overview',
      label: 'Overview',
      icon: ICONS.chartColumn,
      render: () => renderOverview(appData, { switchTab: (id, push, query) => tabManager.switchTab(id, push, query) })
    },
    {
      id: 'monsters',
      label: 'Monsters',
      icon: ICONS.skull,
      render: ({ setNavigate, navigators }) => renderMonsters(appData, {
        setNavigate,
        onMapClick: (mapId) => {
          tabManager.switchTab('maps');
          if (navigators.maps) navigators.maps({ id: mapId, autoExpand: true });
        },
      })
    },
    {
      id: 'maps',
      label: 'Maps',
      icon: ICONS.map,
      render: ({ setNavigate, navigators }) => renderMaps(appData, {
        setNavigate,
        onMobClick: (mobId) => {
          tabManager.switchTab('monsters');
          if (navigators.monsters) navigators.monsters({ id: mobId, autoExpand: true });
        },
      })
    },
    {
      id: 'skills',
      label: 'Skills',
      icon: ICONS.swords,
      render: ({ setNavigate }) => renderSkills(appData, { setNavigate })
    },
    {
      id: 'crafting',
      label: 'Crafting',
      icon: ICONS.hammer,
      render: ({ setNavigate, navigators }) => renderCrafting(appData, {
        setNavigate,
        onItemClick: (item, id) => {
          const isEquip = item?.category === 'Equipment';
          const tab = isEquip ? 'equipment' : 'items';
          tabManager.switchTab(tab);
          if (navigators[tab]) navigators[tab](id != null ? `id:${id}` : (item?.name || ''));
        },
      })
    },
    {
      id: 'items',
      label: 'Items',
      icon: ICONS.scrollText,
      render: ({ setNavigate }) => renderItems(appData, { setNavigate })
    },
    {
      id: 'equipment',
      label: 'Equipment',
      icon: ICONS.swords,
      render: ({ setNavigate }) => renderEquipment(appData, { setNavigate })
    },
    {
      id: 'cashshop',
      label: 'Cash Shop',
      icon: ICONS.shoppingBag,
      render: ({ setNavigate }) => renderCashShop(appData, { setNavigate })
    },
    {
      id: 'quests',
      label: 'Quests',
      icon: ICONS.bookOpen,
      render: ({ setNavigate }) => renderQuests(appData, { setNavigate })
    },
    {
      id: 'formulas',
      label: 'Formulas',
      icon: ICONS.flaskConical,
      render: () => renderFormulas()
    },
    // Uncomment if beauty tab is enabled
    // {
    //   id: 'beauty',
    //   label: 'Beauty',
    //   icon: ICONS.sparkles,
    //   render: () => renderBeautyStyles(appData)
    // },
  ];
}


// No global switchTab; use tabManager.switchTab



// Listen for route changes using Router
Router.onRouteChange((tab, query) => {
  if (!tabManager) return;
  let tabId = tab === 'cash_shop' ? 'cashshop' : tab;
  if (tabId && tabManager.tabs.some(t => t.id === tabId)) tabManager.switchTab(tabId, false, query);
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



  // Determine initial tab from Router

  const route = Router.getCurrentRoute();
  const query = Router.getCurrentQuery();
  const validTab = route && getTabConfigs(appData).some(t => t.id === route) ? route : 'overview';

  tabManager = new TabManager({
    tabs: getTabConfigs(appData),
    panelContainer: panels,
    navContainer: nav,
    initialTab: validTab,
  });
  // If there is a query, pass it to the tab
  if (query && tabManager.navigators[validTab]) {
    tabManager.navigators[validTab](query);
  }

  // State is now handled by StateManager (state)


  let showIds = state.get('showIds', false);
  if (!showIds) document.body.classList.add('hide-ids');

  // Use ButtonFactory for toggles
  const idToggle = createToggleButton({
    label: 'Show IDs',
    active: showIds,
    onClick: () => {
      showIds = !showIds;
      document.body.classList.toggle('hide-ids', !showIds);
      idToggle.classList.toggle('active', showIds);
      state.set('showIds', showIds);
    },
    className: 'id-toggle'
  });

  const themeToggle = createToggleButton({
    label: ThemeManager.getTheme() === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode',
    active: ThemeManager.getTheme() === 'dark',
    onClick: () => {
      ThemeManager.toggleTheme();
      themeToggle.classList.toggle('active', ThemeManager.getTheme() === 'dark');
      themeToggle.textContent = ThemeManager.getTheme() === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
    },
    className: 'id-toggle theme-toggle'
  });

  const toggleDock = el('div', { className: 'toggle-dock' });
  toggleDock.appendChild(idToggle);
  toggleDock.appendChild(themeToggle);
  document.body.appendChild(toggleDock);



  showMapleTip();
}

// --- Image Modal Setup ---
function injectImageModal() {
  if (document.getElementById('imageModal')) return;
  const modal = document.createElement('div');
  modal.id = 'imageModal';
  modal.className = 'image-modal';
  modal.innerHTML = `
    <div class="image-modal-overlay"></div>
    <div class="image-modal-content">
      <button class="image-modal-close" title="Close">&times;</button>
      <img src="" alt="Full Image" />
    </div>
  `;
  document.body.appendChild(modal);
  // Close on overlay or button
  modal.querySelector('.image-modal-overlay').addEventListener('click', closeImageModal);
  modal.querySelector('.image-modal-close').addEventListener('click', closeImageModal);
}

function openImageModal(src, alt) {
    // Show tip only on first map image click after page load
    showZoomTipModal();
  injectImageModal();
  const modal = document.getElementById('imageModal');
  const img = modal.querySelector('img');
  img.src = src;
  img.alt = alt || '';
  img.classList.remove('magnify');
  img.style.transform = '';
  img.style.transformOrigin = '';
  let zoomLevels = [1, 2, 4, 8];
  let zoomIdx = 0;
  let lastOrigin = '50% 50%';
  function setZoom(level, origin) {
    img.style.transform = `scale(${level})`;
    img.style.transformOrigin = origin;
    img.style.cursor = level > 1 ? 'zoom-out' : 'zoom-in';
  }
  img.onclick = (e) => {
    closeImageModal();
  };
  // Mouse wheel/pinch zoom
  img.onwheel = (e) => {
    e.preventDefault();
    let delta = e.deltaY < 0 ? 1 : -1;
    zoomIdx = Math.min(Math.max(zoomIdx + delta, 0), zoomLevels.length - 1);
    const level = zoomLevels[zoomIdx];
    // Use mouse position for zoom origin
    const rect = img.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    lastOrigin = `${x}% ${y}%`;
    setZoom(level, lastOrigin);
  };
  // Touch pinch zoom (basic)
  let pinchStartDist = null;
  let pinchStartZoom = null;
  img.ontouchstart = (e) => {
    if (e.touches.length === 2) {
      pinchStartDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartZoom = zoomLevels[zoomIdx];
    }
  };
  img.ontouchmove = (e) => {
    if (e.touches.length === 2 && pinchStartDist) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      let scale = dist / pinchStartDist;
      let newIdx = zoomIdx;
      if (scale > 1.15 && zoomIdx < zoomLevels.length - 1) newIdx++;
      if (scale < 0.85 && zoomIdx > 0) newIdx--;
      if (newIdx !== zoomIdx) {
        zoomIdx = newIdx;
        setZoom(zoomLevels[zoomIdx], lastOrigin);
        pinchStartDist = dist;
      }
    }
  };
  img.ontouchend = (e) => {
    if (e.touches.length < 2) {
      pinchStartDist = null;
      pinchStartZoom = null;
    }
  };
  // Reset zoom on modal close
  modal.querySelector('.image-modal-close').onclick = closeImageModal;
  // Overlay click closes modal
  modal.querySelector('.image-modal-overlay').onclick = closeImageModal;
  // Prevent clicks inside content from bubbling to overlay (not strictly needed, but safe)
  modal.querySelector('.image-modal-content').onclick = (e) => {
    e.stopPropagation();
  };
  // Initial state
  zoomIdx = 0;
  setZoom(zoomLevels[zoomIdx], '50% 50%');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeImageModal() {
  const modal = document.getElementById('imageModal');
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
    // Optionally clear src for privacy
    modal.querySelector('img').src = '';
  }
}

// Expose modal helpers globally for tab modules
window.openImageModal = openImageModal;
window.closeImageModal = closeImageModal;
init();
