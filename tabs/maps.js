import { el, makeCollapsible, makeThumbnail, makeSearchBox } from '../lib/utils.js';

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

export function renderMaps(data) {
  const { maps, monsters } = data;
  const container = el('div');
  container.appendChild(
    el('div', {
      className: 'count-text',
      textContent: `${maps.total} maps across ${maps.regions.length} regions`,
    })
  );

  // Build reverse lookup: mapId -> [{id, name, thumbnail, count}]
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
        });
      }
    }
    for (const mobs of mapMobs.values()) {
      mobs.sort((a, b) => b.count - a.count);
    }
  }

  let searchQuery = '';
  container.appendChild(
    makeSearchBox('Search maps...', (value) => {
      searchQuery = value;
      renderData();
    })
  );

  // Pills
  const pillRow = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '16px 0 8px 0', alignItems: 'center' } });
  const allTab = el('button', { className: 'pill active', textContent: 'All' });
  pillRow.appendChild(allTab);
  const regionTabs = maps.regions.map((region) => {
    const btn = el('button', { className: 'pill', textContent: region.region });
    pillRow.appendChild(btn);
    return btn;
  });
  container.appendChild(pillRow);

  const dataDiv = el('div');
  container.appendChild(dataDiv);

  let selectedRegion = null;

  function renderDetailRow(mapEntry, colSpan) {
    const tr = el('tr', { className: 'map-detail-row' });
    const td = el('td', { colSpan: String(colSpan) });

    const panel = el('div', { className: 'map-detail-panel' });

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

    // Mob spawns
    const mobs = mapMobs.get(mapEntry.id);
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
        const DEFAULT_SPAWN = 7.65;
        const timerColor = mob.mobTime == null ? 'var(--dim)'
          : mob.mobTime < DEFAULT_SPAWN ? '#9ece6a'
          : mob.mobTime > DEFAULT_SPAWN ? '#f7768e'
          : 'var(--dim)';
        chip.appendChild(el('span', {
          style: { color: timerColor, marginLeft: '4px', fontSize: '11px' },
          textContent: `⏱ ${mob.mobTime != null ? formatSpawnTime(mob.mobTime) : '—'}`,
        }));
        grid.appendChild(chip);
      }
      panel.appendChild(grid);
    }

    td.appendChild(panel);
    tr.appendChild(td);
    return tr;
  }

  // Sort state shared across all region tables
  let sortCol = null;
  let sortDir = 1;

  function renderRegionTable(mapsList) {
    const COL_SPAN = 6;
    const wrapper = el('div', { style: { overflowX: 'auto' } });
    const table = el('table', { className: 'data-table' });

    // Pre-compute mob stats for every entry so sorting is O(1) per row
    const mobStats = new Map();
    for (const mapEntry of mapsList) {
      const mobs = mapMobs.get(mapEntry.id);
      if (mobs && mobs.length > 0) {
        const totalCount = mobs.reduce((s, m) => s + m.count, 0);
        const totalExp = mobs.reduce((s, m) => s + m.exp * m.count, 0);
        mobStats.set(mapEntry.id, {
          unique: mobs.length,
          total: totalCount,
          expPerMob: totalCount > 0 ? Math.round(totalExp / totalCount) : 0,
          totalExp,
        });
      }
    }

    const COLS = [
      { id: 'name',       label: 'Map',       cls: '',    sortVal: m => (m.name || '').toLowerCase() },
      { id: 'mobs',       label: 'Mobs',      cls: 'num', sortVal: m => mobStats.get(m.id)?.total ?? -1 },
      { id: 'exp_per_mob',label: 'Exp / Mob', cls: 'num', sortVal: m => mobStats.get(m.id)?.expPerMob ?? -1 },
      { id: 'total_exp',  label: 'Total Exp', cls: 'num', sortVal: m => mobStats.get(m.id)?.totalExp ?? -1 },
      { id: 'id',         label: 'ID',        cls: 'num', sortVal: m => m.id },
    ];

    const thead = el('thead');
    const headRow = el('tr');
    headRow.appendChild(el('th', { className: 'thumb-col' }));

    COLS.forEach((col) => {
      const active = sortCol === col.id;
      const th = el('th', {
        className: col.cls,
        style: { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' },
        textContent: active ? `${col.label} ${sortDir === 1 ? '▲' : '▼'}` : col.label,
      });
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
        const thumbTd = el('td', { className: 'thumb-col' });
        thumbTd.appendChild(
          makeThumbnail(mapEntry.thumbnail || mapEntry.minimap, `${mapEntry.name} thumbnail`, {
            className: 'map-thumb',
            fallbackText: 'MAP',
          })
        );
        tr.appendChild(thumbTd);

        // Name
        const nameTd = el('td');
        nameTd.appendChild(el('span', { style: { fontSize: '14px' }, textContent: mapEntry.name || '(unnamed)' }));
        if (mapEntry.is_town) {
          nameTd.appendChild(el('span', {
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
          nameTd.appendChild(
            el('span', {
              style: { fontSize: '12px', color: 'var(--dim)', marginLeft: '8px' },
              textContent: `— ${mapEntry.street_name}`,
            })
          );
        }
        tr.appendChild(nameTd);

        // Mobs
        const mobTd = el('td', { className: 'num' });
        if (stats) {
          mobTd.appendChild(el('div', { textContent: `${stats.unique} unique` }));
          mobTd.appendChild(el('div', { style: { color: 'var(--dim)', fontSize: '12px' }, textContent: `${stats.total} total` }));
        } else {
          mobTd.appendChild(el('span', { style: { color: 'var(--dim)' }, textContent: '—' }));
        }
        tr.appendChild(mobTd);

        // Exp / Mob
        const expPerMobTd = el('td', { className: 'num' });
        expPerMobTd.textContent = stats ? stats.expPerMob.toLocaleString() : '';
        if (!stats) expPerMobTd.appendChild(el('span', { style: { color: 'var(--dim)' }, textContent: '—' }));
        tr.appendChild(expPerMobTd);

        // Total Exp
        const totalExpTd = el('td', { className: 'num' });
        totalExpTd.textContent = stats ? stats.totalExp.toLocaleString() : '';
        if (!stats) totalExpTd.appendChild(el('span', { style: { color: 'var(--dim)' }, textContent: '—' }));
        tr.appendChild(totalExpTd);

        // ID
        const idTd = el('td', { className: 'num' });
        idTd.appendChild(el('span', { className: 'id', textContent: mapEntry.id }));
        tr.appendChild(idTd);

        // Expand detail on click
        let detailTr = null;
        let expanded = false;
        tr.addEventListener('click', (e) => {
          if (e.target.closest('.thumb')) return;
          if (!hasDetail) return;
          expanded = !expanded;
          if (expanded) {
            if (!detailTr) {
              detailTr = renderDetailRow(mapEntry, COL_SPAN);
              tr.after(detailTr);
            } else {
              detailTr.style.display = '';
            }
            tr.classList.add('expanded');
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
        const active = sortCol === col.id;
        th.textContent = active ? `${col.label} ${sortDir === 1 ? '▲' : '▼'}` : col.label;
      });
      const newTbody = buildRows(mapsList);
      table.replaceChild(newTbody, tbody);
      tbody = newTbody;
    }

    wrapper.appendChild(table);
    return wrapper;
  }

  function renderData() {
    dataDiv.innerHTML = '';
    const sq = searchQuery.toLowerCase();
    let regions = selectedRegion
      ? maps.regions.filter((r) => r.region === selectedRegion)
      : maps.regions;
    regions.forEach((region) => {
      const filtered = sq
        ? region.maps.filter(
            (m) =>
              (m.name || '').toLowerCase().includes(sq) ||
              (m.street_name || '').toLowerCase().includes(sq)
          )
        : region.maps;
      if (!filtered.length) return;
      dataDiv.appendChild(
        makeCollapsible(region.region, filtered.length, true, null, () => renderRegionTable(filtered))
      );
    });
  }

  // Tab event listeners
  allTab.addEventListener('click', () => {
    selectedRegion = null;
    allTab.classList.add('active');
    regionTabs.forEach((btn) => btn.classList.remove('active'));
    renderData();
  });
  regionTabs.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      selectedRegion = maps.regions[idx].region;
      allTab.classList.remove('active');
      regionTabs.forEach((b, i) => b.classList.toggle('active', i === idx));
      btn.classList.add('active');
      regionTabs.forEach((b, i) => { if (i !== idx) b.classList.remove('active'); });
      renderData();
    });
  });

  renderData();
  return container;
}
