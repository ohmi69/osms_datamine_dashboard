// Stat Equivalency Calculator for MapleStory Classic World.
// Uses the reverse-engineered outgoing damage and accuracy formulas from formulas.js
// to convert a gain in any one stat into the equivalent gain in every other stat.

import { el } from '../lib/utils.js';
import { makeCollapsibleSection, attachTooltip } from './formulas-shared.js';
import { markFormulaSection } from './formulas-layout.js';
import { buildMobPicker } from './formulas-calc.js';
import { accuracyHitPercent } from './formulas-explorers.js';

const COOKIE_NAME = 'osms_stat_equivalency';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// Effective weapon multipliers from WEAPON_MULTS and ACTION_SPLIT in formulas.js.
// Weapons with uneven swing/stab multipliers use the 60/40 basic-attack split as
// their default, with fixed-action variants where skills force one action.
// accPerPrimary / accPerSecondary come from the per-class Accuracy formulas in formulas.js:
// Warrior/Beginner DEX = 1.2/2.5 (0.48), Bowman DEX = 1.2/4.8 (0.25), Thief LUK = 0.6/4 (0.15).
const MAGIC_ACC_PER_INT = 1.2 / 5.1;

export const WEAPON_PROFILES = [
  { id: '1h-sword',      label: '1H Sword',                          wepMult: 1.80, primary: 'STR', secondary: 'DEX',       accPerPrimary: 0,    accPerSecondary: 1.2 / 2.5 },
  { id: '2h-sword',      label: '2H Sword',                          wepMult: 2.50, primary: 'STR', secondary: 'DEX',       accPerPrimary: 0,    accPerSecondary: 1.2 / 2.5 },
  { id: '1h-axe-blunt',  label: '1H Axe / Blunt (60/40 avg)',        wepMult: 1.92, primary: 'STR', secondary: 'DEX',       accPerPrimary: 0,    accPerSecondary: 1.2 / 2.5 },
  { id: '2h-axe-blunt',  label: '2H Axe / Blunt (60/40 avg)',        wepMult: 2.60, primary: 'STR', secondary: 'DEX',       accPerPrimary: 0,    accPerSecondary: 1.2 / 2.5 },
  { id: 'spear-avg',     label: 'Spear (60/40 avg)',                 wepMult: 2.30, primary: 'STR', secondary: 'DEX',       accPerPrimary: 0,    accPerSecondary: 1.2 / 2.5 },
  { id: 'spear-stab',    label: 'Spear (Stab)',                      wepMult: 3.50, primary: 'STR', secondary: 'DEX',       accPerPrimary: 0,    accPerSecondary: 1.2 / 2.5 },
  { id: 'polearm-avg',   label: 'Polearm (60/40 avg)',               wepMult: 2.70, primary: 'STR', secondary: 'DEX',       accPerPrimary: 0,    accPerSecondary: 1.2 / 2.5 },
  { id: 'polearm-swing', label: 'Polearm (Swing)',                   wepMult: 3.50, primary: 'STR', secondary: 'DEX',       accPerPrimary: 0,    accPerSecondary: 1.2 / 2.5 },
  { id: 'bow',           label: 'Bow (Shoot)',                       wepMult: 2.50, primary: 'DEX', secondary: 'STR',       accPerPrimary: 1.2 / 4.8, accPerSecondary: 0 },
  { id: 'crossbow',      label: 'Crossbow (Shoot)',                  wepMult: 2.50, primary: 'DEX', secondary: 'STR',       accPerPrimary: 1.2 / 4.8, accPerSecondary: 0 },
  { id: 'claw',          label: 'Claw (Normal Shoot)',               wepMult: 2.50, primary: 'LUK', secondary: 'STR + DEX', accPerPrimary: 0.6 / 4,   accPerSecondary: 0 },
  { id: 'claw-l7',       label: 'Claw (Lucky Seven)',                wepMult: 3.00, primary: 'LUK', secondary: 'STR + DEX', accPerPrimary: 0.6 / 4,   accPerSecondary: 0, fixedMastery: 0.50 },
  { id: 'dagger-avg',    label: 'Dagger (60/40 avg)',                wepMult: 1.40, primary: 'LUK', secondary: 'STR + DEX', accPerPrimary: 0.6 / 4,   accPerSecondary: 0 },
  { id: 'dagger-stab',   label: 'Dagger (Double Stab / Savage Blow)', wepMult: 2.00, primary: 'LUK', secondary: 'STR + DEX', accPerPrimary: 0.6 / 4,   accPerSecondary: 0 },
  { id: 'barehanded',    label: 'Barehanded',                        wepMult: 1.00, primary: 'STR', secondary: 'DEX',       accPerPrimary: 0,    accPerSecondary: 1.2 / 2.5 },
];

export const DEFAULT_PHYSICAL_STATS = {
  weaponId: '2h-sword',
  primaryStat: null,
  secondaryStat: null,
  weaponAttack: null,
  attackPower: null,
  masteryLevel: null,
  critRate: null,
  critDamage: null,
  level: null,
  accuracy: null,
};

export const DEFAULT_MAGIC_STATS = {
  totalInt: null,
  magicAttack: null,
  masteryLevel: null,
  critRate: null,
  critDamage: null,
  level: null,
  accuracy: null,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function getWeaponProfile(weaponId) {
  return WEAPON_PROFILES.find(w => w.id === weaponId) ?? WEAPON_PROFILES[1];
}

// Expected damage per attack (up to pure-multiplicative factors like Skill %,
// monster defense, elemental modifier, Combo Attack, and Elemental Charge,
// which cancel out in percentage damage gain below the 99,999 cap).
export function expectedDamage(mode, stats, options = {}) {
  const profile = mode === 'physical' ? getWeaponProfile(stats.weaponId) : null;
  const masteryLevel = clamp(Number(stats.masteryLevel) || 0, 0, 10);
  const masteryMult = profile?.fixedMastery != null
    ? profile.fixedMastery
    : (0.1 + masteryLevel / 10) * 0.7;
  const critRate = clamp(Number(stats.critRate) || 0, 0, 100) / 100;
  const critDamage = Math.max(0, Number(stats.critDamage) || 0);
  const critMult = 1 + critRate * (critDamage / 100);

  let baseAvg = 0;
  if (mode === 'magic') {
    const totalInt = Math.max(0, Number(stats.totalInt) || 0);
    const magicAttack = Math.max(0, Number(stats.magicAttack) || 0);
    // Continuous totalInt / 2 avoids artificial 0-slope odd/even steps from floor()
    // when solving for fractional INT equivalents while preserving the true slope.
    const magicTerm = totalInt / 2 + magicAttack;
    const intFactor = 1 + (totalInt * (1 + masteryMult)) / 250;
    baseAvg = magicTerm * intFactor;
  } else {
    const primaryStat = Math.max(0, Number(stats.primaryStat) || 0);
    const secondaryStat = Math.max(0, Number(stats.secondaryStat) || 0);
    const weaponAttack = Math.max(0, Number(stats.weaponAttack) || 0);
    const attackPower = Math.max(0, Number(stats.attackPower) || 0);
    const avgStatRoll = primaryStat * (1 + masteryMult) / 2;
    baseAvg = (0.9 + (avgStatRoll * profile.wepMult + secondaryStat) / 100 + attackPower / 50) * weaponAttack;
  }

  let expected = baseAvg * critMult;

  if (options.includeHitChance && options.monster) {
    const hitPct = accuracyHitPercent({
      accuracy: Math.max(0, Number(stats.accuracy) || 0),
      avoid: Number(options.monster.eva) || 0,
      playerLevel: clamp(Number(stats.level) || 1, 1, 200),
      enemyLevel: Number(options.monster.level) || 1,
    });
    expected *= hitPct / 100;
  }

  return expected;
}

export function getStatDefinitions(mode, stats, includeHitChance = false) {
  const defs = [];
  if (mode === 'magic') {
    defs.push(
      { key: 'totalInt',     label: 'INT',          sub: '',                     unit: '',  step: 5, defaultDelta: 10, maxTotal: null, decimals: 2, hint: 'Total INT including equipment and buffs' },
      { key: 'magicAttack',  label: 'Magic Attack', sub: 'Gear, scrolls, buffs', unit: '',  step: 1, defaultDelta: 5,  maxTotal: null, decimals: 2, hint: 'Magic Attack from equipment, scrolls, and buffs (excluding INT)' },
      { key: 'critRate',     label: 'Crit Rate',    sub: '',                     unit: '%', step: 1, defaultDelta: 2,  maxTotal: 100,  decimals: 2, hint: 'Critical hit rate from your Stats panel (caps at 100%)' },
      { key: 'critDamage',   label: 'Crit Damage',  sub: '',                     unit: '%', step: 1, defaultDelta: 5,  maxTotal: null, decimals: 2, hint: 'Critical damage % from your Stats panel' },
      { key: 'masteryLevel', label: 'Mastery',      sub: '',                     unit: '',  step: 1, defaultDelta: 1,  maxTotal: 10,   decimals: 2, hint: 'Spell mastery level (0 to 10)' },
    );
  } else {
    const profile = getWeaponProfile(stats.weaponId);
    defs.push(
      { key: 'weaponAttack',  label: 'Weapon Attack',   sub: 'Weapon, shield, ammo',   unit: '',  step: 1, defaultDelta: 1, maxTotal: null, decimals: 2, hint: 'Attack on your weapon (incl. weapon scrolls), shield, and stars/arrows' },
      { key: 'attackPower',   label: 'Attack Power',    sub: 'Non-weapon gear & buffs', unit: '', step: 1, defaultDelta: 1, maxTotal: null, decimals: 2, hint: 'Attack from non-weapon gear (e.g. scrolled gloves) and buffs' },
      { key: 'primaryStat',   label: profile.primary,   sub: '',                     unit: '',  step: 1, defaultDelta: 5, maxTotal: null, decimals: 2, hint: `Primary stat (${profile.primary}) for ${profile.label}` },
      { key: 'secondaryStat', label: profile.secondary, sub: '',                     unit: '',  step: 1, defaultDelta: 5, maxTotal: null, decimals: 2, hint: `Secondary stat (${profile.secondary}) for ${profile.label}` },
      { key: 'critRate',      label: 'Crit Rate',       sub: '',                     unit: '%', step: 1, defaultDelta: 2, maxTotal: 100,  decimals: 2, hint: 'Critical hit rate from your Stats panel (caps at 100%)' },
      { key: 'critDamage',    label: 'Crit Damage',     sub: '',                     unit: '%', step: 1, defaultDelta: 5, maxTotal: null, decimals: 2, hint: 'Critical damage % from your Stats panel' },
      { key: 'masteryLevel',  label: 'Mastery',         sub: '',                     unit: '',  step: 1, defaultDelta: 1, maxTotal: 10,   decimals: 2, hint: 'Equipped weapon mastery level (0 to 10)' },
    );
  }

  if (includeHitChance) {
    defs.push(
      { key: 'accuracy', label: 'Accuracy', sub: '', unit: '', step: 1, defaultDelta: 5, maxTotal: null, decimals: 2, hint: 'Direct Accuracy gain against the selected monster' },
    );
  }
  return defs;
}

function accuracyBonusPerStat(mode, stats, key) {
  if (mode === 'magic') {
    return key === 'totalInt' ? MAGIC_ACC_PER_INT : 0;
  }
  const profile = getWeaponProfile(stats.weaponId);
  if (key === 'primaryStat') return profile.accPerPrimary || 0;
  if (key === 'secondaryStat') return profile.accPerSecondary || 0;
  return 0;
}

export function applyStatDelta(mode, stats, key, delta, options = {}) {
  const next = { ...stats, [key]: (Number(stats[key]) || 0) + delta };
  if (options.includeHitChance && options.monster) {
    const accSlope = accuracyBonusPerStat(mode, stats, key);
    if (accSlope > 0) {
      next.accuracy = (Number(stats.accuracy) || 0) + delta * accSlope;
    }
  }
  return next;
}

function currentHitPercent(stats, monster) {
  return accuracyHitPercent({
    accuracy: Math.max(0, Number(stats.accuracy) || 0),
    avoid: Number(monster.eva) || 0,
    playerLevel: clamp(Number(stats.level) || 1, 1, 200),
    enemyLevel: Number(monster.level) || 1,
  });
}

// Why more of this stat adds no damage at all right now, or null if it can.
export function statBlockedReason(mode, stats, def, options = {}) {
  const key = def.key;
  if (key === 'masteryLevel' && mode === 'physical' && getWeaponProfile(stats.weaponId).fixedMastery != null) {
    return { status: 'no-effect', note: 'Fixed 50% for Lucky Seven' };
  }
  if (key === 'critRate' && (Number(stats.critDamage) || 0) <= 0) {
    return { status: 'no-effect', note: 'Needs Crit Damage > 0%' };
  }
  if (key === 'critDamage' && (Number(stats.critRate) || 0) <= 0) {
    return { status: 'no-effect', note: 'Needs Crit Rate > 0%' };
  }
  if (key === 'accuracy' && options.includeHitChance && options.monster && currentHitPercent(stats, options.monster) >= 100) {
    return { status: 'capped', note: 'Already at 100% hit' };
  }
  if (def.maxTotal != null && (Number(stats[key]) || 0) >= def.maxTotal) {
    return { status: 'capped', note: `Already at cap (${def.maxTotal}${def.unit})` };
  }
  return null;
}

function solveTargetStat(mode, stats, def, targetGainPct, baseExpected, options) {
  const key = def.key;
  const currentVal = Number(stats[key]) || 0;

  if (targetGainPct <= 0) {
    return { status: 'zero', value: 0, gainPct: 0, note: '' };
  }

  const blocked = statBlockedReason(mode, stats, def, options);
  if (blocked) {
    return { status: blocked.status, value: null, gainPct: 0, note: blocked.note };
  }

  if (key === 'accuracy' && options.includeHitChance && options.monster) {
    const curHit = currentHitPercent(stats, options.monster);
    // Maximum possible gain from Accuracy is reaching 100% hit chance.
    const maxHitGainPct = ((100 / curHit) - 1) * 100;
    if (maxHitGainPct + 1e-9 < targetGainPct) {
      return {
        status: 'capped',
        value: null,
        gainPct: maxHitGainPct,
        note: `Caps at +${maxHitGainPct.toFixed(2)}% (100% hit)`,
      };
    }
  }

  const gainAt = (delta) => {
    const next = expectedDamage(mode, applyStatDelta(mode, stats, key, delta, options), options);
    return ((next - baseExpected) / baseExpected) * 100;
  };

  let high;
  if (def.maxTotal != null) {
    const remaining = Math.max(0, def.maxTotal - currentVal);
    if (remaining <= 0) {
      return { status: 'capped', value: null, gainPct: 0, note: `Already at cap (${def.maxTotal}${def.unit})` };
    }
    const maxGain = gainAt(remaining);
    if (maxGain + 1e-9 < targetGainPct) {
      return {
        status: 'capped',
        value: null,
        gainPct: maxGain,
        note: `Max +${maxGain.toFixed(2)}% at ${def.maxTotal}${def.unit} cap`,
      };
    }
    high = remaining;
  } else {
    high = Math.max(1, def.defaultDelta || 1);
    const MAX_SEARCH = 1e7;
    while (gainAt(high) < targetGainPct && high < MAX_SEARCH) {
      high *= 2;
    }
    if (gainAt(high) < targetGainPct) {
      return { status: 'capped', value: null, gainPct: gainAt(high), note: 'Cannot match' };
    }
  }

  let low = 0;
  let mid = 0;
  let midGain = 0;
  for (let i = 0; i < 60; i++) {
    mid = (low + high) / 2;
    midGain = gainAt(mid);
    if (Math.abs(midGain - targetGainPct) < 1e-7) break;
    if (midGain < targetGainPct) low = mid;
    else high = mid;
  }

  return { status: 'ok', value: mid, gainPct: midGain, note: '' };
}

export function calculateEquivalency(mode, stats, sourceStat, sourceDelta, options = {}) {
  const defs = getStatDefinitions(mode, stats, Boolean(options.includeHitChance && options.monster));
  const baseExpected = expectedDamage(mode, stats, options);
  const delta = Math.max(0, Number(sourceDelta) || 0);

  let hitChancePct = null;
  if (options.includeHitChance && options.monster) {
    hitChancePct = accuracyHitPercent({
      accuracy: Math.max(0, Number(stats.accuracy) || 0),
      avoid: Number(options.monster.eva) || 0,
      playerLevel: clamp(Number(stats.level) || 1, 1, 200),
      enemyLevel: Number(options.monster.level) || 1,
    });
  }

  if (baseExpected <= 0) {
    const note = hitChancePct === 0 ? '0% hit chance — raise Accuracy' : 'Enter positive base stats';
    return {
      baseExpected: 0,
      sourceStat,
      sourceDelta: delta,
      targetGainPct: 0,
      hitChancePct,
      equivalents: Object.fromEntries(defs.map(d => [d.key, { status: 'zero', value: 0, gainPct: 0, note }])),
    };
  }

  const nextExpected = delta > 0 ? expectedDamage(mode, applyStatDelta(mode, stats, sourceStat, delta, options), options) : baseExpected;
  const targetGainPct = ((nextExpected - baseExpected) / baseExpected) * 100;

  const equivalents = {};
  for (const def of defs) {
    if (def.key === sourceStat) {
      equivalents[def.key] = {
        status: 'source',
        value: delta,
        gainPct: targetGainPct,
        note: '',
      };
    } else {
      equivalents[def.key] = solveTargetStat(mode, stats, def, targetGainPct, baseExpected, options);
    }
  }

  return {
    baseExpected,
    sourceStat,
    sourceDelta: delta,
    targetGainPct,
    hitChancePct,
    equivalents,
  };
}

function loadSavedState() {
  try {
    if (typeof document === 'undefined' || typeof document.cookie !== 'string') return null;
    const prefix = `${COOKIE_NAME}=`;
    const part = document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith(prefix));
    if (!part) return null;
    const raw = decodeURIComponent(part.slice(prefix.length));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function saveState(state) {
  try {
    if (typeof document === 'undefined') return;
    const payload = encodeURIComponent(JSON.stringify({
      mode: state.mode,
      physical: state.physical,
      magic: state.magic,
      includeHitChance: state.includeHitChance,
      monsterName: state.monster?.name ?? null,
      sourceStat: state.sourceStat,
      sourceDelta: state.sourceDelta,
    }));
    document.cookie = `${COOKIE_NAME}=${payload}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
  } catch {
    // Ignore cookie errors in restricted environments.
  }
}

function clearSavedState() {
  try {
    if (typeof document === 'undefined') return;
    document.cookie = `${COOKIE_NAME}=; max-age=0; path=/; SameSite=Lax`;
  } catch {
    // Ignore cookie errors.
  }
}

function formatNum(value, decimals = 2) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 100) return value.toFixed(1);
  return Number(value.toFixed(decimals)).toString();
}

// % expected-damage gain from +1 of each stat (clamped by expectedDamage at caps).
export function perPointGains(mode, stats, options = {}) {
  const defs = getStatDefinitions(mode, stats, Boolean(options.includeHitChance && options.monster));
  const base = expectedDamage(mode, stats, options);
  const out = {};
  for (const def of defs) {
    if (base <= 0) { out[def.key] = 0; continue; }
    const next = expectedDamage(mode, applyStatDelta(mode, stats, def.key, 1, options), options);
    out[def.key] = Math.max(0, ((next - base) / base) * 100);
  }
  return out;
}

export function buildStatEquivalencyCalculator(monsters = []) {
  const saved = loadSavedState();
  const defaultMob = (saved?.monsterName && monsters.find(m => m.name === saved.monsterName))
    || monsters.find(m => m.name === 'Orange Mushroom')
    || monsters[0]
    || null;

  const state = {
    mode: saved?.mode === 'magic' ? 'magic' : 'physical',
    physical: { ...DEFAULT_PHYSICAL_STATS, ...(saved?.physical || {}) },
    magic: { ...DEFAULT_MAGIC_STATS, ...(saved?.magic || {}) },
    includeHitChance: Boolean(saved?.includeHitChance),
    monster: defaultMob,
    sourceStat: saved?.sourceStat || (saved?.mode === 'magic' ? 'magicAttack' : 'weaponAttack'),
    sourceDelta: saved?.sourceDelta != null && Number.isFinite(Number(saved.sourceDelta)) ? Number(saved.sourceDelta) : null,
  };

  const root = el('div', { className: 'stat-equiv' });
  const layout = el('div', { className: 'stat-equiv-layout' });
  root.appendChild(layout);

  // Left: character sheet (mode toggle, grouped baseline stats, hit chance toggle, reset).
  const sheet = el('aside', { className: 'stat-equiv-sheet', 'aria-label': 'Your current stats' });
  const modeToggle = el('div', { className: 'stat-equiv-seg', role: 'group', 'aria-label': 'Damage type' });
  const physBtn = el('button', { className: 'stat-equiv-seg-btn', type: 'button', textContent: 'Physical' });
  const magicBtn = el('button', { className: 'stat-equiv-seg-btn', type: 'button', textContent: 'Magical' });
  modeToggle.append(physBtn, magicBtn);

  const baselinePanel = el('div', { className: 'stat-equiv-groups' });

  const sheetFoot = el('div', { className: 'stat-equiv-sheet-foot' });
  const hitLabel = el('label', { className: 'stat-equiv-switch' });
  const hitCheck = el('input', { type: 'checkbox' });
  hitCheck.checked = state.includeHitChance;
  hitLabel.append(hitCheck, el('span', { className: 'stat-equiv-switch-track', 'aria-hidden': 'true' }), el('span', { textContent: 'Include hit chance' }));
  const resetBtn = el('button', { className: 'stat-equiv-reset', type: 'button', textContent: 'Reset' });
  sheetFoot.append(hitLabel, resetBtn);

  sheet.append(modeToggle, baselinePanel, sheetFoot);

  // Right: hero prompt, equivalence table, notes.
  const main = el('div', { className: 'stat-equiv-main' });
  const heroBar = el('section', { className: 'stat-equiv-hero', 'aria-label': 'Stat gain input' });
  const rowsTable = el('section', { className: 'stat-equiv-rows', 'aria-label': 'Equivalent stat gains' });
  const valueSection = el('section', { className: 'stat-equiv-value', 'aria-label': 'Damage per +1 point' });

  const notesDetails = el('details', { className: 'stat-equiv-details' });
  notesDetails.appendChild(el('summary', { textContent: 'How this works' }));
  const notesWrap = el('div', { className: 'stat-equiv-details-body' });
  [
    'Weapon Att vs. Att Power: In-game tooltips call both "Weapon Attack", but the formula splits them by slot — weapon (incl. weapon scrolls), shield, and stars/arrows go in Weapon Att, while non-weapon gear (e.g. scrolled gloves) and buffs go in Att Power.',
    'Magic Att (Magical): Use gear, scrolls, and buffs only — not the Stats panel MAGIC total, which already includes floor(INT / 2).',
    'Skill %, Monster Defense, Elemental Modifier, Combo Attack, and Elemental Charge multiply every hit equally and cancel out of % damage gain (below the 99,999 cap).',
    'Damage per +1 point: expected damage gain from one more point of each stat at your current stats, independent of the gain entered above. Mastery is per level and has no bar.',
  ].forEach(text => notesWrap.appendChild(el('div', { className: 'formulas-note', textContent: text })));
  notesDetails.appendChild(notesWrap);

  main.append(heroBar, rowsTable, valueSection, notesDetails);
  layout.append(sheet, main);

  const activeStats = () => (state.mode === 'magic' ? state.magic : state.physical);
  const calcOptions = () => ({ includeHitChance: state.includeHitChance, monster: state.monster });

  let heroInput = null;
  let heroSelect = null;
  let heroResult = null;
  let lastResult = null;

  function makeLabelWithTip(label, hint) {
    const row = el('span', { className: 'formulas-calc-label stat-equiv-labelrow' });
    row.appendChild(el('span', { textContent: label }));
    if (hint) {
      const tip = el('span', { className: 'stat-equiv-tip', textContent: '?', tabindex: '0', 'aria-label': hint });
      tip.addEventListener('click', (e) => e.preventDefault());
      attachTooltip(tip, hint);
      row.appendChild(tip);
    }
    return row;
  }

  function makeBaselineNumberField(label, key, { min = 0, max = 99999, step = 1, hint = '', suffix = '', wide = false } = {}) {
    const field = el('label', { className: `formulas-calc-field stat-equiv-field${wide ? ' stat-equiv-field--wide' : ''}` });
    field.appendChild(makeLabelWithTip(label, hint));
    const cur = activeStats()[key];
    const input = el('input', {
      type: 'number',
      className: 'formulas-calc-input',
      value: cur != null && cur !== '' ? String(cur) : '',
      min: String(min),
      max: String(max),
      step: String(step),
      inputmode: 'decimal',
    });
    input.dataset.baseStat = key;
    input.addEventListener('input', () => {
      if (input.value === '') {
        activeStats()[key] = null;
      } else {
        const n = Number(input.value);
        activeStats()[key] = Number.isFinite(n) ? clamp(n, min, max) : null;
      }
      saveState(state);
      updateEquivalents();
    });
    input.addEventListener('blur', () => {
      const v = activeStats()[key];
      input.value = v != null ? String(v) : '';
    });
    if (suffix) {
      const wrap = el('span', { className: 'stat-equiv-suffix' });
      wrap.dataset.suffix = suffix;
      wrap.appendChild(input);
      field.appendChild(wrap);
    } else {
      field.appendChild(input);
    }
    return field;
  }

  function makeGroup(title, ...fields) {
    const group = el('fieldset', { className: 'stat-equiv-group' });
    group.appendChild(el('legend', { className: 'stat-equiv-group-title', textContent: title }));
    const grid = el('div', { className: 'stat-equiv-group-grid' });
    fields.filter(Boolean).forEach(f => grid.appendChild(f));
    group.appendChild(grid);
    return group;
  }

  function critFields(rateHint, dmgHint) {
    return [
      makeBaselineNumberField('Crit Rate', 'critRate', { min: 0, max: 100, suffix: '%', hint: rateHint }),
      makeBaselineNumberField('Crit Dmg', 'critDamage', { min: 0, max: 500, suffix: '%', hint: dmgHint }),
    ];
  }

  function renderBaseline() {
    baselinePanel.textContent = '';
    const stats = activeStats();

    if (state.mode === 'physical') {
      const profile = getWeaponProfile(stats.weaponId);

      const wepRow = el('div', { className: 'stat-equiv-weapon' });
      const select = el('select', { className: 'formulas-calc-input stat-equiv-select', 'aria-label': 'Weapon' });
      select.dataset.baseStat = 'weaponId';
      WEAPON_PROFILES.forEach(w => {
        const opt = el('option', { value: w.id, textContent: w.label });
        if (w.id === stats.weaponId) opt.selected = true;
        select.appendChild(opt);
      });
      select.addEventListener('change', () => {
        stats.weaponId = select.value;
        saveState(state);
        renderBaseline();
        renderHero();
        updateEquivalents();
      });
      const multChip = el('span', { className: 'stat-equiv-mult', textContent: `×${profile.wepMult.toFixed(2)}` });
      attachTooltip(multChip, 'Weapon multiplier');
      wepRow.append(select, multChip);
      const wepGroup = el('fieldset', { className: 'stat-equiv-group' });
      wepGroup.append(el('legend', { className: 'stat-equiv-group-title', textContent: 'Weapon' }), wepRow);

      const secHint = profile.secondary === 'STR + DEX'
        ? 'Your Stats panel total STR + total DEX added together (including gear & buffs).'
        : `Your Stats panel total ${profile.secondary} (base AP + gear + buffs).`;

      const masteryField = profile.fixedMastery != null
        ? (() => {
            const f = el('label', { className: 'formulas-calc-field stat-equiv-field formulas-calc-field--off' });
            f.appendChild(makeLabelWithTip('Mastery', 'Lucky Seven uses a fixed 50% mastery regardless of Claw Mastery.'));
            const inp = el('input', { type: 'text', className: 'formulas-calc-input', value: '50% (fixed)', disabled: true });
            inp.dataset.baseStat = 'masteryLevel';
            f.appendChild(inp);
            return f;
          })()
        : makeBaselineNumberField('Mastery', 'masteryLevel', { min: 0, max: 10, hint: 'Your equipped weapon mastery skill level (0–10; 0 if unlearned).' });

      baselinePanel.append(
        wepGroup,
        makeGroup('Stats',
          makeBaselineNumberField(profile.primary, 'primaryStat', { min: 0, max: 9999, hint: `Primary stat. Your Stats panel total ${profile.primary} (base AP + gear + buffs).` }),
          makeBaselineNumberField(profile.secondary, 'secondaryStat', { min: 0, max: 9999, hint: `Secondary stat. ${secHint}` }),
        ),
        makeGroup('Attack',
          makeBaselineNumberField('Weapon Att', 'weaponAttack', { min: 0, max: 9999, hint: 'Attack on your weapon (incl. weapon scrolls), shield, and stars/arrows (5 if barehanded).' }),
          makeBaselineNumberField('Att Power', 'attackPower', { min: 0, max: 9999, hint: 'Attack from non-weapon gear (e.g. scrolled gloves) + buffs/potions — even though tooltips call it "Weapon Attack".' }),
        ),
        makeGroup('Crit & Mastery',
          ...critFields(
            'Critical Rate % shown in your Stats panel (including skills, gear, and buffs).',
            'Critical Damage % shown in your Stats panel (e.g. 20 = ×1.20 on crits).',
          ),
          masteryField,
        ),
      );
    } else {
      baselinePanel.append(
        makeGroup('Stats',
          makeBaselineNumberField('Total INT', 'totalInt', { min: 0, max: 9999, hint: 'Your Stats panel total INT (base AP + gear + buffs).' }),
          makeBaselineNumberField('Magic Att', 'magicAttack', { min: 0, max: 9999, hint: 'Magic Attack from gear, scrolls, and buffs only (excluding INT). Equals Stats panel MAGIC minus floor(INT / 2).' }),
        ),
        makeGroup('Crit & Mastery',
          ...critFields(
            'Critical Rate % shown in your Stats panel.',
            'Critical Damage % shown in your Stats panel (e.g. 20 = ×1.20 on crits).',
          ),
          makeBaselineNumberField('Mastery', 'masteryLevel', { min: 0, max: 10, hint: 'The spell\'s mastery level (0–10).' }),
        ),
      );
    }

    if (state.includeHitChance) {
      let mobField = null;
      if (monsters.length) {
        mobField = el('label', { className: 'formulas-calc-field stat-equiv-field stat-equiv-field--wide' });
        mobField.appendChild(makeLabelWithTip('Target Monster', 'Monster whose Level and Avoid are used to compute hit chance.'));
        const picker = buildMobPicker(monsters, (mob) => {
          state.monster = mob;
          saveState(state);
          updateEquivalents();
        });
        picker._setValue(state.monster);
        mobField.appendChild(picker);
      }
      baselinePanel.appendChild(makeGroup('Hit Chance',
        mobField,
        makeBaselineNumberField('Your Level', 'level', { min: 1, max: 100, hint: 'Your character level (affects hit chance against higher-level monsters).' }),
        makeBaselineNumberField('Accuracy', 'accuracy', { min: 0, max: 9999, hint: 'Total Accuracy shown in your Stats panel (including gear & buffs).' }),
      ));
    }
  }

  function renderHero() {
    heroBar.textContent = '';
    const defs = getStatDefinitions(state.mode, activeStats(), Boolean(state.includeHitChance && state.monster));
    if (!defs.some(d => d.key === state.sourceStat)) {
      state.sourceStat = defs[0].key;
    }
    const activeDef = defs.find(d => d.key === state.sourceStat) ?? defs[0];

    const give = el('div', { className: 'stat-equiv-hero-give' });
    give.appendChild(el('span', { className: 'stat-equiv-hero-plus', textContent: '+' }));

    heroInput = el('input', {
      type: 'number',
      className: 'formulas-calc-input stat-equiv-hero-num',
      min: '0',
      step: String(activeDef.step),
      value: state.sourceDelta != null && state.sourceDelta > 0 ? String(state.sourceDelta) : '',
      placeholder: '0',
      inputmode: 'decimal',
      'aria-label': 'Stat gain amount',
    });
    heroInput.dataset.heroAmount = 'true';
    // Grow with the value (monospace font, so 1ch = one digit) so pivoted values like 19.93 fit.
    const sizeHeroInput = () => {
      heroInput.style.width = `calc(${Math.max(2, heroInput.value.length) + 1}ch + 22px)`;
    };
    sizeHeroInput();
    heroInput.addEventListener('input', () => {
      sizeHeroInput();
      if (heroInput.value === '') {
        state.sourceDelta = null;
      } else {
        const val = Number(heroInput.value);
        state.sourceDelta = Number.isFinite(val) && val > 0 ? val : null;
      }
      saveState(state);
      updateEquivalents();
    });

    heroSelect = el('select', { className: 'formulas-calc-input stat-equiv-hero-sel', 'aria-label': 'Stat to compare' });
    heroSelect.dataset.heroStat = 'true';
    defs.forEach(def => {
      const opt = el('option', { value: def.key, textContent: def.unit ? `${def.label} (${def.unit})` : def.label });
      if (def.key === state.sourceStat) opt.selected = true;
      heroSelect.appendChild(opt);
    });
    heroSelect.value = state.sourceStat;
    heroSelect.addEventListener('change', () => {
      state.sourceStat = heroSelect.value;
      const nextDef = defs.find(d => d.key === state.sourceStat);
      if (nextDef) heroInput.step = String(nextDef.step);
      saveState(state);
      updateEquivalents();
    });

    give.append(heroInput, heroSelect);
    heroResult = el('div', { className: 'stat-equiv-hero-result', 'aria-live': 'polite' });
    heroBar.append(give, heroResult);
  }

  function updateEquivalents() {
    const stats = activeStats();
    const opts = calcOptions();
    const defs = getStatDefinitions(state.mode, stats, Boolean(opts.includeHitChance && opts.monster));
    const result = calculateEquivalency(state.mode, stats, state.sourceStat, state.sourceDelta, opts);
    const perPoint = perPointGains(state.mode, stats, opts);
    lastResult = result;

    heroResult.textContent = '';
    if (result.baseExpected <= 0) {
      const msg = result.hitChancePct === 0 ? '0% hit chance — raise Accuracy' : 'Enter your stats';
      heroResult.appendChild(el('span', { className: 'stat-equiv-hero-muted', textContent: msg }));
    } else if (result.targetGainPct > 0) {
      heroResult.append(
        el('strong', { className: 'stat-equiv-hero-big', textContent: `+${result.targetGainPct.toFixed(2)}%` }),
        el('span', { className: 'stat-equiv-hero-cap', textContent: 'expected damage' }),
      );
    } else if (state.sourceDelta != null && state.sourceDelta > 0) {
      heroResult.appendChild(el('span', { className: 'stat-equiv-hero-muted', textContent: '+0.00% (at cap or no effect)' }));
    } else {
      heroResult.appendChild(el('span', { className: 'stat-equiv-hero-muted', textContent: 'Enter a gain' }));
    }
    if (result.hitChancePct != null && state.monster) {
      heroResult.appendChild(el('span', {
        className: 'stat-equiv-hit-pill',
        textContent: `${result.hitChancePct.toFixed(1)}% hit vs ${state.monster.name}`,
        title: `${state.monster.name} (Lv ${state.monster.level}, ${state.monster.eva ?? 0} Avoid)`,
      }));
    }

    rowsTable.textContent = '';
    const head = el('div', { className: 'stat-equiv-row stat-equiv-row--head', 'aria-hidden': 'true' });
    head.append(
      el('span', { textContent: 'Stat' }),
      el('span', { className: 'stat-equiv-row-valhead', textContent: 'Equivalent' }),
    );
    rowsTable.appendChild(head);

    defs.forEach(def => {
      const eq = result.equivalents[def.key];
      if (!eq) return;
      const isSource = def.key === state.sourceStat;
      const isDisabled = eq.status === 'capped' || eq.status === 'no-effect';

      // Capped / no-effect stats can't be pivoted to: no gain from them to compare.
      const isClickable = !isSource && !isDisabled;
      const row = el(isClickable ? 'button' : 'div', {
        className: `stat-equiv-row${isSource ? ' is-source' : ''}${isDisabled ? ' is-muted' : ''}`,
      });
      if (isSource) row.setAttribute('aria-current', 'true');
      if (isClickable) {
        row.setAttribute('type', 'button');
        row.title = `Compare from ${def.label}`;
      }
      row.dataset.equivRow = def.key;

      const name = el('span', { className: 'stat-equiv-row-name' });
      name.appendChild(el('span', { className: 'stat-equiv-row-label', textContent: def.label }));
      if (def.sub) name.appendChild(el('span', { className: 'stat-equiv-row-sub', textContent: def.sub }));

      let valText = '—';
      let valClass = 'stat-equiv-row-val';
      if (isSource) {
        valText = eq.value > 0 ? `+${formatNum(eq.value, def.decimals)}${def.unit}` : '—';
      } else if (eq.status === 'ok') {
        valText = `+${formatNum(eq.value, def.decimals)}${def.unit}`;
      } else if (isDisabled) {
        valText = eq.note || (eq.status === 'capped' ? 'At cap' : 'No effect');
        valClass += ' is-reason';
      }
      const val = el('span', { className: valClass, textContent: valText });

      row.append(name, val);

      if (isClickable) {
        row.addEventListener('click', () => {
          const curEq = lastResult?.equivalents?.[def.key];
          state.sourceStat = def.key;
          state.sourceDelta = curEq?.status === 'ok' && curEq.value > 0
            ? Number(formatNum(curEq.value, def.decimals))
            : state.sourceDelta;
          saveState(state);
          renderHero();
          updateEquivalents();
        });
      }

      rowsTable.appendChild(row);
    });

    renderValueTable(defs, perPoint, result.baseExpected > 0, stats, opts);
  }

  // Damage per +1 point of each stat, best first. Independent of the hero input.
  function renderValueTable(defs, perPoint, hasStats, stats, opts) {
    valueSection.textContent = '';
    valueSection.hidden = !hasStats;
    if (!hasStats) return;

    const head = el('div', { className: 'stat-equiv-value-head' });
    head.append(
      el('h4', { className: 'stat-equiv-value-title', textContent: 'Damage per +1 point' }),
      el('span', { className: 'stat-equiv-value-cap', textContent: 'at your current stats' }),
    );
    valueSection.appendChild(head);

    // Mastery is per level and would dwarf every other bar: list it last, number only.
    const pointDefs = defs.filter(d => d.key !== 'masteryLevel')
      .sort((a, b) => (perPoint[b.key] || 0) - (perPoint[a.key] || 0));
    const masteryDef = defs.find(d => d.key === 'masteryLevel');
    const barMax = Math.max(0, ...pointDefs.map(d => perPoint[d.key] || 0));

    const list = el('div', { className: 'stat-equiv-value-list' });
    [...pointDefs, ...(masteryDef ? [masteryDef] : [])].forEach(def => {
      const gain = perPoint[def.key] || 0;
      const isMastery = def.key === 'masteryLevel';
      const blocked = statBlockedReason(state.mode, stats, def, opts);
      const row = el('div', { className: `stat-equiv-value-row${gain <= 0 || blocked ? ' is-muted' : ''}` });
      row.dataset.valueRow = def.key;

      const name = el('span', { className: 'stat-equiv-value-name' });
      name.appendChild(el('span', { textContent: def.label }));
      if (isMastery) name.appendChild(el('span', { className: 'stat-equiv-value-unit', textContent: 'per level' }));

      if (blocked) {
        row.append(name, el('span', { className: 'stat-equiv-value-reason', textContent: blocked.note }));
        list.appendChild(row);
        return;
      }

      const track = el('span', { className: `stat-equiv-meter-track${isMastery ? ' is-empty' : ''}` });
      if (!isMastery && barMax > 0) {
        const fill = el('span', { className: 'stat-equiv-meter-fill' });
        fill.style.width = `${Math.min(100, (gain / barMax) * 100).toFixed(1)}%`;
        track.appendChild(fill);
      }

      row.append(name, track, el('span', { className: 'stat-equiv-value-num', textContent: `+${gain.toFixed(2)}%` }));
      list.appendChild(row);
    });
    valueSection.appendChild(list);
  }

  function syncModeButtons() {
    physBtn.classList.toggle('active', state.mode === 'physical');
    magicBtn.classList.toggle('active', state.mode === 'magic');
  }

  function fullRender() {
    syncModeButtons();
    renderBaseline();
    renderHero();
    updateEquivalents();
  }

  physBtn.addEventListener('click', () => {
    if (state.mode === 'physical') return;
    state.mode = 'physical';
    state.sourceStat = 'weaponAttack';
    saveState(state);
    fullRender();
  });

  magicBtn.addEventListener('click', () => {
    if (state.mode === 'magic') return;
    state.mode = 'magic';
    state.sourceStat = 'magicAttack';
    saveState(state);
    fullRender();
  });

  hitCheck.addEventListener('change', () => {
    state.includeHitChance = hitCheck.checked;
    saveState(state);
    fullRender();
  });

  resetBtn.addEventListener('click', () => {
    state.physical = { ...DEFAULT_PHYSICAL_STATS };
    state.magic = { ...DEFAULT_MAGIC_STATS };
    state.includeHitChance = false;
    hitCheck.checked = false;
    state.sourceStat = state.mode === 'magic' ? 'magicAttack' : 'weaponAttack';
    state.sourceDelta = null;
    clearSavedState();
    fullRender();
  });

  fullRender();
  return root;
}

export function createStatEquivalencyPage(monsters = []) {
  return {
    key: 'stat-equivalency',
    label: 'Stat Equivalency',
    kicker: 'Compare upgrade value across stats',
    description: 'Convert a gain in any stat into the equivalent amount of every other stat using Classic World damage and accuracy formulas.',
    sections: [{ key: 'stat-equivalency-calc', label: 'Equivalency calculator' }],
    render: () => {
      const page = el('div', { className: 'formulas-full' });
      const section = markFormulaSection(
        makeCollapsibleSection('Stat Equivalency Calculator', '', () => buildStatEquivalencyCalculator(monsters)),
        'stat-equivalency-calc',
      );
      page.appendChild(section);
      return page;
    },
  };
}
