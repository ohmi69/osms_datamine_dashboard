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
  const equipTextCache = new Map();
  const container = el('div');
  const equipmentMeta = items.equipment_meta || {};

  const filterBar = el('div', {
    style: {
      display: 'flex', flexWrap: 'wrap', gap: '8px',
      alignItems: 'center', marginBottom: '12px',
    },
  });
  const classOptions = [
    { label: 'All Classes', value: 0 },
    ...((equipmentMeta.job_filters || []).map((option) => ({
      label: option.label,
      value: option.value,
    }))),
  ];
  const classButtons = [];
  classOptions.forEach((option) => {
    const button = el('button', {
      className: `pill${option.value === classFilter ? ' active' : ''}`,
      textContent: option.label,
    });
    button.addEventListener('click', () => {
      classFilter = option.value;
      classButtons.forEach((btn, index) => {
        btn.classList.toggle('active', classOptions[index].value === classFilter);
      });
      renderData();
    });
    classButtons.push(button);
    filterBar.appendChild(button);
  });

  const eqSearchBox = makeSearchBox('Search by name or description...', (value) => {
    searchQuery = value;
    renderData();
  });
  container.appendChild(eqSearchBox);
  container.appendChild(filterBar);

  if (options.setNavigate) {
    options.setNavigate((query) => {
      searchQuery = query;
      eqSearchBox._input.value = query;
      renderData();
      window.scrollTo(0, 0);
    });
  }

  const dataDiv = el('div');
  container.appendChild(dataDiv);

  function renderData() {
    dataDiv.innerHTML = '';
    let equips = items.items.filter((item) => item.category === 'Equipment');
    const sq = searchQuery.toLowerCase();
    const exactId = parseIdFilter(searchQuery);
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

    const weapons = equips.filter((equip) => equip.sub_category === 'Weapon');
    const armor   = equips.filter((equip) => equip.sub_category !== 'Weapon');

    if (weapons.length > 0) {
      const grouped = {};
      weapons.forEach((weapon) => {
        const type = weapon.weapon_type || 'Other';
        (grouped[type] = grouped[type] || []).push(weapon);
      });

      const defaultOrder = Array.isArray(equipmentMeta.weapon_type_order)
        ? equipmentMeta.weapon_type_order
        : Object.keys(grouped).sort();

      let typeOrder;
      if (classFilter !== 0 && equipmentMeta.weapon_types_by_class?.[String(classFilter)]) {
        const primary = equipmentMeta.weapon_types_by_class[String(classFilter)];
        const rest = defaultOrder.filter((type) => !primary.includes(type));
        typeOrder = [...primary, ...rest];
      } else {
        typeOrder = defaultOrder;
      }

      const sortedTypes = Object.keys(grouped).sort((a, b) => {
        const left  = typeOrder.indexOf(a);
        const right = typeOrder.indexOf(b);
        return (left  === -1 ? 99 : left) - (right === -1 ? 99 : right);
      });

      const weaponContent = el('div');
      sortedTypes.forEach((type) => {
        const weps = grouped[type].sort(
          (a, b) => (a.stats?.reqLevel || 0) - (b.stats?.reqLevel || 0)
        );
        const content = el('div');
        weps.forEach((weapon) => content.appendChild(renderEquipRow(weapon)));
        weaponContent.appendChild(makeCollapsible(type, weps.length, true, null, content));
      });

      dataDiv.appendChild(
        makeCollapsible('Weapons', weapons.length, true, null, weaponContent)
      );
    }

    const armorOrder = Array.isArray(equipmentMeta.armor_order) ? equipmentMeta.armor_order : [];
    const armorGrouped = {};
    armor.forEach((item) => {
      const sub = item.sub_category || 'Other';
      (armorGrouped[sub] = armorGrouped[sub] || []).push(item);
    });

    Object.keys(armorGrouped)
      .sort((a, b) => {
        const left  = armorOrder.indexOf(a);
        const right = armorOrder.indexOf(b);
        return (left  === -1 ? 99 : left) - (right === -1 ? 99 : right);
      })
      .forEach((sub) => {
        const equipsBySub = armorGrouped[sub].sort(
          (a, b) => (a.stats?.reqLevel || 0) - (b.stats?.reqLevel || 0)
        );
        const content = el('div');
        equipsBySub.forEach((equip) => content.appendChild(renderEquipRow(equip)));
        dataDiv.appendChild(makeCollapsible(sub, equipsBySub.length, true, null, content));
      });

    if (weapons.length === 0 && armor.length === 0) {
      dataDiv.appendChild(
        el('p', {
          style: { color: 'var(--dim)', padding: '20px', textAlign: 'center' },
          textContent: 'No equipment matches your filters.',
        })
      );
    }
  }

  renderData();
  return container;
}
