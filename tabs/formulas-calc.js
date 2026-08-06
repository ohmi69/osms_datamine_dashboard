// Damage-taken calculator, shared by the COT2 formulas page and the frozen COT1
// snapshot. Everything the two clients disagree on is passed in by the caller -
// the defense scale, whether the player's level is part of it, and the footnotes -
// so neither page's numbers can drift by editing this file.

import { el, matchSearch } from '../lib/utils.js';
import { getMobThumbUrl, getMobGifUrl } from '../lib/data.js';

// Even sampling of the 1.1-1.5 roll. The roll is uniform but the defense step is
// not linear in it, so the average has to be sampled rather than taken at the midpoint.
const ROLL_SAMPLES = 401;

function mobAttackStat(mob, magic) {
  return (magic ? mob?.MADamage : mob?.PADamage) ?? 0;
}

// Type-to-filter monster picker. A plain <select> would work, but a couple of hundred
// mobs with duplicate names are much easier to pick from with a thumbnail next to each.
function buildMobPicker(monsters, onPick) {
  const wrap = el('div', { className: 'formulas-calc-picker' });
  const input = el('input', { type: 'text', className: 'formulas-calc-input', placeholder: 'Search a monster…', autocomplete: 'off' });
  const panel = el('div', { className: 'formulas-calc-options' });
  wrap.appendChild(input);
  wrap.appendChild(panel);

  let rows = [];
  let active = -1;

  function setActive(i) {
    active = i;
    rows.forEach((r, j) => r.classList.toggle('active', j === i));
    rows[i]?.scrollIntoView({ block: 'nearest' });
  }

  function close() {
    panel.classList.remove('open');
    active = -1;
  }

  function pick(mob) {
    input.value = mob.name;
    close();
    onPick(mob);
  }

  function render(query) {
    panel.innerHTML = '';
    rows = [];
    const matches = monsters.filter(m => matchSearch(m.name, query)).slice(0, 80);
    if (!matches.length) {
      panel.appendChild(el('div', { className: 'formulas-calc-empty', textContent: 'No monster matches' }));
    }
    matches.forEach((mob) => {
      const row = el('div', { className: 'formulas-calc-option' });
      // Static thumb in the list - 80 animated webps at once is a lot of decoding.
      const thumb = getMobThumbUrl(mob.thumbnail) || getMobGifUrl(mob.gif);
      if (thumb) row.appendChild(el('img', { className: 'formulas-calc-thumb', src: thumb, alt: '', loading: 'lazy' }));
      else row.appendChild(el('span', { className: 'formulas-calc-thumb' }));
      row.appendChild(el('span', { className: 'formulas-calc-opt-name', textContent: mob.name }));
      row.appendChild(el('span', { className: 'lvl-chip', textContent: `Lv ${mob.level}` }));
      row.addEventListener('mousedown', (e) => { e.preventDefault(); pick(mob); });
      panel.appendChild(row);
      rows.push(row);
    });
    panel.classList.add('open');
  }

  input.addEventListener('focus', () => { input.select(); render(''); });
  input.addEventListener('input', () => render(input.value.trim()));
  input.addEventListener('blur', () => setTimeout(close, 0));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); input.blur(); return; }
    if (!rows.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(active + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(active - 1, 0)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); rows[active].dispatchEvent(new MouseEvent('mousedown')); }
  });

  wrap._setValue = (mob) => { input.value = mob ? mob.name : ''; };
  return wrap;
}

function makeNumberField(label, value, { min, max, onChange }) {
  const field = el('label', { className: 'formulas-calc-field' });
  const labelEl = el('span', { className: 'formulas-calc-label', textContent: label });
  const input = el('input', {
    type: 'number', className: 'formulas-calc-input',
    value: String(value), min: String(min), max: String(max),
    title: `${min} to ${max}`,
  });

  const clamp = () => {
    const n = Number(input.value);
    return Number.isFinite(n) && input.value !== '' ? Math.min(max, Math.max(min, n)) : min;
  };

  input.addEventListener('input', () => onChange(clamp()));
  // Snap the field back to what is actually being used, so an out-of-range number
  // does not sit there looking like it counted.
  input.addEventListener('blur', () => { input.value = String(clamp()); });
  field.appendChild(labelEl);
  field.appendChild(input);
  field._label = labelEl;
  field._input = input;
  return field;
}

function buildDamageCalc(config) {
  const { monsters, scale, scaleTerms, useLevel = true, notes } = config;

  // Both clients share everything but the scale, and both clamp and truncate at the end.
  const damageTaken = (incoming, defense, level) =>
    Math.min(50000000, Math.max(1, Math.trunc(incoming / (1 + defense / scale(incoming, level)))));

  const state = {
    mob: monsters.find(m => m.name === 'Orange Mushroom') ?? monsters[0] ?? null,
    magic: false,
    level: 30,
    defense: 100,
    shield: 0,
  };

  const wrap = el('div', { className: 'formulas-calc' });
  wrap.appendChild(el('div', { className: 'formulas-calc-heading', textContent: 'Damage Taken Calculator' }));

  const controls = el('div', { className: 'formulas-calc-controls' });

  const mobField = el('label', { className: 'formulas-calc-field formulas-calc-field--mob' });
  mobField.appendChild(el('span', { className: 'formulas-calc-label', textContent: 'Monster' }));
  const picker = buildMobPicker(monsters, (mob) => { state.mob = mob; syncMode(); update(); });
  picker._setValue(state.mob);
  mobField.appendChild(picker);
  controls.appendChild(mobField);

  const attackField = el('div', { className: 'formulas-calc-field' });
  attackField.appendChild(el('span', { className: 'formulas-calc-label', textContent: 'Attack' }));
  const attackToggle = el('div', { className: 'formulas-calc-toggle' });
  const physBtn = el('button', { className: 'pill pill--sub active', type: 'button', textContent: 'Regular' });
  const magicBtn = el('button', { className: 'pill pill--sub', type: 'button', textContent: 'Skill (Magic)' });
  physBtn.addEventListener('click', () => { state.magic = false; syncMode(); update(); });
  magicBtn.addEventListener('click', () => { if (!magicBtn.disabled) { state.magic = true; syncMode(); update(); } });
  attackToggle.appendChild(physBtn);
  attackToggle.appendChild(magicBtn);
  attackField.appendChild(attackToggle);
  controls.appendChild(attackField);

  // COT1's defense step has no level term, so the field would do nothing there.
  if (useLevel) {
    controls.appendChild(makeNumberField('Your Level (1-120)', state.level, {
      min: 1, max: 120, onChange: (v) => { state.level = v; update(); },
    }));
  }

  const defField = makeNumberField('Weapon Defense', state.defense, {
    min: 0, max: 99999, onChange: (v) => { state.defense = v; update(); },
  });
  controls.appendChild(defField);

  const shieldField = makeNumberField('Shield Weapon Def', state.shield, {
    min: 0, max: 9999, onChange: (v) => { state.shield = v; update(); },
  });
  controls.appendChild(shieldField);

  wrap.appendChild(controls);

  const out = el('div', { className: 'formulas-calc-out' });
  wrap.appendChild(out);

  function syncMode() {
    const hasMagic = mobAttackStat(state.mob, true) > 0;
    magicBtn.disabled = !hasMagic;
    magicBtn.classList.toggle('disabled', !hasMagic);
    magicBtn.title = hasMagic ? '' : 'This monster has no magic attack stat, so it has no skill attack';
    if (!hasMagic) state.magic = false;
    physBtn.classList.toggle('active', !state.magic);
    magicBtn.classList.toggle('active', state.magic);
    defField._label.textContent = state.magic ? 'Magic Defense' : 'Weapon Defense';
    // Guard is only rolled on a monster's regular attack.
    shieldField.classList.toggle('formulas-calc-field--off', state.magic);
    shieldField._input.disabled = state.magic;
  }

  function statRow(label, value, note) {
    const row = el('div', { className: 'formulas-calc-stat' });
    row.appendChild(el('span', { className: 'formulas-calc-stat-label', textContent: label }));
    row.appendChild(el('span', { className: 'formulas-calc-stat-val', textContent: value }));
    if (note) row.appendChild(el('span', { className: 'formulas-calc-stat-note', textContent: note }));
    return row;
  }

  function update() {
    out.innerHTML = '';
    const mob = state.mob;
    if (!mob) {
      out.appendChild(el('div', { className: 'formulas-calc-empty', textContent: 'Pick a monster to see the numbers.' }));
      return;
    }

    const attack = mobAttackStat(mob, state.magic);
    if (attack <= 0) {
      out.appendChild(el('div', {
        className: 'formulas-calc-empty',
        textContent: `${mob.name} has no ${state.magic ? 'magic' : 'physical'} attack stat, so this attack deals no damage.`,
      }));
      return;
    }

    const incMin = attack * 1.1;
    const incMax = attack * 1.5;
    const dmgMin = damageTaken(incMin, state.defense, state.level);
    const dmgMax = damageTaken(incMax, state.defense, state.level);

    let sum = 0;
    for (let i = 0; i < ROLL_SAMPLES; i++) {
      sum += damageTaken(attack * (1.1 + 0.4 * (i / (ROLL_SAMPLES - 1))), state.defense, state.level);
    }
    const dmgAvg = sum / ROLL_SAMPLES;

    const incAvg = attack * 1.3;
    const reduction = 1 - dmgAvg / incAvg;
    const guard = !state.magic && state.shield > 0 ? Math.max(0.05, state.shield / (state.shield + 500)) : 0;

    const head = el('div', { className: 'formulas-calc-head' });
    const thumb = getMobGifUrl(mob.gif) || getMobThumbUrl(mob.thumbnail);
    if (thumb) head.appendChild(el('img', { className: 'formulas-calc-hero', src: thumb, alt: '' }));
    const headText = el('div', { className: 'formulas-calc-headtext' });
    headText.appendChild(el('div', { className: 'formulas-calc-headline', textContent: Math.round(dmgAvg).toLocaleString() }));
    headText.appendChild(el('div', {
      className: 'formulas-calc-sub',
      textContent: `average damage per landed ${state.magic ? 'skill' : 'regular'} hit  ·  ${dmgMin.toLocaleString()} – ${dmgMax.toLocaleString()}`,
    }));
    head.appendChild(headText);
    out.appendChild(head);

    // Bar: the full incoming hit, with the part your defense eats shaded off.
    const bar = el('div', { className: 'formulas-calc-bar' });
    bar.appendChild(el('div', { className: 'formulas-calc-bar-fill', style: { width: `${Math.max(1, (dmgAvg / incAvg) * 100).toFixed(1)}%` } }));
    out.appendChild(bar);
    out.appendChild(el('div', {
      className: 'formulas-calc-barlabel',
      textContent: `${Math.round(incAvg).toLocaleString()} incoming on an average roll, ${(reduction * 100).toFixed(1)}% cut by defense`,
    }));

    const stats = el('div', { className: 'formulas-calc-stats' });
    stats.appendChild(statRow(state.magic ? 'Magic Attack' : 'Physical Attack', attack.toLocaleString(), `${mob.name}, Lv ${mob.level}`));
    stats.appendChild(statRow('IncomingDamage', `${Math.round(incMin).toLocaleString()} – ${Math.round(incMax).toLocaleString()}`, 'attack × 1.1 to 1.5'));
    stats.appendChild(statRow(
      'DefenseScale',
      Math.round(scale(incAvg, state.level)).toLocaleString(),
      scaleTerms(Math.round(incAvg), state.level),
    ));
    if (!state.magic) {
      stats.appendChild(statRow('Guard Chance', guard ? `${(guard * 100).toFixed(1)}%` : '—', guard ? 'hit negated entirely' : 'no shield equipped'));
      stats.appendChild(statRow('Average per Attack', Math.round(dmgAvg * (1 - guard)).toLocaleString(), 'counting guards, but not misses'));
    }
    out.appendChild(stats);

    const noteWrap = el('div', { className: 'formulas-pipeline-notes formulas-calc-notes' });
    notes(state.magic).forEach(n => noteWrap.appendChild(el('div', { className: 'formulas-note', textContent: n })));
    out.appendChild(noteWrap);
  }

  syncMode();
  update();
  return wrap;
}

// The calculator stays out of the way until asked for - the section is a reference
// first. Built on the first open so the mob list costs nothing until then.
export function buildCalcLauncher(config) {
  const wrap = el('div', { className: 'formulas-calc-launcher' });
  const btn = el('button', { className: 'pill formulas-calc-btn', type: 'button' });
  const slot = el('div', { className: 'formulas-calc-slot' });
  let calc = null;
  let open = false;

  btn.textContent = '▸  Damage Taken Calculator';
  btn.addEventListener('click', () => {
    open = !open;
    if (open && !calc) {
      calc = buildDamageCalc(config);
      slot.appendChild(calc);
    }
    slot.classList.toggle('open', open);
    btn.classList.toggle('active', open);
    btn.textContent = `${open ? '▾' : '▸'}  Damage Taken Calculator`;
  });

  wrap.appendChild(btn);
  wrap.appendChild(slot);
  return wrap;
}
