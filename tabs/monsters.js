import { el, fmt, matchSearch, makeSearchBox, makeThumbnail, normalizeAssetPath, makeDeepLinkButton } from '../lib/utils.js';
import { loadState, saveState } from '../lib/data.js';

const _savedState = loadState();

const ELEMENT_CLASSES = {
  Immune: 'immune',
  Resist: 'resist',
  Weak: 'weak',
  Strong: 'strong',
};

function getMonsterElements(monster) {
  if (!monster || !monster.elements || typeof monster.elements !== 'object') {
    return [];
  }
  return Object.entries(monster.elements).map(([name, effect]) => ({
    name,
    effect,
    cls: ELEMENT_CLASSES[effect] || '',
  }));
}

function buildDetailRow(monster, colSpan, onMapClick) {
  const detailTr = el('tr', { className: 'monster-detail-row' });
  const detailTd = el('td', { colSpan: String(colSpan) });

  const panel = el('div', { className: 'monster-detail-panel' });

  // ── Header ──────────────────────────────────────────────────
  const header = el('div', { className: 'monster-detail-header' });
  const STATE_ORDER = ['stand', 'move', 'fly', 'jump', 'attack1', 'attack2', 'attack3', 'skill1', 'hit1', 'die1'];
  const STATE_LABEL = { stand: 'Stand', move: 'Move', fly: 'Fly', jump: 'Jump', attack1: 'Atk 1', attack2: 'Atk 2', attack3: 'Atk 3', skill1: 'Skill', hit1: 'Hit', die1: 'Die' };

  const gifs = monster.gifs || {};
  const availableStates = STATE_ORDER.filter(s => gifs[s]);
  const defaultSrc = normalizeAssetPath(
    gifs['move'] || (availableStates.length > 0 ? gifs[availableStates[0]] : null) || monster.gif || monster.thumbnail
  );

  const headerLeft = el('div', { className: 'monster-detail-header-left' });

  // Animation display
  const animWrap = el('div', { className: 'monster-anim-wrap' });
  let gifImg;
  if (defaultSrc) {
    gifImg = el('img', { src: defaultSrc, className: 'monster-detail-gif' });
    animWrap.appendChild(gifImg);
  } else {
    gifImg = null;
    animWrap.appendChild(el('div', { className: 'monster-detail-gif monster-detail-gif-fallback', textContent: 'MOB' }));
  }

  // Animation picker tabs (only if multiple states exist)
  if (availableStates.length > 1) {
    const tabs = el('div', { className: 'monster-anim-tabs' });
    let activeState = availableStates.includes('move') ? 'move' : availableStates[0];
    availableStates.forEach(state => {
      const tab = el('button', {
        className: `monster-anim-tab${state === activeState ? ' active' : ''}`,
        textContent: STATE_LABEL[state] || state,
      });
      tab.addEventListener('click', () => {
        activeState = state;
        tabs.querySelectorAll('.monster-anim-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        if (gifImg) gifImg.src = normalizeAssetPath(gifs[state]);
      });
      tabs.appendChild(tab);
    });
    animWrap.appendChild(tabs);
  }

  headerLeft.appendChild(animWrap);
  headerLeft.appendChild(el('span', { className: 'monster-detail-name', textContent: monster.name }));
  header.appendChild(headerLeft);

  const headerRight = el('div', { className: 'monster-detail-header-right' });
  if (monster.id != null) {
    headerRight.appendChild(el('span', { className: 'id', textContent: `#${monster.id}` }));
  }
  if (monster.is_boss) {
    headerRight.appendChild(el('span', { className: 'badge badge-boss', textContent: 'BOSS' }));
  }
  if (monster.undead) {
    headerRight.appendChild(
      el('span', { className: 'elem-badge elem-undead', textContent: 'Undead' })
    );
  }
  const elems = getMonsterElements(monster);
  elems.forEach((elem) => {
    headerRight.appendChild(
      el('span', { className: `elem-badge ${elem.cls}`, textContent: `${elem.name} ${elem.effect}` })
    );
  });
  header.appendChild(headerRight);
  panel.appendChild(header);

  // ── Body ────────────────────────────────────────────────────
  const body = el('div', { className: 'monster-detail-body' });

  // Stats column
  const statsCol = el('div', { className: 'monster-detail-col' });

  const statGroups = [
    {
      label: 'Base',
      stats: [
        { label: 'Level', value: monster.level, accent: true },
        { label: 'HP',    value: monster.hp },
        { label: 'MP',    value: monster.mp },
        { label: 'EXP',   value: monster.exp },
        { label: 'EXP/HP', value: monster.hp > 0 && monster.exp > 0 ? (monster.exp / monster.hp).toFixed(3) : null },
      ],
    },
    {
      label: 'Combat',
      stats: [
        { label: 'P.ATK', value: monster.PADamage },
        { label: 'P.DEF', value: monster.PDDamage },
        { label: 'M.ATK', value: monster.MADamage },
        { label: 'M.DEF', value: monster.MDDamage },
        { label: 'ACC',   value: monster.acc },
        { label: 'EVA',   value: monster.eva },
        { label: 'Speed', value: monster.speed },
      ],
    },
  ];

  statGroups.forEach(({ label, stats }) => {
    const visible = stats.filter(({ value }) => value != null && value !== 0);
    if (!visible.length) return;
    const group = el('div', { className: 'monster-stat-group' });
    group.appendChild(el('div', { className: 'monster-stat-group-label', textContent: label }));
    const grid = el('div', { className: 'monster-stat-grid' });
    visible.forEach(({ label: sLabel, value, accent }) => {
      const cell = el('div', { className: 'monster-stat-cell' });
      cell.appendChild(el('span', { className: 'monster-stat-label', textContent: sLabel }));
      cell.appendChild(
        el('span', { className: `monster-stat-value${accent ? ' accent' : ''}`, textContent: fmt(value) })
      );
      grid.appendChild(cell);
    });
    group.appendChild(grid);
    statsCol.appendChild(group);
  });

  body.appendChild(statsCol);

  // Maps column
  const spawnMaps = monster.maps || [];
  if (spawnMaps.length) {
    const mapsCol = el('div', { className: 'monster-detail-col monster-detail-col-maps' });
    mapsCol.appendChild(el('div', { className: 'monster-stat-group-label', textContent: 'Spawns In' }));
    const mapList = el('div', { className: 'monster-map-list' });
    [...spawnMaps].sort((a, b) => a.id - b.id).forEach((m) => {
      const chip = el('span', { className: 'monster-map-chip' });
      chip.appendChild(el('span', { textContent: m.name || String(m.id) }));
      chip.appendChild(el('span', { className: 'monster-map-chip-count', textContent: `×${m.count}` }));
      if (onMapClick) {
        chip.style.cursor = 'pointer';
        chip.title = `View ${m.name || `#${m.id}`} in Maps tab`;
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          onMapClick(m.id);
        });
      }
      mapList.appendChild(chip);
    });
    mapsCol.appendChild(mapList);
    body.appendChild(mapsCol);
  }

  panel.appendChild(body);
  detailTd.appendChild(panel);
  detailTr.appendChild(detailTd);
  return detailTr;
}

function parseMonsterIdFilter(query) {
  const match = /^id\s*:\s*(\d+)\s*$/i.exec((query || '').trim());
  if (!match) return null;
  return Number(match[1]);
}

export function renderMonsters(data, options = {}) {
  const { monsters } = data;
  const { onMapClick } = options;

  const allCols = [
    { id: 'level',    label: 'Lv',      on: true  },
    { id: 'hp',       label: 'HP',      on: true  },
    { id: 'mp',       label: 'MP',      on: false },
    { id: 'exp',      label: 'EXP',     on: true  },
    { id: 'exp_hp',   label: 'EXP/HP',  on: false },
    { id: 'PADamage', label: 'PATK',    on: false },
    { id: 'PDDamage', label: 'PDEF',    on: false },
    { id: 'MADamage', label: 'MATK',    on: false },
    { id: 'MDDamage', label: 'MDEF',    on: false },
    { id: 'acc',      label: 'ACC',     on: false },
    { id: 'eva',      label: 'EVA',     on: false },
    { id: 'speed',    label: 'SPD',     on: false },
    { id: 'elements', label: 'Element', on: true  },
    { id: 'undead',   label: 'Undead',  on: false },
  ];

  const colState = {};
  const monsterState = _savedState.monsters || {};
  allCols.forEach((col) => {
    colState[col.id] = monsterState.cols
      ? monsterState.cols[col.id] !== undefined
        ? monsterState.cols[col.id]
        : col.on
      : col.on;
  });

  let filter = '';
  let typeFilter = '';
  let elemWeakFilter = '';
  let sortCol = 'level';
  let sortDir = 1;
  let autoExpandAfterId = null;

  const container = el('div');
  const dataContainer = el('div');

  const topRow = el('div', {
    style: { display: 'flex', flexWrap: 'wrap', gap: '12px',  },
  });
  const searchDiv = el('div', { style: { flex: '1', minWidth: '200px' } });
  const searchBox = makeSearchBox('Search by name or map...', (value) => {
    filter = value;
    renderData();
  });
  searchDiv.appendChild(searchBox);
  topRow.appendChild(searchDiv);

  if (options.setNavigate) {
    options.setNavigate((target) => {
      const nextFilter = typeof target === 'object' && target && target.id != null
        ? `id:${target.id}`
        : String(target || '');
      autoExpandAfterId = (typeof target === 'object' && target && target.id != null && target.autoExpand)
        ? target.id
        : parseMonsterIdFilter(nextFilter);
      filter = nextFilter;
      searchBox._input.value = nextFilter;
      renderData();
      window.scrollTo(0, 0);
    });
  }

  const pills = el('div', { className: 'pill-group' });
  function rebuildPills() {
    pills.innerHTML = '';
    pills.appendChild(el('span', { className: 'pill-group-label', textContent: 'Mob Type:' }));
    [
      ['All',      ''],
      ['Non-Boss', 'nonboss'],
      ['Bosses',   'boss'],
    ].forEach(([label, value]) => {
      const pill = el('button', {
        className: `pill${typeFilter === value ? ' active' : ''}`,
        textContent: label,
      });
      pill.addEventListener('click', () => {
        typeFilter = value;
        saveState('monsters', { cols: { ...colState } });
        rebuildPills();
        renderData();
      });
      pills.appendChild(pill);
    });
  }
  rebuildPills();

  const elemPills = el('div', { className: 'pill-group' });
  function rebuildElemPills() {
    elemPills.innerHTML = '';
    const weakLabel = el('span', { className: 'pill-group-label', textContent: 'Weak to:' });
    elemPills.appendChild(weakLabel);
    [['Any', ''], ['Fire', 'Fire'], ['Ice', 'Ice'], ['Lightning', 'Lightning'], ['Holy', 'Holy']].forEach(([label, value]) => {
      const pill = el('button', {
        className: `pill${elemWeakFilter === value ? ' active' : ''}`,
        textContent: label,
      });
      pill.addEventListener('click', () => {
        elemWeakFilter = value;
        rebuildElemPills();
        renderData();
      });
      elemPills.appendChild(pill);
    });
  }
  rebuildElemPills();

  container.appendChild(topRow);

  const filterRow = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' } });
  filterRow.appendChild(pills);
  filterRow.appendChild(elemPills);
  container.appendChild(filterRow);

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
        saveState('monsters', { cols: { ...colState } });
        rebuildToggles();
        renderData();
      });
      toggles.appendChild(button);
    });
  }
  rebuildToggles();

  container.appendChild(toggles);
  container.appendChild(dataContainer);

  function renderData() {
    dataContainer.innerHTML = '';
    const visibleCols = allCols.filter((col) => colState[col.id]);
    // +3 for Name col, Tags col, and ID col
    const totalCols = visibleCols.length + 3;
    const exactId = parseMonsterIdFilter(filter);

    const filtered = monsters.monsters.filter((monster) => {
      if (exactId != null) {
        return Number(monster.id) === exactId;
      }
      if (!matchSearch(monster.name, filter) && !monster.maps?.some((m) => matchSearch(m.name, filter))) return false;
      if (typeFilter === 'boss' && !monster.is_boss) return false;
      if (typeFilter === 'nonboss' && monster.is_boss) return false;
      if (elemWeakFilter && monster.elements?.[elemWeakFilter] !== 'Weak') return false;
      return true;
    });

    dataContainer.appendChild(
      el('div', { className: 'count-text', textContent: `${filtered.length} monsters` })
    );

    if (filtered.length === 0) {
      dataContainer.appendChild(
        el('p', {
          style: { color: 'var(--dim)', padding: '20px', textAlign: 'center' },
          textContent: 'No monsters match your filters.',
        })
      );
      return;
    }

    const wrapper = el('div', { style: { overflowX: 'auto' } });
    const table = el('table', { className: 'data-table' });
    const thead = el('thead');
    const headRow = el('tr');

    const thStyle = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', fontSize: '13px', fontWeight: '500', color: 'var(--fg)', background: 'var(--surface2, #f8f8f8)' };
    const nameHeader = el('th', { style: thStyle });
    const nameLabel = el('span', { textContent: sortCol === 'name' ? `Name ${sortDir === 1 ? '▲' : '▼'}` : 'Name' });
    nameHeader.appendChild(nameLabel);
    nameHeader.addEventListener('click', () => {
      if (sortCol === 'name') {
        sortDir *= -1;
      } else {
        sortCol = 'name';
        sortDir = 1;
      }
      saveState('monsters', { cols: { ...colState } });
      renderData();
    });
    headRow.appendChild(nameHeader);

    visibleCols.forEach((col) => {
      const sortable = col.id !== 'elements';
      const th = el('th', {
        className: sortable ? 'num' : '',
        style: { ...thStyle, cursor: sortable ? 'pointer' : 'default' },
      });
      const labelSpan = el('span', { textContent: sortCol === col.id ? `${col.label} ${sortDir === 1 ? '▲' : '▼'}` : col.label });
      th.appendChild(labelSpan);
      if (sortable) {
        th.addEventListener('click', () => {
          if (sortCol === col.id) {
            sortDir *= -1;
          } else {
            sortCol = col.id;
            sortDir = 1;
          }
          saveState('monsters', { cols: { ...colState } });
          renderData();
        });
      }
      headRow.appendChild(th);
    });

    const thStyleStatic = { fontSize: '13px', fontWeight: '500', color: 'var(--fg)', background: 'var(--surface2, #f8f8f8)', whiteSpace: 'nowrap' };
    headRow.appendChild(el('th', { textContent: 'Tags', style: thStyleStatic }));
    headRow.appendChild(el('th', { className: 'num id-col', textContent: 'ID', style: thStyleStatic }));
    thead.appendChild(headRow);
    table.appendChild(thead);

    filtered.sort((a, b) => {
      let left, right;
      if (sortCol === 'name') {
        left = a.name.toLowerCase();
        right = b.name.toLowerCase();
        return sortDir * (left < right ? -1 : left > right ? 1 : 0);
      }
      if (sortCol === 'exp_hp') {
        left = a.hp > 0 && a.exp > 0 ? a.exp / a.hp : 0;
        right = b.hp > 0 && b.exp > 0 ? b.exp / b.hp : 0;
      } else {
        left = a[sortCol] || 0;
        right = b[sortCol] || 0;
      }
      return sortDir * (left - right);
    });

    const tbody = el('tbody');
    filtered.forEach((monster) => {
      const row = el('tr', { className: 'monster-row', style: { cursor: 'pointer' } });
      const tdBase = { fontSize: '13px', fontWeight: '400', color: 'var(--fg)' };
      const nameCell = el('td', { style: { ...tdBase, fontWeight: '500' } });
      const nameWrap = el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } });
      const nameLeft = el('span', { style: { display: 'flex', alignItems: 'center', gap: '8px' } });
      nameLeft.appendChild(
        makeThumbnail(monster.gif || monster.thumbnail, `${monster.name} thumbnail`, {
          className: 'monster-thumb',
          fallbackText: 'MOB',
        })
      );
      nameLeft.appendChild(el('span', { textContent: monster.name }));
      nameWrap.appendChild(nameLeft);
      if (monster.id != null) nameWrap.appendChild(makeDeepLinkButton('monsters', monster.id));
      nameCell.appendChild(nameWrap);
      row.appendChild(nameCell);

      visibleCols.forEach((col) => {
        if (col.id === 'elements') {
          const td = el('td', { style: tdBase });
          const elems = getMonsterElements(monster);
          if (elems.length) {
            elems.forEach((elem) => {
              td.appendChild(
                el('span', {
                  className: `elem-badge ${elem.cls}`,
                  textContent: `${elem.name} ${elem.effect}`,
                })
              );
            });
          } else {
            td.appendChild(
              el('span', { style: { color: 'var(--dim)', fontSize: '11px' }, textContent: '—' })
            );
          }
          row.appendChild(td);
        } else if (col.id === 'exp_hp') {
          const ratio = monster.hp > 0 && monster.exp > 0 ? monster.exp / monster.hp : 0;
          row.appendChild(
            el('td', {
              className: 'num',
              style: tdBase,
              textContent: ratio > 0 ? ratio.toFixed(3) : '—',
            })
          );
        } else if (col.id === 'undead') {
          const td = el('td', { className: 'num', style: tdBase });
          if (monster.undead) {
            td.appendChild(
              el('span', {
                className: 'elem-badge',
                style: {
                  background: 'rgba(168,85,247,0.13)',
                  color: '#a855f7',
                  border: '1px solid rgba(168,85,247,0.27)',
                },
                textContent: 'Yes',
              })
            );
          } else {
            td.textContent = '—';
          }
          row.appendChild(td);
        } else {
          const value = monster[col.id];
          row.appendChild(
            el('td', {
              className: 'num',
              style: tdBase,
              textContent: value != null && value !== 0 ? fmt(value) : '—',
            })
          );
        }
      });

      const tagCell = el('td', { style: tdBase });
      const tagWrap = el('span', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } });
      if (monster.is_boss) {
        tagWrap.appendChild(el('span', { className: 'badge badge-boss', textContent: 'BOSS' }));
      }
      tagCell.appendChild(tagWrap);
      row.appendChild(tagCell);

      const idTd = el('td', { className: 'num id-col', style: tdBase });
      if (monster.id != null) {
        idTd.appendChild(el('span', { className: 'id', textContent: monster.id }));
      }
      row.appendChild(idTd);

      // Click to toggle detail row
      let detailRow = null;
      row.addEventListener('click', (e) => {
        if (e.target.closest('.thumb')) return; // let thumbnail modal handle its own click
        if (detailRow) {
          detailRow.remove();
          detailRow = null;
          row.classList.remove('expanded');
        } else {
          detailRow = buildDetailRow(monster, totalCols, onMapClick);
          row.after(detailRow);
          row.classList.add('expanded');
        }
      });

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    wrapper.appendChild(table);
    dataContainer.appendChild(wrapper);

    if (autoExpandAfterId != null) {
      const expandId = autoExpandAfterId;
      autoExpandAfterId = null;
      setTimeout(() => {
        const rows = dataContainer.querySelectorAll('tr.monster-row');
        for (const row of rows) {
          const idCell = row.querySelector('.id-col .id');
          if (idCell && Number(idCell.textContent) === expandId) {
            row.click();
            break;
          }
        }
      }, 0);
    }
  }

  renderData();
  return container;
}
