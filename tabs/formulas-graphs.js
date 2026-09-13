import { el } from '../lib/utils.js';

export const shieldBlockPercent = defense => defense > 0 ? 100 * Math.max(0.05, defense / (defense + 500)) : 0;
export const physicalRange = s => [s.mastery / 100, 1]
  .map((mastery, i) => s.skill / 100 * ((i ? 1 : 0.8)
    + (s.primary * s.mult * mastery + s.secondary) / (s.statDiv ?? 100)
    + s.power / (s.atkDiv ?? 50)) * s.attack);
export const magicalRange = s => [s.int * s.mastery / 100, s.int]
  .map(stat => s.basic / 100 * (Math.floor(s.int / 2) + s.magicAttack) * (stat / 100 + 1));

const svgNode = (tag, attrs = {}) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
};
const format = value => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

// Each graph evaluates the same function for its curve and exact-value readout.
function buildGraph({ title, note, fields, evaluate, percent = false, extra }) {
  const state = Object.fromEntries(fields.map(f => [f.key, f.value]));
  let axis = fields[0];
  const ranges = Object.fromEntries(fields.map(f => [f.key, f.range || 100]));
  const wrap = el('section', { className: 'formulas-graph formulas-chart-wrap', 'aria-label': title });
  wrap.append(el('div', { className: 'formulas-chart-head' }, el('strong', { textContent: title })));
  const output = el('div', { className: 'formulas-graph-readout', 'aria-live': 'polite' });
  wrap.append(output);
  const controls = el('div', { className: 'formulas-graph-controls' });
  const inputs = new Map();
  const sliders = new Map();
  fields.forEach(field => {
    const input = el('input', { type: 'number', className: 'formulas-calc-input', min: field.min ?? 0,
      max: field.max, step: field.step || 1, value: field.value, 'aria-label': field.label });
    const slider = el('input', { type: 'range', min: field.min ?? 0, max: ranges[field.key],
      step: field.step || 1, value: field.value, 'aria-label': `${field.label} slider` });
    inputs.set(field.key, input);
    sliders.set(field.key, slider);
    input.addEventListener('input', () => {
      if (input.value === '' || !input.validity.valid) {
        input.setAttribute('aria-invalid', 'true');
        output.textContent = `Enter ${field.label.toLowerCase()} from ${field.min ?? 0} to ${format(field.max)}${field.step ? ` in steps of ${field.step}` : ', using whole numbers'}.`;
        plot.hidden = true;
        return;
      }
      setValue(field.key, Number(input.value));
    });
    slider.addEventListener('input', () => setValue(field.key, Number(slider.value)));
    if (field.hint) input.title = field.hint;
    controls.append(el('div', { className: 'formulas-graph-stat' },
      el('span', { className: 'formulas-calc-label', textContent: field.label }), input, slider));
  });
  wrap.append(controls);
  const plot = el('div', { className: 'formulas-chart-plot' });
  const svg = svgNode('svg', { viewBox: '0 0 640 300', role: 'img', 'aria-label': title });
  svg.classList.add('formulas-graph-svg');
  plot.append(svg);
  wrap.append(plot);
  wrap.append(el('p', { className: 'formulas-graph-note', title: note, textContent: percent
    ? 'Only defense on your shield counts.'
    : note }));
  if (extra) wrap.append(extra(setValue));

  function setValue(key, value) {
    axis = fields.find(field => field.key === key);
    state[key] = value;
    inputs.get(key).value = value;
    inputs.get(key).removeAttribute('aria-invalid');
    draw();
  }

  function draw() {
    if ([...inputs.values()].some(input => input.value === '' || !input.validity.valid)) return;
    plot.hidden = false;
    // Keep each slider's scale steady while dragging; expand only for a typed value beyond it.
    fields.forEach(field => {
      if (state[field.key] > ranges[field.key]) ranges[field.key] = Math.min(field.max, Math.ceil(state[field.key] * 1.5));
      sliders.get(field.key).max = ranges[field.key];
      sliders.get(field.key).value = state[field.key];
    });
    const xmax = ranges[axis.key];
    const xmin = axis.min ?? 0;
    const samples = Array.from({ length: 201 }, (_, i) => {
      const x = xmin + (xmax - xmin) * i / 200;
      return { x, values: evaluate({ ...state, [axis.key]: x }) };
    });
    const peak = Math.max(1, ...samples.flatMap(p => p.values));
    const tick = 10 ** Math.floor(Math.log10(peak / 4));
    const ymax = percent ? 100 : Math.ceil(peak / (4 * tick)) * 4 * tick;
    const px = x => 64 + (x - xmin) / (xmax - xmin) * 552;
    const py = y => 254 - y / ymax * 222;
    svg.replaceChildren();
    const label = (x, y, text, anchor = 'middle') => {
      const node = svgNode('text', { x, y, 'text-anchor': anchor, class: 'formulas-chart-axis-label' });
      node.textContent = text;
      svg.append(node);
    };
    for (let i = 0; i <= 4; i++) {
      const y = ymax * i / 4;
      svg.append(svgNode('line', { x1: 64, x2: 616, y1: py(y), y2: py(y), stroke: 'var(--border)' }));
      label(56, py(y) + 4, `${format(y)}${percent ? '%' : ''}`, 'end');
      const x = xmin + (xmax - xmin) * i / 4;
      label(px(x), 273, format(x));
    }
    label(340, 294, axis.label);
    label(64, 18, percent ? 'Block chance' : 'Damage before enemy defense', 'start');
    if (!percent) {
      const lower = samples.map(p => `${px(p.x)},${py(p.values[0])}`);
      const upper = [...samples].reverse().map(p => `${px(p.x)},${py(p.values[1])}`);
      svg.append(svgNode('path', { d: `M${lower.join(' L')} L${upper.join(' L')} Z`, class: 'formulas-chart-area' }));
    }
    samples[0].values.forEach((_, series) => {
      // Shield guard has a discontinuity at zero: do not interpolate a ramp to the 5% floor.
      const points = percent ? [{ x: 0, values: [5] }, ...samples.slice(1)] : samples;
      svg.append(svgNode('path', { d: points.map((p, i) => `${i ? 'L' : 'M'}${px(p.x)},${py(p.values[series])}`).join(' '),
        class: 'formulas-chart-line', 'stroke-dasharray': series ? '6 4' : 'none' }));
    });
    if (percent) {
      svg.append(svgNode('circle', { cx: px(0), cy: py(5), r: 3, fill: 'var(--bg)', stroke: 'var(--accent)' }));
      svg.append(svgNode('circle', { cx: px(0), cy: py(0), r: 3, fill: 'var(--accent)' }));
    }
    const values = evaluate(state);
    svg.setAttribute('aria-label', percent ? title : `${axis.label} versus damage, with other inputs fixed. At ${format(state[axis.key])}: minimum ${format(values[0])}, maximum ${format(values[1])}.`);
    svg.append(svgNode('line', { x1: px(state[axis.key]), x2: px(state[axis.key]), y1: 32, y2: 254,
      stroke: 'var(--dim)', 'stroke-dasharray': '3 3' }));
    values.forEach(y => svg.append(svgNode('circle', { cx: px(state[axis.key]), cy: py(y), r: 4,
      fill: 'var(--accent)', stroke: 'var(--bg)', 'stroke-width': 2 })));
    output.replaceChildren(el('strong', { className: 'formulas-graph-result',
      textContent: percent ? `${format(values[0])}% block chance` : `${values.map(format).join(' – ')} damage` }));
  }
  draw();
  return wrap;
}

export function buildShieldGraph(items = [], graphData) {
  return buildGraph({
    title: 'Explore shield block chance', percent: true,
    note: 'Only Weapon Defense on the shield counts, including scrolls. Zero defense gives no shield guard; positive defense has a 5% floor. Applies to guardable attacks.',
    fields: [{ key: 'defense', label: 'Shield Weapon Defense', hint: 'Use the number on your shield, including scrolls. Slider range includes the strongest listed DEF scroll in every slot.', ...graphData.shield }],
    evaluate: s => [shieldBlockPercent(s.defense)],
    extra: setValue => {
      const details = el('details', { className: 'formulas-graph-presets' });
      details.append(el('summary', { textContent: 'Choose a shield' }));
      details.append(el('p', { className: 'formulas-graph-hint', textContent: 'These are unscrolled shields. Pick one to load its defense, or edit the number below to match your own.' }));
      const shields = items.filter(i => i.sub_category === 'Shield' && Number.isFinite(i.stats?.incPDD))
        .sort((a, b) => a.stats.incPDD - b.stats.incPDD || a.name.localeCompare(b.name));
      if (!shields.length) details.append(el('p', { textContent: 'No shield presets available. Enter the shield’s Weapon Defense above.' }));
      shields.forEach(item => {
        const defense = item.stats.incPDD;
        details.append(el('button', { className: 'formulas-graph-preset', type: 'button',
          onclick: () => setValue('defense', defense) },
        el('span', { textContent: item.name }),
        el('span', { textContent: `${defense} DEF · ${format(shieldBlockPercent(defense))}%` })));
      });
      return details;
    },
  });
}

export function buildDamageGraph(magic = false, graphData) {
  const profile = magic ? graphData.magical : graphData.physical;
  const field = (key, label, hint) => ({ key, label, hint, ...profile[key] });
  const fields = magic ? [
    field('int', 'Total INT', 'Total INT from base stats, equipment and buffs. Also contributes half its value, rounded down, to MAGIC.'),
    field('magicAttack', 'Magic Attack', 'Total Magic Attack from equipment, scrolls and buffs, excluding INT. Scales both minimum and maximum damage.'),
    field('basic', 'Skill Basic Attack', 'The Basic Attack listed on your spell. Doubling it doubles damage.'),
    field('mastery', 'Mastery level', 'Raises minimum damage only, making hits more consistent. Use the level in the skill effect.'),
  ] : [
    field('primary', 'Primary stat', 'Raises both ends of the range. STR for melee, DEX for bows, LUK for daggers and claws.'),
    field('secondary', 'Secondary stat', 'Raises both ends equally. DEX for melee, STR for bows, STR + DEX for daggers and claws.'),
    field('attack', 'Weapon Attack', 'Weapon + shield + stars or arrows. With other stats fixed, 10% more means 10% more damage.'),
    field('power', 'AttackPower', 'The AttackPower term in the formula: attack from buffs and equipment other than your weapon and shield. Appears as AttackPower × 2 in the simplified formula.'),
    field('mastery', 'Mastery level', 'Raises minimum damage only, making hits more consistent. Use the level in the skill effect.'),
    field('skill', 'Skill Damage (%)', 'The damage percentage on your skill. 100% is a basic attack; 200% doubles damage.'),
    { key: 'mult', label: 'Weapon multiplier', value: profile.mult.value, min: 0, max: 1000, step: 0.01,
      numberOnly: true, hint: 'Enter a custom multiplier. Selecting a weapon or action loads its preset again.' },
  ];
  const current = Object.fromEntries(fields.map(f => [f.key, f.value]));
  if (!magic) current.mult = profile.mult.value;
  const evaluate = state => (magic ? magicalRange : physicalRange)({ ...state,
    mastery: 8 + state.mastery * 8 });
  const title = `Explore ${magic ? 'magical' : 'physical'} base damage`;
  const wrap = el('section', { className: 'formulas-graph formulas-chart-wrap formulas-damage-graph', 'aria-label': title });
  wrap.append(el('div', { className: 'formulas-chart-head' }, el('strong', { textContent: title })));
  const layout = el('div', { className: 'formulas-damage-layout' });
  const controls = el('div', { className: 'formulas-graph-controls' });
  const result = el('div', { className: 'formulas-damage-result' });
  const output = el('div', { className: 'formulas-graph-readout', 'aria-live': 'polite' });
  const plot = el('div', { className: 'formulas-chart-plot' });
  const svg = svgNode('svg', { viewBox: '0 0 480 260', role: 'img', 'aria-label': 'Minimum and maximum damage' });
  svg.classList.add('formulas-damage-svg');
  plot.append(svg);
  const inputs = new Map();
  const sliders = new Map();
  const multiplierControl = el('div', { className: 'formulas-damage-multiplier' });
  if (!magic) {
    const weapons = graphData.weaponMultipliers;
    let weapon = weapons.find(row => row[0] === '1H Sword') ?? weapons[0];
    let action = 1;
    const names = ['Swing', 'Stab', 'Shoot', 'Other'];
    const picker = el('div', { className: 'formulas-damage-weapon' });
    const menu = el('details', { className: 'formulas-damage-weapon-menu' });
    const summary = el('summary', { 'aria-label': 'Weapon type' });
    const options = el('div', { className: 'formulas-damage-weapon-options' });
    const actions = el('div', { className: 'formulas-damage-action-options', role: 'group', 'aria-label': 'Attack action' });
    const info = el('span', { className: 'formulas-damage-weapon-info' });
    const preset = el('span', { className: 'formulas-damage-weapon-info' });
    multiplierControl.append(preset);
    function syncWeapon() {
      current.mult = weapon[action];
      const multiplierInput = inputs.get('mult');
      if (multiplierInput) multiplierInput.value = current.mult;
      const ranged = ['Bow', 'Crossbow', 'Claw'].includes(weapon[0]);
      current.statDiv = ranged && action !== 3 ? 300 : 100;
      current.atkDiv = ranged && [1, 4].includes(action) ? 150 : 50;
      summary.textContent = weapon[0];
      preset.textContent = `Weapon multiplier`;
      info.textContent = ranged && action !== 3 ? 'Melee attack; reduced stat contribution' : '';
      info.hidden = !info.textContent;
      [...options.children].forEach(button => button.setAttribute('aria-pressed', String(button.textContent === weapon[0])));
      [...actions.children].forEach(button => {
        const selected = Number(button.dataset.action) === action;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
    }
    function buildActions() {
      actions.replaceChildren();
      weapon.slice(1).forEach((multiplier, index) => {
        if (!Number.isFinite(multiplier)) return;
        const button = el('button', { type: 'button', className: 'pill', textContent: names[index],
          'data-action': index + 1, onclick: () => { action = index + 1; syncWeapon(); draw(); } });
        actions.append(button);
      });
      syncWeapon();
    }
    weapons.forEach(row => options.append(el('button', { type: 'button', textContent: row[0], onclick: () => {
      weapon = row;
      action = ['Bow', 'Crossbow', 'Claw'].includes(row[0]) ? 3 : 1;
      buildActions();
      menu.open = false;
      summary.focus();
      draw();
    } })));
    menu.append(summary, options);
    picker.append(el('span', { className: 'formulas-calc-label', textContent: 'Weapon' }),
      el('span', { className: 'formulas-calc-label', textContent: 'Action' }), menu, actions, multiplierControl, info);
    controls.append(picker);
    buildActions();
  }
  fields.forEach(f => {
    const input = el('input', { type: 'number', className: 'formulas-calc-input',
      min: f.min, max: f.max, step: f.step, value: current[f.key], 'aria-label': f.label });
    inputs.set(f.key, input);
    input.addEventListener('input', () => {
      if (input.value !== '' && input.validity.valid) current[f.key] = Number(input.value);
      draw();
    });
    if (f.key === 'mult') {
      input.title = f.hint;
      multiplierControl.append(input);
      return;
    }
    const row = el('div', { className: 'formulas-graph-stat', title: f.hint },
      el('span', { className: 'formulas-calc-label', textContent: f.label }), input);
    if (!f.numberOnly) {
      const slider = el('input', { type: 'range', min: f.min, max: Math.max(f.range, f.value),
        step: f.step, value: f.value, 'aria-label': `${f.label} slider` });
      sliders.set(f.key, slider);
      slider.addEventListener('input', () => {
        current[f.key] = Number(slider.value);
        input.value = slider.value;
        draw();
      });
      row.append(slider);
    }
    controls.append(row);
  });
  result.append(output, plot);
  layout.append(controls, result);
  wrap.append(layout);
  // Keep the scale steady when stats decrease, so shorter bars show the loss.
  let chartMax = 0;
  function draw() {
    let invalid;
    fields.forEach(f => {
      const input = inputs.get(f.key);
      const valid = input.value !== '' && input.validity.valid;
      if (valid) input.removeAttribute('aria-invalid');
      else { input.setAttribute('aria-invalid', 'true'); invalid ??= f; }
      const slider = sliders.get(f.key);
      if (slider) {
        if (current[f.key] > Number(slider.max)) slider.max = Math.min(f.max, Math.ceil(current[f.key] * 1.5));
        slider.value = current[f.key];
      }
    });
    plot.hidden = Boolean(invalid);
    if (invalid) {
      output.textContent = `Enter ${invalid.label} from ${format(invalid.min)} to ${format(invalid.max)}, in steps of ${invalid.step}.`;
      return;
    }
    const after = evaluate(current);
    output.replaceChildren(el('span', { className: 'formulas-graph-hint', textContent: 'Damage with your current stats' }),
      el('strong', { className: 'formulas-graph-result', textContent: `${after.map(format).join(' – ')} damage` }));

    const peak = Math.max(1, ...after);
    const unit = 10 ** Math.floor(Math.log10(peak / 4));
    chartMax = Math.max(chartMax, Math.ceil(peak / (4 * unit)) * 4 * unit);
    const xmax = chartMax;
    const px = value => 24 + value / xmax * 424;
    svg.replaceChildren();
    svg.setAttribute('aria-label', `Damage before enemy defense. Minimum: ${format(after[0])}. Maximum: ${format(after[1])}.`);
    const label = (x, y, text, attrs = {}) => {
      const node = svgNode('text', { x, y, fill: 'var(--text)', ...attrs });
      node.textContent = text;
      svg.append(node);
    };
    for (let i = 0; i <= 4; i++) {
      const value = xmax * i / 4;
      svg.append(svgNode('line', { x1: px(value), x2: px(value), y1: 48, y2: 204, stroke: 'var(--border)' }));
      label(px(value), 227, value >= 10000 ? `${format(value / 1000)}k` : format(value), { 'text-anchor': 'middle', class: 'formulas-damage-tick' });
    }
    after.forEach((value, index) => {
      const y = index ? 172 : 72;
      label(24, y - 30, `${index ? 'Maximum' : 'Minimum'} damage: ${format(value)}`, { 'font-weight': 600 });
      svg.append(svgNode('rect', { x: px(0), y: y - 12, width: px(value) - px(0), height: 24,
        fill: 'var(--accent)', opacity: index ? 1 : 0.6, rx: 2 }));
    });
    label(236, 252, 'Damage before enemy defense →', { 'text-anchor': 'middle', class: 'formulas-damage-tick' });
  }
  draw();
  return wrap;
}

