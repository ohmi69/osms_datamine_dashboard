// Monster hit chance calculator for the Damage Taken page's Monster Accuracy step.
// Current-client branches from tmp/damage-taken-old-vs-current-binary.md (outcome
// routine 0x140268140): ordinary roll, beyond-reach rescue, 8% fallback, then the
// guard block. The per-mob 50% dodge flag and unmissable attacks are left out.

import { el } from '../lib/utils.js';
import { getMobThumbUrl, getMobGifUrl } from '../lib/data.js';
import { buildMobPicker, buildCalcGroup } from './formulas-calc.js';

const format = value => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const percent = p => {
  const v = p * 100;
  return `${v > 0 && v < 0.005 ? '<0.01' : v < 100 && v >= 99.995 ? '>99.99' : format(v)}%`;
};

// Claw Guard's block chance by skill level, as listed on the skill.
const clawGuardChance = level => level <= 0 ? 0 : level <= 6 ? 0.03 : level <= 13 ? 0.04 : 0.05;

// Every probability is exact: the roll is uniform, so the ordinary hit chance is the
// share of [1 - Spread, 1 + Spread] at or above EffectiveAvoid / MonsterHitScore.
export function monsterHitOdds(s) {
  const gap = Math.max(0, s.playerLevel - s.mobLevel);
  const score = s.mobAcc * 100 / ((gap + 51) * 5);
  const effAvoid = s.avoid / (s.avoid / 80 + 1) / (gap / 40 + 1);
  const spread = 0.15 + 0.2 / (1 + Math.exp((score - effAvoid) / 12));
  const roll = effAvoid === 0 ? 1 : score === 0 ? 0
    : Math.max(0, Math.min(1, (1 + spread - effAvoid / score) / (2 * spread)));
  const beyondReach = effAvoid > (1 + spread) * score;
  const rescue = beyondReach ? Math.min(0.03, Math.max(0.02, 0.03 * Math.exp((score - effAvoid) / 18))) : 0;
  const salvage = (1 - roll) * (rescue + (1 - rescue) * 0.08);
  const passes = roll + salvage;

  const shield = s.shieldDef > 0 ? Math.max(0.05, s.shieldDef / (s.shieldDef + 500)) : 0;
  const claw = clawGuardChance(s.clawGuardLevel);
  const guard = s.guardImmune ? 0 : shield + (1 - shield) * claw;

  return { gap, score, effAvoid, spread, roll, beyondReach, rescue, salvage,
    passes, shield, claw, guard, hit: passes * (1 - guard), guarded: passes * guard, miss: 1 - passes };
}

function numberField(label, value, { min, max, range, hint, onChange, short = label }) {
  const input = el('input', { type: 'number', className: 'formulas-calc-input', value: String(value),
    min: String(min), max: String(max), step: '1', 'aria-label': label, title: hint ?? '' });
  const slider = el('input', { type: 'range', value: String(value), min: String(min),
    max: String(Math.max(range, value)), step: '1', 'aria-label': `${label} slider` });
  const valid = () => input.value !== '' && input.validity.valid;
  input.addEventListener('input', () => {
    if (!valid()) { input.setAttribute('aria-invalid', 'true'); onChange(null); return; }
    input.removeAttribute('aria-invalid');
    const n = Number(input.value);
    if (n > Number(slider.max)) slider.max = String(Math.min(max, Math.ceil(n * 1.5)));
    slider.value = input.value;
    onChange(n);
  });
  slider.addEventListener('input', () => {
    input.value = slider.value;
    input.removeAttribute('aria-invalid');
    onChange(Number(slider.value));
  });
  const wrap = el('div', { className: 'formulas-graph-stat' },
    el('span', { className: 'formulas-calc-label', textContent: short }), input, slider);
  wrap._set = (n) => {
    input.value = String(n);
    input.removeAttribute('aria-invalid');
    if (n > Number(slider.max)) slider.max = String(Math.min(max, Math.ceil(n * 1.5)));
    slider.value = String(n);
  };
  wrap._label = label;
  wrap._min = min;
  wrap._max = max;
  return wrap;
}

export function buildMonsterHitCalc(monsters) {
  const startMob = monsters.find(m => m.name === 'Orange Mushroom')
    ?? monsters.find(m => !m.passive) ?? monsters[0] ?? null;
  const state = {
    mobLevel: startMob?.level ?? 10,
    mobAcc: startMob?.acc ?? 50,
    playerLevel: startMob?.level ?? 10,
    avoid: 20,
    shieldDef: 0,
    clawGuardLevel: 0,
    // Not an input: only the jump-quest obstacles carry it, so it follows the picked mob.
    guardImmune: Boolean(startMob?.invincible),
  };
  let mob = startMob;
  const invalid = new Set();

  const wrap = el('section', { className: 'formulas-graph formulas-chart-wrap formulas-damage-graph formulas-mob-hit formulas-mob-picker-host',
    'aria-label': 'Monster hit chance calculator' });
  const controls = el('div', { className: 'formulas-graph-controls' });
  const output = el('div', { className: 'formulas-graph-readout', 'aria-live': 'polite' });
  const bar = el('div', { className: 'formulas-explorer-bars' });
  const breakdown = el('div', { className: 'formulas-mob-hit-rows' });

  const setter = (key, field) => (v) => {
    if (v === null) invalid.add(field()); else { invalid.delete(field()); state[key] = v; }
    draw();
  };

  const mobField = el('div', { className: 'formulas-graph-stat formulas-mob-picker-field' });
  const picker = buildMobPicker(monsters, (picked) => {
    mob = picked;
    state.mobLevel = picked.level;
    state.mobAcc = picked.acc ?? 0;
    state.guardImmune = Boolean(picked.invincible);
    mobLevelField._set(state.mobLevel);
    mobAccField._set(state.mobAcc);
    invalid.delete(mobLevelField);
    invalid.delete(mobAccField);
    draw();
  });
  picker._setValue(startMob);
  mobField.appendChild(picker);

  const mobLevelField = numberField('Monster level', state.mobLevel, { short: 'Level', min: 1, max: 255, range: 120,
    onChange: setter('mobLevel', () => mobLevelField) });
  const mobAccField = numberField('Monster accuracy', state.mobAcc, { short: 'Accuracy', min: 0, max: 99999, range: 300,
    hint: 'The acc value from the monster data. Picking a monster fills this in.',
    onChange: setter('mobAcc', () => mobAccField) });
  const levelField = numberField('Your level', state.playerLevel, { short: 'Level', min: 1, max: 200, range: 100,
    onChange: setter('playerLevel', () => levelField) });
  const avoidField = numberField('Your Avoid', state.avoid, { short: 'Avoid', min: 0, max: 99999, range: 300,
    hint: 'Avoid from your Stats panel, before the diminishing-returns step.',
    onChange: setter('avoid', () => avoidField) });
  const shieldField = numberField('Shield Weapon Def', state.shieldDef, { min: 0, max: 9999, range: 300,
    hint: 'Weapon Defense on the shield itself, not your Stats panel total. 0 without a shield.',
    onChange: setter('shieldDef', () => shieldField) });
  const clawField = numberField('Claw Guard level', state.clawGuardLevel, { min: 0, max: 20, range: 20,
    hint: 'Assassin, Hermit and Night Lord only. Leave at 0 otherwise.',
    onChange: setter('clawGuardLevel', () => clawField) });

  controls.classList.add('formulas-grouped-controls');
  controls.append(
    buildCalcGroup('Monster', mobField, mobLevelField, mobAccField),
    buildCalcGroup('You', levelField, avoidField, shieldField, clawField));

  wrap.append(
    el('div', { className: 'formulas-chart-head' }, el('strong', { textContent: 'Monster hit chance calculator' })),
    el('div', { className: 'formulas-damage-layout' }, controls,
      el('div', { className: 'formulas-damage-result' }, output, bar, breakdown)));

  const row = (label, value) => el('div', { className: 'formulas-mob-hit-row' },
    el('span', { className: 'formulas-mob-hit-row-label', textContent: label }),
    el('strong', { textContent: value }));

  function draw() {
    const bad = [...invalid][0];
    bar.hidden = breakdown.hidden = Boolean(bad);
    if (bad) {
      output.replaceChildren(el('span', { className: 'formulas-graph-hint',
        textContent: `Enter ${bad._label.toLowerCase()} from ${format(bad._min)} to ${format(bad._max)}, using whole numbers.` }));
      return;
    }

    const r = monsterHitOdds(state);
    const head = el('div', { className: 'formulas-mob-hit-head' });
    const art = mob && (getMobGifUrl(mob.gif) || getMobThumbUrl(mob.thumbnail));
    if (art) head.appendChild(el('img', { className: 'formulas-calc-hero', src: art, alt: '' }));
    head.appendChild(el('div', {},
      el('strong', { className: 'formulas-graph-result', textContent: `${percent(r.hit)} chance to be hit` }),
      el('span', { className: 'formulas-graph-hint', textContent:
        `${percent(r.miss)} miss${r.guard ? `, ${percent(r.guarded)} guarded` : ''} per regular attack` })));
    output.replaceChildren(head);
    if (mob?.passive && mob.acc === state.mobAcc && mob.level === state.mobLevel) {
      output.appendChild(el('span', { className: 'formulas-graph-hint', textContent: `${mob.name} does not attack, so these odds never come up.` }));
    }

    const segments = [['Hit', r.hit, 'is-hit'], ['Guarded', r.guarded, 'is-guard'], ['Miss', r.miss, 'is-miss']];
    const track = el('div', { className: 'formulas-explorer-bar-track formulas-mob-hit-track' });
    segments.forEach(([, p, cls]) => { if (p > 0) track.appendChild(el('div', { className: `formulas-mob-hit-seg ${cls}`, style: { width: `${p * 100}%` } })); });
    bar.replaceChildren(el('div', { className: 'formulas-explorer-bar' },
      el('div', { className: 'formulas-explorer-bar-label' },
        ...segments.filter(([, p], i) => i !== 1 || r.guard).map(([label, p, cls]) =>
          el('span', { className: `formulas-mob-hit-key ${cls}`, textContent: `${label} ${percent(p)}` }))),
      track));

    breakdown.replaceChildren(
      row('Accuracy check passes', percent(r.passes)),
      row('Guard chance', state.guardImmune ? 'immune' : percent(r.guard)));
  }

  draw();
  return wrap;
}
