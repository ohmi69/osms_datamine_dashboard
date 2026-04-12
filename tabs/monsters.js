import { el, fmt, matchSearch, makeSearchBox, makeThumbnail } from '../lib/utils.js';
import { loadState, saveState } from '../lib/data.js';

const _savedState = loadState();

const ELEMENT_CLASSES = {
  Immune: 'immune',
  Resist: 'resist',
  Weak: 'weak',
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

export function renderMonsters(data) {
  const { monsters } = data;

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
  let sortCol = 'level';
  let sortDir = 1;

  const container = el('div');
  const dataContainer = el('div');

  const topRow = el('div', {
    style: { display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' },
  });
  const searchDiv = el('div', { style: { flex: '1', minWidth: '200px' } });
  searchDiv.appendChild(
    makeSearchBox('Search monsters...', (value) => {
      filter = value;
      renderData();
    })
  );
  topRow.appendChild(searchDiv);

  const pills = el('div', { className: 'pill-group' });
  function rebuildPills() {
    pills.innerHTML = '';
    [
      ['All',    ''],
      ['Bosses', 'boss'],
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
  topRow.appendChild(pills);
  container.appendChild(topRow);

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
    const filtered = monsters.monsters.filter((monster) => {
      if (!matchSearch(monster.name, filter)) return false;
      if (typeFilter === 'boss' && !monster.is_boss) return false;
      return true;
    });

    dataContainer.appendChild(
      el('div', { className: 'count-text', textContent: `${filtered.length} monsters` })
    );

    const wrapper = el('div', { style: { overflowX: 'auto' } });
    const table = el('table', { className: 'data-table' });
    const thead = el('thead');
    const headRow = el('tr');

    const nameHeader = el('th', { textContent: 'Name', style: { cursor: 'pointer' } });
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
    if (sortCol === 'name') {
      nameHeader.textContent = `Name ${sortDir === 1 ? '▲' : '▼'}`;
    }
    headRow.appendChild(nameHeader);

    visibleCols.forEach((col) => {
      const th = el('th', {
        className: col.id !== 'elements' ? 'num' : '',
        textContent: col.label,
        style: { cursor: col.id !== 'elements' ? 'pointer' : 'default' },
      });
      if (col.id !== 'elements') {
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
        if (sortCol === col.id) {
          th.textContent = `${col.label} ${sortDir === 1 ? '▲' : '▼'}`;
        }
      }
      headRow.appendChild(th);
    });

    headRow.appendChild(el('th', { textContent: 'Tags' }));
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
      const row = el('tr');
      const nameCell = el('td', { style: { fontWeight: '500', whiteSpace: 'nowrap' } });
      const nameWrap = el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } });
      nameWrap.appendChild(
        makeThumbnail(monster.thumbnail, `${monster.name} thumbnail`, {
          className: 'monster-thumb',
          fallbackText: 'MOB',
        })
      );
      nameWrap.appendChild(el('span', { textContent: monster.name }));
      nameCell.appendChild(nameWrap);
      row.appendChild(nameCell);

      visibleCols.forEach((col) => {
        if (col.id === 'elements') {
          const td = el('td');
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
              textContent: ratio > 0 ? ratio.toFixed(3) : '—',
            })
          );
        } else if (col.id === 'undead') {
          const td = el('td', { className: 'num' });
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
              textContent: value != null && value !== 0 ? fmt(value) : '—',
            })
          );
        }
      });

      const tagCell = el('td');
      const tagRow = el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' } });
      const tagWrap = el('span', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } });
      if (monster.is_boss) {
        tagWrap.appendChild(el('span', { className: 'badge badge-boss', textContent: 'BOSS' }));
      }
      tagRow.appendChild(tagWrap);
      if (monster.id != null) {
        tagRow.appendChild(el('span', { className: 'id', textContent: monster.id }));
      }
      tagCell.appendChild(tagRow);
      row.appendChild(tagCell);
      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    wrapper.appendChild(table);
    dataContainer.appendChild(wrapper);
  }

  renderData();
  return container;
}
