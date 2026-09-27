import { el } from './utils.js';

const PATCHES = ['v49', 'v43', 'v22'];
const FILES = { monster: 'monsters.json', skill: 'skills.json', item: 'items.json' };
const cache = new Map();
let selectedPatch = PATCHES.includes(localStorage.getItem('osms-compare-patch'))
  ? localStorage.getItem('osms-compare-patch') : 'v49';

export function canCompareWithOsms() {
  return !PATCHES.includes(new URLSearchParams(window.location.search).get('patch'));
}

function nameKey(name) {
  return String(name || '').trim().toLocaleLowerCase();
}

function recordsFor(type, data) {
  if (type === 'monster') return data.monsters || [];
  if (type === 'item') return [...(data.items || []), ...(data.scrolls || [])];
  return Object.values(data).filter(Array.isArray).flatMap(groups =>
    groups.flatMap(group => group?.skills || []));
}

function loadRecords(type, patch) {
  const key = `${patch}/${FILES[type]}`;
  if (!cache.has(key)) {
    const request = fetch(`./data/patches/${patch}/${FILES[type]}`)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => recordsFor(type, data));
    cache.set(key, request);
    request.catch(() => cache.delete(key));
  }
  return cache.get(key);
}

const MONSTER_FIELDS = [
  ['level', 'Level'], ['hp', 'HP'], ['mp', 'MP'], ['exp', 'EXP'],
  ['PADamage', 'P.ATK'], ['PDDamage', 'P.DEF'], ['MADamage', 'M.ATK'],
  ['MDDamage', 'M.DEF'], ['acc', 'ACC'], ['eva', 'AVOID'], ['speed', 'Speed'],
  ['pushed', 'KB'], ['hp_recovery', 'HP regen'], ['mp_recovery', 'MP regen'],
  ['undead', 'Undead'], ['aggro', 'Aggro'], ['invincible', 'Invincible'],
];

const MONSTER_GROUPS = [
  ['Farming', ['level', 'exp', 'hp', 'mp']],
  ['Combat', ['PADamage', 'PDDamage', 'MADamage', 'MDDamage', 'acc', 'eva', 'speed', 'pushed']],
  ['Traits', ['hp_recovery', 'mp_recovery', 'elements', 'undead', 'aggro', 'invincible']],
];
const GROUP_ORDER = {
  monster: ['Farming', 'Combat', 'Traits', 'Other'],
  skill: ['Effect', 'Skill details'],
  item: ['Equipment stats', 'Effects', 'Requirements', 'Item details'],
};

function groupFor(type, key) {
  if (type === 'monster') return MONSTER_GROUPS.find(([, keys]) => keys.includes(key))?.[0] || 'Other';
  if (type === 'skill') return key === 'level-stat' || key === 'description' ? 'Effect' : 'Skill details';
  if (key.startsWith('stats.')) return 'Equipment stats';
  if (key.startsWith('spec.')) return 'Effects';
  if (/^(req|attack_speed|weapon_type)/i.test(key)) return 'Requirements';
  return 'Item details';
}

function humanize(key) {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function addPrimitiveFields(target, record, prefix, excluded = new Set()) {
  for (const [key, value] of Object.entries(record || {})) {
    if (excluded.has(key) || value == null || typeof value === 'object') continue;
    target.set(`${prefix}${key}`, { label: `${prefix ? humanize(prefix.slice(0, -1)) + ' · ' : ''}${humanize(key)}`, value });
  }
}

function fieldsFor(type, record, selectedLevel = 1) {
  const fields = new Map();
  if (type === 'monster') {
    for (const [key, label] of MONSTER_FIELDS) {
      if (record[key] != null) fields.set(key, { label, value: record[key] });
    }
    if (record.elements && Object.keys(record.elements).length) {
      fields.set('elements', {
        label: 'Elements',
        value: Object.entries(record.elements).sort(([a], [b]) => a.localeCompare(b))
          .map(([element, state]) => `${element}: ${state}`).join(', '),
      });
    }
  } else if (type === 'skill') {
    addPrimitiveFields(fields, record, '', new Set(['id', 'name', 'class_name', 'job', 'thumbnail', 'description']));
    if (record.description) {
      fields.set('description', { label: 'Description',
        value: record.description.replace(/^\[Master Level\s*:\s*\d+\]\s*/i, '').trim() });
    }
    const levelStat = record.all_level_stats?.[selectedLevel - 1];
    if (levelStat != null) fields.set('level-stat', { label: `Lv.${selectedLevel} effect`, value: levelStat });
    if (record.item_consume?.length) {
      fields.set('item_consume', { label: 'Items consumed', value: record.item_consume.join(', ') });
    }
  } else {
    addPrimitiveFields(fields, record, '', new Set(['id', 'name', 'thumbnail', 'sub_category']));
    addPrimitiveFields(fields, record.stats, 'stats.');
    addPrimitiveFields(fields, record.spec, 'spec.');
  }
  return fields;
}

function display(value) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : String(value);
}

function sameValue(before, after) {
  if (before === after) return true;
  if (before == null || after == null) return false;
  if (typeof before === 'boolean' || typeof after === 'boolean') return false;
  return String(before).trim() === String(after).trim();
}

function deltaText(before, after) {
  if (typeof before !== 'number' || typeof after !== 'number' || before === after) return '';
  const difference = after - before;
  const amount = `${difference > 0 ? '+' : ''}${difference.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
  if (before <= 0 || after < 0) return amount;
  const percent = ((difference / before) * 100).toFixed(1).replace(/\.0$/, '');
  return `${amount} (${difference > 0 ? '+' : ''}${percent}%)`;
}

function fieldRows(type, current, old, selectedLevel = 1) {
  const currentFields = fieldsFor(type, current, selectedLevel);
  const oldFields = fieldsFor(type, old, selectedLevel);
  const keys = [...new Set([...currentFields.keys(), ...oldFields.keys()])];
  const rows = keys.map(key => {
    const before = oldFields.get(key)?.value;
    const after = currentFields.get(key)?.value;
    return { key, label: currentFields.get(key)?.label || oldFields.get(key)?.label,
      before, after, same: sameValue(before, after) };
  });
  return { changed: rows.filter(row => !row.same), all: rows };
}

function locationRows(current, old) {
  function byName(maps) {
    const result = new Map();
    for (const map of maps || []) {
      const name = map.name || `#${map.id}`;
      const key = name.trim().toLocaleLowerCase();
      const previous = result.get(key);
      result.set(key, { name, count: (previous?.count || 0) + (Number(map.count) || 0) });
    }
    return result;
  }
  const before = byName(old.maps);
  const after = byName(current.maps);
  return [...new Set([...before.keys(), ...after.keys()])].map(key => ({
    label: after.get(key)?.name || before.get(key)?.name,
    before: before.get(key)?.count,
    after: after.get(key)?.count,
    note: !before.has(key) ? 'New location' : !after.has(key) ? 'No longer here' : '',
  })).filter(row => row.before !== row.after)
    .sort((a, b) => a.label.localeCompare(b.label));
}

function makeRow(row) {
  const line = el('div', { className: `osms-change-row${row.same ? ' osms-change-row--same' : ''}` });
  line.appendChild(el('span', { className: 'osms-change-label', textContent: row.label }));
  line.appendChild(el('span', { className: 'osms-change-before', textContent: display(row.before) }));
  line.appendChild(el('span', { className: 'osms-change-arrow', textContent: '→', 'aria-hidden': 'true' }));
  line.appendChild(el('span', { className: 'osms-change-after', textContent: display(row.after) }));
  const direction = typeof row.before === 'number' && typeof row.after === 'number'
    ? row.after > row.before ? ' osms-change-delta--up'
      : row.after < row.before ? ' osms-change-delta--down' : ''
    : '';
  line.appendChild(el('span', { className: `osms-change-delta${direction}`,
    textContent: row.note || deltaText(row.before, row.after) }));
  return line;
}

function makeGroup(label, rows) {
  const section = el('section', { className: 'osms-change-group' });
  section.appendChild(el('h4', { className: 'osms-change-heading', textContent: label }));
  rows.forEach(row => section.appendChild(makeRow(row)));
  return section;
}

function recordIdentity(record, type) {
  const context = type === 'monster' ? `Lv.${record.level ?? '?'}`
    : type === 'skill' ? (record.class_name || record.job || 'Skill')
      : (record.sub_category || record.category || 'Item');
  return `${context} · ID ${record.id}`;
}

/** A lazy comparison disclosure for a current-patch record. */
export function makeOsmsCompare(type, record) {
  const root = el('div', { className: 'osms-compare' });
  const toggle = el('button', { className: 'osms-compare-toggle', type: 'button',
    textContent: 'Compare with OSMS', 'aria-expanded': 'false' });
  const panel = el('div', { className: 'osms-compare-panel', hidden: true });
  root.append(toggle, panel);
  // Item rows and skill cards use clicks on their container for navigation.
  root.addEventListener('click', event => event.stopPropagation());
  let patch = selectedPatch;
  let candidate = 0;
  let selectedLevel = 1;
  let requestId = 0;

  async function render() {
    const thisRequest = ++requestId;
    panel.replaceChildren();
    const controls = el('div', { className: 'osms-compare-controls' });
    controls.appendChild(el('span', { textContent: 'OSMS patch' }));
    const patchSelect = el('select', { className: 'osms-compare-select', 'aria-label': 'OSMS patch' });
    PATCHES.forEach(version => {
      const option = el('option', { value: version, textContent: version });
      option.selected = version === patch;
      patchSelect.appendChild(option);
    });
    patchSelect.addEventListener('change', () => {
      patch = patchSelect.value;
      selectedPatch = patch;
      localStorage.setItem('osms-compare-patch', patch);
      candidate = 0;
      selectedLevel = 1;
      render();
    });
    controls.appendChild(patchSelect);
    panel.appendChild(controls);
    const result = el('div', { className: 'osms-compare-result', textContent: 'Loading OSMS values…' });
    panel.appendChild(result);

    let records;
    try {
      records = await loadRecords(type, patch);
    } catch {
      if (thisRequest === requestId) result.textContent = 'Could not load OSMS values. Try another patch.';
      return;
    }
    if (thisRequest !== requestId || panel.hidden) return;
    const matches = records.filter(entry => nameKey(entry.name) === nameKey(record.name));
    result.replaceChildren();
    if (!matches.length) {
      result.textContent = `No ${patch} record named “${record.name}”.`;
      return;
    }
    if (matches.length > 1) {
      const choice = el('label', { className: 'osms-compare-choice' });
      choice.appendChild(el('span', { textContent: `${matches.length} name matches` }));
      const select = el('select', { className: 'osms-compare-select', 'aria-label': 'Choose OSMS record' });
      matches.forEach((match, index) => {
        const option = el('option', { value: String(index), textContent: recordIdentity(match, type) });
        option.selected = index === candidate;
        select.appendChild(option);
      });
      select.addEventListener('change', () => { candidate = Number(select.value); render(); });
      choice.appendChild(select);
      result.appendChild(choice);
    }
    const match = matches[Math.min(candidate, matches.length - 1)];
    const matchInfo = el('div', { className: 'osms-compare-match' });
    matchInfo.appendChild(el('div', { className: 'osms-compare-match-title',
      textContent: `Matched by name: ${record.name}` }));
    const sources = el('div', { className: 'osms-compare-match-sources' });
    for (const [label, entry] of [[`OSMS ${patch}`, match], ['Classic World', record]]) {
      const source = el('div', { className: 'osms-compare-match-source' });
      source.appendChild(el('span', { className: 'osms-compare-match-label', textContent: label }));
      source.appendChild(el('span', { textContent: recordIdentity(entry, type) }));
      sources.appendChild(source);
    }
    matchInfo.appendChild(sources);
    result.appendChild(matchInfo);
    const maxLevel = type === 'skill'
      ? Math.max(record.all_level_stats?.length || 0, match.all_level_stats?.length || 0) : 0;
    if (maxLevel > 1) {
      const levelControl = el('label', { className: 'osms-compare-level' });
      levelControl.appendChild(el('span', { textContent: 'Skill level' }));
      const levelSelect = el('select', { className: 'osms-compare-select', 'aria-label': 'Skill level' });
      for (let level = 1; level <= maxLevel; level++) {
        const option = el('option', { value: String(level), textContent: `Lv.${level}` });
        option.selected = level === selectedLevel;
        levelSelect.appendChild(option);
      }
      levelSelect.addEventListener('change', () => { selectedLevel = Number(levelSelect.value); render(); });
      levelControl.appendChild(levelSelect);
      result.appendChild(levelControl);
    }

    const { changed, all } = fieldRows(type, record, match, selectedLevel);
    const places = type === 'monster' ? locationRows(record, match) : [];
    const summary = el('div', { className: 'osms-compare-summary' });
    const changeCount = changed.length + places.length;
    summary.appendChild(el('strong', { textContent: changeCount
      ? `${changeCount} ${changeCount === 1 ? 'change' : 'changes'}` : 'No changes found' }));
    summary.appendChild(el('span', { textContent: `${patch}  →  Classic World` }));
    result.appendChild(summary);

    if (all.length) {
      const headers = el('div', { className: 'osms-change-columns' });
      ['Stat', patch, '', 'Current', 'Change'].forEach(label =>
        headers.appendChild(el('span', { textContent: label })));
      result.appendChild(headers);
      const groups = new Map();
      all.forEach(row => {
        const group = groupFor(type, row.key);
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(row);
      });
      [...groups.entries()].sort(([a], [b]) =>
        GROUP_ORDER[type].indexOf(a) - GROUP_ORDER[type].indexOf(b))
        .forEach(([label, rows]) => result.appendChild(makeGroup(label, rows)));
    } else if (!places.length) {
      result.appendChild(el('p', { className: 'osms-compare-empty',
        textContent: 'No comparable values at this patch and level.' }));
    }

    if (places.length) {
      const locations = el('details', { className: 'osms-compare-disclosure' });
      locations.appendChild(el('summary', { textContent: `Locations · ${places.length} spawn changes` }));
      const body = el('div', { className: 'osms-compare-disclosure-body' });
      body.appendChild(el('p', { className: 'osms-compare-note',
        textContent: 'Matched by map name; counts are spawns per map.' }));
      places.forEach(row => body.appendChild(makeRow(row)));
      locations.appendChild(body);
      result.appendChild(locations);
    }

  }

  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) { patch = selectedPatch; render(); }
    else requestId++;
  });
  return root;
}
