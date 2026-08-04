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
    status: 'warn',
    statusNote: 'Carried over from COT1 - not yet re-verified against COT2 data.',
    lines: [
      'BaseChance = Acc × 100 / ((max(0, LevelDiff) + 51) × 5)',
      '',
      'MIN = 0.95 − 0.3 / (1 + exp((BaseChance − Avoid) / 12))',
      'MAX = 1.05 + 0.3 / (1 + exp((BaseChance − Avoid) / 12))',
      '',
      'Roll = rand(MIN, MAX)',
      '',
      'DidHit = Roll × BaseChance ≥ Avoid',
    ],
    notes: ['exp() is the exponential function'],
  },
  {
    label: 'Magical Accuracy',
    wip: false,
    status: 'warn',
    statusNote: 'Carried over from COT1 - not yet re-verified against COT2 data.',
    lines: [
      'Magical skills always hit - there is no accuracy check for magic.',
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
    status: 'warn',
    statusNote: 'Not yet re-verified against COT2 data. COT1 status: Verified for Assassins and Crossbowmen - no data for Warriors or Archers yet',
    lines: [
      'MIN = SkillMult × ((80 + PrimaryStat × MinWepMult × MasteryMult + SecondaryStat + AttackPower) / 100) × WeaponAttack',
      'MAX = SkillMult × ((100 + PrimaryStat × MaxWepMult + SecondaryStat + AttackPower) / 100) × WeaponAttack',
    ],
    notes: [
      'Verified for Assassins and Crossbowmen - no data for Warriors or Archers yet',
      'Lucky Seven uses a 2.6 multi instead of the Claw\'s 2.5',
      '❗ Drain (and possibly Normal Attack) erroneously use Lucky Seven\'s 2.6 multiplier instead of the Claw\'s intended 2.5. Likely a bug',
    ],
  },
  {
    label: 'Magical Damage',
    wip: false,
    status: 'warn',
    statusNote: 'Carried over from COT1 - not yet re-verified against COT2 data.',
    lines: [
      'MIN = (BasicAttack + MagicAttack / 7) × ((MagicAttack × 2 × MasteryMult + BaseInt) / 100 + 1)',
      'MAX = (BasicAttack + MagicAttack / 7) × ((MagicAttack × 2 + BaseInt) / 100 + 1)',
    ],
    notes: [
      '❗ Does not account for Int on Equipment or Scrolls. Luk is also assumed to not be accounted for (unconfirmed). Likely a bug',
    ],
  },
  {
    label: 'Heal',
    wip: false,
    status: 'warn',
    statusNote: 'Not yet re-verified against COT2 data. COT1 status: Data is limited - verified at Heal Lv 1, 2, and 5 only; maxed Heal is unverified',
    lines: [
      'MIN = ((BaseInt × 0.8 + Luk) / 200 + 3) × MagicAttack × (RecoveryRate / 100) × (TargetsHit × 0.1 + 1) / TargetsHit × 0.5',
      'MAX = ((BaseInt × 1.0 + Luk) / 200 + 3) × MagicAttack × (RecoveryRate / 100) × (TargetsHit × 0.1 + 1) / TargetsHit × 0.5',
    ],
    notes: [
      '❗ Does not account for Int or Luk on Equipment or Scrolls. Likely a bug',
      'Luk is assumed to be BASE Luk from AP - difficult to verify as mages have very low Luk on gear',
      'Data is limited - verified at Heal Lv 1, 2, and 5 only; maxed Heal is unverified',
    ],
  },
  {
    label: 'Damage Over Time (DoT)',
    wip: false,
    status: 'warn',
    statusNote: 'Carried over from COT1 - not yet re-verified against COT2 data.',
    lines: [
      'TotalDamage = (BasicAttack + MagicAttack / 7) × ((MagicAttack + BaseInt) / 100 + 1)',
      '',
      'DamagePerTick = TotalDamage / DoTDurationSeconds',
    ],
    notes: [
      '❗ Does not account for Int from Equipment or Scrolls. Likely a bug',
      'DoT damage ignores all Defense reductions',
    ],
  },
];

const BASE_DAMAGE_VARS = [
  { name: 'SkillMult',     desc: 'Skill Damage % as a decimal (e.g. 120% → 1.2)' },
  { name: 'PrimaryStat',   desc: 'Set by weapon type:\nStr - Melee Weapons (1H/2H Swords, Axes, Blunt Weapons, Spears, Polearms, Barehands, and Staves/Wands while whacking)\nDex - Bows and Crossbows\nLuk - Daggers and Claws' },
  { name: 'SecondaryStat', desc: 'Set by weapon type:\nDex - Melee Weapons\nStr - Bows and Crossbows\nStr + Dex - Daggers and Claws' },
  { name: 'AttackPower',   desc: 'Total weapon attack power from gear and buffs' },
  { name: 'WeaponAttack',  desc: 'Base weapon attack, including Stars and Arrows' },
  { name: 'MinWepMult',    desc: 'Weapon min multiplier (Swing or Stab) - see Weapon Multipliers table' },
  { name: 'MaxWepMult',    desc: 'Weapon max multiplier (Swing or Stab) - see Weapon Multipliers table' },
  { name: 'MasteryMult',   desc: '(0.1 + MasteryLevel / 10) × 0.8. Exception: Lucky Seven uses ~5.25' },
  { name: 'BasicAttack',   desc: 'Basic Attack damage value listed on the skill, for magic skills only' },
  { name: 'MagicAttack',        desc: 'TotalInt / 2 + EquipmentMagicAttack (MAGIC value shown in UI)' },
  { name: 'EquipmentMagicAttack', desc: 'Sum of Magic Attack on all gear (including above/below average and scrolled stats)' },
  { name: 'BaseInt',       desc: 'BASE Int from AP only - equipment stats not included (likely a bug)' },
  { name: 'Luk',           desc: 'BASE Luk from AP only - equipment stats not included (assumed - see Heal notes)' },
  { name: 'RecoveryRate',  desc: 'Heal skill recovery rate %' },
  { name: 'TargetsHit',    desc: 'Total targets hit: enemies + caster + allies in range' },
  { name: 'DoTDurationSeconds', desc: 'Duration of the DoT effect in seconds' },
];

// ─── Damage Modifications ─────────────────────────────────────

const MOD_PIPELINE_STEPS = [
  {
    label: 'Weapon Defense',
    wip: false,
    status: 'warn',
    statusNote: 'Not yet re-verified against COT2 data. COT1 status: PercentEffects and FlatEffects have not been verified, not enough data',
    lines: [
      'Damage = Damage × 100 / (trunc(WeaponDefense × (PercentEffects / 100 + 1)) + FlatEffects + 100)',
    ],
    notes: [
      'trunc() rounds toward zero (down for positive, up for negative)',
      'Applies to Physical damage only',
      'If Crossbow Mastery Ignore Defense procs, the entire defense formula is ignored',
      'PercentEffects and FlatEffects have not been verified. Not enough in game data for PercentEffects, and there are no known flat weapon defense (de)buffs in the game',
    ],
  },
  {
    label: 'Magic Defense',
    wip: false,
    status: 'warn',
    statusNote: 'Carried over from COT1 - not yet re-verified against COT2 data.',
    lines: [
      'Damage = Damage × 100 / (MagicDefense + 100)',
    ],
    notes: [
      'No other variables, this is the complete formula',
      'Applies to Magical damage only',
    ],
  },
  {
    label: 'Elemental Modifier',
    wip: false,
    status: 'warn',
    statusNote: 'Carried over from COT1 - not yet re-verified against COT2 data.',
    lines: [
      'Damage = Damage × ElementalMult',
      '  0.0  - immune',
      '  0.75 - resistant',
      '  1.0  - neutral',
      '  1.25 - weak against element',
    ],
    notes: [],
  },
  {
    label: 'Level Difference Penalty',
    wip: false,
    status: 'warn',
    statusNote: 'Carried over from COT1 - not yet re-verified against COT2 data.',
    lines: [
      'No penalty if player level ≥ enemy level',
      '  enemy < 10 levels above:  Damage / (LevelDiff² × 0.005 + 1)',
      '  enemy ≥ 10 levels above:  Damage / (LevelDiff × 0.05 + 1)',
      '     DoT damage always applies this penalty if the enemy is above your level ',
    ],
    notes: [
      
    ],
  },
  {
    label: 'Critical Hit',
    wip: false,
    status: 'warn',
    statusNote: 'Carried over from COT1 - not yet re-verified against COT2 data.',
    lines: [
      'Damage = Damage × CritDamage',
    ],
    notes: [],
  },
  {
    label: 'Iron Arrow Falloff (Crossbow only)',
    wip: false,
    status: 'warn',
    statusNote: 'Carried over from COT1 - not yet re-verified against COT2 data.',
    lines: [
      'Damage = Damage × (1 − ConsecutiveHits × 0.2)',
      '  1st mob: ×1.0,  2nd: ×0.8,  3rd: ×0.6 …',
    ],
    notes: [],
  },
  {
    label: 'Clamp',
    wip: false,
    status: 'warn',
    statusNote: 'Carried over from COT1 - not yet re-verified against COT2 data.',
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
  { name: 'FlatEffects',     desc: 'Flat modifiers to enemy weapon defense - no known sources' },
  { name: 'MagicDefense',    desc: "Enemy's magic defense stat" },
  { name: 'ElementalMult',   desc: 'Elemental modifier: 0.0, 0.75, 1.0, or 1.25' },
  { name: 'EnemyLevel',      desc: "Enemy's level" },
  { name: 'PlayerLevel',     desc: "Player's level" },
  { name: 'CritDamage',      desc: 'Crit damage from Stats Panel (e.g. 120% → 1.2)' },
  { name: 'ConsecutiveHits', desc: 'Iron Arrow: 0 for first mob hit, 1 for second, etc.' },
];


// ─── Formula tokenizer ───────────────────────────────────────

const FORMULA_FNS = new Set(['exp', 'rand', 'trunc', 'floor', 'clamp', 'max']);
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

// ─── Status tooltip ───────────────────────────────────────────

let _statusTip = null;
function getStatusTip() {
  if (!_statusTip) {
    _statusTip = document.createElement('div');
    _statusTip.className = 'formula-status-tooltip';
    document.body.appendChild(_statusTip);
  }
  return _statusTip;
}

function showStatusTooltip(anchor, text) {
  const tip = getStatusTip();
  tip.textContent = text;
  tip.style.visibility = 'hidden';
  tip.classList.add('visible');

  const rect = anchor.getBoundingClientRect();
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  let x = rect.left + rect.width / 2 - tw / 2 + window.scrollX;
  let y = rect.top - th - 6 + window.scrollY;
  x = Math.max(8, Math.min(x, window.innerWidth - tw - 8));
  if (y < window.scrollY + 8) y = rect.bottom + 6 + window.scrollY;

  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
  tip.style.visibility = '';
}

function hideStatusTooltip() {
  _statusTip?.classList.remove('visible');
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
  steps.forEach(({ label, wip, status, statusNote, lines, notes }, i) => {
    const step = el('div', { className: 'formulas-pipeline-step' });

    const stepHeader = el('div', { className: 'formulas-pipeline-header' });
    stepHeader.appendChild(el('span', { className: 'formulas-pipeline-badge', textContent: i + 1 }));
    stepHeader.appendChild(el('span', { className: 'formulas-pipeline-title', textContent: label }));
    if (wip) stepHeader.appendChild(el('span', { className: 'formulas-wip-tag', textContent: 'WIP' }));
    if (status) {
      const statusLabels = { ok: 'Verified', partial: 'Partially Verified', warn: 'Unverified' };
      const statusTag = el('span', { className: `formulas-status-tag formulas-status-${status}`, textContent: statusLabels[status] });
      const tooltipText = statusNote ?? (status === 'ok' ? 'Formula has been validated across multiple datapoints and edge cases' : null);
      if (tooltipText) {
        statusTag.addEventListener('mouseenter', () => showStatusTooltip(statusTag, tooltipText));
        statusTag.addEventListener('mouseleave', hideStatusTooltip);
      }
      stepHeader.appendChild(statusTag);
    }
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
  const table = el('table', { className: 'data-table' });

  const thead = el('thead');
  const headerRow = el('tr');
  for (const [text, cls] of [['Level', ''], ['Exp to Level Up', 'num'], ['Accumulated Exp', 'num']]) {
    headerRow.appendChild(el('th', { className: `${cls} formulas-exp-th`.trim(), textContent: text }));
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  let accumulated = 0;
  EXP_TABLE.forEach(([from, , exp]) => {
    const row = el('tr', { className: 'formulas-exp-row' });

    const lvlCell = el('td', { className: 'formulas-exp-td' });
    lvlCell.appendChild(el('span', { className: 'lvl-chip', textContent: `Lv ${from}` }));
    row.appendChild(lvlCell);

    row.appendChild(el('td', { className: 'num formulas-exp-val formulas-exp-td', textContent: exp.toLocaleString() }));
    row.appendChild(el('td', { className: 'num formulas-accum-val formulas-exp-td', textContent: accumulated.toLocaleString() }));

    tbody.appendChild(row);
    accumulated += exp;
  });
  table.appendChild(tbody);
  container.appendChild(table);
  container.appendChild(el('div', { className: 'formulas-note formulas-note--padded', textContent: 'Unverified: carried over from COT1, not yet re-verified against COT2 data.' }));
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

  container.appendChild(el('div', { className: 'formulas-note formulas-note--padded', textContent: '* Dagger uses Stab multiplier for both MinWepMult and MaxWepMult when stabbing. Savage Blow and Double Stab always Stab. Steal uses both.' }));
  container.appendChild(el('div', { className: 'formulas-note formulas-note--padded', textContent: 'Unverified: carried over from COT1, not yet re-verified against COT2 data.' }));

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

  const disclaimer = el('div', { className: 'formulas-disclaimer' });
  const disclaimerText = el('span');
  disclaimerText.appendChild(el('strong', { textContent: 'Warning: ' }));
  disclaimerText.append('Everything on this page is currently unverified. These formulas and tables are carried over from Closed Online Test 1 and have not yet been re-verified against COT2 data. The COT1 page is still available by time travelling to that patch.');
  disclaimer.appendChild(disclaimerText);
  wrapper.appendChild(disclaimer);

  // Full-width formula sections
  const fullWidth = el('div', { className: 'formulas-full' });

  const accuracySection = makeCollapsibleSection('Accuracy', '', buildAccuracySection);
  const accCredit = el('span', { className: 'formulas-credit' });
  accCredit.innerHTML = 'Reverse engineered by <strong>@Slash</strong> on Discord';
  accuracySection.querySelector('.left').appendChild(accCredit);

  const baseDmgSection = makeCollapsibleSection('Base Damage Formulas', '', buildBaseDamageSection);
  const dmgCredit = el('span', { className: 'formulas-credit' });
  dmgCredit.innerHTML = 'Reverse engineered by <strong>@Slash, @kirbypickr, @sublimerealist, @jimmybald</strong> on Discord';
  baseDmgSection.querySelector('.left').appendChild(dmgCredit);

  const modsSection = makeCollapsibleSection('Damage Modifications', '', buildModsSection);
  const modsCredit = el('span', { className: 'formulas-credit' });
  modsCredit.innerHTML = 'Reverse engineered by <strong>@Slash</strong> on Discord';
  modsSection.querySelector('.left').appendChild(modsCredit);

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
  const weaponMultCredit = el('span', { className: 'formulas-credit' });
  weaponMultCredit.innerHTML = 'Reverse engineered by <strong>@kirbypickr, @Slash</strong> on Discord';
  weaponMultSection.querySelector('.left').appendChild(weaponMultCredit);

  appendix.appendChild(weaponMultSection);
  appendix.appendChild(expSection);
  wrapper.appendChild(appendix);

  frag.appendChild(wrapper);
  return frag;
}
