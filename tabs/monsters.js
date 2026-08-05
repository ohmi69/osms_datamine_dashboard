import { el, fmt, matchSearch, makeSearchBox, makeThumbnail, normalizeAssetPath, makeDeepLinkButton, parseIdFilter, makePillGroup, makeCopyableId, padMapId, padMobId, makeTabLink, scrollToDetailRow, autoExpandById } from '../lib/utils.js';
import { attachTooltip } from '../lib/tooltip.js';
import state, { getMobGifUrl, getMobThumbUrl } from '../lib/data.js';
import { MOB_STATE_ORDER, MOB_STATE_LABEL } from '../lib/constants.js';

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

// Header flags that describe how a mob behaves rather than what it is made of.
const BEHAVIOUR_BADGES = [
  { key: 'aggro',     label: 'Aggro',      cls: 'elem-aggro',      title: 'Attacks on sight (firstAttack)' },
  { key: 'invincible', label: 'Invincible', cls: 'elem-invincible', title: 'Cannot be damaged' },
  { key: 'no_regen',   label: 'No Regen',   cls: 'elem-noregen',    title: 'Does not regenerate HP or MP' },
];

function describeAttack(attack) {
  const parts = [];
  if (attack.element) parts.push(attack.element);
  if (attack.magic) parts.push('Magic');
  if (attack.status) parts.push(attack.status_level ? `${attack.status} Lv.${attack.status_level}` : attack.status);
  if (attack.bullet_speed) parts.push('Ranged');
  if (attack.jump) parts.push('Jump attack');
  if (attack.mp) parts.push(`${attack.mp} MP`);
  if (attack.delay) parts.push(`${(attack.delay / 1000).toFixed(attack.delay % 1000 ? 1 : 0)}s delay`);
  return parts;
}

function buildCombatSection(monster, focusMonster) {
  const attacks = monster.attacks || [];
  const revives = monster.revives || [];
  if (!attacks.length && !revives.length) return null;

  const col = el('div', { className: 'monster-detail-col monster-detail-col-combat' });

  if (attacks.length) {
    col.appendChild(el('div', { className: 'monster-stat-group-label', textContent: 'Attacks' }));
    const list = el('div', { className: 'mob-attack-list' });
    attacks.forEach((attack) => {
      const row = el('div', { className: 'mob-attack-row' });
      row.appendChild(el('span', { className: 'mob-attack-index', textContent: String(attack.index) }));
      row.appendChild(
        el('span', {
          className: 'mob-attack-ratio',
          textContent: attack.ratio != null ? `${attack.ratio}%` : '—',
          title: attack.ratio != null ? `Deals ${attack.ratio}% of this mob's attack stat` : '',
        })
      );
      const tags = describeAttack(attack);
      row.appendChild(
        el('span', { className: 'mob-attack-tags', textContent: tags.length ? tags.join(' · ') : 'Physical' })
      );
      list.appendChild(row);
    });
    col.appendChild(list);
  }

  if (revives.length) {
    col.appendChild(el('div', { className: 'monster-stat-group-label', textContent: 'Summons On Death' }));
    const chips = el('div', { className: 'monster-map-list' });
    revives.forEach((spawn) => {
      const label = spawn.name || `#${spawn.id}`;
      const chip = focusMonster
        ? makeTabLink('monsters', `id:${padMobId(spawn.id)}`, {
            className: 'monster-map-chip monster-map-chip--clickable',
            title: `Jump to ${label}`,
            onActivate: () => focusMonster(spawn.id),
            stopPropagation: true,
          })
        : el('span', { className: 'monster-map-chip' });
      chip.appendChild(el('span', { textContent: label }));
      chip.appendChild(el('span', { className: 'monster-map-chip-count', textContent: `×${spawn.count}` }));
      chips.appendChild(chip);
    });
    col.appendChild(chips);
  }

  return col;
}

function buildDetailRow(monster, colSpan, onMapClick, focusMonster) {
  const detailTr = el('tr', { className: 'monster-detail-row' });
  const detailTd = el('td', { colSpan: String(colSpan) });

  const panel = el('div', { className: 'monster-detail-panel' });

  // ── Header ──────────────────────────────────────────────────
  const header = el('div', { className: 'monster-detail-header' });

  const gifs = monster.gifs || {};
  const availableStates = MOB_STATE_ORDER.filter(s => gifs[s]);
  const defaultSrc =
    getMobGifUrl(gifs['move'] || (availableStates.length > 0 ? gifs[availableStates[0]] : null) || monster.gif) ||
    getMobThumbUrl(monster.thumbnail);

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
        textContent: MOB_STATE_LABEL[state] || state,
      });
      tab.addEventListener('click', () => {
        activeState = state;
        tabs.querySelectorAll('.monster-anim-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        if (gifImg) gifImg.src = getMobGifUrl(gifs[state]);
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
    headerRight.appendChild(makeCopyableId(`#${padMobId(monster.id)}`));
  }
  if (monster.undead) {
    headerRight.appendChild(
      el('span', { className: 'elem-badge elem-undead', textContent: 'Undead' })
    );
  }
  if (monster.passive) {
    headerRight.appendChild(
      el('span', { className: 'elem-badge elem-passive', textContent: 'Passive' })
    );
  }
  BEHAVIOUR_BADGES.forEach(({ key, label, cls, title }) => {
    if (!monster[key]) return;
    headerRight.appendChild(el('span', { className: `elem-badge ${cls}`, textContent: label, title }));
  });
  if (monster.self_destruct_hp) {
    headerRight.appendChild(
      el('span', {
        className: 'elem-badge elem-selfdestruct',
        textContent: 'Self-Destruct',
        title: `selfDestruction HP value: ${fmt(monster.self_destruct_hp)}`,
      })
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
        { label: 'AVOID', value: monster.eva },
        { label: 'Speed', value: monster.speed },
        { label: 'KB',    value: monster.pushed },
      ],
    },
    {
      label: 'Regen (per tick)',
      stats: [
        { label: 'HP', value: monster.hp_recovery, accent: true },
        { label: 'MP', value: monster.mp_recovery },
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

  // Attacks / death-spawn column
  const combatCol = buildCombatSection(monster, focusMonster);
  if (combatCol) body.appendChild(combatCol);

  // Maps column
  const spawnMaps = monster.maps || [];
  if (spawnMaps.length) {
    const mapsCol = el('div', { className: 'monster-detail-col monster-detail-col-maps' });
    mapsCol.appendChild(el('div', { className: 'monster-stat-group-label', textContent: 'Spawns In' }));
    const mapList = el('div', { className: 'monster-map-list' });
    const sortedSpawnMaps = [...spawnMaps].sort((a, b) => b.count - a.count || a.id - b.id);
    sortedSpawnMaps.forEach((m) => {
      const label = m.name || `#${m.id}`;
      const chip = onMapClick
        ? makeTabLink('maps', `id:${padMapId(m.id)}`, {
            className: 'monster-map-chip monster-map-chip--clickable',
            title: `View ${label} in Maps tab`,
            onActivate: () => onMapClick(m.id),
            stopPropagation: true,
          })
        : el('span', { className: 'monster-map-chip' });
      chip.appendChild(el('span', { textContent: label }));
      chip.appendChild(el('span', { className: 'monster-map-chip-count', textContent: `×${m.count}` }));
      mapList.appendChild(chip);
    });
    mapsCol.appendChild(mapList);
    body.appendChild(mapsCol);
  }

  // ── Skills ───────────────────────────────────────────────────
  function renderMobSkillCards(skillList) {
    const wrap = el('div', { className: 'monster-self-buffs' });
    skillList.forEach((buff) => {
      const card = el('div', { className: 'mob-skill-card' });
      if (buff.icon) {
        const img = el('img', { src: normalizeAssetPath(buff.icon), className: 'mob-skill-icon', alt: buff.name });
        img.onerror = () => {
          const fallback = el('div', { className: 'mob-skill-icon-fallback', textContent: '?' });
          img.replaceWith(fallback);
        };
        card.appendChild(img);
      } else {
        card.appendChild(el('div', { className: 'mob-skill-icon-fallback', textContent: '?' }));
      }
      const info = el('div', { className: 'mob-skill-info' });
      const nameRow = el('span', { className: 'mob-skill-name', textContent: `${buff.name} Lv.${buff.level}` });
      if (buff.id != null) {
        const idEl = makeCopyableId(`#${buff.id}`);
        idEl.classList.add('mob-skill-id');
        nameRow.appendChild(idEl);
      }
      info.appendChild(nameRow);
      const parts = [];
      if (buff.x != null) parts.push(`+${buff.x}%`);
      if (buff.prop != null) parts.push(`${buff.prop}% chance`);
      if (buff.time != null) parts.push(`${buff.time}s`);
      if (buff.interval != null) parts.push(`every ${buff.interval}s`);
      if (parts.length) {
        info.appendChild(el('span', { className: 'mob-skill-stats', textContent: parts.join(' · ') }));
      }
      card.appendChild(info);
      wrap.appendChild(card);
    });
    return wrap;
  }

  const selfBuffs = monster.self_buffs;
  const debuffs = monster.debuffs;
  if ((selfBuffs && selfBuffs.length) || (debuffs && debuffs.length)) {
    const skillsCol = el('div', { className: 'monster-detail-col monster-detail-col-skills' });
    if (selfBuffs && selfBuffs.length) {
      skillsCol.appendChild(el('div', { className: 'monster-stat-group-label', textContent: 'Self Buffs' }));
      skillsCol.appendChild(renderMobSkillCards(selfBuffs));
    }
    if (debuffs && debuffs.length) {
      skillsCol.appendChild(el('div', { className: 'monster-stat-group-label', textContent: 'Debuffs' }));
      skillsCol.appendChild(renderMobSkillCards(debuffs));
    }
    body.appendChild(skillsCol);
  }

  panel.appendChild(body);
  detailTd.appendChild(panel);
  detailTr.appendChild(detailTd);
  return detailTr;
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
    { id: 'PDDamage', label: 'PDEF',    on: true },
    { id: 'MADamage', label: 'MATK',    on: false },
    { id: 'MDDamage', label: 'MDEF',    on: true },
    { id: 'acc',      label: 'ACC',     on: false },
    { id: 'eva',      label: 'AVOID',   on: true  },
    { id: 'speed',    label: 'SPD',     on: false },
    { id: 'pushed',   label: 'KB',      on: false },
    { id: 'elements', label: 'Element', on: true  },
    { id: 'undead',   label: 'Undead',  on: false },
  ];

  const colState = {};
  const monsterState = state.get('monsters', { cols: null });
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
      const exactId = parseIdFilter(nextFilter);
      const isDeeplink = typeof target === 'string' && exactId != null;
      if (isDeeplink) {
        autoExpandAfterId = exactId;
        filter = '';
        searchBox._input.value = '';
      } else {
        autoExpandAfterId = (typeof target === 'object' && target && target.id != null && target.autoExpand)
          ? target.id
          : exactId;
        filter = nextFilter;
        searchBox._input.value = nextFilter;
      }
      renderData();
      window.scrollTo(0, 0);
    });
  }

  const typePills = makePillGroup(
    [{ label: 'All', value: '' }, { label: 'Non-Boss', value: 'nonboss' }, { label: 'Bosses', value: 'boss' }],
    typeFilter,
    (value) => {
      typeFilter = value;
      typePills.setActive(value);
      state.set('monsters', { cols: { ...colState } });
      renderData();
    },
    { groupLabel: 'Mob Type:' }
  );

  // Death-spawn chips jump between mobs without leaving the tab.
  function focusMonster(id) {
    autoExpandAfterId = id;
    filter = '';
    searchBox._input.value = '';
    renderData();
    window.scrollTo(0, 0);
  }

  const elemPills = makePillGroup(
    [{ label: 'Any', value: '' }, { label: 'Fire', value: 'Fire' }, { label: 'Ice', value: 'Ice' }, { label: 'Lightning', value: 'Lightning' }, { label: 'Holy', value: 'Holy' }, { label: 'Poison', value: 'Poison' }],
    elemWeakFilter,
    (value) => {
      elemWeakFilter = value;
      elemPills.setActive(value);
      renderData();
    },
    { groupLabel: 'Weak to:' }
  );

  container.appendChild(topRow);

  const filterRow = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' } });
  filterRow.appendChild(typePills);
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
        state.set('monsters', { cols: { ...colState } });
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
    // +2 for Name col and ID col
    const totalCols = visibleCols.length + 2;
    const exactId = parseIdFilter(filter);

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
        el('p', { className: 'empty-state', textContent: 'No monsters match your filters.' })
      );
      return;
    }

    const wrapper = el('div', { className: 'table-scroll' });
    const table = el('table', { className: 'data-table' });
    const thead = el('thead');
    const headRow = el('tr');

    const thStyle = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };
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
      state.set('monsters', { cols: { ...colState } });
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
          state.set('monsters', { cols: { ...colState } });
          renderData();
        });
      }
      headRow.appendChild(th);
    });

    headRow.appendChild(el('th', { className: 'num id-col', textContent: 'ID' }));
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
        makeThumbnail(getMobGifUrl(monster.gif) || getMobThumbUrl(monster.thumbnail), `${monster.name} thumbnail`, {
          className: 'monster-thumb',
          fallbackText: 'MOB',
        })
      );
      // Monster name with (?) tooltip if special
      const nameSpan = el('span', { textContent: monster.name });
      nameLeft.appendChild(nameSpan);
      if (monster.is_boss) {
        nameLeft.appendChild(el('span', { className: 'badge badge-boss', textContent: 'BOSS' }));
      }
      if (monster.special) {
        const SPECIAL_DESCRIPTIONS = {
          'Job Advancement': 'This mob appears only during job advancement trials.',
          'Jump Quest': 'This mob appears only in jump quest maps.',
          'KPQ': 'This mob appears only in the Kerning Party Quest.',
        };
        const desc = SPECIAL_DESCRIPTIONS[monster.special] || 'This mob is considered special.';
        const q = el('span', {
          className: 'special-tooltip-icon',
          textContent: ' (?)',
          title: desc,
          style: 'color: #888; cursor: help; font-size: 0.95em; user-select: none;'
        });
        nameLeft.appendChild(q);
      }
      nameWrap.appendChild(nameLeft);
      if (monster.id != null) nameWrap.appendChild(makeDeepLinkButton('monsters', padMobId(monster.id)));
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

      const idTd = el('td', { className: 'num id-col', style: tdBase });
      if (monster.id != null) {
        idTd.appendChild(makeCopyableId(`#${padMobId(monster.id)}`));
      }
      row.appendChild(idTd);

      // Click to toggle detail row
      let detailRow = null;
      row.addEventListener('click', (e) => {
        if (e.target.closest('.thumb')) return; // let thumbnail modal handle its own click
        if (detailRow) {
          detailRow.remove();
          detailRow = null;
          row.classList.remove('expanded', 'row-hotlink');
          history.replaceState(null, '', '#monsters');
        } else {
          detailRow = buildDetailRow(monster, totalCols, onMapClick, focusMonster);
          row.after(detailRow);
          row.classList.add('expanded');
          history.replaceState(null, '', `#monsters?q=${encodeURIComponent('id:' + padMobId(monster.id))}`);
          document.querySelectorAll('.row-hotlink').forEach(r => r.classList.remove('row-hotlink'));
          row.classList.add('row-hotlink');
          scrollToDetailRow(row, detailRow);
        }
      });

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    wrapper.appendChild(table);
    dataContainer.appendChild(wrapper);

    if (autoExpandAfterId != null) {
      autoExpandById(dataContainer, autoExpandAfterId);
      autoExpandAfterId = null;
    }
  }

  renderData();
  return container;
}
