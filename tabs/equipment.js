import { el, fmt, makeSearchBox, makeCollapsible, makeThumbnail } from '../lib/utils.js';

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
  topLine.appendChild(el('span', { className: 'id', textContent: item.id }));
  row.appendChild(topLine);

  if (item.description) {
    row.appendChild(
      el('p', { className: 'desc', textContent: item.description.replace(/\n/g, '\n') })
    );
  }

  if (item.stats) {
    const stats = item.stats;
    const parts = [];
    const accent = 'var(--accent)';

    if (stats.incPAD) parts.push({ t: `ATK+${stats.incPAD}`,  c: 'var(--secondary)' });
    if (stats.incMAD) parts.push({ t: `MATK+${stats.incMAD}`, c: 'var(--secondary)' });
    if (stats.incPDD) parts.push({ t: `DEF+${stats.incPDD}`,  c: null });
    if (stats.incMDD) parts.push({ t: `MDEF+${stats.incMDD}`, c: null });

    const baseStats = [];
    if (stats.incSTR) baseStats.push(`STR+${stats.incSTR}`);
    if (stats.incDEX) baseStats.push(`DEX+${stats.incDEX}`);
    if (stats.incINT) baseStats.push(`INT+${stats.incINT}`);
    if (stats.incLUK) baseStats.push(`LUK+${stats.incLUK}`);
    if (baseStats.length) parts.push({ t: baseStats.join(', '), c: null });

    if (stats.incMHP)    parts.push({ t: `HP+${stats.incMHP}`,           c: null });
    if (stats.incMMP)    parts.push({ t: `MP+${stats.incMMP}`,           c: null });
    if (stats.incACC)    parts.push({ t: `ACC+${stats.incACC}`,          c: null });
    if (stats.incEVA)    parts.push({ t: `EVA+${stats.incEVA}`,          c: null });
    if (stats.incSpeed)  parts.push({ t: `Speed+${stats.incSpeed}`,      c: null });
    if (stats.incJump)   parts.push({ t: `Jump+${stats.incJump}`,        c: null });
    if (stats.knockback) parts.push({ t: `KB ${stats.knockback}%`,       c: null });
    if (stats.incCRT)    parts.push({ t: `Crit Rate+${stats.incCRT}`,    c: accent });
    if (stats.incCRD)    parts.push({ t: `Crit Damage+${stats.incCRD}`,  c: accent });
    if (stats.recovery)  parts.push({ t: `Recovery ×${stats.recovery}`,  c: accent });
    if (stats.attackSpeed) {
      const label = item.attack_speed_label || stats.attackSpeed;
      parts.push({ t: `Speed:${label}(${stats.attackSpeed})`, c: null });
    }
    if (stats.tuc) parts.push({ t: `Slots:${stats.tuc}`, c: null });

    const statLine = el('div', {
      style: {
        display: 'flex', flexWrap: 'wrap', gap: '4px 8px',
        fontSize: '12px', marginTop: '4px', lineHeight: '1.6',
      },
    });
    parts.forEach((part, index) => {
      if (index > 0) {
        statLine.appendChild(el('span', { style: { color: 'var(--dim)' }, textContent: '·' }));
      }
      statLine.appendChild(
        el('span', { style: { color: part.c || 'var(--dim)' }, textContent: part.t })
      );
    });
    row.appendChild(statLine);

    const reqs = [];
    if (stats.reqLevel) reqs.push(`Lv.${stats.reqLevel}`);
    if (stats.reqSTR)   reqs.push(`STR ${stats.reqSTR}`);
    if (stats.reqDEX)   reqs.push(`DEX ${stats.reqDEX}`);
    if (stats.reqINT)   reqs.push(`INT ${stats.reqINT}`);
    if (stats.reqLUK)   reqs.push(`LUK ${stats.reqLUK}`);
    const jobStr = item.req_job_label || 'All';

    if (reqs.length || jobStr !== 'All') {
      const reqLine = el('div', {
        style: {
          display: 'flex', flexWrap: 'wrap', gap: '4px 8px',
          fontSize: '11px', marginTop: '2px', lineHeight: '1.5',
        },
      });
      reqLine.appendChild(el('span', { style: { color: 'var(--dim)' }, textContent: 'Req: ' }));
      if (jobStr !== 'All') {
        reqLine.appendChild(
          el('span', { style: { color: '#c084fc' }, textContent: `[${jobStr}]` })
        );
      }
      reqs.forEach((req) => {
        reqLine.appendChild(el('span', { style: { color: 'var(--dim)' }, textContent: req }));
      });
      row.appendChild(reqLine);
    }
  }

  return row;
}

export function renderEquipment(data) {
  const { items } = data;
  let searchQuery = '';
  let classFilter = 0;
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

  container.appendChild(filterBar);
  container.appendChild(
    makeSearchBox('Search equipment...', (value) => {
      searchQuery = value;
      renderData();
    })
  );

  const dataDiv = el('div');
  container.appendChild(dataDiv);

  function renderData() {
    dataDiv.innerHTML = '';
    let equips = items.items.filter((item) => item.category === 'Equipment');
    const sq = searchQuery.toLowerCase();
    if (sq) {
      equips = equips.filter(
        (equip) =>
          equip.name.toLowerCase().includes(sq) ||
          (equip.description || '').toLowerCase().includes(sq)
      );
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
