import { el } from '../lib/utils.js';

const EXP_TABLE = [
  [1, 2, 15], [2, 3, 34], [3, 4, 57], [4, 5, 92], [5, 6, 135],
  [6, 7, 372], [7, 8, 560], [8, 9, 840], [9, 10, 1242], [10, 11, 1716],
  [11, 12, 2360], [12, 13, 3216], [13, 14, 4200], [14, 15, 5460],
  [15, 16, 7050], [16, 17, 8840], [17, 18, 11040], [18, 19, 13716],
  [19, 20, 16680], [20, 21, 20216], [21, 22, 24402], [22, 23, 28980],
  [23, 24, 34320], [24, 25, 40512], [25, 26, 47216], [26, 27, 54900],
  [27, 28, 63666], [28, 29, 73080], [29, 30, 83720], [30, 31, 95700],
  [31, 32, 108480], [32, 33, 122760], [33, 34, 138666], [34, 35, 155540],
  [35, 36, 174216], [36, 37, 194832], [37, 38, 216600], [38, 39, 240500],
  [39, 40, 266682], [40, 41, 294216], [41, 42, 324240], [42, 43, 356916],
  [43, 44, 391160], [44, 45, 428280], [45, 46, 468450], [46, 47, 510420],
  [47, 48, 555680], [48, 49, 604416], [49, 50, 655200],
  [50, 51, 709716], [51, 52, 748608],
];

function makeCollapsibleSection(title, countLabel, bodyFn) {
  const wrap = el('div', { className: 'collapsible open' });

  const header = el('div', { className: 'collapsible-header' });
  const left = el('div', { className: 'left' });
  left.appendChild(el('span', { className: 'title', textContent: title }));
  const right = el('div', { className: 'right' });
  if (countLabel) right.appendChild(el('span', { className: 'count', textContent: countLabel }));

  header.appendChild(left);
  header.appendChild(right);

  const body = el('div', { className: 'collapsible-body' });
  body.appendChild(bodyFn());

  wrap.appendChild(header);
  wrap.appendChild(body);
  return wrap;
}

function buildExpTable() {
  const container = el('div', { className: 'formulas-table-wrap' });

  const table = el('table', { className: 'data-table' });

  const thead = el('thead');
  const headerRow = el('tr');
  for (const [text, cls] of [['Level', ''], ['Exp to Level Up', 'num'], ['Accumulated Exp', 'num']]) {
    headerRow.appendChild(el('th', { className: cls, textContent: text }));
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  let accumulated = 0;
  EXP_TABLE.forEach(([from, , exp]) => {
    const row = el('tr');

    const lvlCell = el('td');
    lvlCell.appendChild(el('span', { className: 'lvl-chip', textContent: `Lv ${from}` }));
    row.appendChild(lvlCell);

    row.appendChild(el('td', { className: 'num formulas-exp-val', textContent: exp.toLocaleString() }));
    row.appendChild(el('td', { className: 'num formulas-accum-val', textContent: accumulated.toLocaleString() }));

    tbody.appendChild(row);
    accumulated += exp;
  });
  table.appendChild(tbody);
  container.appendChild(table);
  return container;
}

const DAMAGE_VARS = [
  { name: 'PrimaryStat',  desc: 'Main stat for your class (STR, DEX, INT, or LUK)' },
  { name: 'SecondaryStat', desc: 'Secondary stat for your class' },
  { name: 'AttackPower',  desc: 'Total weapon attack from gear and buffs' },
  { name: 'WeaponAttack', desc: 'Base attack value of the equipped weapon' },
  { name: 'MinMult',      desc: 'Per-skill minimum damage multiplier' },
  { name: 'MaxMult',      desc: 'Per-skill maximum damage multiplier' },
  { name: 'Masterylvl',   desc: 'Mastery skill level (0 if not applicable)' },
];

function buildDamageFormula() {
  const container = el('div', { className: 'formulas-formula-wrap' });

  // Formula block
  const block = el('div', { className: 'formulas-code-block' });

  for (const [label, formula] of [
    ['MIN Damage', 'MIN = (0.8 + (PrimaryStat × MinMult × ((0.1 + Masterylvl / 10) × 0.8) + SecondaryStat + AttackPower) / 100.0) × WeaponAttack'],
    ['MAX Damage', 'MAX = (1.0 + (PrimaryStat × MaxMult + SecondaryStat + AttackPower) / 100.0) × WeaponAttack'],
  ]) {
    const cell = el('div', { className: 'formulas-code-cell' });
    cell.appendChild(el('div', { className: 'formulas-code-label', textContent: label }));
    cell.appendChild(el('pre', { className: 'formulas-code', textContent: formula }));
    block.appendChild(cell);
  }

  container.appendChild(block);

  // Variable legend
  container.appendChild(el('div', { className: 'formulas-var-heading', textContent: 'Variables' }));
  const grid = el('div', { className: 'formulas-var-grid' });
  DAMAGE_VARS.forEach(({ name, desc }) => {
    const row = el('div', { className: 'formulas-var-row' });
    row.appendChild(el('span', { className: 'formulas-var-name', textContent: name }));
    row.appendChild(el('span', { className: 'formulas-var-desc', textContent: desc }));
    grid.appendChild(row);
  });
  container.appendChild(grid);

  return container;
}

export function renderFormulas() {
  const frag = document.createDocumentFragment();
  const wrapper = el('div', { className: 'formulas-page' });

  wrapper.appendChild(el('div', { className: 'section-heading', textContent: 'Formulas & Tables' }));

  const expSection = makeCollapsibleSection(
    'Experience Table',
    '',
    buildExpTable,
  );

  const credit = el('span', { className: 'formulas-credit' });
  credit.innerHTML = 'Reverse engineered by <strong>@wolffy</strong> on Discord';
  expSection.querySelector('.left').appendChild(credit);

  const dmgSection = makeCollapsibleSection(
    'Damage Range Formula',
    '',
    buildDamageFormula,
  );

  const dmgCredit = el('span', { className: 'formulas-credit' });
  dmgCredit.innerHTML = 'Reverse engineered by <strong>@Slash, @kirbypickr, @sublimerealist</strong> on Discord';
  dmgSection.querySelector('.left').appendChild(dmgCredit);


  const rightCol = el('div', { className: 'formulas-col' });
  rightCol.appendChild(dmgSection);

  const row = el('div', { className: 'formulas-row' });
  row.appendChild(expSection);
  row.appendChild(rightCol);
  wrapper.appendChild(row);

  frag.appendChild(wrapper);
  return frag;
}
