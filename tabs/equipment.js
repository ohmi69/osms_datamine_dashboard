import { el, fmt, makeSearchBox, makeCollapsible, makeThumbnail, makeEquipStatLine, makeEquipReqLine, makeDeepLinkButton, parseIdFilter, makePillGroup } from '../lib/utils.js';

function matchesClass(item, classFilter) {
  if (classFilter === 0 || !item.stats) return true;
  const requiredJob = item.stats.reqJob || 0;
  if (requiredJob === 0) return true;
  return (requiredJob & classFilter) !== 0;
}

function renderEquipRow(item) {
  const row = el('div', { className: 'item-row', style: { marginBottom: '0', borderBottom: '1px solid var(--border)' } });
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

  // Show sell price in a detail panel (exactly like items tab)
  if (typeof item.price === 'number' && item.price > 0) {
    const panel = el('div', { className: 'item-detail-panel', style: { borderTop: 'none', paddingTop: 0, marginTop: 0 } });
    const chipRow = el('div', { className: 'item-detail-chips' });
    const chip = el('div', { className: 'item-detail-chip' });
    chip.appendChild(el('span', { className: 'chip-label', textContent: 'Sell Price' }));
    chip.appendChild(el('span', { className: 'chip-value', textContent: fmt(item.price) + ' mesos' }));
    chipRow.appendChild(chip);
    panel.appendChild(chipRow);
    row.appendChild(panel);
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

  // Class filter pills using makePillGroup
  const classOptions = [
    { label: 'All Classes', value: 0 },
    ...((equipmentMeta.job_filters || []).map((opt) => ({ label: opt.label, value: opt.value }))),
  ];
  function handleClassPillChange(value) {
    classFilter = value;
    const newGroup = makePillGroup(classOptions, classFilter, handleClassPillChange, { groupLabel: 'Class:' });
    container.replaceChild(newGroup, classPillGroup);
    classPillGroup = newGroup;
    buildWeaponTypePills();
    renderData();
  }
  let classPillGroup = makePillGroup(classOptions, classFilter, handleClassPillChange, { groupLabel: 'Class:' });
  container.appendChild(classPillGroup);
  container.appendChild(el('hr', { style: { border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0 10px 0' } }));

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
      buildSubCategoryPills();
      buildWeaponTypePills();
      renderData();
    }
    const newPillGroup = makePillGroup(subCategoryOptions, selectedSubCategory, handleSubCategoryPillChange, { groupLabel: 'Type:' });
    if (subCategoryPillGroup) {
      container.replaceChild(newPillGroup, subCategoryPillGroup);
    } else {
      container.appendChild(newPillGroup);
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
      renderData();
    }
    if (selectedSubCategory !== 'Weapon' || types.length === 0) {
      if (weaponTypePillGroup) {
        container.removeChild(weaponTypePillGroup);
        weaponTypePillGroup = null;
      }
      selectedWeaponType = null;
      return;
    }
    const newPillGroup = makePillGroup(weaponTypeOptions, selectedWeaponType, handleWeaponTypePillChange, { groupLabel: 'Weapon Type:' });
    if (weaponTypePillGroup) {
      container.replaceChild(newPillGroup, weaponTypePillGroup);
    } else {
      container.insertBefore(newPillGroup, dataDiv);
    }
    weaponTypePillGroup = newPillGroup;
  }
  buildSubCategoryPills();
  buildWeaponTypePills();

  const dataDiv = el('div');
  container.appendChild(dataDiv);

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

  buildSubCategoryPills();
  buildWeaponTypePills();
  renderData();
  return container;
}
