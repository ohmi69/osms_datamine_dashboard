import { el } from '../lib/utils.js';
import { getMobThumbUrl, getMobGifUrl } from '../lib/data.js';
import { attachTooltip, buildTable, makeCollapsibleSection } from './formulas-shared.js';
import { markFormulaSection } from './formulas-layout.js';
import { buildMobPicker, buildCalcGroup } from './formulas-calc.js';
import { numberField } from './formulas-mob-hit.js';

// Fitted from captured kills, not read from the client: the server decides kill EXP.
// Evidence and match rates: docs/PARTY_EXP_RESEARCH.md.
function paragraph(parent, text) {
  parent.appendChild(el('p', { textContent: text }));
}

function formula(parent, text) {
  parent.appendChild(el('pre', { className: 'spawn-reference-formula' }, el('code', { textContent: text })));
}

function table(parent, columns, rows) {
  parent.appendChild(el('div', { className: 'formulas-table-wrap' }, buildTable(columns, rows)));
}

const STATUS_TAGS = {
  verified: ['formulas-status-ok', 'Verified'],
  'partially-verified': ['formulas-status-warn', 'Partially verified'],
};

function section(title, key, status, tooltip, build) {
  const body = el('div', { className: 'spawn-reference-body' });
  build(body);
  const node = markFormulaSection(makeCollapsibleSection(title, '', () => body), key);
  if (STATUS_TAGS[status]) {
    const [className, textContent] = STATUS_TAGS[status];
    node.querySelector('.right').appendChild(attachTooltip(el('span', {
      className: `formulas-status-tag ${className}`, textContent,
    }), tooltip));
  }
  return node;
}

function buildGuide(monsters) {
  const page = el('div', { className: 'formulas-full spawn-reference' });

  page.appendChild(section('Your Share of a Kill', 'party-exp-share', 'verified',
    'Confirmed against the EXP the server sends for solo and party kills.', body => {
      paragraph(body, 'The mob\'s EXP becomes a shared pool, scaled by how much of its HP your party took off. 80% of the pool is split by level across the eligible party members and 20% by the share of the damage each member dealt.');
      formula(body, 'Pool  = MobEXP × PartyDamage / MobMaxHP\nShare = max(1, round(Pool × (0.8 × YourLevel / EligibleLevels\n                            + 0.2 × YourDamage / PartyDamage)))');
      table(body, [['Input', ''], ['Meaning', '']], [
        ['MobEXP, MobMaxHP', 'The mob\'s EXP and max HP'],
        ['PartyDamage', 'Damage dealt by party members, including you.'],
        ['YourDamage', 'Your own counted damage.'],
        ['EligibleLevels', 'Sum of the levels of the eligible party members, including yours (see below)'],
      ]);
    }));

  page.appendChild(section('Who Counts as Eligible', 'party-exp-eligible', 'verified',
    'Confirmed against the EXP the server sends for party kills.', body => {
      table(body, [['Case', ''], ['Counts?', '']], [
        ['On your map, attacked, took damage, or used a skill within 10 s', 'Yes'],
        ['On your map, no activity within 10 s', 'No'],
        ['On another map', 'No, even if they were fighting seconds before the kill'],
      ]);
    }));

  page.appendChild(section('Party Bonus', 'party-exp-bonus', 'verified',
    'Confirmed against the EXP the server sends for party kills.', body => {
      paragraph(body, 'A party kill pays a bonus on top of your share. It grows with the number of eligible members and with the number of party members who damaged the mob.');
      formula(body, 'Bonus    = min(0.3, 0.1 × (EligibleMembers − 1))\n         + 0.05 × (MembersWhoDamagedIt − 1)\nBonusEXP = max(1, round(Share × Bonus))');
      // Whole percents: 10 × (eligible − 1) capped at 30, plus 5 per extra attacker.
      const attackers = [1, 2, 3, 4, 5, 6];
      table(body, [['Eligible members', ''], ...attackers.map(n => [`${n} damaged it`, 'num'])],
        [2, 3, 4, 5, 6].map(eligible => [eligible, ...attackers.map(n =>
          n > eligible ? '–' : `${Math.min(30, 10 * (eligible - 1)) + 5 * (n - 1)}%`)]));
    }));

  if (monsters.length) {
    page.appendChild(section('Calculator', 'party-exp-calc', '', '', body => body.appendChild(buildPartyExpCalc(monsters))));
  }

  return page;
}

// Half-up, as the server rounds.
const round = x => Math.floor(x + 0.5);

export function partyExp(s) {
  const others = s.eligible - 1;
  const totalLevel = s.level + (others ? s.otherLevels : 0);
  // With no one else in the party, all of the party's damage is yours.
  const damageShare = others ? s.damagePct / 100 : 1;
  const levelPart = 0.8 * s.level / totalLevel;
  const damagePart = 0.2 * damageShare;
  const share = Math.max(1, round(s.mobExp * (levelPart + damagePart)));
  const bonusPct = others
    ? Math.min(0.3, 0.1 * others) + 0.05 * Math.max(0, s.attackers - 1)
    : 0;
  const bonus = bonusPct ? Math.max(1, round(share * bonusPct)) : 0;
  return { levelPart, damagePart, share, bonusPct, bonus, total: share + bonus };
}

function buildPartyExpCalc(monsters) {
  const startMob = monsters.find(m => m.name === 'Green Mushroom') ?? monsters[0];
  const state = { mobExp: startMob.exp ?? 0, level: 30, eligible: 4, otherLevels: 90, damagePct: 25, attackers: 2 };
  let mob = startMob;
  const invalid = new Set();

  const wrap = el('section', { className: 'formulas-graph formulas-chart-wrap formulas-damage-graph formulas-mob-hit formulas-mob-picker-host formulas-party-exp-calc',
    'aria-label': 'Party EXP calculator' });
  const controls = el('div', { className: 'formulas-graph-controls formulas-grouped-controls' });
  const output = el('div', { className: 'formulas-graph-readout', 'aria-live': 'polite' });
  const breakdown = el('div', { className: 'formulas-mob-hit-rows' });

  const setter = (key, field) => (v) => {
    if (v === null) invalid.add(field()); else { invalid.delete(field()); state[key] = v; }
    draw();
  };

  const mobField = el('div', { className: 'formulas-graph-stat formulas-mob-picker-field' });
  const picker = buildMobPicker(monsters, (picked) => {
    mob = picked;
    state.mobExp = picked.exp ?? 0;
    mobExpField._set(state.mobExp);
    invalid.delete(mobExpField);
    draw();
  });
  picker._setValue(startMob);
  mobField.appendChild(picker);

  const setMobExp = setter('mobExp', () => mobExpField);
  const mobExpField = numberField('Monster EXP', state.mobExp, { short: 'EXP', min: 0, max: 9999999, range: 500,
    hint: 'Picking a monster fills this in.',
    onChange: (v) => {
      // A typed EXP no longer describes the picked monster, so drop the pick.
      if (mob && v !== mob.exp) { mob = null; picker._setValue(null); }
      setMobExp(v);
    } });
  const levelField = numberField('Your level', state.level, { short: 'Level', min: 1, max: 200, range: 100,
    onChange: setter('level', () => levelField) });
  const damageField = numberField('Damage you dealt', state.damagePct, { short: 'Damage you dealt (% of its HP)', min: 0, max: 100, range: 100,
    hint: 'How much of the monster\'s HP you took off yourself. Your party dealt the rest.', onChange: setter('damagePct', () => damageField) });
  const eligibleField = numberField('Eligible members', state.eligible, { short: 'Eligible members (incl. you)', min: 1, max: 6, range: 6,
    hint: 'You, plus party members on your map who attacked, took damage or used a skill in the 10 seconds before the kill.',
    // Cap the attackers before setEligible redraws, so the result never shows the old count.
    onChange: (v) => { if (v !== null) { state.eligible = v; limitAttackers(); } setEligible(v); } });
  const setEligible = setter('eligible', () => eligibleField);
  const otherLevelsField = numberField('Combined level of the others', state.otherLevels, { min: 0, max: 1000, range: 500,
    hint: 'The levels of the other eligible members added together, not counting yours.', onChange: setter('otherLevels', () => otherLevelsField) });
  const attackersField = numberField('Members who damaged it', state.attackers, { short: 'Members who damaged it (incl. you)', min: 1, max: 6, range: 6,
    hint: 'Eligible members, including you, who dealt damage to this monster. Always part of the eligible members. Each one after the first adds 5% to the party bonus.', onChange: setter('attackers', () => attackersField) });

  // Anyone who hit the monster was active, so "damaged it" can never exceed "eligible".
  // Cap the field at the eligible count instead of letting the inputs disagree.
  const [attackersInput] = attackersField.querySelectorAll('input');
  attackersField.addEventListener('input', (e) => {
    if (Number(e.target.value) > state.eligible) e.target.value = String(state.eligible);
  }, true);
  function limitAttackers() {
    // The slider keeps the eligible slider's 1-6 scale; the input listener above stops it at the cap.
    attackersInput.max = String(state.eligible);
    attackersField._max = state.eligible;
    if (state.attackers > state.eligible) {
      state.attackers = state.eligible;
      attackersField._set(state.eligible);
      invalid.delete(attackersField);
    }
  }
  limitAttackers();

  controls.append(
    buildCalcGroup('Monster', mobField, mobExpField),
    buildCalcGroup('You', levelField, damageField),
    buildCalcGroup('Party', eligibleField, otherLevelsField, attackersField));

  wrap.append(
    el('div', { className: 'formulas-chart-head' }, el('strong', { textContent: 'Party EXP calculator' })),
    el('div', { className: 'formulas-damage-layout' }, controls,
      el('div', { className: 'formulas-damage-result' }, output, breakdown)));

  const row = (label, value) => el('div', { className: 'formulas-mob-hit-row' },
    el('span', { className: 'formulas-mob-hit-row-label', textContent: label }),
    el('strong', { textContent: value }));
  const pct = p => `${(p * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;

  function draw() {
    const bad = [...invalid][0];
    const others = state.eligible - 1;
    const problem = bad
      ? `Enter ${bad._label.toLowerCase()} from ${bad._min} to ${bad._max}, using whole numbers.`
      : others && state.otherLevels < others ? 'The combined level must be at least 1 per other eligible member.' : '';
    if (problem) {
      // The rows' display: grid overrides the hidden attribute, so empty them instead.
      breakdown.replaceChildren();
      output.replaceChildren(el('div', { className: 'formulas-calc-error', role: 'alert', textContent: problem }));
      return;
    }

    const r = partyExp(state);
    const head = el('div', { className: 'formulas-mob-hit-head' });
    const art = mob && (getMobGifUrl(mob.gif) || getMobThumbUrl(mob.thumbnail));
    if (art) head.appendChild(el('img', { className: 'formulas-calc-hero', src: art, alt: '' }));
    head.appendChild(el('div', {},
      el('strong', { className: 'formulas-graph-result', textContent: `${r.total.toLocaleString()} EXP` }),
      el('span', { className: 'formulas-graph-hint', textContent:
        r.bonus ? `${r.share.toLocaleString()} + ${r.bonus.toLocaleString()} party bonus` : 'no party bonus' })));
    output.replaceChildren(head);

    breakdown.replaceChildren(
      row('Level part', `0.8 × ${state.level} / ${state.level + (others ? state.otherLevels : 0)} = ${pct(r.levelPart)}`),
      row('Damage part', `0.2 × ${others ? state.damagePct : 100}% = ${pct(r.damagePart)}`),
      row('Your share', r.share.toLocaleString()),
      row('Party bonus', `${pct(r.bonusPct)} → ${r.bonus.toLocaleString()}`));
  }

  draw();
  return wrap;
}

export function createPartyExpPage(monsters = []) {
  return {
    key: 'party-exp', label: 'Party EXP', kicker: 'Reference · EXP from kills and party sharing',
    description: 'See how a kill\'s EXP is split across a party and how the party bonus is added.',
    credit: () => ['Derived by ', el('strong', { textContent: 'azzy' }), ' on Discord'],
    sections: [
      { key: 'party-exp-share', label: 'Your share' }, { key: 'party-exp-eligible', label: 'Eligibility' },
      { key: 'party-exp-bonus', label: 'Party bonus' },
      ...(monsters.length ? [{ key: 'party-exp-calc', label: 'Calculator' }] : []),
    ],
    render: () => buildGuide(monsters),
  };
}
