import { el, normalizeAssetPath, makeEquipStatLine, makeEquipReqLine } from './utils.js';

function toItemThumbPath(itemId) {
  const n = Number(itemId);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `images/items/${String(n).padStart(8, '0')}.png`;
}

function toMobThumbPath(mobId) {
  const n = Number(mobId);
  if (!Number.isFinite(n) || n < 0) return '';
  return `images/monsters/${String(n).padStart(7, '0')}.png`;
}

let _tooltip = null;
function getTooltip() {
  if (!_tooltip) {
    _tooltip = el('div', { className: 'item-tooltip', id: 'craft-item-tooltip' });
    document.body.appendChild(_tooltip);
  }
  return _tooltip;
}

function positionTooltip(tip, e) {
  tip.style.left = '0px';
  tip.style.top = '0px';
  tip.style.visibility = 'hidden';
  tip.classList.add('visible');

  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  const offset = 12;

  let x = e.clientX + offset;
  let y = e.clientY + offset;
  if (x + tw > vpW - 8) x = e.clientX - tw - offset;
  if (y + th > vpH - 8) y = e.clientY - th - offset;

  tip.style.left = `${x + window.scrollX}px`;
  tip.style.top = `${y + window.scrollY}px`;
  tip.style.visibility = '';
}

export function showItemTooltip(e, itemData) {
  if (!itemData) return;
  const tip = getTooltip();
  tip.innerHTML = '';
  tip.classList.remove('mob-tooltip');

  const header = el('div', { className: 'item-tooltip-header' });
  const thumbSrc = toItemThumbPath(itemData.id);
  if (thumbSrc) {
    const img = el('img', { className: 'item-tooltip-thumb', loading: 'lazy' });
    img.src = normalizeAssetPath(thumbSrc);
    img.addEventListener('error', () => img.remove(), { once: true });
    header.appendChild(img);
  }
  const nameWrap = el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } });
  nameWrap.appendChild(el('span', { className: 'item-tooltip-name', textContent: itemData.name }));
  const equipType = itemData.weapon_type || (itemData.category === 'Equipment' ? itemData.sub_category : null);
  if (equipType) {
    nameWrap.appendChild(el('span', { className: 'equip-type-badge', textContent: equipType }));
  }
  header.appendChild(nameWrap);
  tip.appendChild(header);

  if (itemData.description) {
    tip.appendChild(el('p', { className: 'item-tooltip-desc', textContent: itemData.description }));
  }

  let hasContent = !!itemData.description;

  if (itemData.category === 'Equipment') {
    const statLine = makeEquipStatLine(itemData);
    if (statLine) { tip.appendChild(statLine); hasContent = true; }
    const reqLine = makeEquipReqLine(itemData);
    if (reqLine) { tip.appendChild(reqLine); hasContent = true; }
  }

  if (!hasContent) {
    tip.appendChild(el('span', { className: 'item-tooltip-desc', textContent: 'No details available.' }));
  }

  positionTooltip(tip, e);
  tip.classList.add('visible');
}

export function hideItemTooltip() {
  if (_tooltip) { _tooltip.classList.remove('visible'); _tooltip.classList.remove('mob-tooltip'); }
}

export function showMobTooltip(e, mobData) {
  if (!mobData) return;
  const tip = getTooltip();
  tip.innerHTML = '';
  tip.classList.add('mob-tooltip');

  // ── Header ───────────────────────────────────────────────────
  const header = el('div', { className: 'mob-tooltip-header' });
  const thumbSrc = toMobThumbPath(mobData.id);
  if (thumbSrc) {
    const img = el('img', { className: 'mob-tooltip-img', loading: 'lazy' });
    img.src = normalizeAssetPath(thumbSrc);
    img.addEventListener('error', () => img.remove(), { once: true });
    header.appendChild(img);
  }
  const headerText = el('div', { className: 'mob-tooltip-header-text' });
  headerText.appendChild(el('span', { className: 'mob-tooltip-name', textContent: mobData.name }));
  if (mobData.level != null) {
    headerText.appendChild(el('span', { className: 'mob-tooltip-level', textContent: `Lv. ${mobData.level}` }));
  }
  if (mobData.is_boss) {
    headerText.appendChild(el('span', { className: 'badge badge-boss mob-tooltip-boss', textContent: 'BOSS' }));
  }
  header.appendChild(headerText);
  tip.appendChild(header);

  // ── Stat groups ───────────────────────────────────────────────
  const baseStats = [
    ['HP',  mobData.hp  != null ? mobData.hp.toLocaleString()  : null],
    ['EXP', mobData.exp != null ? mobData.exp.toLocaleString() : null],
  ].filter(([, v]) => v != null);

  const combatStats = [
    ['P.ATK', mobData.PADamage],
    ['M.ATK', mobData.MADamage],
    ['P.DEF', mobData.PDDamage],
    ['M.DEF', mobData.MDDamage],
    ['AVOID', mobData.eva],
  ].filter(([, v]) => v != null && v !== 0);

  function makeStatGroup(rows) {
    const grid = el('div', { className: 'mob-tooltip-stat-grid' });
    rows.forEach(([label, value]) => {
      grid.appendChild(el('span', { className: 'mob-tooltip-stat-label', textContent: label }));
      grid.appendChild(el('span', { className: 'mob-tooltip-stat-value', textContent: value }));
    });
    return grid;
  }

  const hasBase   = baseStats.length > 0;
  const hasCombat = combatStats.length > 0;

  if (hasBase || hasCombat) {
    const body = el('div', { className: 'mob-tooltip-body' });
    if (hasBase)   body.appendChild(makeStatGroup(baseStats));
    if (hasBase && hasCombat) body.appendChild(el('div', { className: 'mob-tooltip-divider' }));
    if (hasCombat) body.appendChild(makeStatGroup(combatStats));
    tip.appendChild(body);
  }

  // ── Elemental resistances ─────────────────────────────────────
  if (mobData.elements && typeof mobData.elements === 'object') {
    const elemEntries = Object.entries(mobData.elements);
    if (elemEntries.length) {
      const elemDiv = el('div', { className: 'mob-tooltip-elements' });
      elemEntries.forEach(([elem, effect]) => {
        const cls = { Immune: 'immune', Resist: 'resist', Weak: 'weak', Strong: 'strong' }[effect] || '';
        elemDiv.appendChild(el('span', { className: `elem-badge ${cls}`, textContent: `${elem} ${effect}` }));
      });
      tip.appendChild(elemDiv);
    }
  }

  if (!hasBase && !hasCombat && !(mobData.elements && Object.keys(mobData.elements).length)) {
    tip.appendChild(el('span', { className: 'item-tooltip-desc', textContent: 'No details available.' }));
  }

  positionTooltip(tip, e);
  tip.classList.add('visible');
}

export function attachTooltip(element, getData, type = 'item') {
  element.addEventListener('mouseenter', (e) => {
    if (type === 'mob') showMobTooltip(e, getData());
    else showItemTooltip(e, getData());
  });
  element.addEventListener('mousemove', (e) => {
    if (_tooltip?.classList.contains('visible')) positionTooltip(_tooltip, e);
  });
  element.addEventListener('mouseleave', hideItemTooltip);
}
