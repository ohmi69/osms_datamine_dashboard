

import { el, makeCollapsible, makeThumbnail, makeSearchBox, normalizeAssetPath, makeDeepLinkButton } from '../lib/utils.js';
import { attachTooltip, hideItemTooltip } from '../lib/tooltip.js';
import state from '../lib/data.js';

// Load NPCs data for lookup

// NPC lookup cache
let npcLookup = null;
async function getNpcLookup() {
  if (npcLookup) return npcLookup;
  const res = await fetch('data/npcs.json');
  const npcsData = await res.json();
  npcLookup = new Map();
  for (const npc of npcsData) {
    npcLookup.set(Number(npc.id), npc);
  }
  return npcLookup;
}

function formatSpawnTime(seconds) {
  // If input is a string, handle min-max [avg] or single value
  if (typeof seconds === 'string') {
    // Match "min-max [avg]" or "min [avg]"
    const rangeMatch = seconds.match(/^([\d.]+)-(\d+\.\d+|\d+)(?: \[(\d+\.\d+|\d+)\])?$/);
    const singleMatch = seconds.match(/^([\d.]+)(?: \[(\d+\.\d+|\d+)\])?$/);
    if (rangeMatch) {
      const min = parseFloat(rangeMatch[1]);
      const max = parseFloat(rangeMatch[2]);
      const avg = rangeMatch[3];
      if (min === max) {
        // Only show one value (with avg if present)
        return avg ? `${min}s [${avg}s]` : `${min}s`;
      } else {
        // Show range and avg
        return avg ? `${min}s-${max}s [${avg}s]` : `${min}s-${max}s`;
      }
    } else if (singleMatch) {
      const val = parseFloat(singleMatch[1]);
      const avg = singleMatch[2];
      return avg ? `${val}s [${avg}s]` : `${val}s`;
    }
    // Fallback: return as-is
    return seconds;
  }
  if (seconds < 60) {
    const s = Number.isInteger(seconds) ? seconds : seconds.toFixed(2).replace(/\.?0+$/, '');
    return `${s}s`;
  }
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function getAvgSpawnTime(mobTime) {
  const DEFAULT = 7.56;
  if (mobTime == null) return DEFAULT;
  if (typeof mobTime === 'number') return mobTime > 0 ? mobTime : DEFAULT;
  const rangeMatch = mobTime.match(/^([\d.]+)-([\d.]+)(?: \[(\d[\d.]*)\])?$/);
  if (rangeMatch) {
    if (rangeMatch[3]) return parseFloat(rangeMatch[3]);
    return (parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2;
  }
  const singleMatch = mobTime.match(/^([\d.]+)(?: \[(\d[\d.]*)\])?$/);
  if (singleMatch) return parseFloat(singleMatch[2] || singleMatch[1]) || DEFAULT;
  return DEFAULT;
}

function parseMapIdFilter(query) {
  const match = /^id\s*:\s*(\d+)\s*$/i.exec((query || '').trim());
  if (!match) return null;
  return Number(match[1]);
}

export function renderMaps(data, options = {}) {
  // Container setup (create local container for tab panel)
  const container = el('div', { className: 'maps-panel' });
  // Column config (customizable)
  const allCols = [
      { id: 'mobs',              label: 'Mobs',       on: true },
      { id: 'common_mob',        label: 'Most Common Mob', on: true },
      { id: 'weighted_level',    label: 'Weighted Mob Lv.', on: true },
      { id: 'exp_per_mob',       label: 'Exp / Mob',  on: true },
      { id: 'total_exp',         label: 'Total Exp',  on: false },
      { id: 'weighted_exp_hour', label: 'Weighted Exp / hr',   on: false },
    ];
  // Load/save state for columns and hideNoMobs
  const mapState = state.get('maps', {});
  const colState = {};
  allCols.forEach((col) => {
    colState[col.id] = mapState.cols && mapState.cols[col.id] !== undefined ? mapState.cols[col.id] : col.on;
  });
  let hideNoMobs = mapState.hideNoMobs || false;

  // Column toggles UI and hide-maps-without-mobs toggle styled like cash shop
  const toggles = el('div', { className: 'col-toggles' });
  function rebuildToggles() {
    toggles.innerHTML = '';
    toggles.appendChild(el('span', { className: 'label', textContent: 'Columns:' }));
    allCols.forEach((col) => {
      const button = el('button', {
        className: `col-toggle${colState[col.id] ? ' active' : ''}`,
        textContent: col.label,
      });
      button.addEventListener('click', () => {
        colState[col.id] = !colState[col.id];
        state.set('maps', { cols: { ...colState }, hideNoMobs });
        rebuildToggles();
        renderData();
      });
      toggles.appendChild(button);
    });
    // Add hide maps without mobs toggle (same style as cash shop)
    const checkBox = el('span', {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '13px',
        height: '13px',
        borderRadius: '3px',
        border: '1.5px solid currentColor',
        flexShrink: '0',
        fontSize: '10px',
        lineHeight: '1',
      },
    });
    const toggleBtn = el('button', {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 9px',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: '500',
        cursor: 'pointer',
        border: '1px solid var(--border)',
        background: 'transparent',
        color: 'var(--dim)',
        transition: 'all .2s',
        marginLeft: '10px',
      },
    });
    toggleBtn.appendChild(checkBox);
    toggleBtn.appendChild(document.createTextNode('Hide maps without mobs'));
    function updateToggleStyle() {
      if (hideNoMobs) {
        toggleBtn.style.color = '#ef4444';
        toggleBtn.style.borderColor = '#ef444466';
        toggleBtn.style.background = '#ef444411';
        checkBox.textContent = '✓';
      } else {
        toggleBtn.style.color = 'var(--dim)';
        toggleBtn.style.borderColor = 'var(--border)';
        toggleBtn.style.background = 'transparent';
        checkBox.textContent = '';
      }
    }
    toggleBtn.addEventListener('click', () => {
      hideNoMobs = !hideNoMobs;
      state.set('maps', { cols: { ...colState }, hideNoMobs });
      updateToggleStyle();
      renderData();
    });
    updateToggleStyle();
    toggles.appendChild(toggleBtn);
  }
  rebuildToggles();
  container.appendChild(toggles);
  const { onMobClick } = options;
  const { maps, monsters } = data;

  container.appendChild(
    el('div', {
      className: 'count-text',
      textContent: `${maps.total} maps across ${maps.regions.length} regions`,
    })
  );
  // Reorder regions: Victoria Island > Maple Island > Other > Event
  const regionOrder = [
    'Victoria Island',
    'Maple Island',
    'Other',
    'Event',
  ];
  maps.regions.sort((a, b) => {
    const ai = regionOrder.indexOf(a.region);
    const bi = regionOrder.indexOf(b.region);
    if (ai === -1 && bi === -1) return a.region.localeCompare(b.region);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  // Build reverse lookup: mapId -> [{id, name, thumbnail, count, level, ...}]
  const mapMobs = new Map();
  if (monsters && monsters.monsters) {
    for (const mob of monsters.monsters) {
      if (!mob.maps) continue;
      for (const m of mob.maps) {
        if (!mapMobs.has(m.id)) mapMobs.set(m.id, []);
        mapMobs.get(m.id).push({
          id: mob.id,
          name: mob.name,
          thumbnail: mob.thumbnail,
          count: m.count,
          exp: mob.exp || 0,
          mobTime: m.mob_time ?? null,
          level: mob.level ?? 0,
        });
      }
    }
    for (const mobs of mapMobs.values()) {
      mobs.sort((a, b) => b.count - a.count);
    }
  }
  // Expose all maps and mob data for tooltips
  window._allMapsCache = maps;
  // Convert mapMobs to a plain object for tooltip.js
  window._mapMobsCache = {};
  for (const [k, v] of mapMobs.entries()) {
    window._mapMobsCache[String(k)] = v;
  }

  let searchQuery = '';
  let autoExpandAfterId = null;
  let renderGen = 0;
  let selfNavigate = null;
  const searchBox = makeSearchBox('Search by name, mob, or NPC...', (value) => {
    searchQuery = value;
    renderData();
  });
  container.appendChild(searchBox);

  if (options.setNavigate) {
    const navigateFn = (target) => {
      const nextFilter = typeof target === 'object' && target && target.id != null
        ? `id:${target.id}`
        : String(target || '');
      autoExpandAfterId = (typeof target === 'object' && target && target.id != null && target.autoExpand)
        ? target.id
        : parseMapIdFilter(nextFilter);
      searchQuery = nextFilter;
      searchBox._input.value = nextFilter;
      selectedRegion = null;
                                                                renderData();
      window.scrollTo(0, 0);
    };
    selfNavigate = navigateFn;
    options.setNavigate(navigateFn);
  }



  const dataDiv = el('div');
  container.appendChild(dataDiv);

  let selectedRegion = null;

    async function renderDetailRow(mapEntry, colSpan) {
      const tr = el('tr', { className: 'map-detail-row' });
      const td = el('td', { colSpan: String(colSpan) });


      const panel = el('div', { className: 'map-detail-panel' });

      // --- Full map image preview with portal overlays ---
      if (mapEntry.id) {
        const mapImgPath = `data/maps/${String(mapEntry.id).padStart(9, '0')}.img.png`;
        const imgContainer = el('div', { className: 'full-map-image-container', style: { position: 'relative', display: 'inline-block' } });
        const img = el('img', {
          className: 'full-map-image',
          src: mapImgPath,
          alt: `${mapEntry.name || 'Map'} full image`,
          loading: 'lazy',
          style: { maxWidth: '100%', maxHeight: '600px', display: 'block' },
        });
        img.title = 'Click to view fullscreen';
        img.addEventListener('click', (e) => {
          if (window.openImageModal) {
            window.openImageModal(mapImgPath, img.alt);
          }
        });
        imgContainer.appendChild(img);

        // Overlay portals after image loads, using portals.json
        img.addEventListener('load', async () => {
          // Remove any old overlays
          const oldOverlays = imgContainer.querySelectorAll('.portal-overlay');
          oldOverlays.forEach(el => el.remove());
          // Fetch all portals.json once and cache
          if (!window._allPortalsCache) {
            try {
              const res = await fetch('data/maps/portals.json');
              if (res.ok) {
                window._allPortalsCache = await res.json();
              } else {
                window._allPortalsCache = {};
              }
            } catch {
              window._allPortalsCache = {};
            }
          }
          const allPortals = window._allPortalsCache || {};
          const portals = allPortals[String(mapEntry.id).padStart(9, '0')] || [];
          if (!Array.isArray(portals) || portals.length === 0) return;
          // Get image display size and scale
          const naturalW = img.naturalWidth, naturalH = img.naturalHeight;
          const displayW = img.width, displayH = img.height;
          const scaleX = displayW / naturalW;
          const scaleY = displayH / naturalH;
          portals.forEach(portal => {
            // Use exported x/y (canvas-relative)
            const px = portal.x * scaleX;
            const py = portal.y * scaleY;
            // Style: intra-map = green, inter-map = blue
            const isIntra = portal.intra_map;
            const borderColor = isIntra ? '#2ecc40' : '#3af';
            const bgColor = isIntra ? 'rgba(46,204,64,0.18)' : 'rgba(0,120,255,0.18)';
            const boxShadow = isIntra ? '0 0 8px 2px #2ecc4066' : '0 0 8px 2px #3af6';
            const hoverShadow = isIntra ? '0 0 16px 4px #2ecc40bb' : '0 0 16px 4px #fff8';
            const overlay = el('div', {
              className: 'portal-overlay',
              style: {
                position: 'absolute',
                left: `${px - 18}px`,
                top: `${py - 18}px`,
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                border: `2.5px solid ${borderColor}`,
                background: bgColor,
                boxShadow,
                cursor: 'pointer',
                zIndex: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'box-shadow 0.2s',
              },
            });
            // Attach custom tooltip for portal overlays
            if (isIntra) {
              attachTooltip(overlay, () => ({ portal: { is_intra: true } }), 'portal');
            } else {
              attachTooltip(overlay, () => ({ portal, mapEntry, mobs: mapMobs.get(mapEntry.id) }), 'portal');
            }
            overlay.addEventListener('mouseenter', () => {
              overlay.style.boxShadow = hoverShadow;
            });
            overlay.addEventListener('mouseleave', () => {
              overlay.style.boxShadow = boxShadow;
            });
            overlay.addEventListener('click', (e) => {
              e.stopPropagation();
              // Hide tooltip immediately on navigation
              hideItemTooltip();
              // Optionally, navigate to the destination map if available
              if (!isIntra && portal.dest_map && selfNavigate) {
                selfNavigate({ id: Number(portal.dest_map), autoExpand: true });
              }
            });
            // Label (arrow or name)
            const label = el('span', {
              style: {
                color: isIntra ? '#2ecc40' : '#fff', fontWeight: 'bold', fontSize: '15px', textShadow: '0 1px 6px #000b', pointerEvents: 'none',
              },
              textContent: isIntra ? '⟳' : (portal.dest_name ? '→' : portal.name || ''),
            });
            overlay.appendChild(label);
            imgContainer.appendChild(overlay);
          });
        });

        panel.appendChild(imgContainer);
      }

      // Metadata chips
      const hasMeta = mapEntry.bgm || mapEntry.mob_rate != null || mapEntry.return_map_name;
      if (hasMeta) {
        const meta = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '12px', marginBottom: '8px' } });
        const tag = (label, value) => {
          const chip = el('div', {
            style: {
              display: 'flex', gap: '4px', alignItems: 'center',
              padding: '2px 7px', borderRadius: '4px',
              border: '1px solid var(--border)',
              background: 'var(--surface3, rgba(255,255,255,0.04))',
            },
          });
          chip.appendChild(el('span', { style: { color: 'var(--dim)' }, textContent: label }));
          chip.appendChild(el('span', { textContent: value }));
          return chip;
        };
        if (mapEntry.bgm) meta.appendChild(tag('BGM', mapEntry.bgm.replace('Bgm', '').replace('/', ' / ')));
        if (mapEntry.mob_rate != null) meta.appendChild(tag('Mob Rate', `×${mapEntry.mob_rate}`));
        if (mapEntry.return_map_name) meta.appendChild(tag('Return', mapEntry.return_map_name));
        panel.appendChild(meta);
      }

      // Exits (connected maps)
      if (Array.isArray(mapEntry.exit_names) && mapEntry.exit_names.length > 0) {
        const exitsGrid = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' } });
        for (const exit of mapEntry.exit_names) {
          const chip = el('div', {
            style: {
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '3px 9px', borderRadius: '6px',
              background: 'var(--surface3, rgba(255,255,255,0.05))',
              border: '1px solid var(--border)', fontSize: '13px',
              cursor: 'pointer',
            },
            title: `Go to map: ${exit.name}`,
          });
          chip.appendChild(el('span', { style: { color: 'var(--dim)', fontSize: '11px' }, textContent: '→' }));
          chip.appendChild(el('span', { textContent: exit.name || `Map #${exit.id}` }));
          chip.appendChild(el('span', { style: { color: 'var(--dim)', fontSize: '11px', marginLeft: '2px' }, textContent: `#${exit.id}` }));
          chip.addEventListener('click', (e) => {
            e.stopPropagation();
            if (selfNavigate) selfNavigate({ id: exit.id, autoExpand: true });
          });
          exitsGrid.appendChild(chip);
        }
        panel.appendChild(el('div', { style: { fontWeight: 'bold', margin: '0 0 4px 0', fontSize: '13px' }, textContent: 'Leads to:' }));
        panel.appendChild(exitsGrid);
      }

      // Mob spawns
      const mobs = mapMobs.get(mapEntry.id);
      // Build a lookup for full monster data by id
      const monsterById = new Map((monsters?.monsters || []).map(mob => [String(mob.id), mob]));
      if (!mobs || mobs.length === 0) {
        panel.appendChild(el('span', { style: { fontSize: '13px', color: 'var(--dim)' }, textContent: 'No mob spawns' }));
      } else {
        const grid = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } });
        for (const mob of mobs) {
          const chip = el('div', {
            style: {
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '4px 8px 4px 4px', borderRadius: '6px',
              background: 'var(--surface3, rgba(255,255,255,0.05))',
              border: '1px solid var(--border)', fontSize: '13px',
            },
          });
          chip.appendChild(makeThumbnail(mob.thumbnail, mob.name, { className: 'mob-mini-thumb', fallbackText: 'MOB' }));
          chip.appendChild(el('span', { textContent: mob.name || `#${mob.id}` }));
          chip.appendChild(el('span', { style: { color: 'var(--dim)', marginLeft: '2px' }, textContent: `×${mob.count}` }));
          const DEFAULT_SPAWN = 7.56;
          const timerColor = mob.mobTime == null ? 'var(--dim)'
            : mob.mobTime < DEFAULT_SPAWN ? '#9ece6a'
            : mob.mobTime > DEFAULT_SPAWN ? '#f7768e'
            : 'var(--dim)';
          chip.appendChild(el('span', {
            style: { color: timerColor, marginLeft: '4px', fontSize: '11px' },
            textContent: `⏱ ${mob.mobTime != null ? formatSpawnTime(mob.mobTime) : '—'}`,
          }));
          // Use full monster data for tooltip if available
          attachTooltip(chip, () => monsterById.get(String(mob.id)) || mob, 'mob');
          if (onMobClick) {
            chip.style.cursor = 'pointer';
            chip.classList.add('mob-chip-clickable');
            chip.addEventListener('click', (e) => {
              e.stopPropagation();
              onMobClick(mob.id);
            }, true);
          }
          grid.appendChild(chip);
        }
        panel.appendChild(grid);
      }

      // --- NPCs on this map ---
      if (Array.isArray(mapEntry.npcs) && mapEntry.npcs.length > 0) {
        const npcGrid = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' } });
        const lookup = await getNpcLookup();
        for (const npcId of mapEntry.npcs) {
          const npc = lookup.get(Number(npcId));
          const chip = el('div', {
            style: {
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '4px 8px 4px 4px', borderRadius: '6px',
              background: 'var(--surface3, rgba(255,255,255,0.05))',
              border: '1px solid var(--border)', fontSize: '13px',
            },
          });
          if (npc?.thumbnail) {
            chip.appendChild(el('img', {
              src: normalizeAssetPath(npc.thumbnail),
              style: { width: '32px', height: '32px', objectFit: 'contain', borderRadius: '4px',  marginRight: '4px' },
              loading: 'lazy',
            }));
          }
          chip.appendChild(el('span', { textContent: npc?.name || `NPC #${npcId}` }));
          chip.appendChild(el('span', { style: { color: 'var(--dim)', marginLeft: '2px', fontSize: '11px' }, textContent: `#${npcId}` }));
          npcGrid.appendChild(chip);
        }
        panel.appendChild(el('div', { style: { fontWeight: 'bold', margin: '10px 0 2px 0', fontSize: '13px' }, textContent: 'NPCs on this map:' }));
        panel.appendChild(npcGrid);
      }

      td.appendChild(panel);
      tr.appendChild(td);
      return tr;
    }

  // Sort state shared across all region tables
  let sortCol = 'common_mob';
  let sortDir = 1;

  function renderRegionTable(mapsList) {
    const COL_SPAN = 7;
    const wrapper = el('div', { style: { overflowX: 'auto' } });
    const table = el('table', { className: 'data-table' });

    // Pre-compute mob stats for every entry so sorting is O(1) per row
    const mobStats = new Map();
    for (const mapEntry of mapsList) {
      const mobs = mapMobs.get(mapEntry.id);
      if (mobs && mobs.length > 0) {
        const mobRate = mapEntry.mob_rate ?? 1;
        const totalCount = mobs.reduce((s, m) => s + m.count, 0);
        const totalExp = mobs.reduce((s, m) => s + m.exp * m.count, 0);
        const weightedExpPerHour = Math.round(
          mobs.reduce((s, m) => s + m.exp * m.count * mobRate * (3600 / getAvgSpawnTime(m.mobTime)), 0)
        );
        // Weighted average mob level
        const weightedLevel = totalCount > 0 ? (mobs.reduce((s, m) => s + (m.level ?? 0) * m.count, 0) / totalCount) : null;
        // Most common mob (by count)
        const mostCommonMob = mobs.reduce((a, b) => (a.count > b.count ? a : b), mobs[0]);
        mobStats.set(mapEntry.id, {
          unique: mobs.length,
          total: totalCount,
          expPerMob: totalCount > 0 ? Math.round(totalExp / totalCount) : 0,
          totalExp,
          weightedExpPerHour,
          weightedLevel,
          mostCommonMobLevel: mostCommonMob.level ?? null,
          mostCommonMobName: mostCommonMob.name ?? '',
          mostCommonMobCount: mostCommonMob.count ?? 0,
        });
      }
    }

    const COLS = [
      { id: 'name', label: 'Map', cls: '', sortVal: m => (m.name || '').toLowerCase() },
      ...allCols.filter(col => colState[col.id]).map(col => {
        // Provide sortVal and tooltip for each column
        if (col.id === 'mobs') return { ...col, cls: 'num', sortVal: m => mobStats.get(m.id)?.total ?? -1 };
        if (col.id === 'weighted_level') return { ...col, cls: 'num', sortVal: m => mobStats.get(m.id)?.weightedLevel ?? -1, tooltip: 'Weighted average mob level' };
        if (col.id === 'common_mob') return {
          ...col,
          cls: 'num',
          sortVal: m => mobStats.get(m.id)?.mostCommonMobLevel ?? -1,
          tooltip: 'Most common mob (Name Lv. X), sorted by level',
        };
        if (col.id === 'exp_per_mob') return { ...col, cls: 'num', sortVal: m => mobStats.get(m.id)?.expPerMob ?? -1 };
        if (col.id === 'total_exp') return { ...col, cls: 'num', sortVal: m => mobStats.get(m.id)?.totalExp ?? -1, tooltip: 'Sum of the EXP of all mobs on this map at max capacity' };
        if (col.id === 'weighted_exp_hour') return { ...col, cls: 'num', sortVal: m => mobStats.get(m.id)?.weightedExpPerHour ?? -1, tooltip: 'Mob spawn-time adjusted and map mob-rate adjusted EXP per hour' };
        return col;
      })
    ];

    const thead = el('thead');
    const headRow = el('tr');
    headRow.appendChild(el('th', { className: 'thumb-col' }));

    COLS.forEach((col) => {
      const active = sortCol === col.id;
      const th = el('th', {
        className: col.cls,
        style: {
          cursor: 'pointer',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        },
      });
      const labelSpan = el('span', { textContent: active ? `${col.label} ${sortDir === 1 ? '▲' : '▼'}` : col.label });
      th.appendChild(labelSpan);
      if (col.tooltip) {
        const badge = el('span', {
          className: 'col-tooltip-badge',
          textContent: '?',
          title: col.tooltip,
        });
        badge.addEventListener('click', (e) => e.stopPropagation());
        th.appendChild(badge);
      }
      th.addEventListener('click', () => {
        if (sortCol === col.id) {
          sortDir *= -1;
        } else {
          sortCol = col.id;
          sortDir = col.cls === 'num' ? -1 : 1; // nums default descending
        }
        rebuildTable();
      });
      headRow.appendChild(th);
    });
    // Always add ID column at the end
    headRow.appendChild(el('th', { className: 'num id-col', textContent: 'ID' }));

    thead.appendChild(headRow);
    table.appendChild(thead);

    function buildRows(list) {
      // Sort
      const sorted = [...list];
      if (sortCol) {
        const col = COLS.find(c => c.id === sortCol);
        if (col) {
          sorted.sort((a, b) => {
            const av = col.sortVal(a), bv = col.sortVal(b);
            if (typeof av === 'string') return sortDir * (av < bv ? -1 : av > bv ? 1 : 0);
            return sortDir * (av - bv);
          });
        }
      }

      const tbody = el('tbody');
      for (const mapEntry of sorted) {
        const mobs = mapMobs.get(mapEntry.id);
        const stats = mobStats.get(mapEntry.id);
        const hasDetail = !!stats || mapEntry.bgm || mapEntry.mob_rate != null || mapEntry.return_map_name;

        const tr = el('tr', { style: { cursor: hasDetail ? 'pointer' : 'default' } });

        // Thumbnail
        const thumbTd = el('td', { className: 'thumb-col', style: { fontSize: '13px', fontWeight: '400', color: 'var(--fg)' } });
        thumbTd.appendChild(
          makeThumbnail(mapEntry.thumbnail || mapEntry.minimap, `${mapEntry.name} thumbnail`, {
            className: 'map-thumb',
            fallbackText: 'MAP',
          })
        );
        tr.appendChild(thumbTd);

        // Name
        const nameTd = el('td', { style: { fontSize: '13px', fontWeight: '400', color: 'var(--fg)' } });
        const nameWrap = el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } });
        const nameLeft = el('span', { style: { display: 'flex', alignItems: 'center', minWidth: '0' } });
        nameLeft.appendChild(el('span', { style: { fontSize: '14px' }, textContent: mapEntry.name || '(unnamed)' }));
        if (mapEntry.is_town) {
          nameLeft.appendChild(el('span', {
            style: {
              fontSize: '11px', fontWeight: '600', letterSpacing: '0.04em',
              color: 'var(--accent, #7aa2f7)', background: 'rgba(122,162,247,0.12)',
              border: '1px solid rgba(122,162,247,0.3)', borderRadius: '4px',
              padding: '1px 5px', marginLeft: '7px', verticalAlign: 'middle',
            },
            textContent: 'TOWN',
          }));
        }
        if (mapEntry.street_name) {
          nameLeft.appendChild(
            el('span', {
              style: { fontSize: '12px', color: 'var(--dim)', marginLeft: '8px' },
              textContent: `— ${mapEntry.street_name}`,
            })
          );
        }
        nameWrap.appendChild(nameLeft);
        nameWrap.appendChild(makeDeepLinkButton('maps', mapEntry.id));
        nameTd.appendChild(nameWrap);
        tr.appendChild(nameTd);

        // Render columns dynamically
        for (const col of COLS.slice(1)) { // skip name col
          let td;
          const baseStyle = { fontSize: '13px', fontWeight: '400', color: 'var(--fg)' };
          if (col.cls && col.cls.includes('num')) baseStyle.textAlign = 'right';
          switch (col.id) {
            case 'mobs':
              td = el('td', { className: 'num', style: baseStyle });
              if (stats) {
                td.appendChild(el('div', { textContent: `${stats.unique} unique` }));
                td.appendChild(el('div', { style: { color: 'var(--dim)', fontSize: '12px' }, textContent: `${stats.total} total` }));
              } else {
                td.appendChild(el('span', { style: { color: 'var(--dim)' }, textContent: '—' }));
              }
              break;
            case 'weighted_level':
              td = el('td', { className: 'num', style: baseStyle });
              td.textContent = stats && stats.weightedLevel != null ? Math.round(stats.weightedLevel) : '—';
              break;
            case 'common_mob':
              td = el('td', { style: baseStyle });
              if (stats && stats.mostCommonMobLevel != null && stats.mostCommonMobName) {
                td.appendChild(document.createTextNode(stats.mostCommonMobName + ' '));
                const badge = el('span', { className: 'level-badge', textContent: `Lv. ${stats.mostCommonMobLevel}` });
                td.appendChild(badge);
              } else if (stats && stats.mostCommonMobName) {
                td.textContent = stats.mostCommonMobName;
              } else {
                td.textContent = '—';
              }
              break;
            case 'exp_per_mob':
              td = el('td', { className: 'num', style: baseStyle });
              td.textContent = stats ? stats.expPerMob.toLocaleString() : '';
              if (!stats) td.appendChild(el('span', { style: { color: 'var(--dim)' }, textContent: '—' }));
              break;
            case 'total_exp':
              td = el('td', { className: 'num', style: baseStyle });
              td.textContent = stats ? stats.totalExp.toLocaleString() : '';
              if (!stats) td.appendChild(el('span', { style: { color: 'var(--dim)' }, textContent: '—' }));
              break;
            case 'weighted_exp_hour':
              td = el('td', { className: 'num', style: baseStyle });
              td.textContent = stats ? stats.weightedExpPerHour.toLocaleString() : '—';
              break;
            default:
              td = el('td', { style: baseStyle });
              td.textContent = '—';
          }
          tr.appendChild(td);
        }

        // Always show ID at the end, like monsters tab
        const idTd = el('td', { className: 'num id-col', style: { fontSize: '13px', fontWeight: '400', color: 'var(--fg)' } });
        idTd.appendChild(el('span', { className: 'id', textContent: mapEntry.id }));
        tr.appendChild(idTd);

        // Expand detail on click
        let detailTr = null;
        let expanded = false;
        tr.addEventListener('click', async (e) => {
          if (e.target.closest('.thumb')) return;
          if (!hasDetail) return;
          expanded = !expanded;
          if (expanded) {
            if (!detailTr) {
              detailTr = await renderDetailRow(mapEntry, COL_SPAN);
              tr.after(detailTr);
            } else {
              detailTr.style.display = '';
            }
            tr.classList.add('expanded');
            // Improved: Wait for DOM update and images to load before scrolling
            const scrollToRow = () => {
              requestAnimationFrame(() => {
                const header = document.querySelector('.site-header');
                const headerHeight = header ? header.offsetHeight : 64;
                const trRect = tr.getBoundingClientRect();
                const scrollY = window.scrollY + trRect.top - headerHeight;
                window.scrollTo({
                  top: scrollY,
                  behavior: "smooth"
                });
              });
            };
            // If there are images in the detail row, wait for them to load
            const imgs = detailTr.querySelectorAll('img');
            if (imgs.length > 0) {
              let loaded = 0;
              let fired = false;
              imgs.forEach(img => {
                if (img.complete) {
                  loaded++;
                } else {
                  img.addEventListener('load', () => {
                    loaded++;
                    if (loaded === imgs.length && !fired) {
                      fired = true;
                      scrollToRow();
                    }
                  }, { once: true });
                  img.addEventListener('error', () => {
                    loaded++;
                    if (loaded === imgs.length && !fired) {
                      fired = true;
                      scrollToRow();
                    }
                  }, { once: true });
                }
              });
              if (loaded === imgs.length && !fired) {
                fired = true;
                scrollToRow();
              }
            } else {
              scrollToRow();
            }
          } else {
            if (detailTr) detailTr.style.display = 'none';
            tr.classList.remove('expanded');
          }
        });

        tbody.appendChild(tr);
      }
      return tbody;
    }

    let tbody = buildRows(mapsList);
    table.appendChild(tbody);

    function rebuildTable() {
      // Rebuild headers with updated sort indicators
      headRow.querySelectorAll('th:not(.thumb-col)').forEach((th, i) => {
        const col = COLS[i];
        if (!col) return; // Guard: skip if column is undefined
        const active = sortCol === col.id;
        const labelSpan = th.querySelector('span:first-child') || th;
        labelSpan.textContent = active ? `${col.label} ${sortDir === 1 ? '▲' : '▼'}` : col.label;
      });
      const newTbody = buildRows(mapsList);
      table.replaceChild(newTbody, tbody);
      tbody = newTbody;
    }

    wrapper.appendChild(table);
    return wrapper;
  }

    async function renderData() {
      const gen = ++renderGen;
      dataDiv.innerHTML = '';
      const sq = searchQuery.toLowerCase();
      const exactId = parseMapIdFilter(searchQuery);
      const npcLookup = await getNpcLookup();
      if (gen !== renderGen) return;
      let regions = selectedRegion
        ? maps.regions.filter((r) => r.region === selectedRegion)
        : maps.regions;
      regions.forEach((region) => {
        let filtered;
        if (exactId != null) {
          // Always include the map with exactId, even if it has no mobs
          filtered = region.maps.filter((m) => Number(m.id) === exactId);
        } else if (sq) {
          filtered = region.maps.filter((m) => {
            // Match map name or street name
            if ((m.name || '').toLowerCase().includes(sq) || (m.street_name || '').toLowerCase().includes(sq)) {
              return true;
            }
            // Match mob names that spawn on this map
            const mobs = mapMobs.get(m.id);
            if (mobs && mobs.some(mob => (mob.name || '').toLowerCase().includes(sq))) {
              return true;
            }
            // Match NPC names on this map
            if (Array.isArray(m.npcs) && m.npcs.length > 0) {
              for (const npcId of m.npcs) {
                const npc = npcLookup.get(Number(npcId));
                if ((npc?.name || '').toLowerCase().includes(sq)) {
                  return true;
                }
              }
            }
            return false;
          });
        } else {
          filtered = region.maps;
        }
        // If deeplinked (exactId), ignore hideNoMobs filter
        if (hideNoMobs && exactId == null) {
          filtered = filtered.filter((m) => {
            const mobs = mapMobs.get(m.id);
            return mobs && mobs.length > 0;
          });
        }
        if (!filtered.length) return;
        const collapsible = makeCollapsible(region.region, filtered.length, true, null, () => renderRegionTable(filtered));
        dataDiv.appendChild(collapsible);
      });

      if (!dataDiv.children.length) {
        dataDiv.appendChild(
          el('p', {
            style: { color: 'var(--dim)', padding: '20px', textAlign: 'center' },
            textContent: 'No maps match your filters.',
          })
        );
      }

      if (autoExpandAfterId != null) {
        setTimeout(() => {
          const rows = dataDiv.querySelectorAll('tr');
          for (const row of rows) {
            const idCell = row.querySelector('.id-col .id');
            if (idCell && Number(idCell.textContent) === autoExpandAfterId) {
              row.click();
              // Scroll the detail row into view after it is expanded
              setTimeout(() => {
                const detailRow = row.nextElementSibling;
                if (detailRow && detailRow.classList.contains('map-detail-row')) {
                  detailRow.scrollIntoView({ behavior: "smooth", block: "center" });
                }
              }, 100);
              autoExpandAfterId = null;
              break;
            }
          }
        }, 300);
      }
    }



  renderData();
  return container;
}
