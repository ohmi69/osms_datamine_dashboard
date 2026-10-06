import { el } from './utils.js';

const PATCHES = [
  { version: 'cot2', label: 'COT2' },
  { version: 'cot1', label: 'COT1' },
  { version: 'v49', label: 'v49' },
  { version: 'v43', label: 'v43' },
  { version: 'v22', label: 'v22' },
];
const PATCH_LABELS = Object.fromEntries(PATCHES.map(({ version, label }) => [version, label]));
const FILES = { monster: 'monsters.json', skill: 'skills.json', item: 'items.json', map: 'maps.json' };
const cache = new Map();
let selectedPatch = PATCH_LABELS[localStorage.getItem('osms-compare-patch')]
  ? localStorage.getItem('osms-compare-patch') : 'cot1';

export function canCompareWithOsms() {
  return !new URLSearchParams(window.location.search).has('patch');
}

function nameKey(name) {
  return String(name || '').trim().toLocaleLowerCase();
}

function recordsFor(type, data) {
  if (type === 'monster') return data.monsters || [];
  if (type === 'item') return [...(data.items || []), ...(data.scrolls || [])];
  if (type === 'map') return (data.regions || []).flatMap(region => region.maps || []);
  return Object.values(data).filter(Array.isArray).flatMap(groups =>
    groups.flatMap(group => group?.skills || []));
}

function mapRecordsWithSpawns(mapsData, monstersData, mapManifest) {
  const spawnsByMap = new Map();
  for (const monster of monstersData.monsters || []) {
    for (const location of monster.maps || []) {
      if (!spawnsByMap.has(location.id)) spawnsByMap.set(location.id, []);
      spawnsByMap.get(location.id).push({
        id: monster.id, name: monster.name, count: location.count, mobTime: location.mob_time,
      });
    }
  }
  return recordsFor('map', mapsData).map(map => ({
    ...map, _spawns: spawnsByMap.get(map.id) || [],
    _imageUrl: mapManifest[String(map.id).padStart(9, '0')]
      ? `./data/maps/${mapManifest[String(map.id).padStart(9, '0')]}.webp` : null,
  }));
}

function loadRecords(type, patch) {
  const key = `${patch}/${FILES[type]}`;
  if (!cache.has(key)) {
    const read = file => fetch(`./data/patches/${patch}/${file}`).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    });
    const request = type === 'map'
      ? Promise.all([read('maps.json'), read('monsters.json'), read('map_manifest.json')])
        .then(([maps, monsters, manifest]) => mapRecordsWithSpawns(maps, monsters, manifest))
      : read(FILES[type]).then(data => recordsFor(type, data));
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
  map: ['Map settings', 'Monster spawns'],
};

function groupFor(type, key) {
  if (type === 'monster') return MONSTER_GROUPS.find(([, keys]) => keys.includes(key))?.[0] || 'Other';
  if (type === 'skill') return key === 'level-stat' || key === 'description' ? 'Effect' : 'Skill details';
  if (type === 'map') return 'Map settings';
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
  } else if (type === 'map') {
    for (const [key, label] of [
      ['mob_rate', 'Mob rate'], ['bgm', 'BGM'], ['return_map_name', 'Return map'],
    ]) {
      if (record[key] != null) fields.set(key, { label, value: record[key] });
    }
  } else {
    addPrimitiveFields(fields, record, '', new Set(['id', 'name', 'thumbnail', 'sub_category']));
    addPrimitiveFields(fields, record.stats, 'stats.');
    addPrimitiveFields(fields, record.spec, 'spec.');
  }
  return fields;
}

function display(value) {
  if (value == null || value === '') return '-';
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
  return rows.filter(row => !row.same);
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

function mapSpawnData(record, context = {}) {
  const spawns = context.spawns || record._spawns || [];
  const byName = new Map();
  const ensure = name => {
    const key = nameKey(name);
    if (!byName.has(key)) byName.set(key, { name, count: 0, times: new Set() });
    return byName.get(key);
  };
  for (const spawn of spawns) {
    const group = ensure(spawn.name || `Mob ID ${spawn.id}`);
    group.count += Number(spawn.count) || 0;
    if (spawn.mobTime != null) group.times.add(String(spawn.mobTime).trim());
  }
  return byName;
}

function mapSpawnRows(current, old, context) {
  const before = mapSpawnData(old);
  const after = mapSpawnData(current, context);
  const rows = [];
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    const oldMob = before.get(key);
    const newMob = after.get(key);
    const name = newMob?.name || oldMob?.name;
    const oldCount = oldMob?.count;
    const newCount = newMob?.count;
    const oldTime = oldMob?.times.size ? [...oldMob.times].sort().join(', ') : undefined;
    const newTime = newMob?.times.size ? [...newMob.times].sort().join(', ') : undefined;
    const countSame = sameValue(oldCount, newCount);
    const timeSame = sameValue(oldTime, newTime);
    const beforeText = oldMob ? `×${oldCount}${oldTime != null ? ` · ${oldTime}s` : ''}` : undefined;
    const afterText = newMob ? `×${newCount}${newTime != null ? ` · ${newTime}s` : ''}` : undefined;
    const notes = [];
    if (!oldMob) notes.push('New mob');
    else if (!newMob) notes.push('Removed mob');
    else {
      if (!countSame) notes.push(deltaText(oldCount, newCount));
      if (!timeSame) notes.push('Respawn changed');
    }
    rows.push({ group: 'Monster spawns', key, label: name, before: beforeText, after: afterText,
      same: countSame && timeSame, note: notes.join(' · '),
      direction: oldMob && newMob && !countSame ? (newCount > oldCount ? 'up' : 'down') : '' });
  }
  return rows;
}

function makeRow(row) {
  const longValue = [row.before, row.after].some(value =>
    typeof value === 'string' && value.length > 18);
  const line = el('div', { className: `osms-change-row${row.same ? ' osms-change-row--same' : ''}${longValue ? ' osms-change-row--long' : ''}` });
  line.appendChild(el('span', { className: 'osms-change-label', textContent: row.label }));
  line.appendChild(el('span', { className: 'osms-change-before', textContent: display(row.before) }));
  line.appendChild(el('span', { className: 'osms-change-arrow', textContent: '→', 'aria-hidden': 'true' }));
  line.appendChild(el('span', { className: 'osms-change-after', textContent: display(row.after) }));
  const direction = row.direction
    ? ` osms-change-delta--${row.direction}`
    : typeof row.before === 'number' && typeof row.after === 'number'
      ? row.after > row.before ? ' osms-change-delta--up'
        : row.after < row.before ? ' osms-change-delta--down' : ''
      : '';
  line.appendChild(el('span', { className: `osms-change-delta${direction}`,
    textContent: row.note || deltaText(row.before, row.after) }));
  return line;
}

function makeGroup(label, rows, onSpawnHover) {
  const section = el('section', { className: 'osms-change-group' });
  section.appendChild(el('h4', { className: 'osms-change-heading',
    textContent: label === 'Monster spawns' ? 'Monster spawns · count / respawn' : label }));
  rows.forEach(row => {
    const line = makeRow(row);
    if (label === 'Monster spawns' && onSpawnHover) {
      line.classList.add('osms-change-row--spawn');
      line.tabIndex = 0;
      line.addEventListener('mouseenter', () => onSpawnHover(row.key));
      line.addEventListener('mouseleave', () => {
        if (document.activeElement !== line) onSpawnHover(null);
      });
      line.addEventListener('focus', () => onSpawnHover(row.key));
      line.addEventListener('blur', () => onSpawnHover(null));
    }
    section.appendChild(line);
  });
  return section;
}

function recordIdentity(record, type) {
  const context = type === 'monster' ? `Lv.${record.level ?? '?'}`
    : type === 'skill' ? (record.class_name || record.job || 'Skill')
      : type === 'map' ? (record.street_name || record.region || 'Map')
        : (record.sub_category || record.category || 'Item');
  return `${context} · ID ${record.id}`;
}

function mapImageCard(label, imageUrl, mapName) {
  const card = el('div', { className: 'osms-map-card' });
  const heading = el('div', { className: 'osms-map-card-heading' });
  heading.appendChild(el('strong', { textContent: label }));
  if (imageUrl) heading.appendChild(el('span', { textContent: 'Click to enlarge' }));
  card.appendChild(heading);
  if (!imageUrl) {
    card.appendChild(el('div', { className: 'osms-map-card-empty', textContent: 'Map image unavailable' }));
    return card;
  }
  const preview = el('button', { className: 'osms-map-card-preview', type: 'button',
    title: `Open ${label} map image`, 'aria-label': `Open ${label} map image` });
  const image = el('img', { src: imageUrl, alt: `${mapName} in ${label}`, loading: 'lazy' });
  image.addEventListener('error', () => {
    preview.replaceWith(el('div', { className: 'osms-map-card-empty',
      textContent: 'Map image unavailable' }));
  }, { once: true });
  preview.appendChild(image);
  preview.addEventListener('click', () => {
    if (window.openImageModal) window.openImageModal(imageUrl, image.alt);
  });
  card.appendChild(preview);
  return card;
}

function spawnPositionsFor(record, spawns, mobKey) {
  const ids = new Set(spawns.filter(spawn => nameKey(spawn.name || `Mob ID ${spawn.id}`) === mobKey)
    .map(spawn => String(spawn.id)));
  return (record.mob_positions || []).filter(position => ids.has(String(position.id)));
}

function highlightMapSpawns(card, positions) {
  card.querySelectorAll('.osms-map-spawn-marker').forEach(marker => marker.remove());
  const preview = card.querySelector('.osms-map-card-preview');
  const image = preview?.querySelector('img');
  if (!image?.naturalWidth || !image.naturalHeight || !positions.length) return;
  const previewBounds = preview.getBoundingClientRect();
  const imageBounds = image.getBoundingClientRect();
  const scale = Math.min(imageBounds.width / image.naturalWidth,
    imageBounds.height / image.naturalHeight);
  const radius = Math.max(10, Math.min(22, Math.round(10 + 18 * scale)));
  const left = imageBounds.left - previewBounds.left
    + (imageBounds.width - image.naturalWidth * scale) / 2;
  const top = imageBounds.top - previewBounds.top
    + (imageBounds.height - image.naturalHeight * scale) / 2;
  for (const position of positions) {
    const x = Number(position.x);
    const y = Number(position.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const marker = el('span', { className: 'mob-highlight-overlay osms-map-spawn-marker',
      'aria-hidden': 'true' });
    marker.style.left = `${left + x * scale - radius}px`;
    marker.style.top = `${top + y * scale - radius}px`;
    marker.style.width = `${radius * 2}px`;
    marker.style.height = `${radius * 2}px`;
    preview.appendChild(marker);
  }
}

/** A lazy comparison disclosure for a current-patch record. */
export function makeOsmsCompare(type, record, context = {}) {
  const root = el('div', { className: 'osms-compare' });
  const toggle = el('button', { className: 'osms-compare-toggle', type: 'button',
    textContent: 'Compare versions', 'aria-expanded': 'false' });
  const panel = el('div', { className: 'osms-compare-panel', hidden: true });
  root.append(toggle, panel);
  // Item rows and skill cards use clicks on their container for navigation.
  root.addEventListener('click', event => event.stopPropagation());
  let patch = selectedPatch;
  let candidate = 0;
  let candidateChanged = false;
  let selectedLevel = 1;
  let requestId = 0;

  async function render() {
    const thisRequest = ++requestId;
    panel.replaceChildren();
    const controls = el('div', { className: 'osms-compare-controls' });
    controls.appendChild(el('span', { textContent: 'Compare to' }));
    const patchSelect = el('select', { className: 'osms-compare-select', 'aria-label': 'Comparison version' });
    PATCHES.forEach(({ version, label }) => {
      const option = el('option', { value: version, textContent: label });
      option.selected = version === patch;
      patchSelect.appendChild(option);
    });
    patchSelect.addEventListener('change', () => {
      patch = patchSelect.value;
      selectedPatch = patch;
      localStorage.setItem('osms-compare-patch', patch);
      candidate = 0;
      candidateChanged = false;
      selectedLevel = 1;
      render();
    });
    controls.appendChild(patchSelect);
    panel.appendChild(controls);
    const result = el('div', { className: 'osms-compare-result', textContent: 'Loading comparison…' });
    panel.appendChild(result);

    let records;
    try {
      records = await loadRecords(type, patch);
    } catch {
      if (thisRequest === requestId) result.textContent = 'Could not load this version. Try another one.';
      return;
    }
    if (thisRequest !== requestId || panel.hidden) return;
    const matches = records.filter(entry => nameKey(entry.name) === nameKey(record.name));
    result.replaceChildren();
    if (!matches.length) {
      result.textContent = `No ${PATCH_LABELS[patch]} record named “${record.name}”.`;
      return;
    }
    if (!candidateChanged && matches.length > 1) {
      const exactId = matches.findIndex(entry => String(entry.id) === String(record.id));
      const sameStreet = type === 'map'
        ? matches.findIndex(entry => nameKey(entry.street_name) === nameKey(record.street_name)) : -1;
      candidate = exactId >= 0 ? exactId : sameStreet >= 0 ? sameStreet : 0;
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
      select.addEventListener('change', () => {
        candidate = Number(select.value);
        candidateChanged = true;
        render();
      });
      choice.appendChild(select);
      result.appendChild(choice);
    }
    const match = matches[Math.min(candidate, matches.length - 1)];
    const matchInfo = el('div', { className: 'osms-compare-match' });
    matchInfo.appendChild(el('div', { className: 'osms-compare-match-title',
      textContent: `Matched by name: ${record.name}` }));
    const sources = el('div', { className: 'osms-compare-match-sources' });
    for (const [label, entry] of [[PATCH_LABELS[patch], match], ['Public Release', record]]) {
      const source = el('div', { className: 'osms-compare-match-source' });
      source.appendChild(el('span', { className: 'osms-compare-match-label', textContent: label }));
      source.appendChild(el('span', { textContent: recordIdentity(entry, type) }));
      sources.appendChild(source);
    }
    matchInfo.appendChild(sources);
    result.appendChild(matchInfo);
    let onSpawnHover = null;
    if (type === 'map') {
      const maps = el('div', { className: 'osms-map-images' });
      const oldCard = mapImageCard(PATCH_LABELS[patch], match._imageUrl, match.name);
      const currentCard = mapImageCard('PR', context.imageUrl, record.name);
      maps.append(oldCard, currentCard);
      result.appendChild(maps);
      result.appendChild(el('p', { className: 'osms-map-hint',
        textContent: 'Hover a monster spawn below to show its locations on both maps.' }));
      let activeMob = null;
      onSpawnHover = mobKey => {
        activeMob = mobKey;
        highlightMapSpawns(oldCard, mobKey
          ? spawnPositionsFor(match, match._spawns || [], mobKey) : []);
        highlightMapSpawns(currentCard, mobKey
          ? spawnPositionsFor(record, context.spawns || [], mobKey) : []);
      };
      for (const card of [oldCard, currentCard]) {
        card.querySelector('img')?.addEventListener('load', () => {
          if (activeMob) onSpawnHover(activeMob);
        });
      }
    }
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

    const changed = fieldRows(type, record, match, selectedLevel);
    const mapSpawns = type === 'map' ? mapSpawnRows(record, match, context) : [];
    const spawnChanges = mapSpawns.filter(row => !row.same);
    const visibleRows = [...changed, ...spawnChanges];
    const places = type === 'monster' ? locationRows(record, match) : [];
    const summary = el('div', { className: 'osms-compare-summary' });
    const changeCount = changed.length + spawnChanges.length + places.length;
    summary.appendChild(el('strong', { textContent: changeCount
      ? `${changeCount} ${changeCount === 1 ? 'change' : 'changes'}` : 'No changes found' }));
    summary.appendChild(el('span', { textContent: `${PATCH_LABELS[patch]}  →  PR` }));
    result.appendChild(summary);

    if (visibleRows.length) {
      const headers = el('div', { className: 'osms-change-columns' });
      ['Stat', PATCH_LABELS[patch], '', 'PR', 'Change'].forEach(label =>
        headers.appendChild(el('span', { textContent: label })));
      result.appendChild(headers);
      const groups = new Map();
      visibleRows.forEach(row => {
        const group = row.group || groupFor(type, row.key);
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(row);
      });
      [...groups.entries()].sort(([a], [b]) =>
        GROUP_ORDER[type].indexOf(a) - GROUP_ORDER[type].indexOf(b))
        .forEach(([label, rows]) => result.appendChild(makeGroup(label, rows, onSpawnHover)));
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
