import { el } from '../lib/utils.js';
import { getMobThumbUrl, getMobGifUrl } from '../lib/data.js';
import { attachTooltip, buildTable, makeCollapsibleSection } from './formulas-shared.js';
import { markFormulaSection } from './formulas-layout.js';
import { buildMobPicker, buildCalcGroup } from './formulas-calc.js';
import { numberField } from './formulas-mob-hit.js';

// Fitted, not read from the client. Monster EXP is authored in Mob.wz; the level
// rule is fitted to those values (docs/MOB_EXP_RESEARCH.md). Party sharing is
// fitted from captured kills, since the server decides kill EXP
// (docs/PARTY_EXP_RESEARCH.md).
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

  page.appendChild(section('Monster EXP', 'exp-monster', 'partially-verified',
    'The level 31 and below rule and the boss and special multipliers match every monster\'s EXP in the game data. The curve from level 32 is fitted; other constants fit equally well.', body => {
      paragraph(body, 'A monster\'s EXP scales based off its level, scaling linearly through level 31, then curving upward. Bosses and special event and PQ monsters have bonus scaling on top.');
      // Formula and chart side by side; the row stacks on narrow screens.
      const row = el('div', { className: 'formulas-mob-exp-row' });
      formula(row, 'Level ≤ 31:\n  Base = ceil(1.84 × Level)\nLevel ≥ 32:\n  Base = round(7.74 × 1.0536^Level\n               + 0.5 × Level + 3)\n\nBoss    = 4 × Base\nSpecial = floor(1.75 × Base)');
      if (monsters.length) row.appendChild(buildMobExpChart(monsters));
      body.appendChild(row);
      table(body, [['Kind', ''], ['Monsters', '']], [
        ['Boss', 'Mano, Stumpy, Mushmom, Shade, Zombie Mushmom, Rotten Mushmom, Faust, Jr. Balrog'],
        ['Special (Event/PQ Mobs)', 'Orange Slime, the KPQ Ligator, Jr. Necki and Curse Eye, and the Primrose Hill Stirge, Flyeye and Goblin Fire'],
      ]);
      table(body, [['Exception', ''], ['EXP', 'num'], ['Note', '']], [
        ['Rotten Mushroom (level 56)', 183, ''],
        ['King Slime (level 32)', 2400, ''],
        ['Crimson Balrog (level 100)', 6000, ''],
        ['Tutorial Jr. Sentinel (level 1)', 1, 'Tutorial monster'],
      ]);
    }));

  page.appendChild(section('EXP Share', 'party-exp-share', 'verified',
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

// Integer arithmetic keeps ceil(1.84 × level) exact at whole-number products (level 25).
export function mobBaseExp(level) {
  return level <= 31 ? Math.ceil(184 * level / 100) : round(7.74 * 1.0536 ** level + 0.5 * level + 3);
}

const BOSS_IDS = new Set([800003]);
const SPECIAL_IDS = new Set([800000, 800001, 800002, 800020, 800021, 800022, 800024, 900000]);

// The unrounded base, for drawing a smooth line; the rounded values are integer
// steps that zigzag visibly on a short range.
const smoothBaseExp = level => level <= 31 ? 1.84 * level : 7.74 * 1.0536 ** level + 0.5 * level + 3;

const MOB_EXP_KINDS = {
  regular: { label: 'Regular', exp: base => base, scale: 1, maxLevel: 75 },
  boss: { label: 'Boss', exp: base => 4 * base, scale: 4, maxLevel: 100 },
  special: { label: 'Special', exp: base => Math.floor(1.75 * base), scale: 1.75, maxLevel: 40 },
};

function mobExpKind(mob) {
  if ((mob.id >= 700000 && mob.id < 800000) || BOSS_IDS.has(mob.id)) return 'boss';
  if (SPECIAL_IDS.has(mob.id)) return 'special';
  return 'regular';
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// Formula curve with every monster's real EXP on top, so the fit and its
// exceptions are visible. Hovering snaps to the nearest level.
function buildMobExpChart(monsters) {
  const W = 440, H = 300;
  const M = { t: 14, r: 14, b: 32, l: 48 };
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;
  // Test mobs pay 0 EXP and sit outside the rule.
  const mobs = monsters.filter(m => m.exp > 0 && m.level >= 1);

  const wrap = el('div', { className: 'formulas-chart-wrap formulas-mob-exp-chart' });
  const head = el('div', { className: 'formulas-chart-head' });
  const title = el('span', { className: 'formulas-chart-title' });
  const toggle = el('div', { className: 'formulas-chart-scale' });
  head.append(title, toggle);
  const plot = el('div', { className: 'formulas-chart-plot' });
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'formulas-chart-svg formulas-mob-exp-svg', role: 'img' });
  const tip = el('div', { className: 'formulas-chart-tip' });
  plot.append(svg, tip);
  const legendItem = (cls, text) => el('span', { className: 'formulas-mob-exp-key' },
    el('span', { className: `formulas-mob-exp-swatch ${cls}` }), text);
  const legend = el('div', { className: 'formulas-mob-exp-legend' },
    legendItem('is-line', 'Formula'), legendItem('is-dot', 'Monster'), legendItem('is-ring', 'Exception'));
  wrap.append(head, plot, legend);

  let mode = 'regular';

  function draw() {
    svg.replaceChildren();
    tip.classList.remove('visible');
    const kind = MOB_EXP_KINDS[mode];
    title.textContent = `${kind.label} monster EXP by level`;
    const maxLevel = kind.maxLevel;
    const curve = Array.from({ length: maxLevel }, (_, i) => kind.exp(mobBaseExp(i + 1)));
    const dots = mobs.filter(m => mobExpKind(m) === mode && m.level <= maxLevel);

    const peak = Math.max(...curve, ...dots.map(m => m.exp));
    // Smallest 1/2/2.5/5 × 10^k step that covers the peak in at most six gridlines.
    const mag = 10 ** Math.floor(Math.log10(peak / 6));
    const tick = [1, 2, 2.5, 5, 10].map(f => f * mag).find(t => 6 * t >= peak);
    const ticks = Math.ceil(peak / tick);
    const ymax = ticks * tick;
    const xOf = lvl => M.l + (lvl - 1) / (maxLevel - 1) * plotW;
    const yOf = v => M.t + plotH - v / ymax * plotH;

    const grid = svgEl('g', { class: 'formulas-chart-grid' });
    const text = (x, y, value, anchor) => {
      const node = svgEl('text', { x, y, class: 'formulas-chart-axis-label', 'text-anchor': anchor });
      node.textContent = value;
      grid.appendChild(node);
    };
    for (let i = 0; i <= ticks; i++) {
      const v = tick * i;
      grid.appendChild(svgEl('line', { x1: M.l, x2: M.l + plotW, y1: yOf(v), y2: yOf(v) }));
      text(M.l - 8, yOf(v) + 3.5, v.toLocaleString(), 'end');
    }
    const step = maxLevel > 60 ? 20 : 10;
    [1, ...Array.from({ length: Math.floor(maxLevel / step) }, (_, i) => (i + 1) * step)]
      .forEach(lvl => text(xOf(lvl), M.t + plotH + 20, lvl, 'middle'));
    svg.appendChild(grid);

    // Where the linear rule hands over to the curve.
    const split = xOf(31.5);
    svg.appendChild(svgEl('line', { x1: split, x2: split, y1: M.t, y2: M.t + plotH, class: 'formulas-mob-exp-split' }));
    const splitLabel = svgEl('text', { x: split + 4, y: M.t + 10, class: 'formulas-chart-axis-label', 'text-anchor': 'start' });
    splitLabel.textContent = 'curve from 32';
    svg.appendChild(splitLabel);

    // Sampled every tenth of a level; the 31 → 32 rule change shows as a small jump.
    const line = Array.from({ length: (maxLevel - 1) * 10 + 1 }, (_, i) => 1 + i / 10)
      .map((lvl, i) => `${i ? 'L' : 'M'}${xOf(lvl).toFixed(2)} ${yOf(kind.scale * smoothBaseExp(lvl)).toFixed(2)}`)
      .join(' ');
    svg.appendChild(svgEl('path', { class: 'formulas-chart-line', d: line }));

    // Same-level, same-EXP monsters share one dot.
    const byPoint = new Map();
    dots.forEach(m => {
      const key = `${m.level}:${m.exp}`;
      if (!byPoint.has(key)) byPoint.set(key, { level: m.level, exp: m.exp, names: [] });
      if (!byPoint.get(key).names.includes(m.name)) byPoint.get(key).names.push(m.name);
    });
    // Exceptions last, so a matching neighbour never hides them.
    const points = [...byPoint.values()]
      .sort((a, b) => (a.exp !== curve[a.level - 1]) - (b.exp !== curve[b.level - 1]));
    points.forEach(p => svg.appendChild(svgEl('circle', {
      cx: xOf(p.level), cy: yOf(p.exp), r: 4,
      class: p.exp === curve[p.level - 1] ? 'formulas-mob-exp-dot' : 'formulas-mob-exp-ring',
    })));

    const focus = svgEl('g', { class: 'formulas-chart-focus' });
    const crosshair = svgEl('line', { y1: M.t, y2: M.t + plotH });
    const marker = svgEl('circle', { r: 4.5 });
    focus.append(crosshair, marker);
    svg.appendChild(focus);
    const hit = svgEl('rect', { x: M.l, y: M.t, width: plotW, height: plotH, class: 'formulas-chart-hit' });
    svg.appendChild(hit);

    const exceptions = points.filter(p => p.exp !== curve[p.level - 1]).length;
    svg.setAttribute('aria-label', `${kind.label} monster EXP from level 1 to ${maxLevel}: the formula curve and ${points.length} monster values, ${exceptions} off the curve.`);

    hit.addEventListener('pointermove', e => {
      const rect = svg.getBoundingClientRect();
      const scale = rect.width / W;
      const vx = (e.clientX - rect.left) / scale;
      const lvl = Math.max(1, Math.min(maxLevel, Math.round((vx - M.l) / plotW * (maxLevel - 1)) + 1));
      const x = xOf(lvl), y = yOf(kind.scale * smoothBaseExp(lvl));
      crosshair.setAttribute('x1', x);
      crosshair.setAttribute('x2', x);
      marker.setAttribute('cx', x);
      marker.setAttribute('cy', y);
      focus.classList.add('visible');
      tip.replaceChildren(
        el('div', { className: 'formulas-chart-tip-lvl', textContent: `Level ${lvl}` }),
        el('div', { className: 'formulas-chart-tip-val', textContent: `${curve[lvl - 1].toLocaleString()} EXP` }),
        ...points.filter(p => p.level === lvl).map(p => el('div', {
          className: 'formulas-chart-tip-sub', textContent: `${p.names.join(', ')}: ${p.exp.toLocaleString()}`,
        })));
      tip.classList.add('visible');
      tip.style.left = `${Math.min(Math.max(x * scale, 80), rect.width - 80)}px`;
      tip.style.top = `${y * scale}px`;
    });
    hit.addEventListener('pointerleave', () => {
      focus.classList.remove('visible');
      tip.classList.remove('visible');
    });
  }

  Object.entries(MOB_EXP_KINDS).forEach(([key, { label }]) => {
    const btn = el('button', { className: `pill pill--sub${key === mode ? ' active' : ''}`, textContent: label });
    btn.addEventListener('click', () => {
      mode = key;
      toggle.querySelectorAll('.pill').forEach(b => b.classList.toggle('active', b === btn));
      draw();
    });
    toggle.appendChild(btn);
  });

  draw();
  return wrap;
}

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

export function createExpPage(monsters = []) {
  return {
    key: 'exp', label: 'EXP', kicker: 'Reference · EXP from kills and party sharing',
    description: 'See how much EXP each monster is worth, how a kill\'s EXP is split across a party, and how the party bonus is added.',
    credit: () => ['Party sharing derived by ', el('strong', { textContent: 'azzy' }), ' on Discord'],
    sections: [
      { key: 'exp-monster', label: 'Monster EXP' }, { key: 'party-exp-share', label: 'Your share' }, { key: 'party-exp-eligible', label: 'Eligibility' },
      { key: 'party-exp-bonus', label: 'Party bonus' },
      ...(monsters.length ? [{ key: 'party-exp-calc', label: 'Calculator' }] : []),
    ],
    render: () => buildGuide(monsters),
  };
}
