import { el, fmt, makeCollapsible, makeThumbnail, makeEquipStatLine, makeEquipReqLine, makeDeepLinkButton, parseIdFilter, makeMatcher, makePillGroup, wireSearch, makeDetailPanel, makeCopyableId, padItemId, scrollToDetailRow, autoExpandById, showFilterBanner, hideFilterBanner, enableMobileFilterDrawer } from '../lib/utils.js';
import { Router } from '../lib/Router.js';

function matchesClass(item, classFilter) {
  if (classFilter === 0 || !item.stats) return true;
  const requiredJob = item.stats.reqJob || 0;
  if (requiredJob === 0) return true;
  return (requiredJob & classFilter) !== 0;
}

function renderEquipRow(item) {
  const row = el('div', { className: 'item-row' });
  const topLine = el('div', { className: 'top-line' });
  const nameWrap = el('span', { className: 'item-name-wrap' });
  nameWrap.appendChild(
    makeThumbnail(`images/items/${padItemId(item.id)}.png`, `${item.name} thumbnail`, {
      className: 'item-thumb',
      fallbackText: 'ITEM',
    })
  );
  nameWrap.appendChild(el('span', { className: 'name', textContent: item.name }));
  if (item.weapon_type) {
    nameWrap.appendChild(el('span', { className: 'equip-type-badge', textContent: item.weapon_type }));
  }
  topLine.appendChild(nameWrap);
  const eqRightWrap = el('span', { className: 'item-id-wrap' });
  eqRightWrap.appendChild(makeDeepLinkButton('equipment', padItemId(item.id)));
  eqRightWrap.appendChild(makeCopyableId(`#${padItemId(item.id)}`));
  topLine.appendChild(eqRightWrap);
  row.appendChild(topLine);
  row.addEventListener('click', (e) => {
    if (e.target.closest('button, input')) return;
    history.replaceState(null, '', `#equipment?q=${encodeURIComponent('id:' + padItemId(item.id))}`);
    document.querySelectorAll('.row-hotlink').forEach(r => r.classList.remove('row-hotlink'));
    row.classList.add('row-hotlink');
    scrollToDetailRow(row, row);
  });

  if (item.description) {
    row.appendChild(
      el('p', { className: 'desc', textContent: item.description.replace(/\n/g, '\n') })
    );
  }

  // Show sell price in a detail panel (exactly like items tab)
  if (typeof item.price === 'number' && item.price > 0) {
    row.appendChild(makeDetailPanel([{ label: 'Sell Price', value: fmt(item.price) + ' mesos' }], { noBorder: true }));
  }

  if (item.stats) {
    const statLine = makeEquipStatLine(item);
    if (statLine) row.appendChild(statLine);
    const reqLine = makeEquipReqLine(item);
    if (reqLine) row.appendChild(reqLine);
  }

  return row;
}

export function renderEquipment(data, options = {}) {
  const { items } = data;
  let searchQuery = '';
  let autoExpandAfterId = null;
  let classFilter = 0;
  let genderFilter = null; // null = All genders
  let selectedSubCategory = null; // null = All
  let selectedWeaponType = null;  // null = All weapon types
  const equipTextCache = new Map();
  const container = el('div');
  const equipmentMeta = items.equipment_meta || {};

  // Search and filters stay pinned at the top while the list scrolls past.
  const toolbar = el('div', { className: 'sticky-toolbar' });
  container.appendChild(toolbar);

  // Capture the search-box navigator so the tab-level navigator below can
  // handle both `q` string routes (deep links) and full filter params.
  const outerSetNavigate = options.setNavigate;
  let searchNavigate = null;
  const searchBox = wireSearch(toolbar, 'Search by name or description...', { ...options, setNavigate: (fn) => { searchNavigate = fn; } }, (query) => {
    searchQuery = query;
    renderData();
  }, (id) => {
    autoExpandAfterId = id;
    renderData();
  });
  const classOptions = [
    { label: 'All Classes', value: 0 },
    ...((equipmentMeta.job_filters || []).map((opt) => ({ label: opt.label, value: opt.value }))),
  ];
  const classPillGroup = makePillGroup(classOptions, classFilter, (value) => {
    classFilter = value;
    classPillGroup.setActive(value);
    hideFilterBanner();
    buildWeaponTypePills();
    pushFilterUrl();
    renderData();
  }, { groupLabel: 'Class:' });
  toolbar.appendChild(classPillGroup);
  toolbar.appendChild(el('hr', { style: { border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0 10px 0' } }));

  const genderOptions = [
    { label: 'All Genders', value: null },
    { label: 'Male', value: 'male' },
    { label: 'Female', value: 'female' },
  ];
  const genderPillGroup = makePillGroup(genderOptions, genderFilter, (value) => {
    genderFilter = value;
    genderPillGroup.setActive(value);
    hideFilterBanner();
    pushFilterUrl();
    renderData();
  }, { groupLabel: 'Gender:' });
  toolbar.appendChild(genderPillGroup);
  toolbar.appendChild(el('hr', { style: { border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0 10px 0' } }));

  function currentFilterParams() {
    return {
      ...(classFilter !== 0 && { class: String(classFilter) }),
      ...(genderFilter && { gender: genderFilter }),
      ...(selectedSubCategory && { type: selectedSubCategory }),
      ...(selectedWeaponType && { wtype: selectedWeaponType }),
    };
  }

  // Discrete pill navigation gets its own history entry so Back walks back
  // up one level at a time instead of jumping to the previous tab.
  function pushFilterUrl() {
    Router.pushFilter('equipment', currentFilterParams());
  }

  // Subcategory pills using makePillGroup
  let subCategoryOptions = [];
  let subCategoryPillGroup = null;
  let weaponTypeOptions = [];
  let weaponTypePillGroup = null;
  function buildSubCategoryPills() {
    const allEquips = items.items.filter((item) => item.category === 'Equipment');
    const armorOrder = Array.isArray(equipmentMeta.armor_order) ? equipmentMeta.armor_order : [];
    const subCats = [...new Set(allEquips.map((item) => item.sub_category).filter(Boolean))];
    subCats.sort((a, b) => {
      if (a === 'Weapon') return -1;
      if (b === 'Weapon') return 1;
      const ai = armorOrder.indexOf(a);
      const bi = armorOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    subCategoryOptions = [
      { label: 'All', value: null },
      ...subCats.map(sub => ({ label: sub, value: sub })),
    ];
    function handleSubCategoryPillChange(value) {
      selectedSubCategory = value;
      selectedWeaponType = null;
      hideFilterBanner();
      buildSubCategoryPills();
      buildWeaponTypePills();
      pushFilterUrl();
      renderData();
    }
    const newPillGroup = makePillGroup(subCategoryOptions, selectedSubCategory, handleSubCategoryPillChange, { groupLabel: 'Type:' });
    if (subCategoryPillGroup) {
      toolbar.replaceChild(newPillGroup, subCategoryPillGroup);
    } else {
      toolbar.appendChild(newPillGroup);
    }
    subCategoryPillGroup = newPillGroup;
  }
  function buildWeaponTypePills() {
    const allWeapons = items.items.filter((item) => item.category === 'Equipment' && item.sub_category === 'Weapon');
    let typeOrder = Array.isArray(equipmentMeta.weapon_type_order) ? equipmentMeta.weapon_type_order : [];
    let primaryTypes = new Set();
    if (classFilter !== 0 && equipmentMeta.weapon_types_by_class?.[String(classFilter)]) {
      const primary = equipmentMeta.weapon_types_by_class[String(classFilter)];
      primaryTypes = new Set(primary);
      const rest = typeOrder.filter((t) => !primary.includes(t));
      typeOrder = [...primary, ...rest];
    }
    const types = [...new Set(allWeapons.map((w) => w.weapon_type).filter(Boolean))].sort((a, b) => {
      const ai = typeOrder.indexOf(a);
      const bi = typeOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    weaponTypeOptions = [
      { label: 'All', value: null },
      ...types.map(type => ({ label: type, value: type, className: `pill--sub${primaryTypes.has(type) ? ' pill--primary' : ''}` })),
    ];
    function handleWeaponTypePillChange(value) {
      selectedWeaponType = value;
      buildWeaponTypePills();
      pushFilterUrl();
      renderData();
    }
    if (selectedSubCategory !== 'Weapon' || types.length === 0) {
      if (weaponTypePillGroup) {
        toolbar.removeChild(weaponTypePillGroup);
        weaponTypePillGroup = null;
      }
      selectedWeaponType = null;
      return;
    }
    const newPillGroup = makePillGroup(weaponTypeOptions, selectedWeaponType, handleWeaponTypePillChange, { groupLabel: 'Weapon Type:' });
    if (weaponTypePillGroup) {
      toolbar.replaceChild(newPillGroup, weaponTypePillGroup);
    } else {
      toolbar.appendChild(newPillGroup);
    }
    weaponTypePillGroup = newPillGroup;
  }
  buildSubCategoryPills();
  buildWeaponTypePills();
  enableMobileFilterDrawer(toolbar, { keep: [searchBox] });

  const dataDiv = el('div');
  container.appendChild(dataDiv);

  function renderData() {
    dataDiv.innerHTML = '';

    let equips = items.items.filter((item) => item.category === 'Equipment');

    const exactId = parseIdFilter(searchQuery);
    const matcher = makeMatcher(searchQuery);
    if (exactId != null) {
      equips = equips.filter((equip) => Number(equip.id) === exactId);
    } else if (searchQuery.trim()) {
      // Guarded on the raw query so an empty search never pays to build the row-text cache.
      // Cached text is lowercased, which is harmless: makeMatcher always forces the "i" flag.
      equips = equips.filter((equip) => {
        if (!equipTextCache.has(equip.id)) {
          const row = renderEquipRow(equip);
          // Drop the hidden thumbnail placeholder ("ITEM"), which is always in the DOM and
          // would otherwise sit in front of the name and swallow a leading "^" anchor.
          row.querySelectorAll('.thumb-fallback').forEach((n) => n.remove());
          equipTextCache.set(equip.id, row.textContent.toLowerCase());
        }
        return matcher.test(equipTextCache.get(equip.id));
      });
    }

    if (classFilter !== 0) {
      equips = equips.filter((equip) => matchesClass(equip, classFilter));
    }

    if (genderFilter !== null) {
      equips = equips.filter((equip) => !equip.gender || equip.gender === genderFilter);
    }

    if (selectedSubCategory) {
      equips = equips.filter((equip) => equip.sub_category === selectedSubCategory);
    }

    if (selectedWeaponType) {
      equips = equips.filter((equip) => equip.weapon_type === selectedWeaponType);
    }

    equips = equips.sort((a, b) => (a.stats?.reqLevel || 0) - (b.stats?.reqLevel || 0));

    if (equips.length === 0) {
      dataDiv.appendChild(
        el('p', { className: 'empty-state', textContent: 'No equipment matches your filters.' })
      );
      return;
    }

    if (!selectedSubCategory) {
      // "All" selected: group into collapsibles by sub_category
      const armorOrder = Array.isArray(equipmentMeta.armor_order) ? equipmentMeta.armor_order : [];
      const grouped = {};
      equips.forEach((item) => {
        const sub = item.sub_category || 'Other';
        (grouped[sub] = grouped[sub] || []).push(item);
      });

      Object.keys(grouped)
        .sort((a, b) => {
          if (a === 'Weapon') return -1;
          if (b === 'Weapon') return 1;
          const ai = armorOrder.indexOf(a);
          const bi = armorOrder.indexOf(b);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        })
        .forEach((sub) => {
          const content = el('div');
          grouped[sub].forEach((item) => content.appendChild(renderEquipRow(item)));
          dataDiv.appendChild(makeCollapsible(sub, grouped[sub].length, true, null, content));
        });
    } else {
      // Specific sub_category selected: wrap in a collapsible like cashshop
      const content = el('div');
      equips.forEach((item) => content.appendChild(renderEquipRow(item)));
      dataDiv.appendChild(makeCollapsible(selectedSubCategory, equips.length, true, null, content));
    }

    if (autoExpandAfterId != null) {
      autoExpandById(dataDiv, autoExpandAfterId, '.item-row');
      autoExpandAfterId = null;
    }
  }

  buildSubCategoryPills();
  buildWeaponTypePills();

  // Shared by the initial deep link and by back/forward traversal. Applies
  // URL params to UI state without touching history (the URL is already
  // correct when this runs).
  function applyParams(params, { showBanner = false } = {}) {
    if (!params) return;
    const get = typeof params.get === 'function'
      ? (k) => params.get(k)
      : (k) => params[k];
    const has = typeof params.has === 'function'
      ? (k) => params.has(k)
      : (k) => get(k) != null && get(k) !== '';
    classFilter = 0;
    genderFilter = null;
    selectedSubCategory = null;
    selectedWeaponType = null;
    const hasAny = has('class') || has('gender') || has('type') || has('wtype');
    if (hasAny) {
      if (has('class')) { classFilter = Number(get('class')); }
      if (has('gender')) { genderFilter = get('gender'); }
      if (has('type')) {
        selectedSubCategory = get('type');
        if (has('wtype')) { selectedWeaponType = get('wtype'); }
      }
    }
    classPillGroup.setActive(classFilter);
    genderPillGroup.setActive(genderFilter);
    buildSubCategoryPills();
    buildWeaponTypePills();
    if (showBanner && hasAny) {
      const labelParts = [];
      if (has('class')) {
        const classLabel = classOptions.find(o => o.value === Number(get('class')))?.label;
        if (classLabel && classLabel !== 'All Classes') labelParts.push(classLabel);
      }
      if (has('gender')) labelParts.push(get('gender') === 'male' ? 'Male' : 'Female');
      if (has('type')) labelParts.push(has('wtype') ? `${get('type')} → ${get('wtype')}` : get('type'));
      if (labelParts.length > 0) {
        showFilterBanner(labelParts.join(' · '), () => {
          classFilter = 0;
          genderFilter = null;
          selectedSubCategory = null;
          selectedWeaponType = null;
          classPillGroup.setActive(0);
          genderPillGroup.setActive(null);
          buildSubCategoryPills();
          buildWeaponTypePills();
          pushFilterUrl();
          renderData();
        });
      }
    }
    const q = get('q') || '';
    const exactId = parseIdFilter(q);
    autoExpandAfterId = exactId != null ? exactId : null;
    searchQuery = q;
    if (searchBox) {
      searchBox._input.value = q;
      searchBox._sync();
    }
    renderData();
    window.scrollTo(0, 0);
  }

  if (outerSetNavigate) {
    outerSetNavigate((route) => {
      if (typeof route === 'string') searchNavigate?.(route);
      else applyParams(route);
    });
  }

  // Apply initial filter from deep link
  if (options.initialParams) {
    applyParams(options.initialParams, { showBanner: true });
  } else {
    renderData();
  }
  return container;
}
