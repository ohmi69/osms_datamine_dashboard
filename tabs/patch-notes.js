import { el, makeCollapsible, makeCopyableId, makeThumbnail,
         makeDeepLinkButton, makeSearchBox, makePillGroup, makeMatcher, makeHideToggle,
         enableMobileFilterDrawer } from '../lib/utils.js';
import { attachTooltip } from '../lib/tooltip.js';
import { loadPatchNotesFile } from '../lib/data.js';
import { startDeepLinkJump } from '../lib/utils.js';

const BUCKETS = [
  { key: 'added',   label: 'Added',   sign: '+', cls: 'pn-added' },
  { key: 'removed', label: 'Removed', sign: '−', cls: 'pn-removed' },
  { key: 'changed', label: 'Changed', sign: '~', cls: 'pn-changed' },
];

// Sections dense enough to tile: thumbnail + name cells in a grid, full
// stats/diffs in the detail modal. Everything else renders as full rows.
const TILE_SECTIONS = new Set(['monsters', 'equipment', 'items', 'scrolls', 'cash_shop', 'beauty', 'maps']);
const isTileSection = (section) => TILE_SECTIONS.has(section.key);

// Lookups into the *current* dataset, so hovering a name or chip shows the same
// tooltip the Items/Monsters/Maps tabs do. Removed entries have no current
// record, so their getters return undefined and no tooltip opens.
//
// Module scope rather than a threaded argument: renderPatchNotes owns the whole
// page and rebuilds this on every render.
let lookups = null;

// Empty strings reach here as real values ("NPC: '' -> The Glimmer Man"), and
// rendering them raw leaves one side of the arrow blank while a null shows a
// dash. Collapse both to the same placeholder.
function shown(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return text.trim() === '' ? '-' : text;
}

function buildLookups(data) {
  const items = new Map();
  [...(data?.items?.items || []), ...(data?.items?.scrolls || [])]
    .forEach((item) => items.set(String(item.id), item));

  const monsters = new Map();
  (data?.monsters?.monsters || []).forEach((mob) => monsters.set(String(mob.id), mob));

  const maps = new Map();
  (data?.maps?.regions || []).forEach((region) =>
    (region.maps || []).forEach((map) => maps.set(String(map.id), map)));

  const cash = new Map();
  (data?.cashShop?.categories || []).forEach((cat) =>
    (cat.items || []).forEach((item) => cash.set(String(item.id), item)));

  const beauty = new Map();
  [...(data?.beauty_coupons?.hair || []), ...(data?.beauty_coupons?.face || [])]
    .forEach((style) => beauty.set(String(style.id), style));

  return { items, monsters, maps, cash, beauty };
}

// mob_positions is one entry per spawn point, so collapse to id -> count the
// way the map tooltip wants to show it.
function mapSpawns(map) {
  const counts = new Map();
  (map.mob_positions || []).forEach((spawn) => {
    const id = String(typeof spawn === 'object' ? spawn.id : spawn);
    counts.set(id, (counts.get(id) || 0) + 1);
  });
  return [...counts].map(([id, count]) => {
    const mob = lookups.monsters.get(id);
    return { id, count, name: mob?.name || `#${id}`, thumbnail: mob?.thumbnail };
  });
}

function attachEntityTooltip(node, tab, id, extra = null) {
  if (!lookups || !node || id === null || id === undefined) return;
  const key = String(id);
  if (tab === 'items' || tab === 'equipment') {
    attachTooltip(node, () => lookups.items.get(key), 'item', extra);
  } else if (tab === 'monsters') {
    attachTooltip(node, () => lookups.monsters.get(key), 'mob', extra);
  } else if (tab === 'cashshop') {
    attachTooltip(node, () => lookups.cash.get(key), 'item', extra);
  } else if (tab === 'beauty') {
    attachTooltip(node, () => lookups.beauty.get(key), 'item', extra);
  } else if (tab === 'maps') {
    attachTooltip(node, () => {
      const map = lookups.maps.get(key);
      return map ? { map, mobs: mapSpawns(map) } : null;
    }, 'map', extra);
  }
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// The footer stamp is a full ISO instant, not a bare date, so it needs its own
// parse -- but it should read like the header dates rather than raw ISO.
function formatTimestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function buildHeader(notes) {
  const card = el('div', { className: 'info-card pn-header' });

  const side = (meta) => {
    const wrap = el('div', { className: 'pn-side' });
    // version is the client's "Ver." label; it doesn't change every patch, so the
    // build label stays beside it.
    const label = meta.version ? `v${meta.version} · ${meta.label}` : meta.label;
    wrap.appendChild(el('div', { className: 'pn-side-label', textContent: label }));
    if (meta.date) {
      wrap.appendChild(el('div', { className: 'pn-side-date', textContent: formatDate(meta.date) }));
    }
    return wrap;
  };

  card.appendChild(side(notes.before));
  card.appendChild(el('div', { className: 'pn-arrow', textContent: '→' }));
  card.appendChild(side(notes.after));

  // Whole-patch scale, so the size of the update reads without expanding
  // every section and adding up their headings.
  const totals = notes.totals || {};
  const tally = el('div', { className: 'pn-header-tally' });
  BUCKETS.forEach((b) => {
    if (!totals[b.key]) return;
    tally.appendChild(el('span', {
      className: `pn-tally-item ${b.cls}`,
      textContent: `${b.sign}${totals[b.key]} ${b.label.toLowerCase()}`,
    }));
  });
  if (tally.childElementCount) card.appendChild(tally);
  return card;
}

// One card per section: tally, a proportional added/removed/changed bar, and,
// when one change shape dominates the Changed bucket, a "N × Field" line so a
// reader knows what kind of changes it holds before scrolling there.
function buildOverview(notes, onJump) {
  const grid = el('div', { className: 'pn-overview' });
  notes.sections.forEach((section) => {
    const counts = section.counts || {};
    const total = BUCKETS.reduce((sum, b) => sum + (counts[b.key] || 0), 0);
    if (!total) return;
    const card = el('button', { type: 'button', className: 'pn-ov-card' });
    card.appendChild(el('span', { className: 'pn-ov-name', textContent: section.label }));
    card.appendChild(buildTally(counts));
    const bar = el('span', { className: 'pn-ov-bar', 'aria-hidden': 'true' });
    BUCKETS.forEach((b) => {
      if (!counts[b.key]) return;
      bar.appendChild(el('i', { className: b.cls, style: { flexGrow: String(counts[b.key]) } }));
    });
    card.appendChild(bar);

    const changed = section.changed || [];
    const groups = changed.length >= PN_PATTERN_MIN ? groupByShape(changed) : null;
    const top = groups?.find((g) => !g.other);
    if (top && top.entries.length >= Math.max(PN_PATTERN_MIN, changed.length * 0.4)) {
      const { label } = describeGroup(top);
      card.appendChild(el('span', {
        className: 'pn-ov-hint',
        textContent: `${top.entries.length} × ${label}`,
      }));
    }
    card.addEventListener('click', () => onJump(section.key));
    grid.appendChild(card);
  });
  return grid;
}

function buildFieldRow(field, onNavigate) {
  // Long prose (descriptions) stacks vertically so neither side is clipped.
  if (field.long) {
    const block = el('div', { className: 'pn-field pn-field-long' });
    const label = el('div', { className: 'pn-field-label', textContent: field.label });
    block.appendChild(label);
    // Both sides present: one paragraph with the edits marked inline, so the
    // reader doesn't have to compare two paragraphs word by word.
    const before = field.before === null || field.before === undefined ? '' : String(field.before);
    const after = field.after === null || field.after === undefined ? '' : String(field.after);
    const ops = before.trim() && after.trim() ? wordDiff(before, after) : null;
    if (ops) {
      const para = el('div', { className: 'pn-worddiff' });
      ops.forEach(([op, text]) => {
        if (op === '=') para.appendChild(document.createTextNode(text));
        else para.appendChild(el(op === '-' ? 'del' : 'ins', { textContent: text }));
      });
      block.appendChild(para);
      return block;
    }
    const pair = el('div', { className: 'pn-longpair' });
    pair.appendChild(el('div', { className: 'pn-long-before', textContent: shown(field.before) }));
    pair.appendChild(el('div', { className: 'pn-long-after', textContent: shown(field.after) }));
    block.appendChild(pair);
    return block;
  }

  const row = el('div', {
    className: field.unchanged ? 'pn-field pn-field-same' : 'pn-field',
  });
  row.appendChild(el('span', { className: 'pn-field-label', textContent: field.label }));

  // Context rows (a skill level this patch left alone) carry one value that is
  // both the before and the after. It gets no strikethrough and no arrow --
  // nothing changed to point at -- but a lone value sitting in the column where
  // struck-through "before" text normally lives reads as old data, so it is
  // tagged explicitly rather than left to the reader to infer.
  if (field.unchanged) {
    const values = el('span', { className: 'pn-field-values' });
    values.appendChild(el('span', { className: 'pn-same-tag', textContent: 'unchanged' }));
    values.appendChild(el('span', { className: 'pn-field-after', textContent: shown(field.after) }));
    row.appendChild(values);
    return row;
  }

  // before / arrow / after share one grid cell so they stay on a single line
  // and wrap together, rather than each claiming its own row.
  const hasMemberChanges = Boolean(field.added?.length || field.removed?.length);
  if (!(hasMemberChanges && field.before === field.after)
      && (field.before !== null && field.before !== undefined
        || field.after !== null && field.after !== undefined)) {
    const values = el('span', { className: 'pn-field-values' });
    values.appendChild(el('span', { className: 'pn-field-before', textContent: shown(field.before) }));
    values.appendChild(el('span', { className: 'pn-arrow-sm', textContent: '→' }));
    values.appendChild(el('span', { className: 'pn-field-after', textContent: shown(field.after) }));
    row.appendChild(values);
  }
  // Set-valued fields (spawn maps, NPCs, monsters, exits) list their members
  // as individually coloured chips rather than one run-on italic string.
  if (hasMemberChanges) {
    const chips = el('span', { className: 'pn-chips' });
    const pairedAdded = new Set();
    const pairedRemoved = new Set();
    (field.removed || []).forEach((oldItem, oldIndex) => {
      if (!oldItem?.id) return;
      const newIndex = (field.added || []).findIndex((newItem, index) =>
        !pairedAdded.has(index) && newItem?.id != null
        && String(newItem.id) === String(oldItem.id)
        && (newItem.tab || field.tab) === (oldItem.tab || field.tab));
      if (newIndex < 0) return;
      const newItem = field.added[newIndex];
      const chip = buildChip(newItem, 'pn-chip-neutral pn-chip-change', field.tab, onNavigate);
      chip.lastChild.replaceWith(
        el('span', { className: 'pn-field-before', textContent: oldItem.name }),
        el('span', { className: 'pn-arrow-sm', textContent: '→' }),
        el('span', { className: 'pn-field-after', textContent: newItem.name }),
      );
      chips.appendChild(chip);
      pairedAdded.add(newIndex);
      pairedRemoved.add(oldIndex);
    });
    const add = (list, cls, sign) => (list || []).forEach((item) => {
      const labelled = typeof item === 'string'
        ? `${sign} ${item}` : { ...item, name: `${sign} ${item.name}` };
      chips.appendChild(buildChip(labelled, cls, field.tab, onNavigate));
    });
    add((field.added || []).filter((_, i) => !pairedAdded.has(i)), 'pn-added', '+');
    add((field.removed || []).filter((_, i) => !pairedRemoved.has(i)), 'pn-removed', '−');
    row.appendChild(chips);
  } else if (field.detail) {
    row.appendChild(el('span', { className: 'pn-field-detail', textContent: field.detail }));
  }
  return row;
}

// Mirrors Router's "#<tab>?q=<query>" hash format, preserving the ?patch=
// dataset selector that lives in the search string.
function entryHref(tab, id) {
  const { pathname, search } = window.location;
  return `${pathname}${search}#${tab}?q=${encodeURIComponent(`id:${id}`)}`;
}

// Chips referencing a map/monster link to that entity's own page. Uses a real
// href so middle-click and "open in new tab" work, with a left-click handler
// for in-page navigation.
function buildChip(item, extraClass, rowTab, onNavigate) {
  const label = typeof item === 'string' ? item : item.name;
  const id = typeof item === 'string' ? null : item.id;
  // Quest reward items pick their own tab per chip (Items vs Equipment), so an
  // item-level tab wins over the row's.
  const tab = (typeof item === 'object' && item.tab) || rowTab;
  const image = typeof item === 'object' ? item.image : null;

  // Quest rewards and requirements carry item/monster art, matching the chips
  // on the Quests tab. Everything else is text-only.
  const fill = (node) => {
    if (image) {
      node.classList.add('pn-chip-art');
      node.appendChild(makeThumbnail(image, `${label} thumbnail`, {
        className: 'pn-chip-thumb', fallbackText: '',
      }));
    }
    node.appendChild(el('span', { textContent: label }));
    return node;
  };

  if (!tab || !id || !onNavigate) {
    const plain = fill(el('span', { className: `pn-chip ${extraClass}` }));
    attachEntityTooltip(plain, tab, id);
    return plain;
  }
  const chip = fill(el('a', {
    className: `pn-chip ${extraClass} pn-chip-link`,
    href: entryHref(tab, id),
  }));
  attachEntityTooltip(chip, tab, id);
  chip.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0
        || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(tab, id);
  });
  return chip;
}

// Per-level skill stats, mirroring the Skills tab (tabs/skills.js:190-212):
// Lv.1 and Lv.max always visible, the levels between them behind a toggle.
// Reuses that tab's classes so it inherits styles/skills.css verbatim.
function buildLevelStats(levels) {
  const wrap = el('div', { className: 'stat-levels' });
  const lastIdx = levels.length - 1;

  const levelRow = (className, label, text) => {
    const row = el('div', { className });
    row.appendChild(el('span', { className: 'label', textContent: label }));
    row.appendChild(document.createTextNode(text));
    return row;
  };

  wrap.appendChild(levelRow('lv1', 'Lv.1: ', levels[0]));

  if (levels.length > 2) {
    const list = el('div', { className: 'all-levels-list' });
    for (let i = 1; i < lastIdx; i++) {
      list.appendChild(levelRow('midlevel', `Lv.${i + 1}: `, levels[i]));
    }
    list.hidden = true;

    // A real button, not a span: here the arrow IS the control (on the Skills
    // tab the whole card is clickable and the arrow only indicates state), so
    // it has to be reachable and operable from the keyboard.
    const arrow = el('button', {
      className: 'all-levels-arrow',
      type: 'button',
      textContent: '▼',
      'aria-expanded': 'false',
      'aria-label': 'Show intermediate levels',
    });
    arrow.addEventListener('click', (event) => {
      event.stopPropagation();
      list.hidden = !list.hidden;
      arrow.textContent = list.hidden ? '▼' : '▲';
      arrow.setAttribute('aria-expanded', String(!list.hidden));
      arrow.setAttribute('aria-label',
        list.hidden ? 'Show intermediate levels' : 'Hide intermediate levels');
    });
    wrap.appendChild(arrow);
    wrap.appendChild(list);
    wrap.appendChild(levelRow('lvmax', `Lv.${lastIdx + 1}: `, levels[lastIdx]));
  } else if (lastIdx > 0) {
    wrap.appendChild(levelRow('lvmax', `Lv.${lastIdx + 1}: `, levels[lastIdx]));
  }
  return wrap;
}

// Keep changed descriptions in their before/after layout while folding the
// intermediate ranks just like the Skills tab.
function buildLevelDiffs(levels, onNavigate) {
  const wrap = el('div', { className: 'stat-levels pn-level-diffs' });
  const appendRow = (parent, field) => {
    const row = el('div', { className: 'pn-fields' });
    row.appendChild(buildFieldRow(field, onNavigate));
    parent.appendChild(row);
  };
  appendRow(wrap, levels[0]);
  if (levels.length > 2) {
    const list = el('div', { className: 'all-levels-list' });
    levels.slice(1, -1).forEach((field) => appendRow(list, field));
    list.hidden = true;
    const arrow = el('button', {
      className: 'all-levels-arrow', type: 'button', textContent: '▼',
      'aria-expanded': 'false', 'aria-label': 'Show intermediate levels',
    });
    arrow.addEventListener('click', (event) => {
      event.stopPropagation();
      list.hidden = !list.hidden;
      arrow.textContent = list.hidden ? '▼' : '▲';
      arrow.setAttribute('aria-expanded', String(!list.hidden));
      arrow.setAttribute('aria-label',
        list.hidden ? 'Show intermediate levels' : 'Hide intermediate levels');
    });
    wrap.appendChild(arrow);
    wrap.appendChild(list);
  }
  if (levels.length > 1) appendRow(wrap, levels[levels.length - 1]);
  return wrap;
}

// ---- Detail modal for tile sections ----
// Tiles stay tiles: expanding one inline would morph a grid cell into a
// full-width row and shove the whole wall around. Details open in a modal
// instead, rendered fresh (so links, tooltips, and copy buttons work) at a
// width where stat tables read comfortably.
let pnModal = null;

function closeEntryModal() {
  if (!pnModal) return;
  const { overlay, opener } = pnModal;
  pnModal = null;
  document.removeEventListener('keydown', pnModalEsc);
  overlay.remove();
  document.body.style.overflow = '';
  opener?.focus?.();
}

function pnModalEsc(event) {
  if (event.key === 'Escape') closeEntryModal();
}

function openEntryModal(entry, bucket, section, onNavigate, opener) {
  closeEntryModal();
  const overlay = el('div', { className: 'pn-modal-overlay' });
  const panel = el('div', {
    className: 'pn-modal',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': `${entry.name || entry.id} details`,
  });
  const closeBtn = el('button', {
    className: 'pn-modal-close',
    type: 'button',
    textContent: '×',
    'aria-label': 'Close details',
  });
  closeBtn.addEventListener('click', closeEntryModal);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeEntryModal();
  });
  panel.appendChild(closeBtn);
  // A full (non-tile) render: head plus visible details, no tile handlers.
  panel.appendChild(buildEntry(entry, bucket, section, onNavigate, { full: true }));
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', pnModalEsc);
  pnModal = { overlay, opener };
  closeBtn.focus();
}

// Entry name: a link to the entity's own tab (with the shared hover tooltip),
// or plain text for removed entries, which no longer exist to navigate to.
function buildEntryName(entry, bucket, section, onNavigate) {
  const canNavigate = section.tab && bucket.key !== 'removed' && onNavigate;
  const name = canNavigate
    ? el('a', {
        className: 'pn-name pn-name-link',
        // A real href so middle-click and "Open in new tab" work; the click
        // handler below intercepts plain left-clicks for in-page navigation.
        href: entryHref(section.tab, entry.id),
        textContent: entry.name || entry.id,
      })
    : el('span', { className: 'pn-name', textContent: entry.name || entry.id });

  if (canNavigate) {
    name.addEventListener('click', (event) => {
      // Let the browser handle new-tab/new-window modifiers natively.
      if (event.defaultPrevented || event.button !== 0
          || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      onNavigate(section.tab, entry.id);
    });
  }
  attachEntityTooltip(name, section.tab, entry.id, tooltipChanges(entry, bucket, section));
  return name;
}

// Changed tile entries feed their diff fields into the hover tooltip, so it
// reads "what changed" on top of the live record. Long text fields carry a
// word diff, so a description edit shows up marked inline in the tooltip.
function tooltipChanges(entry, bucket, section) {
  if (!isTileSection(section) || bucket.key !== 'changed' || !entry.fields) return null;
  if (!entry._tipFields) {
    entry._tipFields = entry.fields.map((f) => {
      if (!f.long || !f.before || !f.after) return f;
      const ops = wordDiff(String(f.before), String(f.after));
      return ops ? { ...f, wordDiff: ops } : f;
    });
  }
  return entry._tipFields;
}

// ---- Change-shape helpers ----
// Everything below is mechanical: grouping keys, number parsing, and word
// diffs over the generator's before/after strings. No prose is generated.

const normWs = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

// A text edit that only moved whitespace around ("over\r\nany" -> "over any").
function isWhitespaceOnly(field) {
  return typeof field.before === 'string' && typeof field.after === 'string'
    && field.before !== field.after && normWs(field.before) === normWs(field.after);
}

const hasMembers = (field) => Boolean(field.added?.length || field.removed?.length);

// "1,000 mesos", "×0.8", "45", "12%" -> number. Blank -> null (a field that
// didn't exist on one side). Anything else -> NaN (not a numeric field).
const NUM_RE = /^[×x]?\s*(-?[\d,]*\.?\d+)\s*(mesos|%)?$/;
function parseNum(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const text = String(value).trim();
  if (!text) return null;
  const m = NUM_RE.exec(text);
  return m ? Number(m[1].replace(/,/g, '')) : NaN;
}

// A field that reads cleanly as one table cell: a number (or blank) on both
// sides. Set-valued fields carry before/after member counts; `allowMembers`
// decides whether those counts are enough or the member chips are needed.
function isNumericField(field, { allowMembers = false } = {}) {
  if (field.long || field.unchanged) return false;
  if (hasMembers(field) && !allowMembers) return false;
  const b = parseNum(field.before);
  const a = parseNum(field.after);
  return !Number.isNaN(b) && !Number.isNaN(a) && (b !== null || a !== null);
}

const entrySignature = (entry) => (entry.fields || []).map((f) => f.label).sort().join('|');

// Groups a Changed bucket by which fields changed. Returns null when grouping
// would not shorten the list: every entry its own shape, or no shape shared by
// at least three entries. Shapes with fewer than three entries pool into one
// trailing "other" group.
const PN_PATTERN_MIN = 3;
function groupByShape(entries) {
  const bySig = new Map();
  entries.forEach((entry) => {
    const sig = entrySignature(entry);
    if (!bySig.has(sig)) bySig.set(sig, []);
    bySig.get(sig).push(entry);
  });
  const sorted = [...bySig.values()].sort((a, b) => b.length - a.length);
  if (!sorted.length || sorted[0].length < PN_PATTERN_MIN) return null;
  if (bySig.size > entries.length / 2) return null;
  const groups = [];
  const other = [];
  sorted.forEach((list) => {
    if (list.length >= PN_PATTERN_MIN) groups.push({ entries: list, other: false });
    else other.push(...list);
  });
  if (other.length) groups.push({ entries: other, other: true });
  return groups;
}

// Facts about a shape group, all derived from the values themselves.
function describeGroup(group) {
  const first = group.entries[0];
  const fields = first.fields || [];
  const label = group.other
    ? 'Other changes'
    : fields.map((f) => f.label).join(' · ') || 'Changed';
  let direction = null;
  if (!group.other && fields.length === 1) {
    const deltas = group.entries.map((e) => {
      const f = e.fields[0];
      const b = parseNum(f.before);
      const a = parseNum(f.after);
      return typeof b === 'number' && typeof a === 'number' && !Number.isNaN(b) && !Number.isNaN(a)
        ? a - b : NaN;
    });
    if (deltas.every((d) => d < 0)) direction = 'all lowered';
    else if (deltas.every((d) => d > 0)) direction = 'all raised';
  }
  return { label, direction };
}

// Word-level diff of two strings: [['=', text] | ['-', text] | ['+', text]].
// Whitespace runs compare equal to each other, so a reflowed line break
// doesn't read as an edit. Returns null when the inputs are too large for the
// quadratic LCS, or so different that a word diff would be confetti -- the
// caller then falls back to the stacked before/after layout.
function wordDiff(before, after) {
  const tokenize = (s) => s.split(/(\s+)/).filter(Boolean);
  const key = (t) => (/^\s+$/.test(t) ? ' ' : t);
  const a = tokenize(before);
  const b = tokenize(after);
  let start = 0;
  while (start < a.length && start < b.length && key(a[start]) === key(b[start])) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && key(a[endA - 1]) === key(b[endB - 1])) { endA--; endB--; }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  if (n * m > 4e6) return null;

  // LCS table, flattened, (n+1) x (m+1).
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = key(midA[i]) === key(midB[j])
        ? dp[(i + 1) * w + j + 1] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  // Segments: { eq } runs and { del, ins } change runs.
  const segs = [];
  const eq = (t) => {
    const last = segs[segs.length - 1];
    if (last && 'eq' in last) last.eq += t;
    else segs.push({ eq: t });
  };
  const change = (del, ins) => {
    const last = segs[segs.length - 1];
    if (last && !('eq' in last)) { last.del += del; last.ins += ins; }
    else segs.push({ del, ins });
  };
  b.slice(0, start).forEach(eq);
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && key(midA[i]) === key(midB[j])) { eq(midB[j]); i++; j++; }
    else if (j < m && (i >= n || dp[i * w + j + 1] >= dp[(i + 1) * w + j])) { change('', midB[j]); j++; }
    else { change(midA[i], ''); i++; }
  }
  b.slice(endB).forEach(eq);

  const words = (list) => list.filter((t) => !/^\s+$/.test(t)).length;
  const shared = words(b) - words(midB) + (n && m ? dp[0] : 0);
  if (shared / Math.max(words(a), words(b), 1) < 0.35) return null;

  // Semantic cleanup: a short equal run (a space, "the", "of the") between
  // two changes is a coincidental match, not a kept phrase. Fold it into both
  // sides so the edit reads as one deletion and one insertion.
  for (let k = 1; k < segs.length - 1; k++) {
    const mid = segs[k];
    if (!('eq' in mid) || 'eq' in segs[k - 1] || 'eq' in segs[k + 1]) continue;
    if (words(tokenize(mid.eq)) > 2) continue;
    const prev = segs[k - 1];
    const next = segs[k + 1];
    segs.splice(k - 1, 3, { del: prev.del + mid.eq + next.del, ins: prev.ins + mid.eq + next.ins });
    k = Math.max(0, k - 2);
  }

  const ops = [];
  segs.forEach((s) => {
    if ('eq' in s) { ops.push(['=', s.eq]); return; }
    if (s.del) ops.push(['-', s.del]);
    if (s.ins) ops.push(['+', s.ins]);
  });
  return ops;
}

// Compact "what changed" line for a collapsed tile: the first few diffs as
// `Label before→after`, with a neutral direction mark on numeric changes.
const PN_TILE_DIFFS = 3;
function buildTileDiffs(fields) {
  const wrap = el('div', { className: 'pn-tile-diffs' });
  fields.slice(0, PN_TILE_DIFFS).forEach((f) => {
    const item = el('span', { className: 'pn-tile-diff' });
    item.appendChild(el('span', { className: 'pn-tile-diff-label', textContent: f.label }));
    if (f.long) {
      // Prose doesn't fit a tile; the word diff lives in the modal and in
      // Detailed view. The tile only says that the text changed.
      item.appendChild(document.createTextNode(' changed'));
    } else if (hasMembers(f) && f.before === f.after) {
      const parts = [];
      if (f.added?.length) parts.push(`+${f.added.length}`);
      if (f.removed?.length) parts.push(`−${f.removed.length}`);
      item.appendChild(document.createTextNode(` ${parts.join(' ')}`));
    } else {
      item.appendChild(document.createTextNode(` ${shown(f.before)}→${shown(f.after)}`));
      const b = parseNum(f.before);
      const a = parseNum(f.after);
      if (typeof b === 'number' && typeof a === 'number' && !Number.isNaN(b) && !Number.isNaN(a) && a !== b) {
        item.appendChild(el('span', { className: 'pn-dir', textContent: a > b ? '▲' : '▼' }));
      }
    }
    wrap.appendChild(item);
  });
  if (fields.length > PN_TILE_DIFFS) {
    wrap.appendChild(el('span', {
      className: 'pn-tile-diff pn-tile-diff-more',
      textContent: `+${fields.length - PN_TILE_DIFFS} more`,
    }));
  }
  return wrap;
}

// ---- Tables ----
// One row per entry, one column per field. `rows` are { entry, cells } where
// cells maps column label -> { node, sort }. Headers sort on click; rows past
// the cap sit behind a "Show N more" row like the lists.
const PN_TABLE_LIMIT = 50;
// `columnMeta` (optional) maps a column key to { label, cls }: a display label
// other than the key, and a class for its cells and header (default numeric).
function buildEntryTable(rows, columns, section, bucket, onNavigate,
  { defaultSort = null, columnMeta = null } = {}) {
  const metaFor = (col) => columnMeta?.get(col) || {};
  const wrap = el('div', { className: 'pn-table-wrap' });
  const table = el('table', { className: 'pn-table' });
  const thead = el('thead');
  const headRow = el('tr');
  const tbody = el('tbody');
  // sortCol: null = Name column. `sorted` false = generator order.
  let sorted = Boolean(defaultSort);
  let sortCol = defaultSort?.col ?? null;
  let sortDir = defaultSort?.dir ?? 1;
  let expanded = false;

  const nameCell = (entry) => {
    // Flex on an inner span: flex on the <td> itself breaks the row borders.
    const inner = el('span', { className: 'pn-td-name-inner' });
    if (entry.image) {
      inner.appendChild(makeThumbnail(entry.image, `${entry.name} thumbnail`, {
        className: `pn-thumb pn-thumb-${section.key}`, fallbackText: '',
      }));
    }
    inner.appendChild(buildEntryName(entry, bucket, section, onNavigate));
    return el('td', { className: 'pn-td-name' }, inner);
  };
  // Built once; sorting only reorders the same nodes.
  const built = rows.map((row) => {
    const tr = el('tr', {
      className: `pn-entry-row ${bucket.cls}`,
      'data-pn-key': `${section.key}:${row.entry.id}`,
    });
    tr.appendChild(nameCell(row.entry));
    columns.forEach((col) => {
      const cell = row.cells.get(col);
      const cls = metaFor(col).cls;
      tr.appendChild(cell
        ? el('td', { className: cls || 'pn-td-num' }, cell.node)
        : el('td', { className: cls || 'pn-td-same', textContent: cls ? '' : '·' }));
    });
    return { row, tr };
  });

  const sortValue = (item) => (sortCol === null
    ? item.row.entry.name || ''
    : item.row.cells.get(sortCol)?.sort);
  // Single-column default sort ranks by size of the move, not signed value.
  const rankByMagnitude = () => defaultSort && sortCol === defaultSort.col && sortDir === defaultSort.dir;
  const paint = () => {
    const order = built.slice();
    if (sorted) {
      order.sort((x, y) => {
        const a = sortValue(x);
        const b = sortValue(y);
        // Blank cells sink regardless of direction.
        if (a === undefined || a === null || Number.isNaN(a)) return 1;
        if (b === undefined || b === null || Number.isNaN(b)) return -1;
        if (typeof a === 'string') return a.localeCompare(b) * sortDir;
        if (rankByMagnitude()) return Math.abs(b) - Math.abs(a);
        return (a - b) * sortDir;
      });
    }
    tbody.replaceChildren();
    const limit = expanded ? order.length : PN_TABLE_LIMIT;
    order.slice(0, limit).forEach((item) => tbody.appendChild(item.tr));
    if (order.length > limit) {
      const more = el('button', {
        type: 'button', className: 'pn-show-more', textContent: `Show ${order.length - limit} more`,
      });
      more.addEventListener('click', () => { expanded = true; paint(); });
      tbody.appendChild(el('tr', { className: 'pn-table-more' },
        el('td', { colspan: columns.length + 1 }, more)));
    }
    headers.forEach(({ th, col }) => {
      const active = sorted && sortCol === col;
      th.setAttribute('aria-sort', active ? (sortDir > 0 ? 'ascending' : 'descending') : 'none');
    });
  };

  const headers = [];
  const header = (label, col) => {
    const th = el('th', { scope: 'col', className: col === null ? '' : metaFor(col).cls || '' });
    const btn = el('button', { type: 'button', className: 'pn-th-btn', textContent: label });
    btn.addEventListener('click', () => {
      if (sorted && sortCol === col) sortDir = -sortDir;
      else { sortCol = col; sortDir = col === null ? 1 : -1; }
      sorted = true;
      paint();
    });
    th.appendChild(btn);
    headers.push({ th, col });
    headRow.appendChild(th);
  };
  header('Name', null);
  columns.forEach((col) => header(metaFor(col).label || col, col));
  thead.appendChild(headRow);
  table.appendChild(thead);
  table.appendChild(tbody);
  wrap.appendChild(table);
  paint();
  return wrap;
}

// Diff cell: struck before, bold after, signed delta when both are numbers.
function diffCell(field) {
  const node = el('span', { className: 'pn-cell-diff' });
  // Set-valued fields carry member counts; a missing side had no members
  // (a monster with no spawn maps before), so it reads 0, not a dash.
  const counted = hasMembers(field);
  const before = counted && (field.before === null || field.before === undefined) ? 0 : field.before;
  const after = counted && (field.after === null || field.after === undefined) ? 0 : field.after;
  const b = parseNum(before);
  const a = parseNum(after);
  node.appendChild(el('span', { className: 'pn-field-before', textContent: shown(before) }));
  node.appendChild(el('span', { className: 'pn-field-after', textContent: shown(after) }));
  let sort = typeof a === 'number' && !Number.isNaN(a) ? a : undefined;
  if (typeof b === 'number' && typeof a === 'number' && !Number.isNaN(b) && !Number.isNaN(a) && a !== b) {
    const delta = a - b;
    sort = delta;
    const digits = Math.max(...[before, after]
      .map((v) => (String(v).split('.')[1] || '').replace(/\D.*$/, '').length));
    const text = `${delta > 0 ? '+' : '−'}${Math.abs(delta).toLocaleString('en-US', {
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    })}`;
    node.appendChild(el('span', { className: `pn-delta ${delta > 0 ? 'pn-up' : 'pn-down'}`, textContent: text }));
  }
  return { node, sort };
}

// Changed entries whose fields are all numeric, as one table. Column order is
// first appearance, so the most common leading field reads first.
function buildDiffTable(entries, section, bucket, onNavigate) {
  const columns = [];
  const memberCols = new Set();
  const rows = entries.map((entry) => {
    const cells = new Map();
    mergeColumns(columns, (entry.fields || []).map((f) => f.label));
    (entry.fields || []).forEach((f) => {
      cells.set(f.label, diffCell(f));
      if (hasMembers(f)) {
        memberCols.add(f.label);
        cells.set(`${f.label}\u0000members`, memberCell(f, onNavigate));
      }
    });
    return { entry, cells };
  });
  // Set-valued fields (spawn maps, NPCs) get a column naming the members
  // that came and went, just before the count -- the count alone doesn't say
  // which map a monster moved into.
  const columnMeta = new Map();
  const ordered = [];
  columns.forEach((col) => {
    if (memberCols.has(col)) {
      const key = `${col}\u0000members`;
      ordered.push(key);
      columnMeta.set(key, { label: `${col} added / removed`, cls: 'pn-td-members' });
    }
    ordered.push(col);
  });
  // A single-field table is a ranking: biggest move first.
  const defaultSort = columns.length === 1 ? { col: columns[0], dir: 1 } : null;
  return buildEntryTable(rows, ordered, section, bucket, onNavigate, { defaultSort, columnMeta });
}

// Member chips for a set-valued field: "+ Primeval Forest I", linked to the
// map with its usual hover card. Past PN_CELL_CHIPS the rest fold into a
// "+N more" chip whose hover lists them.
const PN_CELL_CHIPS = 3;
function memberCell(field, onNavigate) {
  const node = el('span', { className: 'pn-cell-members' });
  const all = [
    ...(field.added || []).map((item) => ({ item, cls: 'pn-added', sign: '+' })),
    ...(field.removed || []).map((item) => ({ item, cls: 'pn-removed', sign: '−' })),
  ];
  const label = (item) => (typeof item === 'string' ? item : item.name);
  all.slice(0, PN_CELL_CHIPS).forEach(({ item, cls, sign }) => {
    const labelled = typeof item === 'string' ? `${sign} ${item}` : { ...item, name: `${sign} ${item.name}` };
    node.appendChild(buildChip(labelled, cls, field.tab, onNavigate));
  });
  if (all.length > PN_CELL_CHIPS) {
    const rest = all.slice(PN_CELL_CHIPS);
    node.appendChild(el('span', {
      className: 'pn-chip pn-chip-neutral pn-chip-more',
      textContent: `+${rest.length} more`,
      title: rest.map(({ item, sign }) => `${sign} ${label(item)}`).join('\n'),
    }));
  }
  // Sorts by how many members moved.
  return { node, sort: all.length };
}

// Adds one entry's ordered labels to the shared column list, keeping each new
// label next to the one it followed in that entry -- so a stat missing from
// the first row (Turkey has no M.DEF) still lands beside P.DEF, not at the end.
function mergeColumns(columns, labels) {
  labels.forEach((label, i) => {
    if (columns.includes(label)) return;
    const prev = labels.slice(0, i).reverse().find((l) => columns.includes(l));
    columns.splice(prev === undefined ? 0 : columns.indexOf(prev) + 1, 0, label);
  });
}

// Added monsters carry their stats as "Lv.20 · HP 18,550 · ..." meta strings.
// Rows of such tokens split into one numeric column per stat; any other meta
// row (Elements chips) becomes one text column. An entry needs at least one
// stat row to qualify, and entries with prose stay as normal rows.
const STAT_TOKEN = /^(?:(Lv)\.\s*(-?[\d,]+)|([A-Za-z][A-Za-z.]*(?: [A-Za-z.]+)*) (-?[\d,]+))$/;
function parseStatMeta(entry) {
  const meta = entry.meta || [];
  if (!meta.length || entry.description || entry.fields?.length) return null;
  const cells = new Map();
  let statRows = 0;
  for (const m of meta) {
    if (m.items?.length) {
      cells.set(m.label, { text: m.items.map((it) => (typeof it === 'string' ? it : it.name)).join(', ') });
      continue;
    }
    if (typeof m.value !== 'string') return null;
    const hits = m.value.split(' · ').map((token) => STAT_TOKEN.exec(token.trim()));
    if (hits.every(Boolean)) {
      statRows += 1;
      hits.forEach((hit) => cells.set(hit[1] || hit[3], { num: hit[2] || hit[4] }));
    } else {
      cells.set(m.label, { text: m.value });
    }
  }
  return statRows ? cells : null;
}

function buildStatTable(entries, section, bucket, onNavigate) {
  const columns = [];
  const rows = entries.map((entry) => {
    const parsed = parseStatMeta(entry);
    mergeColumns(columns, [...parsed.keys()]);
    const cells = new Map();
    parsed.forEach((value, label) => {
      cells.set(label, value.num !== undefined
        ? { node: document.createTextNode(value.num), sort: Number(value.num.replace(/,/g, '')) }
        : { node: el('span', { className: 'pn-td-text', textContent: value.text }), sort: value.text });
    });
    return { entry, cells };
  });
  return buildEntryTable(rows, columns, section, bucket, onNavigate);
}

function buildEntry(entry, bucket, section, onNavigate, opts = {}) {
  const row = el('div', {
    className: `pn-entry ${bucket.cls}`,
    'data-pn-key': `${section.key}:${entry.id}`,
  });

  const head = el('div', { className: 'pn-entry-head' });
  head.appendChild(el('span', { className: `pn-sign ${bucket.cls}`, textContent: bucket.sign }));

  // makeThumbnail resolves the path per-dataset and swaps in a placeholder if
  // the asset is missing, so a bad path degrades rather than showing a broken image.
  if (entry.image) {
    const thumb = makeThumbnail(entry.image, `${entry.name} thumbnail`, {
      className: `pn-thumb pn-thumb-${section.key}`, fallbackText: '',
    });
    // The icon is half the tile; it gets the same hover as the name.
    if (bucket.key !== 'removed') {
      attachEntityTooltip(thumb, section.tab, entry.id, tooltipChanges(entry, bucket, section));
    }
    head.appendChild(thumb);
  }

  head.appendChild(buildEntryName(entry, bucket, section, onNavigate));

  if (entry.id) {
    head.appendChild(makeCopyableId(`#${entry.id}`));
    // Composite key: ids are only unique within a section.
    head.appendChild(makeDeepLinkButton('patchnotes', `${section.key}:${entry.id}`));
  }
  (entry.badges || []).forEach((badge) => {
    head.appendChild(el('span', { className: 'badge badge-new', textContent: badge }));
  });
  // Glanceable hint for tiles: how many field diffs the modal holds,
  // so readers can tell a stat tweak from a full rework before clicking.
  if (isTileSection(section) && entry.fields?.length) {
    head.appendChild(el('span', {
      className: 'pn-change-count',
      textContent: `${entry.fields.length} change${entry.fields.length === 1 ? '' : 's'}`,
    }));
  }
  row.appendChild(head);

  // Detail nodes collect here instead of landing on the row directly, so the
  // monsters section can hide them behind a toggle (below).
  const details = el('div', { className: 'pn-entry-details' });

  // Only meaningful for added/removed -- changed entries show a Description
  // field row instead, with both sides.
  if (entry.description && bucket.key !== 'changed') {
    details.appendChild(el('div', { className: 'pn-desc', textContent: entry.description }));
  }
  // Informational context (what lives on this map, where it connects).
  // Same row grid as diffs, but neutral -- these aren't changes.
  if (entry.meta?.length) {
    const meta = el('div', { className: 'pn-fields pn-meta-rows' });
    entry.meta.forEach((m) => {
      const metaRow = el('div', { className: 'pn-field' });
      metaRow.appendChild(el('span', { className: 'pn-field-label', textContent: m.label }));
      if (m.items?.length) {
        const chips = el('span', { className: 'pn-chips' });
        m.items.forEach((item) => chips.appendChild(
          buildChip(item, 'pn-chip-neutral', m.tab, onNavigate)));
        metaRow.appendChild(chips);
      } else {
        metaRow.appendChild(el('span', { className: 'pn-meta-value', textContent: m.value }));
      }
      meta.appendChild(metaRow);
    });
    details.appendChild(meta);
  }

  // Only on added/removed -- a changed skill reports its level deltas as
  // individual "Level N" diff rows instead.
  if (entry.levels?.length && bucket.key !== 'changed') {
    details.appendChild(buildLevelStats(entry.levels));
  }

  if (entry.fields?.length) {
    const fields = el('div', { className: 'pn-fields' });
    const levels = section.key === 'skills'
      ? entry.fields.filter((f) => f.field === 'all_level_stats') : [];
    entry.fields.filter((f) => !levels.includes(f))
      .forEach((f) => fields.appendChild(buildFieldRow(f, onNavigate)));
    if (fields.childElementCount) details.appendChild(fields);
    if (levels.length) details.appendChild(buildLevelDiffs(levels, onNavigate));
  }

  // Tile sections collapse entries to thumbnail + name and open stats or
  // diffs in a modal, in every bucket. Full-row sections keep everything
  // inline. Detailed view (toolbar toggle) opts tiles back out to the
  // previous full-row display.
  if (isTileSection(section) && !opts.full && !opts.detailed && details.childElementCount) {
    details.hidden = true;
    row.classList.add('pn-collapsed');
    head.setAttribute('tabindex', '0');
    head.setAttribute('role', 'button');
    head.setAttribute('aria-label', `Show details for ${entry.name || entry.id}`);
    const open = (event) => {
      // Interactive children (name link, buttons, copyable id) keep their
      // own clicks; anything else on the tile opens the modal.
      if (event.target.closest('a,button,.id')) return;
      event.preventDefault();
      openEntryModal(entry, bucket, section, onNavigate, head);
    };
    head.addEventListener('click', open);
    head.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      open(event);
    });
    // Changed tiles show what changed without opening the modal.
    if (bucket.key === 'changed' && entry.fields?.length && !opts.noTileDiffs) {
      const diffs = buildTileDiffs(entry.fields);
      diffs.addEventListener('click', open);
      row.appendChild(diffs);
    }
  }
  if (details.childElementCount) row.appendChild(details);
  return row;
}

// One continuous run of rows for a single bucket. Each row carries its own
// sign and colour, so the change type still reads per-entry; the bucket block
// header above it carries the grouping.
// Buckets render only the first page; the rest sits behind an explicit
// toggle. A Changed bucket can hold ~800 entries, and rendering them all on
// every section open (or every search keystroke) janks the page -- while
// nobody glances past the first screenful anyway.
const PN_LIST_LIMIT = 50;

// Quest entries run long (multi-stage prose plus reward/requirement chips),
// so the quest buckets page after 10 instead of 50 -- same "Show N more"
// toggle, just a shorter first page.
const PN_LIST_LIMITS = { quests: 10 };
const pnListLimit = (section) => PN_LIST_LIMITS[section.key] ?? PN_LIST_LIMIT;

function buildList(rows, section, onNavigate, opts = {}) {
  const list = el('div', {
    className: `pn-list pn-list-${section.key}${isTileSection(section) ? ' pn-tiles' : ''}`,
  });
  const limit = pnListLimit(section);
  const appendRow = ({ entry, bucket }) =>
    list.appendChild(buildEntry(entry, bucket, section, onNavigate, opts));
  rows.slice(0, limit).forEach(appendRow);
  if (rows.length > limit) {
    const hidden = rows.length - limit;
    const more = el('button', {
      type: 'button',
      className: 'pn-show-more',
      textContent: `Show ${hidden} more`,
    });
    more.addEventListener('click', () => {
      rows.slice(limit).forEach(appendRow);
      more.remove();
    });
    list.appendChild(more);
  }
  return list;
}

// Coloured +N / −N / ~N breakdown for a heading. makeCollapsible's own
// badgeText is plain text, so this is appended to the header separately to keep
// each number in its own colour.
function buildTally(counts) {
  const tally = el('span', { className: 'pn-tally' });
  BUCKETS.forEach((b) => {
    if (!counts[b.key]) return;
    tally.appendChild(el('span', {
      className: `pn-tally-item ${b.cls}`,
      textContent: `${b.sign}${counts[b.key]}`,
    }));
  });
  return tally;
}

// Sections whose entries carry a `group` (Skills, by class) split into nested
// collapsibles, one per group, closed by default: the section then opens as a
// short index of classes rather than a wall of entries.
//
// `section.groups` is the generator's canonical order; anything missing from it
// -- including entries with no group at all -- follows in the order it appears,
// so nothing can silently drop out of the list.
function buildGroupedList(rows, section, onNavigate, opts = {}) {
  const byGroup = new Map();
  rows.forEach((row) => {
    const key = row.entry.group || '';
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(row);
  });

  const wrap = el('div', { className: 'pn-groups' });
  [...new Set([...(section.groups || []), ...byGroup.keys()])]
    .filter((key) => byGroup.has(key))
    .forEach((key) => {
      const groupRows = byGroup.get(key);
      const list = buildList(groupRows, section, onNavigate, opts);
      // Entries with no group of their own stay loose, above the blocks.
      if (!key) {
        wrap.appendChild(list);
        return;
      }
      // The rows are passed as a node rather than a builder, so they are in the
      // DOM even while the block is closed -- reveal() finds a deep-linked row
      // by query and then opens its block, which a lazy body would defeat.
      const block = makeCollapsible(key, groupRows.length, !!opts.expand, null, list);
      block.classList.add('pn-group');
      const counts = {};
      groupRows.forEach(({ bucket }) => {
        counts[bucket.key] = (counts[bucket.key] || 0) + 1;
      });
      block.querySelector('.collapsible-header .left')?.appendChild(buildTally(counts));
      wrap.appendChild(block);
    });
  return wrap;
}

// Sections render their non-empty buckets -- Added / Removed / Changed -- as
// flat blocks under a small heading, with a segmented control above them to
// show one bucket at a time. (They used to be nested collapsibles, which put
// three levels of boxes between the section title and its first entry.)
//
// A bucket this small reads fine fully expanded: tiles render as inline rows
// (the Detailed view layout) and Skills' class groups start open. Bigger
// buckets keep the tiles and closed groups that keep a large patch glanceable.
const PN_EXPAND_LIMIT = 12;

function rowsOf(entries, bucket) {
  return entries.map((entry) => ({ entry, bucket }));
}

// Inline (full-row) Changed bucket: entries whose every field is a number go
// into one diff table; the rest keep their rows. Only worth it with two or more
// table rows -- a one-row table is just a worse row.
function buildChangedInline(entries, bucket, section, onNavigate, opts) {
  const numeric = entries.filter((e) => e.fields?.length
    && e.fields.every((f) => isNumericField(f)));
  if (numeric.length < 2) return buildList(rowsOf(entries, bucket), section, onNavigate, opts);
  const wrap = el('div', { className: 'pn-bucket-parts' });
  wrap.appendChild(buildDiffTable(numeric, section, bucket, onNavigate));
  const rest = entries.filter((e) => !numeric.includes(e));
  if (rest.length) wrap.appendChild(buildList(rowsOf(rest, bucket), section, onNavigate, opts));
  return wrap;
}

// Inline Added bucket: stat-line entries (monsters) as one sortable table.
function buildAddedInline(entries, bucket, section, onNavigate, opts) {
  const parsed = entries.filter((e) => parseStatMeta(e));
  if (parsed.length < 2) return buildList(rowsOf(entries, bucket), section, onNavigate, opts);
  const wrap = el('div', { className: 'pn-bucket-parts' });
  wrap.appendChild(buildStatTable(parsed, section, bucket, onNavigate));
  const rest = entries.filter((e) => !parsed.includes(e));
  if (rest.length) wrap.appendChild(buildList(rowsOf(rest, bucket), section, onNavigate, opts));
  return wrap;
}

// Summary-mode Changed bucket, grouped by which fields changed: one nested
// block per shape with its count and a mechanical fact where one holds (all
// lowered / all raised). All-numeric shapes render as a table; others as the
// usual list.
function buildShapeGroups(groups, bucket, section, onNavigate, opts) {
  const wrap = el('div', { className: 'pn-shapes' });
  groups.forEach((group) => {
    const { label, direction } = describeGroup(group);
    const numeric = !group.other && group.entries.every((e) => e.fields?.length
      && e.fields.every((f) => isNumericField(f, { allowMembers: true })));
    // Text-only groups (descriptions, game text): the header already names the
    // field and prose doesn't fit a tile, so their tiles skip the diff line.
    // The edit shows on hover, in the modal, and inline in Detailed view.
    const textOnly = !group.other && group.entries.every((e) => e.fields?.length
      && e.fields.every((f) => f.long));
    const content = numeric
      ? buildDiffTable(group.entries, section, bucket, onNavigate)
      : buildList(rowsOf(group.entries, bucket), section, onNavigate,
        textOnly ? { ...opts, noTileDiffs: true } : opts);
    // Content is a node, not a builder: reveal() finds a deep-linked row by
    // query and then opens its block, which a lazy body would defeat.
    const block = makeCollapsible(label, group.entries.length, true, null, content);
    block.classList.add('pn-shape');
    if (group.other) block.classList.add('pn-shape-other');
    if (direction) {
      block.querySelector('.collapsible-header .left')
        ?.appendChild(el('span', { className: 'pn-shape-tag', textContent: direction }));
    }
    wrap.appendChild(block);
  });
  return wrap;
}

function buildBucketBlock(bucket, entries, section, onNavigate, isFiltering, opts = {}) {
  if (!entries?.length) return null;
  const rows = rowsOf(entries, bucket);
  const expand = entries.length <= PN_EXPAND_LIMIT;
  if (expand) opts = { ...opts, detailed: true, expand: true };
  const grouped = section.groups?.length || rows.some((r) => r.entry.group);
  const inline = expand || opts.detailed;

  let list;
  if (grouped) {
    list = buildGroupedList(rows, section, onNavigate, opts);
  } else if (bucket.key === 'changed' && inline) {
    list = buildChangedInline(entries, bucket, section, onNavigate, opts);
  } else if (bucket.key === 'changed') {
    const groups = groupByShape(entries);
    list = groups
      ? buildShapeGroups(groups, bucket, section, onNavigate, opts)
      : buildList(rows, section, onNavigate, opts);
  } else if (bucket.key === 'added' && inline) {
    list = buildAddedInline(entries, bucket, section, onNavigate, opts);
  } else {
    list = buildList(rows, section, onNavigate, opts);
  }

  const block = el('div', {
    className: `pn-bucket pn-bucket-${bucket.key}`,
    'data-bucket': bucket.key,
  });
  const head = el('div', { className: 'pn-bucket-head' });
  head.appendChild(el('span', { className: `pn-bucket-title ${bucket.cls}`, textContent: bucket.label }));
  head.appendChild(el('span', { className: 'pn-bucket-count', textContent: entries.length }));
  block.appendChild(head);

  // pn-detailed reuses the page-level Detailed view styles for this bucket only.
  const wrap = el('div', { className: `pn-bucket-list${expand ? ' pn-detailed' : ''}` });
  wrap.appendChild(list);

  // The generator's --max-items can cap each bucket. Say so: a silently short
  // list is indistinguishable from a section that had nothing more to report.
  // Sections with a note already explain their own empty bucket, and while a
  // search/type filter is active the counts describe the filter, not the data.
  const counts = section.counts || {};
  const hidden = (counts[bucket.key] || 0) - entries.length;
  if (hidden > 0 && !section.note && !isFiltering) {
    wrap.appendChild(el('div', {
      className: 'pn-more',
      textContent: `Not listed: ${hidden} more ${bucket.label.toLowerCase()}.`,
    }));
  }
  block.appendChild(wrap);
  return block;
}

// All / Added / Removed / Changed for one section. Toggles visibility only,
// so every row stays in the DOM for deep links (reveal() resets it to All).
function buildBucketSeg(buckets, entries, blocks) {
  const seg = el('div', { className: 'pn-seg', role: 'group', 'aria-label': 'Change type' });
  const total = buckets.reduce((sum, b) => sum + entries[b.key].length, 0);
  const options = [{ key: 'all', label: 'All', count: total, cls: '' },
    ...buckets.map((b) => ({ key: b.key, label: b.label, count: entries[b.key].length, cls: b.cls }))];
  const buttons = [];
  options.forEach((o) => {
    const btn = el('button', {
      type: 'button',
      className: `pn-seg-btn${o.key === 'all' ? ' active' : ''}`,
      'data-bucket': o.key,
      'aria-pressed': String(o.key === 'all'),
    });
    btn.appendChild(el('span', { textContent: o.label }));
    btn.appendChild(el('span', { className: `pn-seg-count ${o.cls}`, textContent: o.count }));
    btn.addEventListener('click', () => {
      buttons.forEach((b) => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      blocks.forEach((block) => {
        block.hidden = o.key !== 'all' && block.dataset.bucket !== o.key;
      });
    });
    buttons.push(btn);
    seg.appendChild(btn);
  });
  return seg;
}

// `entries` is the bucket -> row subset to show: the full section when idle,
// the search/type-filtered subset while the toolbar filter is active.
function buildSectionBody(section, entries, onNavigate, ctx) {
  const body = el('div', { className: 'pn-body' });

  if (section.note) {
    body.appendChild(el('div', { className: 'pn-note', textContent: section.note }));
  }

  const buckets = el('div', { className: 'pn-buckets' });
  const nonEmpty = BUCKETS.filter((b) => (entries[b.key] || []).length);
  const blocks = [];
  nonEmpty.forEach((bucket) => {
    const block = buildBucketBlock(bucket, entries[bucket.key] || [], section, onNavigate, ctx.isFiltering, {
      detailed: ctx.detailed,
    });
    if (block) {
      blocks.push(block);
      buckets.appendChild(block);
    }
  });
  if (blocks.length > 1) body.appendChild(buildBucketSeg(nonEmpty, entries, blocks));
  body.appendChild(buckets);

  return body;
}

// Patch picker: a custom listbox rather than a <select>, so each entry can show its
// title and date at different weights, grouped by game phase. Index labels read
// "<title> · <Mon d>", the title being the new client version, or "Patch <hash>" when
// the version didn't change (see patch_label in run_pipeline.py).
function splitDiffLabel(d) {
  const [title, ...rest] = String(d.label || d.id).split(' · ');
  // "COT2 → Founders Access" belongs to the phase it enters; "COT1 patch" to COT1.
  // Titles are versions ("v1.1.0 · Oct 28"), so entries carry their phase explicitly.
  const phase = d.phase || title.split('→').pop().replace(/\s+(patch|launch)$/i, '').trim();
  let date = rest.join(' · ');
  if (d.date) {
    const parsed = new Date(`${d.date}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      date = parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }
  // Versioned entries already name the build in their title ("v1.1.0" or
  // "Patch 71eb67bc"), so only unversioned ones get a builds line.
  const builds = d.after_version ? '' : buildsText(d);
  return { title, phase, date, builds, crossing: d.phase_change ?? title.includes('→') };
}

// "v1.0.1 → v1.1.0"; build hashes only for entries without versions.
function buildsText(d) {
  if (d.before_version && d.after_version) return `v${d.before_version} → v${d.after_version}`;
  return d.before && d.after ? `${d.before} → ${d.after}` : '';
}

let diffPickerCount = 0;

function makeDiffPicker(diffs, activeId, onChange) {
  const id = `pn-patch-list-${++diffPickerCount}`;
  const items = diffs.map((d) => ({ diff: d, ...splitDiffLabel(d) }));
  const wrap = el('div', { className: 'pn-patch-picker' });
  wrap.appendChild(el('span', { className: 'pill-group-label', textContent: 'Patch:' }));

  const trigger = el('button', {
    type: 'button', className: 'pn-patch-trigger',
    'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': id,
  });
  const triggerTitle = el('span', { className: 'pn-patch-trigger-title' });
  const triggerMeta = el('span', { className: 'pn-patch-trigger-meta' });
  trigger.append(
    el('span', { className: 'pn-patch-trigger-text' }, triggerTitle, triggerMeta),
    el('span', { className: 'pn-patch-chevron', 'aria-hidden': 'true' }),
  );

  const panel = el('div', { className: 'pn-patch-panel', id, role: 'listbox', tabindex: '-1', 'aria-label': 'Patch' });
  const options = [];
  let lastPhase = null;
  items.forEach((item, i) => {
    if (item.phase !== lastPhase) {
      panel.appendChild(el('div', { className: 'pn-patch-group', role: 'presentation', textContent: item.phase }));
      lastPhase = item.phase;
    }
    const { builds } = item;
    const option = el('div', {
      className: `pn-patch-option${item.crossing ? ' pn-patch-option-major' : ''}`,
      role: 'option', id: `${id}-${i}`, 'aria-selected': 'false',
    },
    el('span', { className: 'pn-patch-option-main' },
      el('span', { className: 'pn-patch-option-title', textContent: item.title }),
      el('span', { className: 'pn-patch-option-date', textContent: item.date })),
    builds ? el('span', { className: 'pn-patch-option-builds', textContent: builds }) : null);
    option.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus on the list
    option.addEventListener('click', () => choose(i));
    panel.appendChild(option);
    options.push(option);
  });
  // The list hangs from the button, not the "Patch:" label beside it.
  wrap.appendChild(el('div', { className: 'pn-patch-anchor' }, trigger, panel));

  let selected = Math.max(0, items.findIndex((it) => it.diff.id === activeId));
  let active = selected;

  function paint() {
    const item = items[selected];
    triggerTitle.textContent = item.title;
    triggerMeta.textContent = [item.date, item.builds].filter(Boolean).join(' · ');
    options.forEach((o, i) => {
      o.setAttribute('aria-selected', String(i === selected));
      o.classList.toggle('active', i === active);
    });
    panel.setAttribute('aria-activedescendant', options[active]?.id || '');
  }
  function setOpen(open) {
    wrap.classList.toggle('open', open);
    trigger.setAttribute('aria-expanded', String(open));
    if (open) {
      active = selected;
      paint();
      panel.focus();
      options[active]?.scrollIntoView({ block: 'nearest' });
    }
  }
  function choose(i) {
    const changed = i !== selected;
    selected = active = i;
    paint();
    setOpen(false);
    trigger.focus();
    if (changed) onChange(items[i].diff.id);
  }

  trigger.addEventListener('click', () => setOpen(!wrap.classList.contains('open')));
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); }
  });
  panel.addEventListener('keydown', (e) => {
    const last = options.length - 1;
    const move = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: last, PageDown: active + 5, PageUp: active - 5 }[e.key];
    if (move !== undefined) {
      e.preventDefault();
      active = Math.min(last, Math.max(0, move));
      paint();
      options[active].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') { e.preventDefault(); trigger.focus(); }
      setOpen(false);
    }
  });
  panel.addEventListener('focusout', (e) => {
    if (!wrap.contains(e.relatedTarget)) setOpen(false);
  });

  paint();
  const host = el('div', { className: 'pn-diff-picker-wrap' }, wrap);
  host.setActive = (diffId) => {
    const i = items.findIndex((it) => it.diff.id === diffId);
    if (i >= 0) { selected = active = i; paint(); }
  };
  return host;
}

// `patchNotes` is either one notes object or { diffs, initial } from
// loadPatchNotes when the dataset carries several diffs. In the latter case a
// picker above the header swaps the page between them; `?diff=<id>` in the
// tab's deep link selects one.
export function renderPatchNotes(patchNotes, options = {}) {
  lookups = buildLookups(options.data);
  const diffs = patchNotes?.diffs;
  if (!diffs) return buildNotesPage(patchNotes, options);

  const cache = new Map([[diffs[0].id, patchNotes.initial]]);
  const host = el('div', { className: 'pn-host' });
  let picker = null;

  const show = async (id, { push = false, params = null } = {}) => {
    // `aliases` keeps links to retired diff ids (the old milestone pills) working.
    const diff = diffs.find((d) => d.id === id || d.aliases?.includes(id)) || diffs[0];
    picker.setActive(diff.id);
    if (push) {
      const hash = diff.id === diffs[0].id ? '#patchnotes' : `#patchnotes?diff=${encodeURIComponent(diff.id)}`;
      history.replaceState(history.state, '', `${location.pathname}${location.search}${hash}`);
    }
    if (!cache.has(diff.id)) {
      host.replaceChildren(el('div', { className: 'empty-state', textContent: 'Loading patch notes…' }));
      cache.set(diff.id, await loadPatchNotesFile(diff.file));
    }
    host.replaceChildren(buildNotesPage(cache.get(diff.id), { ...options, initialParams: params }, picker));
  };

  picker = makeDiffPicker(diffs, diffs[0].id, (id) => show(id, { push: true }));

  const params = options.initialParams;
  show(params?.get?.('diff') || diffs[0].id, { params });
  return host;
}

// Whitespace-only edits ("over\r\nany" -> "over any") change nothing a player
// reads. The generator skips them now (same_text in generate_patch_notes.py);
// this drops them from files generated before that, and corrects the counts so
// headings and the overview agree with what's listed. Runs once per notes
// object -- renderPatchNotes caches and re-renders the same one.
function dropWhitespaceOnly(notes) {
  if (notes._wsDropped) return;
  notes._wsDropped = true;
  let dropped = 0;
  (notes.sections || []).forEach((section) => {
    if (!section.changed?.length) return;
    const kept = [];
    section.changed.forEach((entry) => {
      if (!entry.fields?.length) { kept.push(entry); return; }
      const fields = entry.fields.filter((f) => !isWhitespaceOnly(f));
      if (!fields.length) return;
      kept.push(fields.length === entry.fields.length ? entry : { ...entry, fields });
    });
    const removed = section.changed.length - kept.length;
    if (!removed) return;
    section.changed = kept;
    if (section.counts?.changed) section.counts.changed -= removed;
    dropped += removed;
  });
  if (dropped && notes.totals?.changed) notes.totals.changed -= dropped;
}

function buildNotesPage(notes, options = {}, picker = null) {
  const frag = document.createDocumentFragment();
  const page = el('div', { className: 'patch-notes-page' });

  page.appendChild(el('div', { className: 'section-heading', textContent: 'Patch Notes' }));
  if (picker) page.appendChild(picker);

  if (!notes) {
    page.appendChild(el('div', {
      className: 'empty-state',
      textContent: 'No patch notes are available for this dataset.',
    }));
    frag.appendChild(page);
    return frag;
  }

  dropWhitespaceOnly(notes);
  page.appendChild(buildHeader(notes));

  const totals = notes.totals || {};
  const hasChanges = (totals.added || 0) + (totals.removed || 0) + (totals.changed || 0) > 0;

  if (!hasChanges) {
    page.appendChild(el('div', {
      className: 'empty-state',
      textContent: `No player-facing changes detected between ${notes.before.label} and ${notes.after.label}.`,
    }));
    frag.appendChild(page);
    return frag;
  }

  // Navigate to the entity's own tab, matching the deeplink pattern in main.js.
  // `options.getNavigators` is read at click time because TabManager populates
  // navigators lazily as each tab first renders.
  const onNavigate = (tab, id) => {
    options.switchTab?.(tab);
    const nav = options.getNavigators?.()?.[tab];
    if (nav) nav(`id:${id}`);
  };

  // ---- Toolbar: search + change-type pills + expand controls ----
  // Same sticky-toolbar pattern as Items/Equipment/Skills, so the controls
  // stay in reach while thousand-row sections scroll past.
  let searchQuery = '';
  let bucketFilter = 'all'; // all | added | removed | changed
  let detailedView = false; // toolbar toggle: full inline rows, no tiles
  const isFiltering = () => searchQuery.trim() !== '' || bucketFilter !== 'all';

  // Name, id, or (Skills) class-group match. Regex in slashes comes free via
  // makeMatcher, matching the other tabs.
  const matchesQuery = (entry) => {
    const q = searchQuery.trim();
    if (!q) return true;
    const m = makeMatcher(q);
    return m.test(entry.name) || m.test(entry.id) || m.test(entry.group);
  };

  const filterBuckets = (section) => {
    const out = {};
    BUCKETS.forEach((b) => {
      out[b.key] = bucketFilter !== 'all' && b.key !== bucketFilter
        ? []
        : (section[b.key] || []).filter(matchesQuery);
    });
    return out;
  };

  const toolbar = el('div', { className: 'sticky-toolbar pn-toolbar' });
  const searchBox = makeSearchBox('Search by name or id...', (value) => {
    searchQuery = value;
    renderData();
  });
  toolbar.appendChild(searchBox);

  const pillRow = el('div', { className: 'filter-row pn-filter-row' });
  const bucketPills = makePillGroup(
    [{ label: 'All changes', value: 'all' },
     ...BUCKETS.map((b) => ({ label: b.label, value: b.key }))],
    'all',
    (value) => {
      bucketFilter = value;
      bucketPills.setActive(value);
      renderData();
    },
    { groupLabel: 'Show:' },
  );
  pillRow.appendChild(bucketPills);
  pillRow.appendChild(el('span', { className: 'filter-divider' }));
  const expandBtn = el('button', { className: 'pill pill--sub', type: 'button', textContent: 'Expand all' });
  expandBtn.addEventListener('click', () => sectionEls.forEach((c) => c.classList.add('open')));
  const collapseBtn = el('button', { className: 'pill pill--sub', type: 'button', textContent: 'Collapse all' });
  collapseBtn.addEventListener('click', () => sectionEls.forEach((c) => c.classList.remove('open')));
  pillRow.appendChild(expandBtn);
  pillRow.appendChild(collapseBtn);
  pillRow.appendChild(el('span', { className: 'filter-divider' }));
  // Detailed view restores the previous full-row display: every entry
  // renders its stats/diffs inline instead of collapsing to a modal tile.
  const detailedHintCookie = 'osms-patch-notes-detailed-seen';
  const hasSeenDetailedHint = document.cookie
    .split(';')
    .some((cookie) => cookie.trim().startsWith(`${detailedHintCookie}=`));
  const detailedToggle = makeHideToggle('Detailed view', false, (active) => {
    detailedView = active;
    detailedToggle.classList.remove('pn-detailed-hint');
    document.cookie = `${detailedHintCookie}=1; Max-Age=31536000; Path=/; SameSite=Lax`;
    renderData();
  });
  if (!hasSeenDetailedHint) detailedToggle.classList.add('pn-detailed-hint');
  pillRow.appendChild(detailedToggle);
  toolbar.appendChild(pillRow);

  // Section jump bar: stays pinned with the toolbar and marks the section
  // currently under it.
  const jumpRow = el('div', { className: 'pn-jump', role: 'navigation', 'aria-label': 'Sections' });
  toolbar.appendChild(jumpRow);

  const statusLine = el('div', { className: 'pn-status', hidden: true });
  toolbar.appendChild(statusLine);
  enableMobileFilterDrawer(toolbar, { keep: [searchBox, statusLine] });

  const sectionsWrap = el('div', { className: 'pn-sections' });
  const sectionEls = new Map();

  // Where the pinned toolbar ends right now (it slides with the site header).
  const toolbarBottom = () => toolbar.getBoundingClientRect().bottom;
  const jumpTo = (key) => {
    // A filter can hide the section; a jump means "show me it", so clear it.
    if (!sectionEls.has(key) && isFiltering()) {
      searchQuery = '';
      bucketFilter = 'all';
      searchBox._input.value = '';
      searchBox._sync();
      bucketPills.setActive('all');
      renderData();
    }
    const target = sectionEls.get(key);
    if (!target) return;
    target.classList.add('open');
    // Same convention as scrollRowToTop's instant mode: the jump hides the
    // site header (--sticky-offset drops to 0), so only the toolbar pins above.
    startDeepLinkJump();
    window.scrollTo({
      top: window.scrollY + target.getBoundingClientRect().top - toolbar.offsetHeight - 4,
      behavior: 'instant',
    });
  };

  page.appendChild(buildOverview(notes, jumpTo));
  page.appendChild(toolbar);
  page.appendChild(sectionsWrap);

  const jumpButtons = new Map();
  const paintJump = () => {
    jumpRow.replaceChildren();
    jumpButtons.clear();
    sectionEls.forEach((_, key) => {
      const section = notes.sections.find((s) => s.key === key);
      const btn = el('button', { type: 'button', className: 'pn-jump-btn', textContent: section.label });
      btn.addEventListener('click', () => jumpTo(key));
      jumpButtons.set(key, btn);
      jumpRow.appendChild(btn);
    });
    jumpRow.hidden = jumpButtons.size < 2;
    markCurrent();
  };
  // The current section is the last one whose top has passed under the
  // toolbar. A dozen rect reads per scroll event; cheap enough unthrottled.
  let wasConnected = false;
  function markCurrent() {
    if (!page.isConnected) return;
    const line = toolbarBottom() + 12;
    let current = null;
    sectionEls.forEach((node, key) => {
      if (node.getBoundingClientRect().top <= line) current = key;
    });
    jumpButtons.forEach((btn, key) => btn.classList.toggle('active', key === current));
  }
  function onScroll() {
    // Switching patches replaces the page; once a page that was on screen has
    // left the document, drop its listener.
    if (page.isConnected) wasConnected = true;
    else if (wasConnected) {
      window.removeEventListener('scroll', onScroll);
      return;
    }
    markCurrent();
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  // Tiles and the render cap keep the full page cheap, so every section
  // lands open. (Skills still indexes its classes behind closed groups.)
  function renderData() {
    const filtering = isFiltering();
    page.classList.toggle('pn-detailed', detailedView);
    sectionEls.clear();
    sectionsWrap.innerHTML = '';
    let matchEntries = 0;
    let matchSections = 0;
    notes.sections.forEach((section) => {
      const entries = filtering
        ? filterBuckets(section)
        : {
            added: section.added || [],
            removed: section.removed || [],
            changed: section.changed || [],
          };
      const total = BUCKETS.reduce((sum, b) => sum + entries[b.key].length, 0);
      // Empty while filtering, or emptied by dropWhitespaceOnly.
      if (total === 0) return;
      matchEntries += total;
      matchSections += 1;
      // While filtering, headings count the matches; idle, the generator's
      // canonical counts (which include --max-items-truncated rows).
      const counts = filtering
        ? Object.fromEntries(BUCKETS.map((b) => [b.key, entries[b.key].length]).filter(([, n]) => n))
        : section.counts || {};
      const shown = filtering
        ? total
        : BUCKETS.reduce((sum, b) => sum + (counts[b.key] || 0), 0);
      const collapsible = makeCollapsible(section.label, shown, true, null,
        () => buildSectionBody(section, entries, onNavigate, {
          isFiltering: filtering,
          bucketFilter,
          hasQuery: searchQuery.trim() !== '',
          detailed: detailedView,
        }));

      collapsible.querySelector('.collapsible-header .left')?.appendChild(buildTally(counts));
      sectionEls.set(section.key, collapsible);
      sectionsWrap.appendChild(collapsible);
    });

    if (filtering) {
      const q = searchQuery.trim();
      statusLine.hidden = false;
      statusLine.textContent = matchEntries
        ? q
          ? `${matchEntries} match${matchEntries === 1 ? '' : 'es'} for "${q}" across ${matchSections} section${matchSections === 1 ? '' : 's'}`
          : `${matchEntries} ${bucketFilter} across ${matchSections} section${matchSections === 1 ? '' : 's'}`
        : 'No entries match the current filter.';
    } else {
      statusLine.hidden = true;
    }
    if (filtering && matchEntries === 0) {
      sectionsWrap.appendChild(el('div', {
        className: 'empty-state',
        textContent: 'No entries match the current filter.',
      }));
    }
    paintJump();
  }
  renderData();

  // Deep link to a single row: "#patchnotes?q=id:<section>:<entryId>".
  // The section key is part of the key because entry ids are only unique
  // within a section (a map and a monster can share an id).
  const reveal = (collapsible, key) => {
    // Bodies render lazily on open, so expand first and let that frame commit
    // before looking for the row. Retry a couple of frames in case the body
    // hasn't been built yet.
    collapsible.classList.add('open');

    const attempt = (tries) => requestAnimationFrame(() => {
      // A per-section bucket filter hides other buckets' rows; reset to All.
      collapsible.querySelectorAll('.pn-seg-btn[data-bucket="all"]:not(.active)')
        .forEach((b) => b.click());
      // Compare attributes directly rather than building an escaped attribute
      // selector -- the keys contain colons, which need CSS escaping to be
      // matched reliably.
      const target = [...collapsible.querySelectorAll('[data-pn-key]')]
        .find((n) => n.getAttribute('data-pn-key') === key);
      if (!target) {
        // Rows past the render cap aren't in the DOM yet -- expand any
        // "Show more" toggles and retry on the next frame.
        collapsible.querySelectorAll('.pn-show-more').forEach((b) => b.click());
        if (tries > 0) attempt(tries - 1);
        return;
      }
      // Grouped sections nest each block in its own collapsible, closed by
      // default -- open whichever ones hold the row, or it stays invisible and
      // the scroll below lands on a zero-height target.
      for (let node = target.parentElement; node && node !== collapsible;
           node = node.parentElement) {
        if (node.classList.contains('collapsible')) node.classList.add('open');
      }
      // Tile rows keep their details in a modal -- open it for the
      // deep-linked row so the landing shows the linked content.
      if (target.classList.contains('pn-collapsed')) {
        target.querySelector(':scope > .pn-entry-head')?.click();
      }
      document.querySelectorAll('.row-hotlink').forEach((r) => r.classList.remove('row-hotlink'));
      target.classList.add('row-hotlink');

      // NOT scrollToDetailRow: it waits for every <img> in the row to fire
      // load/error first, and our thumbnails are loading="lazy". An off-screen
      // lazy image never loads until it is scrolled into view, so that wait
      // deadlocks and the scroll never happens.
      startDeepLinkJump();
      const offset = 8;
      window.scrollTo({
        top: window.scrollY + target.getBoundingClientRect().top - offset,
        behavior: 'instant',
      });
    });
    attempt(5);
  };

  const goToEntry = (query) => {
    const raw = String(query || '').trim().replace(/^id\s*:\s*/i, '');
    if (!raw) return;

    // A deep link escapes any active filter: its row may be hidden by it.
    if (isFiltering()) {
      searchQuery = '';
      bucketFilter = 'all';
      searchBox._input.value = '';
      searchBox._sync();
      bucketPills.setActive('all');
      renderData();
    }

    const match = /^([a-z_]+)\s*:\s*(.+)$/i.exec(raw);
    if (match && sectionEls.has(match[1])) {
      reveal(sectionEls.get(match[1]), `${match[1]}:${match[2]}`);
      return;
    }
    // Bare id (the convention the other tabs use): find whichever section
    // holds it. Ids are unique within a section, so take the first hit.
    const bare = match ? match[2] : raw;
    const hit = notes.sections.find((s) =>
      BUCKETS.some((b) => (s[b.key] || []).some((e) => String(e.id) === bare)));
    if (hit) reveal(sectionEls.get(hit.key), `${hit.key}:${bare}`);
  };

  // Router/deep-link entry point: section-qualified targets ("maps:10000")
  // reveal a row; anything else becomes toolbar search text, matching the
  // ?q=<query> convention the other tabs use.
  const navigate = (query) => {
    const raw = String(query || '').trim();
    if (!raw) return;
    const bare = raw.replace(/^id\s*:\s*/i, '');
    if (/^[a-z_]+\s*:\s*.+/i.test(bare)) {
      goToEntry(raw);
    } else {
      searchQuery = bare;
      searchBox._input.value = bare;
      searchBox._sync();
      renderData();
      window.scrollTo(0, 0);
    }
  };

  options.setNavigate?.(navigate);
  const initial = options.initialParams?.get?.('q');
  if (initial) navigate(initial);

  const generated = formatTimestamp(notes.generated_at);
  if (generated) {
    page.appendChild(el('div', {
      className: 'pn-generated',
      textContent: `Generated ${generated}`,
    }));
  }

  frag.appendChild(page);
  return frag;
}
