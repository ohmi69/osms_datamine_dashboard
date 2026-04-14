import { el, fmt, makeSearchBox, makeCollapsible, makeThumbnail, makeEquipStatLine, makeEquipReqLine, makeDeepLinkButton } from '../lib/utils.js';

function parseIdFilter(query) {
  const match = /^id\s*:\s*(\d+)\s*$/i.exec((query || '').trim());
  if (!match) return null;
  return Number(match[1]);
}

function matchesClass(item, classFilter) {
  if (classFilter === 0 || !item.stats) return true;
  const requiredJob = item.stats.reqJob || 0;
  if (requiredJob === 0) return true;
  return (requiredJob & classFilter) !== 0;
}

function renderEquipRow(item) {
  const row = el('div', { className: 'item-row' });
  const topLine = el('div', { className: 'top-line' });
  const nameWrap = el('span', {
    style: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: '0' },
  });
  nameWrap.appendChild(
    makeThumbnail(item.thumbnail, `${item.name} thumbnail`, {
      className: 'item-thumb',
      fallbackText: 'ITEM',
    })
  );
  nameWrap.appendChild(el('span', { className: 'name', textContent: item.name }));
  if (item.weapon_type) {
    nameWrap.appendChild(el('span', { className: 'equip-type-badge', textContent: item.weapon_type }));
  }
  topLine.appendChild(nameWrap);
  const eqRightWrap = el('span', { style: { display: 'flex', alignItems: 'center', gap: '4px', flexShrink: '0' } });
  eqRightWrap.appendChild(makeDeepLinkButton('equipment', item.id));
  eqRightWrap.appendChild(el('span', { className: 'id', textContent: item.id }));
  topLine.appendChild(eqRightWrap);
  row.appendChild(topLine);

  if (item.description) {
    row.appendChild(
      el('p', { className: 'desc', textContent: item.description.replace(/\n/g, '\n') })
    );
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
  let classFilter = 0;
  let selectedSubCategory = null; // null = All
  let selectedWeaponType = null;  // null = All weapon types
  const equipTextCache = new Map();
  const container = el('div');
  const equipmentMeta = items.equipment_meta || {};

  // Search box
  const eqSearchBox = makeSearchBox('Search by name or description...', (value) => {
    searchQuery = value;
    renderData();
  });
  container.appendChild(eqSearchBox);

  if (options.setNavigate) {
    options.setNavigate((query) => {
      searchQuery = query;
      eqSearchBox._input.value = query;
      renderData();
      window.scrollTo(0, 0);
    });
  }

  // Class filter pills
  const classBar = el('div', {
    style: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', margin: '12px 0 8px 0' },
  });
  const classOptions = [
    { label: 'All Classes', value: 0 },
    ...((equipmentMeta.job_filters || []).map((opt) => ({ label: opt.label, value: opt.value }))),
  ];
  const classButtons = [];
  classOptions.forEach((opt) => {
    const btn = el('button', {
      className: `pill${opt.value === classFilter ? ' active' : ''}`,
      textContent: opt.label,
    });
    btn.addEventListener('click', () => {
      classFilter = opt.value;
      classButtons.forEach((b, i) => b.classList.toggle('active', classOptions[i].value === classFilter));
      buildWeaponTypePills();
      renderData();
    });
    classButtons.push(btn);
    classBar.appendChild(btn);
  });
  container.appendChild(classBar);
  container.appendChild(el('hr', { style: { border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0 10px 0' } }));

  // Level 1 pills: sub_categories (Weapon, Cap, Coat, ...)
  const pillRow = el('div', {
    style: { display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '0 0 8px 0', alignItems: 'center' },
  });
  container.appendChild(pillRow);

  // Level 2 pills: weapon types (hidden unless Weapon is selected)
  const weaponTypePillRow = el('div', {
    style: { display: 'none', flexWrap: 'wrap', gap: '6px', margin: '0 0 8px 0', alignItems: 'center' },
  });
  container.appendChild(weaponTypePillRow);

  const dataDiv = el('div');
  container.appendChild(dataDiv);

  function setActivePill(activeBtn, row) {
    row.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    activeBtn.classList.add('active');
  }

  function buildCategoryPills() {
    pillRow.innerHTML = '';

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

    const allBtn = el('button', { className: 'pill active', textContent: 'All' });
    allBtn.addEventListener('click', () => {
      selectedSubCategory = null;
      selectedWeaponType = null;
      setActivePill(allBtn, pillRow);
      buildWeaponTypePills();
      renderData();
    });
    pillRow.appendChild(allBtn);

    subCats.forEach((sub) => {
      const btn = el('button', { className: 'pill', textContent: sub });
      btn.addEventListener('click', () => {
        selectedSubCategory = sub;
        selectedWeaponType = null;
        setActivePill(btn, pillRow);
        buildWeaponTypePills();
        renderData();
      });
      pillRow.appendChild(btn);
    });
  }

  function buildWeaponTypePills() {
    weaponTypePillRow.innerHTML = '';
    if (selectedSubCategory !== 'Weapon') {
      weaponTypePillRow.style.display = 'none';
      selectedWeaponType = null;
      return;
    }

    const defaultOrder = Array.isArray(equipmentMeta.weapon_type_order) ? equipmentMeta.weapon_type_order : [];
    let typeOrder = defaultOrder;
    let primaryTypes = new Set();
    if (classFilter !== 0 && equipmentMeta.weapon_types_by_class?.[String(classFilter)]) {
      const primary = equipmentMeta.weapon_types_by_class[String(classFilter)];
      primaryTypes = new Set(primary);
      const rest = defaultOrder.filter((t) => !primary.includes(t));
      typeOrder = [...primary, ...rest];
    }

    const allWeapons = items.items.filter((item) => item.category === 'Equipment' && item.sub_category === 'Weapon');
    const types = [...new Set(allWeapons.map((w) => w.weapon_type).filter(Boolean))].sort((a, b) => {
      const ai = typeOrder.indexOf(a);
      const bi = typeOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    if (types.length === 0) {
      weaponTypePillRow.style.display = 'none';
      return;
    }

    weaponTypePillRow.style.display = 'flex';

    const allBtn = el('button', { className: 'pill pill--sub active', textContent: 'All' });
    allBtn.addEventListener('click', () => {
      selectedWeaponType = null;
      setActivePill(allBtn, weaponTypePillRow);
      renderData();
    });
    weaponTypePillRow.appendChild(allBtn);

    types.forEach((type) => {
      const isPrimary = primaryTypes.has(type);
      const btn = el('button', { className: `pill pill--sub${isPrimary ? ' pill--primary' : ''}`, textContent: type });
      btn.addEventListener('click', () => {
        selectedWeaponType = type;
        setActivePill(btn, weaponTypePillRow);
        renderData();
      });
      weaponTypePillRow.appendChild(btn);
    });
  }

  function renderData() {
    dataDiv.innerHTML = '';

    let equips = items.items.filter((item) => item.category === 'Equipment');

    const exactId = parseIdFilter(searchQuery);
    const sq = searchQuery.toLowerCase();
    if (exactId != null) {
      equips = equips.filter((equip) => Number(equip.id) === exactId);
    } else if (sq) {
      equips = equips.filter((equip) => {
        if (!equipTextCache.has(equip.id)) equipTextCache.set(equip.id, renderEquipRow(equip).textContent.toLowerCase());
        return equipTextCache.get(equip.id).includes(sq);
      });
    }

    if (classFilter !== 0) {
      equips = equips.filter((equip) => matchesClass(equip, classFilter));
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
        el('p', {
          style: { color: 'var(--dim)', padding: '20px', textAlign: 'center' },
          textContent: 'No equipment matches your filters.',
        })
      );
      return;
    }

    if (!selectedSubCategory) {
      // "All" selected — group into collapsibles by sub_category
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
      // Specific sub_category selected — wrap in a collapsible like cashshop
      const content = el('div');
      equips.forEach((item) => content.appendChild(renderEquipRow(item)));
      dataDiv.appendChild(makeCollapsible(selectedSubCategory, equips.length, true, null, content));
    }
  }

  buildCategoryPills();
  buildWeaponTypePills();
  renderData();
  return container;
}
