import { el, normalizeAssetPath, makeEquipStatLine, makeEquipReqLine, toItemThumbPath } from './utils.js';
import { getMobThumbUrl, getMapUrl } from './data.js';

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
  tip.classList.remove('mob-tooltip', 'portal-tooltip');

  const header = el('div', { className: 'item-tooltip-header' });
  const thumbSrc = toItemThumbPath(itemData.id);
  if (thumbSrc) {
    const img = el('img', { className: 'item-tooltip-thumb', loading: 'lazy' });
    img.src = normalizeAssetPath(thumbSrc);
    img.addEventListener('error', () => img.remove(), { once: true });
    img.addEventListener('load', () => { if (img.naturalWidth === 0) img.remove(); }, { once: true });
    header.appendChild(img);
  }
  const nameWrap = el('div', { className: 'tooltip-name-wrap' });
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
  if (_tooltip) {
    _tooltip.classList.remove('visible', 'mob-tooltip', 'portal-tooltip');
  }
}

export function showMobTooltip(e, mobData) {
  if (!mobData) return;
  const tip = getTooltip();
  tip.innerHTML = '';
  tip.classList.remove('portal-tooltip');
  tip.classList.add('mob-tooltip');

  // ── Header ───────────────────────────────────────────────────
  const header = el('div', { className: 'mob-tooltip-header' });
  const thumbSrc = getMobThumbUrl(mobData.thumbnail);
  if (thumbSrc) {
    const img = el('img', { className: 'mob-tooltip-img', loading: 'lazy' });
    img.src = thumbSrc;
    img.addEventListener('error', () => img.remove(), { once: true });
    img.addEventListener('load', () => { if (img.naturalWidth === 0) img.remove(); }, { once: true });
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

// Maps had no tooltip of their own; this reuses the portal tooltip's
// destination-map presentation (thumbnail, name, spawn chips) so a map preview
// looks the same wherever it appears.
export function showMapTooltip(e, mapData) {
  if (!mapData || !mapData.map) return;
  const { map, mobs } = mapData;
  const tip = getTooltip();
  tip.innerHTML = '';
  tip.classList.remove('mob-tooltip');
  tip.classList.add('portal-tooltip');

  const header = el('div', { className: 'portal-tooltip-dest-header' });
  const thumbSrc = map.thumbnail || map.minimap || (map.id != null ? getMapUrl(map.id) : '');
  if (thumbSrc) {
    const img = el('img', {
      className: 'portal-tooltip-dest-thumb', loading: 'lazy',
      src: normalizeAssetPath(thumbSrc),
    });
    img.addEventListener('error', () => img.remove(), { once: true });
    header.appendChild(img);
  }
  header.appendChild(el('span', {
    className: 'portal-tooltip-dest-name',
    textContent: map.name || `Map #${map.id}`,
  }));
  tip.appendChild(header);

  const context = [map.region, map.street_name].filter(Boolean).join(' · ');
  if (context) {
    tip.appendChild(el('div', { className: 'portal-tooltip-dest-label', textContent: context }));
  }

  if (mobs && mobs.length) {
    tip.appendChild(el('div', { className: 'portal-tooltip-mobs-label', textContent: 'Mob spawns:' }));
    const list = el('div', { className: 'portal-tooltip-mob-list' });
    mobs.forEach((mob) => {
      const chip = el('div', { className: 'portal-tooltip-mob-chip' });
      if (mob.thumbnail) {
        chip.appendChild(el('img', {
          className: 'portal-tooltip-mob-img', loading: 'lazy',
          src: getMobThumbUrl(mob.thumbnail),
        }));
      }
      chip.appendChild(el('span', { textContent: mob.name || `#${mob.id}` }));
      if (mob.count > 1) {
        chip.appendChild(el('span', { className: 'text-dim', textContent: `×${mob.count}` }));
      }
      list.appendChild(chip);
    });
    tip.appendChild(list);
  } else if (!context) {
    tip.appendChild(el('span', { className: 'item-tooltip-desc', textContent: 'No details available.' }));
  }

  positionTooltip(tip, e);
  tip.classList.add('visible');
}

export function showPortalTooltip(e, portalData) {
  if (!portalData || !portalData.portal) return;
  const { portal, mapEntry, mobs } = portalData;
  const tip = getTooltip();
  tip.innerHTML = '';
  tip.classList.add('portal-tooltip');

  // Header (no portal name, just a generic label)
  const header = el('div', { className: 'portal-tooltip-header' });
  tip.appendChild(header);
  if (portal.intra_map) {
    const hint = el('div', {
      className: 'portal-tooltip-intra-hint',
      textContent: portalData.showAllIntra
        ? 'Click to disable intra-map teleport indicators'
        : 'Click to enable intra-map teleport indicators',
    });
    tip.appendChild(hint);
    positionTooltip(tip, e);
    tip.classList.add('visible');
    return;
  } else {
    // Inter-map: show map name, thumbnail, and mob spawns with images
    // Try to find the destination map info
    let destMap = null;
    if (portal.dest_map) {
      // Try to find the map in window._allMapsCache if available, else fallback to searching window._mapsData or nothing
      destMap = null;
      if (window._allMapsCache && typeof window._allMapsCache === 'object') {
        for (const region of window._allMapsCache.regions || []) {
          destMap = region.maps?.find(m => String(m.id) === String(portal.dest_map));
          if (destMap) break;
        }
      }
      if (!destMap && window._mapsData && typeof window._mapsData === 'object') {
        for (const region of window._mapsData.regions || []) {
          destMap = region.maps?.find(m => String(m.id) === String(portal.dest_map));
          if (destMap) break;
        }
      }
    }
    if (destMap) {
      // Map name and thumbnail
      const destHeader = el('div', { className: 'portal-tooltip-dest-header' });
      if (destMap.thumbnail || destMap.minimap) {
        destHeader.appendChild(el('img', {
          src: normalizeAssetPath(destMap.thumbnail || destMap.minimap),
          className: 'portal-tooltip-dest-thumb',
          loading: 'lazy',
        }));
      }
      destHeader.appendChild(el('span', { className: 'portal-tooltip-dest-name', textContent: destMap.name || `Map #${portal.dest_map}` }));
      tip.appendChild(destHeader);
      // Mob spawns for the destination map
      if (window._mapMobsCache && typeof window._mapMobsCache === 'object') {
        const destMobs = window._mapMobsCache[String(destMap.id)];
        if (destMobs && destMobs.length > 0) {
          tip.appendChild(el('div', { className: 'portal-tooltip-mobs-label', textContent: 'Mob spawns:' }));
          const mobList = el('div', { className: 'portal-tooltip-mob-list' });
          for (const mob of destMobs) {
            const mobChip = el('div', { className: 'portal-tooltip-mob-chip' });
            if (mob.thumbnail) {
              mobChip.appendChild(el('img', {
                src: getMobThumbUrl(mob.thumbnail),
                className: 'portal-tooltip-mob-img',
                loading: 'lazy',
              }));
            }
            mobChip.appendChild(el('span', { textContent: mob.name || `#${mob.id}` }));
            mobChip.appendChild(el('span', { className: 'text-dim', textContent: `×${mob.count}` }));
            mobList.appendChild(mobChip);
          }
          tip.appendChild(mobList);
        } 
      } else {
        tip.appendChild(el('div', { className: 'portal-tooltip-unavailable', textContent: 'Mob data unavailable.' }));
      }
    } else {
      tip.appendChild(el('div', { className: 'portal-tooltip-dest-label', textContent: portal.dest_name ? `To: ${portal.dest_name}` : `To another map` }));
    }
  }

  positionTooltip(tip, e);
  tip.classList.add('visible');
}

export function attachTooltip(element, getData, type = 'item') {
  element.addEventListener('mouseenter', (e) => {
    if (type === 'mob') showMobTooltip(e, getData());
    else if (type === 'portal') showPortalTooltip(e, getData());
    else if (type === 'map') showMapTooltip(e, getData());
    else showItemTooltip(e, getData());
  });
  element.addEventListener('mousemove', (e) => {
    if (_tooltip?.classList.contains('visible')) positionTooltip(_tooltip, e);
  });
  element.addEventListener('mouseleave', hideItemTooltip);
}
