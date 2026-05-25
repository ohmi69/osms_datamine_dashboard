// Show a temporary tip modal (centered, above all modals) -- only once per page load
let zoomTipShownThisSession = false;
function showZoomTipModal() {
  if (zoomTipShownThisSession || document.getElementById('zoomTipModal')) return;
  zoomTipShownThisSession = true;
  const tip = document.createElement('div');
  tip.id = 'zoomTipModal';
  tip.className = 'zoom-tip-modal';
  tip.textContent = 'Scroll/pinch to zoom';
  document.body.appendChild(tip);
  setTimeout(() => {
    tip.classList.add('zoom-tip-modal--fadeout');
    setTimeout(() => tip.remove(), 600);
  }, 1800);
}
import { TABS, ICONS } from './lib/config.js';
import { el, $, $$, hideFilterBanner } from './lib/utils.js';
import state, { loadData, getDataBase } from './lib/data.js';
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
import { renderNavigatorGame } from './tabs/navigator-game.js';


// Apply theme immediately
ThemeManager.applyTheme();


let appData = null;
let tabManager = null;


// Use Router for deep link parsing

// Tab renderers as a config array for TabManager
function getTabConfigs(appData, isTimeTravelMode = false, initialRoute = null, initialParams = null) {
  const usedDeeplinks = new Set();
  function onceParams(tabId) {
    if (initialRoute !== tabId || usedDeeplinks.has(tabId)) return null;
    usedDeeplinks.add(tabId);
    return initialParams;
  }

  const tabs = [
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
      render: ({ setNavigate }) => renderSkills(appData, {
        setNavigate,
        initialParams: onceParams('skills'),
      })
    },
    ...(appData.recipes?.disciplines?.length > 0 ? [{
      id: 'crafting',
      label: 'Crafting',
      icon: ICONS.hammer,
      render: ({ setNavigate, navigators }) => renderCrafting(appData, {
        setNavigate,
        initialParams: onceParams('crafting'),
        onItemClick: (item, id) => {
          const isEquip = item?.category === 'Equipment';
          const tab = isEquip ? 'equipment' : 'items';
          tabManager.switchTab(tab);
          if (navigators[tab]) navigators[tab](id != null ? `id:${id}` : (item?.name || ''));
        },
      })
    }] : []),
    {
      id: 'items',
      label: 'Items',
      icon: ICONS.scrollText,
      render: ({ setNavigate }) => renderItems(appData, {
        setNavigate,
        initialParams: onceParams('items'),
      })
    },
    {
      id: 'equipment',
      label: 'Equipment',
      icon: ICONS.swords,
      render: ({ setNavigate }) => renderEquipment(appData, {
        setNavigate,
        initialParams: onceParams('equipment'),
      })
    },
    {
      id: 'cashshop',
      label: 'Cash Shop',
      icon: ICONS.shoppingBag,
      render: ({ setNavigate }) => renderCashShop(appData, {
        setNavigate,
        initialParams: onceParams('cashshop'),
      })
    },
    {
      id: 'quests',
      label: 'Quests',
      icon: ICONS.bookOpen,
      render: ({ setNavigate }) => renderQuests(appData, {
        setNavigate,
        initialParams: onceParams('quests'),
      })
    },
    {
      id: 'formulas',
      label: 'Formulas',
      icon: ICONS.flaskConical,
      render: () => renderFormulas()
    },
    {
      id: 'portal-runner',
      label: '🗺️ Portal Runner',
      icon: ICONS.map,
      hidden: true,
      render: ({ setNavigate }) => renderNavigatorGame(appData, { setNavigate })
    },
    // Uncomment if beauty tab is enabled
    // {
    //   id: 'beauty',
    //   label: 'Beauty',
    //   icon: ICONS.sparkles,
    //   render: () => renderBeautyStyles(appData)
    // },
  ];
  return isTimeTravelMode ? tabs.filter(t => t.id !== 'formulas') : tabs;
}


// No global switchTab; use tabManager.switchTab



// Listen for route changes using Router
Router.onRouteChange((tab, query) => {
  if (!tabManager) return;
  let tabId = tab === 'cash_shop' ? 'cashshop' : tab;
  if (!tabId || !tabManager.tabs.some(t => t.id === tabId)) return;
  // Skip if staying on the same tab with only a filter change (no navigation query)
  if (tabId === tabManager.activeTab && !query) return;
  tabManager.switchTab(tabId, false, query);
});

async function showMapleTip() {
  try {
    const tips = await fetch('./data/current/tips.json').then(r => r.json());
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

async function buildPatchSelector() {
  try {
    const res = await fetch('./data/patches/index.json');
    if (!res.ok) return null;
    const index = await res.json();
    if (!Array.isArray(index.patches) || !index.patches.length) return null;

    const params = new URLSearchParams(window.location.search);
    const currentPatch = params.get('patch') || '';

    const wrapper = el('div', { className: 'patch-selector-wrap' });
    const label = el('label', { className: 'patch-selector-label', textContent: 'Patch:' });
    const select = el('select', { className: 'patch-selector' });

    const OLD_PATCHES = new Set(['v22', 'v43', 'v49']);

    const sortedPatches = [...index.patches].sort((a, b) => new Date(b.date) - new Date(a.date));
    const classicPatches = sortedPatches.filter(p => !OLD_PATCHES.has(p.version));
    const oldPatches = sortedPatches.filter(p => OLD_PATCHES.has(p.version));

    const classicGroup = el('optgroup', { label: 'Classic World' });
    const currentOpt = el('option', { value: '', textContent: 'Closed Online Test' });
    if (!currentPatch) currentOpt.selected = true;
    classicGroup.appendChild(currentOpt);
    for (const p of classicPatches) {
      const opt = el('option', { value: p.version, textContent: p.label || `v${p.version}` });
      if (currentPatch === p.version) opt.selected = true;
      classicGroup.appendChild(opt);
    }
    select.appendChild(classicGroup);

    const oldGroup = el('optgroup', { label: 'Old School' });
    for (const p of oldPatches) {
      const opt = el('option', { value: p.version, textContent: p.label || `v${p.version}` });
      if (currentPatch === p.version) opt.selected = true;
      oldGroup.appendChild(opt);
    }
    select.appendChild(oldGroup);

    select.addEventListener('change', () => {
      const v = select.value;
      const hash = window.location.hash;
      if (v) {
        sessionStorage.setItem('tt_intentional', '1');
        window.location.href = `${window.location.pathname}?patch=${encodeURIComponent(v)}${hash}`;
      } else {
        sessionStorage.setItem('tt_returning', '1');
        window.location.href = window.location.pathname + hash;
      }
    });

    wrapper.appendChild(label);
    wrapper.appendChild(select);
    return wrapper;
  } catch {
    return null;
  }
}

async function init() {
  const isTimeTravelMode = getDataBase() !== './data/current';

  if (isTimeTravelMode) {
    document.body.classList.add('time-travel');
    const params = new URLSearchParams(window.location.search);
    const patchVersion = params.get('patch') || 'unknown';

    if (sessionStorage.getItem('tt_intentional')) {
      sessionStorage.removeItem('tt_intentional');
      const overlay = el('div', { className: 'tt-overlay' });
      const monster = el('img', { className: 'tt-monster', src: './data/images/monsters/dfa7cc8dc3a3d612d44510bcf0b30401.webp', alt: '' });
      const ttText = el('div', { className: 'tt-text', textContent: `Timetravelling back to ${patchVersion}` });
      overlay.appendChild(monster);
      overlay.appendChild(ttText);
      document.body.appendChild(overlay);
      setTimeout(() => {
        overlay.classList.add('tt-out');
        overlay.addEventListener('animationend', () => overlay.remove(), { once: true });
      }, 1000);
    }

    const strip = el('div', { className: 'time-travel-strip' });
    const backHref = window.location.pathname + window.location.hash;
    strip.innerHTML = `
      <span class="time-travel-strip__label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Currently time travelling in <strong>${patchVersion}</strong>
      </span>
      <a class="time-travel-strip__back" href="${backHref}">← Back to current</a>
    `;
    document.querySelector('.site-header').appendChild(strip);
    strip.querySelector('.time-travel-strip__back').addEventListener('click', () => {
      sessionStorage.setItem('tt_returning', '1');
    });
  }

  if (!isTimeTravelMode && sessionStorage.getItem('tt_returning')) {
    sessionStorage.removeItem('tt_returning');
    const overlay = el('div', { className: 'tt-overlay' });
    const monster = el('img', { className: 'tt-monster tt-monster--flipped', src: './data/images/monsters/dfa7cc8dc3a3d612d44510bcf0b30401.webp', alt: '' });
    const ttText = el('div', { className: 'tt-text', textContent: 'Time travelling back to the present' });
    overlay.appendChild(monster);
    overlay.appendChild(ttText);
    document.body.appendChild(overlay);
    setTimeout(() => {
      overlay.classList.add('tt-out');
      overlay.addEventListener('animationend', () => overlay.remove(), { once: true });
    }, 1000);
  }

  // Inject patch selector into header (doesn't need appData)
  buildPatchSelector().then((selector) => {
    if (!selector) return;
    const extras = document.querySelector('.site-header-extras');
    if (extras) extras.prepend(selector);
  });

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
          '<h3>Failed to load</h3><p>Contact @ohmi if the issue persists.</p>',
      })
    );
    return;
  }

  if (isTimeTravelMode) {
    try {
      const pv = new URLSearchParams(window.location.search).get('patch');
      const res = await fetch('./data/patches/index.json');
      if (res.ok) {
        const index = await res.json();
        const found = index.patches?.find(p => p.version === pv);
        if (found) appData.patchMeta = found;
      }
    } catch {}
  }

  panels.innerHTML = '';
  const nav = $('#tabNav');
  nav.innerHTML = '';



  // Determine initial tab from Router
  const route = Router.getCurrentRoute();
  const query = Router.getCurrentQuery();
  const initialParams = Router.getParams();
  const tabConfigs = getTabConfigs(appData, isTimeTravelMode, route, initialParams);
  const validTab = route && tabConfigs.some(t => t.id === route) ? route : 'overview';

  tabManager = new TabManager({
    tabs: tabConfigs,
    panelContainer: panels,
    navContainer: nav,
    initialTab: validTab,
    onTabSwitch: (() => {
      let prev = null;
      return (id) => {
        if (prev !== null && prev !== id) {
          hideFilterBanner();
          if (tabManager?.panelCache[prev]) {
            tabManager.panelCache[prev].remove();
            delete tabManager.panelCache[prev];
          }
        }
        prev = id;
      };
    })(),
  });
  // Expose global switchTab for header banner
  window.switchTab = function(tabId, push, query) {
    if (tabManager) tabManager.switchTab(tabId, push, query);
  };
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

  const scrollTopBtn = el('button', {
    className: 'scroll-top-btn',
    title: 'Back to top',
    innerHTML: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg> Back to top`
  });
  scrollTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  let footerVisible = false;
  const footer = document.querySelector('.footer');
  if (footer) {
    new IntersectionObserver(([e]) => {
      footerVisible = e.isIntersecting;
      scrollTopBtn.classList.toggle('visible', window.scrollY > 300 && !footerVisible);
    }).observe(footer);
  }
  window.addEventListener('scroll', () => {
    scrollTopBtn.classList.toggle('visible', window.scrollY > 300 && !footerVisible);
  }, { passive: true });
  document.body.appendChild(scrollTopBtn);

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

// Hide site-header on scroll down, show on scroll up
(function () {
  const header = document.querySelector('.site-header');
  if (!header) return;
  let lastY = window.scrollY;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y <= 0 || y < lastY) {
      header.classList.remove('site-header--hidden');
    } else {
      header.classList.add('site-header--hidden');
    }
    lastY = y;
  }, { passive: true });
})();

init();
