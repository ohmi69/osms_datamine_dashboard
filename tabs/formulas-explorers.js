import { el } from '../lib/utils.js';

const format = value => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const field = (key, label, value, range = 1000, min = 0, max = 100000, hint = '') =>
  ({ key, label, value, range, min, max, hint });
const damage = () => field('damage', 'Damage before this step', 1000, 5000);
const int = () => field('int', 'Total INT', 200, 1000);
const magicAttack = () => field('magicAttack', 'Magic Attack', 80, 300, 0, 10000, 'Equipment, scrolls and buffs; excludes INT.');
const level = (key, label, value) => field(key, label, value, 120, 1, 200);
const magic = s => Math.floor(s.int / 2) + s.magicAttack;

// Uniform roll integrated analytically; see tmp/accuracy-formula-binary.md and
// tmp/patch-2026-08-rederive-damagetaken-accuracy.md for the client branches.
export function accuracyHitPercent(s) {
  const gap = Math.max(0, s.enemyLevel - s.playerLevel);
  const base = s.accuracy * 100 / (10 * gap + 255);
  const spread = 0.15 + 0.2 / (1 + Math.exp((base - s.avoid) / 12));
  const autoHit = base - s.avoid >= 25 + gap * (s.playerLevel / 2 + 15);
  const chance = autoHit || s.avoid === 0 ? 1 : base === 0 ? 0
    : Math.max(0, Math.min(1, (1 + spread - s.avoid / base) / (2 * spread)));
  return 100 * chance * (1 - s.missRate / 100);
}

const percent = value => `${value > 0 && value < 0.005 ? '<0.01'
  : value < 100 && value >= 99.995 ? '>99.99' : format(value)}%`;

// These are individual formula stages, evaluated independently of other calculators.
export const FORMULA_EXPLORERS = {
  'Meso Explosion': {
    title: 'Meso Explosion calculator',
    className: 'formulas-meso-calc',
    fields: [field('mastery', 'Mastery (%)', 150, 150, 90, 150),
      field('mesos', 'Mesos per pile', 100, 1000, 1, 2147483647)],
    scale: 1500,
    evaluate: s => {
      // The skill's Mastery percentage is raw x / 10, so x / 2 = Mastery * 5.
      const maximum = s.mastery * 5 * (1 + s.mesos / (s.mesos + 10));
      const minimum = maximum / 2;
      return { headline: `${format(minimum)} – ${format(maximum)} damage per pile`,
        bars: [{ label: 'Minimum', value: minimum }, { label: 'Maximum', value: maximum }],
        detail: `Average: ${format((minimum + maximum) / 2)}` };
    },
    note: 'Before defense and other modifiers. Tooltip correction: Lv.28 = 144%, Lv.29 = 146%.',
  },
  'Physical & Magical Accuracy': {
    title: 'Explore hit chance',
    fields: [field('accuracy', 'Your Accuracy', 100, 500, 0, 100000, 'Use Accuracy from your Stats panel.'),
      field('avoid', 'Enemy Avoid', 30, 100, 0, 10000, 'Enemy Avoid after any avoidability modifiers.'),
      level('playerLevel', 'Your level', 30), level('enemyLevel', 'Enemy level', 35),
      field('missRate', 'Miss-chance debuff (%)', 0, 100, 0, 100, 'Leave at 0 without a forced-miss debuff.')],
    scale: 100,
    stacked: true,
    formatValue: percent,
    evaluate: s => {
      const hit = accuracyHitPercent(s);
      return { headline: `${percent(hit)} hit chance`,
        bars: [{ label: 'Hit', value: hit }, { label: 'Miss', value: 100 - hit }],
        detail: 'The same chance applies to physical and magical attacks.' };
    },
    note: 'Includes the normal auto-hit shortcut and applies the miss-chance debuff afterward. Debuff skills that bypass accuracy use their own success rate.',
  },
  Heal: {
    title: 'Explore Heal damage',
    fields: [int(), magicAttack(), field('luk', 'Total LUK', 30),
      field('recovery', 'Skill recovery (%)', 100, 300, 0, 1000),
      field('players', 'Players in range', 1, 6, 1, 6, 'Includes the caster, even when at full HP.'),
      field('monsters', 'Monsters hit', 1, 15, 1, 15, 'Damage shown applies to undead monsters only.'),
      field('bonus', 'Bless heal bonus (%)', 0, 10, 0, 10)],
    evaluate: s => {
      const targets = s.players + s.monsters;
      const amounts = [0.8, 1].map(roll => Math.trunc(((s.int * roll + s.luk) / 200 + 3)
        * magic(s) * s.recovery / 100 * (targets * 0.1 + 1) * (1 + s.bonus / 100)) / targets * 0.5);
      return { bars: amounts.map((value, i) => ({ label: `${i ? 'Maximum' : 'Minimum'} base damage`, value })),
        headline: `${amounts.map(format).join(' – ')} damage per undead target`,
        detail: `${targets} total targets, including the caster. More targets reduce damage per monster.` };
    },
    note: 'Before enemy defense and later modifiers. HP restored per player is not established by this client formula.',
  },
  'Damage Over Time (DoT)': {
    title: 'Explore damage over time',
    fields: [int(), magicAttack(), field('basic', 'DoT Basic Attack', 100, 500, 0, 10000,
      'The Basic Attack listed for the full damage-over-time effect.'),
      field('duration', 'Duration (seconds)', 10, 60, 1, 3600)],
    evaluate: s => {
      const total = s.basic / 100 * magic(s) * (s.int / 125 + 1);
      const perTick = total / s.duration;
      return { headline: `${format(total)} total damage`,
        bars: [{ label: 'Total damage', value: total }, { label: 'Estimated damage per tick', value: perTick }],
        detail: `${format(perTick)} damage per tick over ${format(s.duration)} seconds.` };
    },
    note: 'Before element, level and critical modifiers. Per-tick damage assumes one tick per second, based on the skill descriptions.',
  },
  'Level Difference Penalty': {
    title: 'Explore level penalties',
    fields: [damage(), level('playerLevel', 'Your level', 30), level('enemyLevel', 'Enemy level', 35)],
    evaluate: s => {
      const diff = Math.max(0, s.enemyLevel - s.playerLevel);
      const direct = s.damage / (1 + (diff < 10 ? diff * diff * 0.005 : diff * 0.05));
      const dot = s.damage / (1 + diff * 0.05);
      return { headline: `${format(direct)} direct-hit damage`, bars: [
        { label: 'Before level penalty', value: s.damage },
        { label: 'Direct hit after penalty', value: direct },
        { label: 'DoT after penalty', value: dot }],
      detail: diff ? `Enemy is ${diff} levels higher.` : 'No level penalty.' };
    },
    note: 'Applies only the level penalty to the damage you enter.',
  },
  'Player Defense': {
    title: 'Explore damage taken',
    fields: [field('incoming', 'Incoming damage', 100, 1000),
      field('defense', 'Your defense', 300, 1000), level('playerLevel', 'Your level', 30)],
    evaluate: s => {
      const scale = 5 * s.playerLevel + 200 + 1.2 * s.incoming;
      const taken = s.incoming / (1 + s.defense / scale);
      return { headline: `${format(taken)} damage taken`, bars: [
        { label: 'Before your defense', value: s.incoming }, { label: 'After your defense', value: taken }],
      detail: `${format(100 * s.defense / (scale + s.defense))}% reduced by defense.` };
    },
    note: 'Use Weapon Defense for regular attacks or Magic Defense for skill attacks. Before Invincible, elemental reductions and final rounding.',
  },
};

export function buildFormulaExplorer(label) {
  const config = FORMULA_EXPLORERS[label];
  if (!config) return null;
  const state = Object.fromEntries(config.fields.map(f => [f.key, f.value]));
  const wrap = el('section', { className: 'formulas-graph formulas-chart-wrap formulas-damage-graph', 'aria-label': config.title });
  if (config.className) wrap.classList.add(config.className);
  const controls = el('div', { className: 'formulas-graph-controls' });
  const output = el('div', { className: 'formulas-graph-readout', 'aria-live': 'polite' });
  const bars = el('div', { className: 'formulas-explorer-bars', 'aria-hidden': 'true' });
  const inputs = new Map();
  const sliders = new Map();
  let scale = 1;
  config.fields.forEach(f => {
    const input = el('input', { type: 'number', className: 'formulas-calc-input', value: f.value,
      min: f.min, max: f.max, step: 1, 'aria-label': f.label, title: f.hint });
    const slider = el('input', { type: 'range', value: f.value, min: f.min, max: f.range,
      step: 1, 'aria-label': `${f.label} slider` });
    inputs.set(f.key, input);
    sliders.set(f.key, slider);
    input.addEventListener('input', draw);
    slider.addEventListener('input', () => { input.value = slider.value; draw(); });
    controls.append(el('div', { className: 'formulas-graph-stat' },
      el('span', { className: 'formulas-calc-label', textContent: f.label }), input, slider));
  });
  wrap.append(el('div', { className: 'formulas-chart-head' }, el('strong', { textContent: config.title })),
    el('div', { className: 'formulas-damage-layout' }, controls,
      el('div', { className: 'formulas-damage-result' }, output, bars,
        el('p', { className: 'formulas-graph-note', textContent: config.note }))));
  function draw() {
    let invalid;
    config.fields.forEach(f => {
      const input = inputs.get(f.key);
      const valid = input.value !== '' && input.validity.valid;
      if (valid) {
        input.removeAttribute('aria-invalid');
        state[f.key] = Number(input.value);
        const slider = sliders.get(f.key);
        if (state[f.key] > Number(slider.max)) slider.max = Math.min(f.max, Math.ceil(state[f.key] * 1.5));
        slider.value = input.value;
      } else {
        input.setAttribute('aria-invalid', 'true');
        invalid ??= f;
      }
    });
    bars.hidden = Boolean(invalid);
    if (invalid) {
      output.textContent = `Enter ${invalid.label.toLowerCase()} from ${format(invalid.min)} to ${format(invalid.max)}, using whole numbers.`;
      return;
    }
    const result = config.evaluate(state);
    scale = config.scale ?? Math.max(scale, ...result.bars.map(bar => bar.value));
    const formatValue = config.formatValue ?? format;
    output.replaceChildren(el('strong', { className: 'formulas-graph-result', textContent: result.headline }),
      el('span', { className: 'formulas-graph-hint', textContent: result.detail }));
    bars.replaceChildren();
    const accessible = el('span', { className: 'formulas-explorer-sr' });
    accessible.textContent = result.bars.map(bar => `${bar.label}: ${formatValue(bar.value)}.`).join(' ');
    output.append(accessible);
    if (config.stacked) {
      const [hit, miss] = result.bars;
      const fill = el('div', { className: 'formulas-explorer-bar-fill' });
      fill.style.width = `${hit.value}%`;
      bars.append(el('div', { className: 'formulas-explorer-bar' },
        el('div', { className: 'formulas-explorer-bar-label' },
          el('span', { textContent: `Hit ${formatValue(hit.value)}` }),
          el('span', { textContent: `Miss ${formatValue(miss.value)}` })),
        el('div', { className: 'formulas-explorer-bar-track' }, fill)));
      return;
    }
    result.bars.forEach((bar, index) => {
      const fill = el('div', { className: 'formulas-explorer-bar-fill' });
      fill.style.width = `${bar.value / scale * 100}%`;
      fill.style.opacity = index ? '1' : '0.6';
      bars.append(el('div', { className: 'formulas-explorer-bar' },
        el('div', { className: 'formulas-explorer-bar-label' },
          el('span', { textContent: bar.label }), el('strong', { textContent: formatValue(bar.value) })),
        el('div', { className: 'formulas-explorer-bar-track' }, fill)));
    });
  }
  draw();
  return wrap;
}
