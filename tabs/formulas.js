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
  [50, 51, 709716], 
];

const WEAPON_MULTS = [
  ['1H Sword',        1.8, 1.8],
  ['2H Sword',        2.5, 2.5],
  ['1H Blunt Weapon', 2.4, 1.2],
  ['2H Blunt Weapon', 3,   2  ],
  ['1H Axe',          2.4, 1.2],
  ['2H Axe',          3,   2  ],
  ['Spear',           1.5, 3.5],
  ['Polearm',         3.5, 1.5],
  ['Bow',             2.5, 2.5],
  ['Crossbow',        2.5, 2.5],
  ['Claw',            2.5, 2.5],
  ['Dagger*',         1,   2  ],
];

// ─── Accuracy ────────────────────────────────────────────────

const ACCURACY_STEPS = [
  {
    label: 'Physical Accuracy',
    wip: false,
    lines: [
      'BaseChance = Acc × 100 / ((LevelDiff + 51) × 5)',
      '',
      'MIN = 0.95 − 0.3 / (1 + exp(BaseChance / 12))',
      'MAX = 1.05 + 0.3 / (1 + exp(BaseChance / 12))',
      '',
      'Roll = rand(0, 1) × (MAX − MIN) + MIN',
      '',
      'DidHit = Roll × BaseChance ≥ Avoid',
    ],
    notes: [],
  },
  {
    label: 'Magical Accuracy',
    wip: false,
    lines: [
      'Magical skills always hit — there is no accuracy check for magic.',
    ],
    notes: [],
  },
];

const ACCURACY_VARS = [
  { name: 'Acc',       desc: "Player's Accuracy stat value" },
  { name: 'Avoid',     desc: "Enemy's Avoid stat value" },
  { name: 'LevelDiff', desc: 'Enemy level minus player level, or 0 if player level ≥ enemy level' },
];

// ─── Base Damage ──────────────────────────────────────────────

const BASE_DAMAGE_STEPS = [
  {
    label: 'Physical Damage',
    wip: false,
    lines: [
      'MIN = SkillMult × ((80 + PrimaryStat × MinWepMult × MasteryMult + SecondaryStat + AttackPower) / 100) × WeaponAttack',
      'MAX = SkillMult × ((100 + PrimaryStat × MaxWepMult + SecondaryStat + AttackPower) / 100) × WeaponAttack',
    ],
    notes: [
      'L7 (Lucky Seven): MinWepMult = MaxWepMult = 2.6, MasteryLevel ≈ 5.25',
      'Claws appear to use 2.6 for all attacks — Drain should use the 2.5 claw multiplier (likely a bug)',
    ],
  },
  {
    label: 'Magical Damage',
    wip: false,
    lines: [
      'MIN = (BasicAttack + MagicAttack / 7) × ((MagicAttack × 2 × MasteryMult + Int) / 100 + 1)',
      'MAX = (BasicAttack + MagicAttack / 7) × ((MagicAttack × 2 + Int) / 100 + 1)',
    ],
    notes: [],
  },
  {
    label: 'Heal',
    wip: false,
    lines: [
      'MIN = ((Int × 0.8 + Luk) / 200 + 3) × MagicAttack × (RecoveryRate / 100) × (TargetsHit × 0.1 + 1) / TargetsHit × 0.5',
      'MAX = ((Int × 1.0 + Luk) / 200 + 3) × MagicAttack × (RecoveryRate / 100) × (TargetsHit × 0.1 + 1) / TargetsHit × 0.5',
    ],
    notes: [
      'Luk is assumed to be BASE Luk from AP — difficult to verify as mages have very low Luk on gear',
      'Data is limited — verified at Heal Lv 1, 2, and 5 only; maxed Heal is unverified',
    ],
  },
];

const BASE_DAMAGE_VARS = [
  { name: 'SkillMult',     desc: 'Skill Damage % as a decimal (e.g. 120% → 1.2)' },
  { name: 'PrimaryStat',   desc: 'Main stat for your class (STR, DEX, INT, or LUK)' },
  { name: 'SecondaryStat', desc: 'Secondary stat — for Thieves: STR + DEX' },
  { name: 'AttackPower',   desc: 'Total weapon attack power from gear and buffs' },
  { name: 'WeaponAttack',  desc: 'Base weapon attack, including Stars and Arrows' },
  { name: 'MinWepMult',    desc: 'Weapon min multiplier (Swing or Stab) — see Weapon Multipliers table' },
  { name: 'MaxWepMult',    desc: 'Weapon max multiplier (Swing or Stab) — see Weapon Multipliers table' },
  { name: 'MasteryMult',   desc: '(0.1 + MasteryLevel / 10) × 0.8  |  L7: MasteryLevel ≈ 5.25' },
  { name: 'BasicAttack',   desc: 'Basic Attack damage value listed on the skill (magic skills)' },
  { name: 'MagicAttack',        desc: 'TotalInt / 2 + EquipmentMagicAttack (MAGIC value shown in UI)' },
  { name: 'EquipmentMagicAttack', desc: 'Sum of Magic Attack on all gear (including above/below average and scrolled stats)' },
  { name: 'Int',           desc: 'BASE Int from AP only — equipment stats not included (likely a bug)' },
  { name: 'Luk',           desc: 'BASE Luk from AP (assumed — see Heal notes)' },
  { name: 'RecoveryRate',  desc: 'Heal skill recovery rate %' },
  { name: 'TargetsHit',    desc: 'Total targets hit: enemies + caster + allies in range' },
];

// ─── Damage Modifications ─────────────────────────────────────

const MOD_PIPELINE_STEPS = [
  {
    label: 'Weapon Defense',
    wip: false,
    lines: [
      'Damage = Damage × 100 / (trunc(WeaponDefense × (PercentEffects / 100 + 1) + FlatEffects) + 100)',
      '',
      'If Crossbow Mastery Ignore Defense procs: treat WeaponDefense as 0',
    ],
    notes: [
      'trunc() rounds toward zero (down for positive, up for negative)',
      'Applies to Physical damage only',
    ],
  },
  {
    label: 'Magic Defense',
    wip: false,
    lines: [
      'Damage = Damage × 100 / (MagicDefense + 100)',
    ],
    notes: [
      'No other variables — this is the complete formula',
      'Applies to Magical damage only',
    ],
  },
  {
    label: 'Elemental Modifier',
    wip: false,
    lines: [
      'Damage = Damage × ElementalMult',
      '  0.0  — immune',
      '  0.75 — resistant (strong against element)',
      '  1.0  — neutral',
      '  1.25 — weak against element',
    ],
    notes: [],
  },
  {
    label: 'Level Difference Penalty',
    wip: false,
    lines: [
      'No penalty if player level ≥ enemy level',
      '  enemy < 10 levels above:  Damage / (LevelDiff² × 0.005 + 1)',
      '  enemy ≥ 10 levels above:  Damage / (LevelDiff × 0.05 + 1)',
    ],
    notes: [],
  },
  {
    label: 'Critical Hit',
    wip: false,
    lines: [
      'Damage = Damage × CritDamage',
      '  CritDamage from Stats Panel (e.g. 120% Crit Damage → 1.2)',
    ],
    notes: [],
  },
  {
    label: 'Iron Arrow Falloff (Crossbow only)',
    wip: false,
    lines: [
      'Damage = Damage × (1 − ConsecutiveHits × 0.2)',
      '  1st mob: ×1.0,  2nd: ×0.8,  3rd: ×0.6 …',
    ],
    notes: [],
  },
  {
    label: 'Clamp',
    wip: false,
    lines: [
      'Damage = floor(Damage)',
      'Damage = clamp(Damage, 1, 700,000,000,000)',
    ],
    notes: [],
  },
];

const MOD_VARS = [
  { name: 'WeaponDefense',   desc: "Enemy's weapon defense stat" },
  { name: 'PercentEffects',  desc: 'Sum of percent-based buffs/debuffs on enemy weapon defense' },
  { name: 'FlatEffects',     desc: 'Flat modifiers to enemy weapon defense — no known sources' },
  { name: 'MagicDefense',    desc: "Enemy's magic defense stat" },
  { name: 'ElementalMult',   desc: 'Elemental modifier: 0.0, 0.75, 1.0, or 1.25' },
  { name: 'LevelDiff',       desc: 'Enemy level minus player level (when enemy is higher)' },
  { name: 'CritDamage',      desc: 'Crit damage from Stats Panel (e.g. 120% → 1.2)' },
  { name: 'ConsecutiveHits', desc: 'Iron Arrow: 0 for first mob hit, 1 for second, etc.' },
];


// ─── Formula tokenizer ───────────────────────────────────────

const FORMULA_FNS = new Set(['exp', 'rand', 'trunc', 'floor', 'clamp']);
const FORMULA_TOKEN_RE = /([A-Za-z][A-Za-z0-9]*)|(\d+(?:\.\d+)?)/g;

function tokenizeLine(line) {
  let out = '';
  let last = 0;
  let m;
  FORMULA_TOKEN_RE.lastIndex = 0;
  while ((m = FORMULA_TOKEN_RE.exec(line)) !== null) {
    out += line.slice(last, m.index);
    if (m[1]) {
      const cls = FORMULA_FNS.has(m[1]) ? 'formula-fn' : 'formula-var';
      out += `<span class="${cls}">${m[1]}</span>`;
    } else {
      out += `<span class="formula-num">${m[0]}</span>`;
    }
    last = FORMULA_TOKEN_RE.lastIndex;
  }
  out += line.slice(last);
  return out;
}

// ─── Shared helpers ───────────────────────────────────────────

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

function buildPipeline(steps) {
  const frag = document.createDocumentFragment();
  steps.forEach(({ label, wip, lines, notes }, i) => {
    const step = el('div', { className: 'formulas-pipeline-step' });

    const stepHeader = el('div', { className: 'formulas-pipeline-header' });
    stepHeader.appendChild(el('span', { className: 'formulas-pipeline-badge', textContent: i + 1 }));
    stepHeader.appendChild(el('span', { className: 'formulas-pipeline-title', textContent: label }));
    if (wip) stepHeader.appendChild(el('span', { className: 'formulas-wip-tag', textContent: 'WIP' }));
    step.appendChild(stepHeader);

    const codeLines = lines.filter(l => l !== '');
    if (codeLines.length) {
      const pre = el('pre', { className: 'formulas-code' });
      pre.innerHTML = lines.map(l => l === '' ? '' : tokenizeLine(l)).join('\n');
      step.appendChild(pre);
    }

    if (notes?.length) {
      const noteWrap = el('div', { className: 'formulas-pipeline-notes' });
      notes.forEach(n => noteWrap.appendChild(el('div', { className: 'formulas-note', textContent: n })));
      step.appendChild(noteWrap);
    }

    frag.appendChild(step);
  });
  return frag;
}

function buildVarLegend(vars) {
  const wrap = el('div', { className: 'formulas-var-section' });
  wrap.appendChild(el('div', { className: 'formulas-var-heading', textContent: 'Variables' }));
  const grid = el('div', { className: 'formulas-var-grid' });
  vars.forEach(({ name, desc }) => {
    const row = el('div', { className: 'formulas-var-row' });
    row.appendChild(el('span', { className: 'formulas-var-name', textContent: name }));
    row.appendChild(el('span', { className: 'formulas-var-desc', textContent: desc }));
    grid.appendChild(row);
  });
  wrap.appendChild(grid);
  return wrap;
}

// ─── Section builders ─────────────────────────────────────────

function buildExpTable() {
  const container = el('div', { className: 'formulas-table-wrap' });
  const table = el('table', { className: 'data-table', style: 'border-collapse:collapse;' });

  const thead = el('thead');
  const headerRow = el('tr');
  for (const [text, cls] of [['Level', ''], ['Exp to Level Up', 'num'], ['Accumulated Exp', 'num']]) {
    const th = el('th', { className: cls, textContent: text });
    th.style.padding = '2px 6px';
    th.style.fontSize = '0.95em';
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  let accumulated = 0;
  EXP_TABLE.forEach(([from, , exp]) => {
    const row = el('tr');
    row.style.lineHeight = '1.1';
    row.style.fontSize = '0.95em';
    row.style.height = '22px';

    const lvlCell = el('td');
    lvlCell.appendChild(el('span', { className: 'lvl-chip', textContent: `Lv ${from}` }));
    lvlCell.style.padding = '2px 6px';
    row.appendChild(lvlCell);

    const expCell = el('td', { className: 'num formulas-exp-val', textContent: exp.toLocaleString() });
    expCell.style.padding = '2px 6px';
    row.appendChild(expCell);

    const accCell = el('td', { className: 'num formulas-accum-val', textContent: accumulated.toLocaleString() });
    accCell.style.padding = '2px 6px';
    row.appendChild(accCell);

    tbody.appendChild(row);
    accumulated += exp;
  });
  table.appendChild(tbody);
  container.appendChild(table);
  return container;
}

function buildWeaponMultTable() {
  const container = el('div', { className: 'formulas-table-wrap' });
  const table = el('table', { className: 'data-table' });

  const thead = el('thead');
  const headerRow = el('tr');
  for (const [text, cls] of [['Weapon Type', ''], ['Swing', 'num'], ['Stab', 'num']]) {
    headerRow.appendChild(el('th', { className: cls, textContent: text }));
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  WEAPON_MULTS.forEach(([type, swing, stab]) => {
    const row = el('tr');
    row.appendChild(el('td', { textContent: type }));
    row.appendChild(el('td', { className: 'num', textContent: swing }));
    row.appendChild(el('td', { className: 'num', textContent: stab }));
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  container.appendChild(table);

  const note = el('div', { className: 'formulas-note', textContent: '* Dagger uses Stab multiplier for both MinWepMult and MaxWepMult when stabbing. Savage Blow and Double Stab always Stab. Steal uses both.' });
  note.style.marginTop = '0.5em';
  note.style.padding = '0.5em 1em';
  container.appendChild(note);

  return container;
}

function buildAccuracySection() {
  const container = el('div', { className: 'formulas-formula-wrap' });
  container.appendChild(buildPipeline(ACCURACY_STEPS));
  container.appendChild(buildVarLegend(ACCURACY_VARS));
  return container;
}

function buildBaseDamageSection() {
  const container = el('div', { className: 'formulas-formula-wrap' });
  container.appendChild(buildPipeline(BASE_DAMAGE_STEPS));
  container.appendChild(buildVarLegend(BASE_DAMAGE_VARS));
  return container;
}

function buildModsSection() {
  const container = el('div', { className: 'formulas-formula-wrap' });
  container.appendChild(buildPipeline(MOD_PIPELINE_STEPS));
  container.appendChild(buildVarLegend(MOD_VARS));
  return container;
}



// ─── Page render ──────────────────────────────────────────────

export function renderFormulas() {
  const frag = document.createDocumentFragment();
  const wrapper = el('div', { className: 'formulas-page' });

  wrapper.appendChild(el('div', { className: 'section-heading', textContent: 'Formulas & Tables' }));

  // Full-width formula sections
  const fullWidth = el('div', { className: 'formulas-full' });

  const accuracySection = makeCollapsibleSection('Accuracy', '', buildAccuracySection);

  const baseDmgSection = makeCollapsibleSection('Base Damage Formulas', '', buildBaseDamageSection);
  const dmgCredit = el('span', { className: 'formulas-credit' });
  dmgCredit.innerHTML = 'Reverse engineered by <strong>@Slash, @kirbypickr, @sublimerealist, @jimmybald</strong> on Discord';
  baseDmgSection.querySelector('.left').appendChild(dmgCredit);

  const modsSection = makeCollapsibleSection('Damage Modifications', '', buildModsSection);

  fullWidth.appendChild(accuracySection);
  fullWidth.appendChild(baseDmgSection);
  fullWidth.appendChild(modsSection);
  wrapper.appendChild(fullWidth);

  // Appendix
  wrapper.appendChild(el('div', { className: 'section-heading', textContent: 'Appendix' }));

  const appendix = el('div', { className: 'formulas-full' });

  const expSection = makeCollapsibleSection('Experience Table', '', buildExpTable);
  const expCredit = el('span', { className: 'formulas-credit' });
  expCredit.innerHTML = 'Reverse engineered by <strong>@wolffy</strong> on Discord';
  expSection.querySelector('.left').appendChild(expCredit);

  const weaponMultSection = makeCollapsibleSection('Weapon Min/Max Multipliers', '', buildWeaponMultTable);

  appendix.appendChild(weaponMultSection);
  appendix.appendChild(expSection);
  wrapper.appendChild(appendix);

  frag.appendChild(wrapper);
  return frag;
}
