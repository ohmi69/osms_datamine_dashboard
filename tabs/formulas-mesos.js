import { el, makePillGroup } from '../lib/utils.js';
import { getMobThumbUrl, getMobGifUrl } from '../lib/data.js';
import { buildTable, makeCollapsibleSection, attachTooltip } from './formulas-shared.js';
import { markFormulaSection } from './formulas-layout.js';
import { buildMobPicker, buildCalcGroup } from './formulas-calc.js';
import { numberField } from './formulas-mob-hit.js';

// Server-side rules fitted to captures, not extracted from the client.
// Evidence, match rates and ownership exceptions: docs/MESO_RESEARCH.md.
export function mesoAmount(level, roll = 100) {
  // Integer arithmetic preserves floor(2.1 * level) at decimal boundaries.
  const base = Math.floor(21 * level / 10) + 3;
  return { base, amount: Math.floor(base * roll / 100),
    min: Math.floor(base * 90 / 100), max: Math.floor(base * 110 / 100) };
}

export function mesoSplit(amount, members) {
  const other = Math.floor(4 * amount / (5 * members));
  return { other, picker: amount - (members - 1) * other };
}

function paragraph(body, text) {
  body.appendChild(el('p', { textContent: text }));
}

function formula(body, text) {
  body.appendChild(el('pre', { className: 'spawn-reference-formula' }, el('code', { textContent: text })));
}

function table(body, columns, rows) {
  body.appendChild(el('div', { className: 'formulas-table-wrap' }, buildTable(columns, rows)));
}

function section(title, key, tooltip, build) {
  const body = el('div', { className: 'spawn-reference-body' });
  build(body);
  const node = markFormulaSection(makeCollapsibleSection(title, '', () => body), key);
  if (tooltip) node.querySelector('.right').appendChild(attachTooltip(el('span', {
    className: 'formulas-status-tag formulas-status-ok', textContent: 'Verified',
  }), tooltip));
  return node;
}

function buildGuide(monsters) {
  const page = el('div', { className: 'formulas-full spawn-reference' });
  page.appendChild(section('Meso Drop Amount', 'meso-amount',
    'Confirmed against captured meso drops.', body => {
      body.appendChild(el('div', { className: 'formulas-warn-notes' },
        el('div', { className: 'formulas-note', textContent: 'This formula has only been verified on mobs from level 1 to 22. If you see a drop outside the predicted range, reach out to @ohmi on the CW Discord!' })));
      paragraph(body, 'The mob\'s level determines the base drop. Each drop is a random 90–110% of the base, rounded down.');
      formula(body, 'Base   = floor(2.1 × MonsterLevel) + 3\nRoll   = rand(90, 110)\nAmount = floor(Base × Roll / 100)');
      paragraph(body, 'Mobs drop mesos about two-thirds (67%) of the time.');
    }));

  page.appendChild(section('Party Meso Share', 'meso-share',
    'Confirmed against captured party pickups.', body => {
      paragraph(body, 'The looter takes 20% off the top. The other 80% is split evenly between everyone, looter included, and the looter also keeps whatever is lost to rounding.');
      formula(body, 'EqualCut    = floor(0.8 × Amount / Members)\nLooterShare = Amount − (Members − 1) × EqualCut\n            ≈ 20% of Amount + EqualCut\nOtherShare  = EqualCut');
      table(body, [['Input', ''], ['Meaning', '']], [
        ['Amount', 'Mesos in the drop.'],
        ['Members', 'You plus the party members on your map when the drop is picked up.'],
      ]);
    }));

  page.appendChild(section('Calculator', 'meso-calc', '', body => body.appendChild(buildMesoCalc(monsters))));
  return page;
}

const ROLES = [
  { label: 'You', value: 'picker' },
  { label: 'Party Member', value: 'other' },
  { label: 'Solo', value: 'solo' },
];

function buildMesoCalc(monsters) {
  const startMob = monsters.find(m => m.name === 'Horny Mushroom') ?? monsters[0] ?? null;
  const state = { level: startMob?.level ?? 22, members: 3, role: 'picker' };
  let mob = startMob;
  const invalid = new Set();
  const wrap = el('section', {
    className: 'formulas-graph formulas-chart-wrap formulas-damage-graph formulas-mob-hit formulas-mob-picker-host formulas-meso-calc',
    'aria-label': 'Meso calculator',
  });
  const controls = el('div', { className: 'formulas-graph-controls formulas-grouped-controls' });
  const output = el('div', { className: 'formulas-graph-readout', 'aria-live': 'polite' });
  const breakdown = el('div', { className: 'formulas-mob-hit-rows' });
  const setter = (key, field) => value => {
    if (value === null) invalid.add(field());
    else { invalid.delete(field()); state[key] = value; }
    draw();
  };

  const setLevel = setter('level', () => levelField);
  const levelField = numberField('Monster level', state.level, { short: 'Level', min: 1, max: 255, range: 100,
    hint: 'Picking a monster fills this in.',
    onChange: value => {
      // A typed level no longer describes the picked monster, so drop the pick.
      if (mob && value !== mob.level) { mob = null; picker?._setValue(null); }
      setLevel(value);
    } });
  let picker = null;
  let mobField = null;
  if (monsters.length) {
    mobField = el('div', { className: 'formulas-graph-stat formulas-mob-picker-field' });
    picker = buildMobPicker(monsters, picked => {
      mob = picked;
      levelField._set(picked.level);
      setLevel(picked.level);
    });
    picker._setValue(startMob);
    mobField.appendChild(picker);
  }
  const rolePills = makePillGroup(ROLES, state.role, role => {
    state.role = role;
    rolePills.setActive(role);
    // display: grid on the field overrides the hidden attribute.
    membersField.style.display = role === 'solo' ? 'none' : '';
    draw();
  });
  const roleField = el('div', { className: 'formulas-meso-role' },
    el('span', { className: 'formulas-calc-label', textContent: 'Looted by' }), rolePills);
  const membersField = numberField('Party members counted', state.members, { short: 'Members (incl. you)', min: 1, max: 6, range: 6,
    hint: 'You plus the party members on your map when the drop is picked up.', onChange: setter('members', () => membersField) });

  controls.append(buildCalcGroup('Monster', ...[mobField, levelField].filter(Boolean)),
    buildCalcGroup('Party', roleField, membersField));
  wrap.append(el('div', { className: 'formulas-chart-head' }, el('strong', { textContent: 'Meso calculator' })),
    el('div', { className: 'formulas-damage-layout' }, controls,
      el('div', { className: 'formulas-damage-result' }, output, breakdown)));

  const row = (label, value) => el('div', { className: 'formulas-mob-hit-row' },
    el('span', { className: 'formulas-mob-hit-row-label', textContent: label }), el('strong', { textContent: value }));
  function draw() {
    const shared = state.role !== 'solo';
    // The members count is hidden and unused for an unshared drop.
    const bad = [...invalid].find(field => shared || field !== membersField);
    const problem = bad
      ? `Enter ${bad._label.toLowerCase()} from ${bad._min} to ${bad._max}, using whole numbers.`
      : state.role === 'other' && state.members < 2 ? 'Another member can only pick up the drop with at least two members counted.' : '';
    if (problem) {
      // The rows' display: grid overrides the hidden attribute, so empty them instead.
      breakdown.replaceChildren();
      output.replaceChildren(el('div', { className: 'formulas-calc-error', role: 'alert', textContent: problem }));
      return;
    }
    const result = mesoAmount(state.level);
    const party = shared && state.members > 1;
    // The looter's remainder can dip as the drop grows, so take the range over every roll.
    const amounts = [];
    for (let roll = 90; roll <= 110; roll++) amounts.push(mesoAmount(state.level, roll).amount);
    const range = pick => {
      const values = amounts.map(pick);
      const lo = Math.min(...values), hi = Math.max(...values);
      return lo === hi ? lo.toLocaleString() : `${lo.toLocaleString()}–${hi.toLocaleString()}`;
    };
    const looter = range(a => mesoSplit(a, state.members).picker);
    const other = range(a => mesoSplit(a, state.members).other);
    const drop = range(a => a);
    const share = !party ? drop : state.role === 'picker' ? looter : other;

    const head = el('div', { className: 'formulas-mob-hit-head' });
    const art = mob && (getMobGifUrl(mob.gif) || getMobThumbUrl(mob.thumbnail));
    if (art) head.appendChild(el('img', { className: 'formulas-calc-hero', src: art, alt: '' }));
    head.appendChild(el('div', {},
      el('strong', { className: 'formulas-graph-result', textContent: `${share} mesos` }),
      el('span', { className: 'formulas-graph-hint', textContent: party
        ? `your share of a ${drop} meso drop, split ${state.members} ways`
        : `the whole ${drop} meso drop` })));
    output.replaceChildren(head);

    breakdown.replaceChildren(
      row(`Base (level ${state.level})`, result.base.toLocaleString()),
      row('Drop', drop),
      ...(party ? [row('Looter gets', looter), row(`Each of the other ${state.members - 1} party members`, other)] : []));
  }
  draw();
  return wrap;
}

export function createMesoPage(monsters = []) {
  return {
    key: 'mesos', label: 'Mesos', kicker: 'Reference · Drop amounts and party sharing',
    description: 'Estimate a monster’s meso drop and see how the picker and party divide it.',
    credit: () => ['Derived by ', el('strong', { textContent: 'azzy' }), ' on Discord'],
    sections: [
      { key: 'meso-amount', label: 'Drop amount' }, { key: 'meso-share', label: 'Party share' },
      { key: 'meso-calc', label: 'Calculator' },
    ],
    render: () => buildGuide(monsters),
  };
}
