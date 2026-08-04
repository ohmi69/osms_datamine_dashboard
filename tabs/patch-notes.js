import { el, makeCollapsible, makeCopyableId, makeThumbnail,
         makeDeepLinkButton } from '../lib/utils.js';
import { attachTooltip } from '../lib/tooltip.js';

const BUCKETS = [
  { key: 'added',   label: 'Added',   sign: '+', cls: 'pn-added' },
  { key: 'removed', label: 'Removed', sign: '−', cls: 'pn-removed' },
  { key: 'changed', label: 'Changed', sign: '~', cls: 'pn-changed' },
];

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
  return text.trim() === '' ? '—' : text;
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

  return { items, monsters, maps };
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

function attachEntityTooltip(node, tab, id) {
  if (!lookups || !node || id === null || id === undefined) return;
  const key = String(id);
  if (tab === 'items' || tab === 'equipment') {
    attachTooltip(node, () => lookups.items.get(key));
  } else if (tab === 'monsters') {
    attachTooltip(node, () => lookups.monsters.get(key), 'mob');
  } else if (tab === 'maps') {
    attachTooltip(node, () => {
      const map = lookups.maps.get(key);
      return map ? { map, mobs: mapSpawns(map) } : null;
    }, 'map');
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
    wrap.appendChild(el('div', { className: 'pn-side-label', textContent: meta.label }));
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


function buildFieldRow(field, onNavigate) {
  // Long prose (descriptions) stacks vertically so neither side is clipped.
  if (field.long) {
    const block = el('div', { className: 'pn-field pn-field-long' });
    block.appendChild(el('div', { className: 'pn-field-label', textContent: field.label }));
    const pair = el('div', { className: 'pn-longpair' });
    pair.appendChild(el('div', { className: 'pn-long-before', textContent: shown(field.before) }));
    pair.appendChild(el('div', { className: 'pn-long-after', textContent: shown(field.after) }));
    block.appendChild(pair);
    return block;
  }

  const row = el('div', { className: 'pn-field' });
  row.appendChild(el('span', { className: 'pn-field-label', textContent: field.label }));

  // before / arrow / after share one grid cell so they stay on a single line
  // and wrap together, rather than each claiming its own row.
  if (field.before !== null && field.before !== undefined
      || field.after !== null && field.after !== undefined) {
    const values = el('span', { className: 'pn-field-values' });
    values.appendChild(el('span', { className: 'pn-field-before', textContent: shown(field.before) }));
    values.appendChild(el('span', { className: 'pn-arrow-sm', textContent: '→' }));
    values.appendChild(el('span', { className: 'pn-field-after', textContent: shown(field.after) }));
    row.appendChild(values);
  }
  // Set-valued fields (spawn maps, NPCs, monsters, exits) list their members
  // as individually coloured chips rather than one run-on italic string.
  if (field.added?.length || field.removed?.length) {
    const chips = el('span', { className: 'pn-chips' });
    const add = (list, cls, sign) => (list || []).forEach((item) => {
      const labelled = typeof item === 'string'
        ? `${sign} ${item}` : { ...item, name: `${sign} ${item.name}` };
      chips.appendChild(buildChip(labelled, cls, field.tab, onNavigate));
    });
    add(field.added, 'pn-added', '+');
    add(field.removed, 'pn-removed', '−');
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

function buildEntry(entry, bucket, section, onNavigate) {
  const row = el('div', {
    className: `pn-entry ${bucket.cls}`,
    'data-pn-key': `${section.key}:${entry.id}`,
  });

  const head = el('div', { className: 'pn-entry-head' });
  head.appendChild(el('span', { className: `pn-sign ${bucket.cls}`, textContent: bucket.sign }));

  // makeThumbnail resolves the path per-dataset and swaps in a placeholder if
  // the asset is missing, so a bad path degrades rather than showing a broken image.
  if (entry.image) {
    head.appendChild(makeThumbnail(entry.image, `${entry.name} thumbnail`, {
      className: `pn-thumb pn-thumb-${section.key}`, fallbackText: '',
    }));
  }

  // Removed entries no longer exist in the current dataset, so there is
  // nothing to navigate to -- render those as plain text.
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
  head.appendChild(name);
  attachEntityTooltip(name, section.tab, entry.id);

  if (entry.id) {
    head.appendChild(makeCopyableId(`#${entry.id}`));
    // Composite key: ids are only unique within a section.
    head.appendChild(makeDeepLinkButton('patchnotes', `${section.key}:${entry.id}`));
  }
  (entry.badges || []).forEach((badge) => {
    head.appendChild(el('span', { className: 'badge badge-new', textContent: badge }));
  });
  row.appendChild(head);

  // Only meaningful for added/removed -- changed entries show a Description
  // field row instead, with both sides.
  if (entry.description && bucket.key !== 'changed') {
    row.appendChild(el('div', { className: 'pn-desc', textContent: entry.description }));
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
    row.appendChild(meta);
  }

  // Only on added/removed -- a changed skill reports its level deltas as
  // individual "Level N" diff rows instead.
  if (entry.levels?.length && bucket.key !== 'changed') {
    row.appendChild(buildLevelStats(entry.levels));
  }

  if (entry.fields?.length) {
    const fields = el('div', { className: 'pn-fields' });
    entry.fields.forEach((f) => fields.appendChild(buildFieldRow(f, onNavigate)));
    row.appendChild(fields);
  }
  return row;
}

// One continuous run of rows. Each carries its own sign and colour, so the
// change type reads per-entry without splitting the list into blocks.
function buildList(rows, section, onNavigate) {
  const list = el('div', { className: 'pn-list' });
  rows.forEach(({ entry, bucket }) =>
    list.appendChild(buildEntry(entry, bucket, section, onNavigate)));
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
function buildGroupedList(rows, section, onNavigate) {
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
      const list = buildList(groupRows, section, onNavigate);
      // Entries with no group of their own stay loose, above the blocks.
      if (!key) {
        wrap.appendChild(list);
        return;
      }
      // The rows are passed as a node rather than a builder, so they are in the
      // DOM even while the block is closed -- reveal() finds a deep-linked row
      // by query and then opens its block, which a lazy body would defeat.
      const block = makeCollapsible(key, groupRows.length, false, null, list);
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

function buildSectionBody(section, onNavigate) {
  const body = el('div', { className: 'pn-body' });

  if (section.note) {
    body.appendChild(el('div', { className: 'pn-note', textContent: section.note }));
  }

  const rows = [];
  BUCKETS.forEach((bucket) => {
    (section[bucket.key] || []).forEach((entry) => rows.push({ entry, bucket }));
  });
  const grouped = section.groups?.length || rows.some((r) => r.entry.group);
  body.appendChild(grouped
    ? buildGroupedList(rows, section, onNavigate)
    : buildList(rows, section, onNavigate));

  // The generator's --max-items can cap each bucket. Say so: a silently short
  // list is indistinguishable from a section that had nothing more to report.
  // Sections with a note already explain their own empty bucket.
  const counts = section.counts || {};
  const omitted = section.note ? [] : BUCKETS.map((bucket) => {
    const hidden = (counts[bucket.key] || 0) - (section[bucket.key] || []).length;
    return hidden > 0 ? `${hidden} more ${bucket.label.toLowerCase()}` : null;
  }).filter(Boolean);
  if (omitted.length) {
    body.appendChild(el('div', {
      className: 'pn-more',
      textContent: `Not listed: ${omitted.join(', ')}.`,
    }));
  }

  return body;
}

export function renderPatchNotes(notes, options = {}) {
  lookups = buildLookups(options.data);
  const frag = document.createDocumentFragment();
  const page = el('div', { className: 'patch-notes-page' });

  page.appendChild(el('div', { className: 'section-heading', textContent: 'Patch Notes' }));

  if (!notes) {
    page.appendChild(el('div', {
      className: 'empty-state',
      textContent: 'No patch notes are available for this dataset.',
    }));
    frag.appendChild(page);
    return frag;
  }

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

  const sectionsWrap = el('div', { className: 'pn-sections' });
  const sectionEls = new Map();
  notes.sections.forEach((section, i) => {
    const counts = section.counts || {};
    const total = BUCKETS.reduce((sum, b) => sum + (counts[b.key] || 0), 0);
    const collapsible = makeCollapsible(section.label, total, i === 0, null,
      () => buildSectionBody(section, onNavigate));

    collapsible.querySelector('.collapsible-header .left')?.appendChild(buildTally(counts));
    sectionEls.set(section.key, collapsible);
    sectionsWrap.appendChild(collapsible);
  });
  page.appendChild(sectionsWrap);

  // Deep link to a single row: "#patchnotes?q=id:<section>:<entryId>".
  // The section key is part of the key because entry ids are only unique
  // within a section (a map and a monster can share an id).
  const reveal = (collapsible, key) => {
    // Bodies render lazily on open, so expand first and let that frame commit
    // before looking for the row. Retry a couple of frames in case the body
    // hasn't been built yet.
    collapsible.classList.add('open');

    const attempt = (tries) => requestAnimationFrame(() => {
      // Compare attributes directly rather than building an escaped attribute
      // selector -- the keys contain colons, which need CSS escaping to be
      // matched reliably.
      const target = [...collapsible.querySelectorAll('[data-pn-key]')]
        .find((n) => n.getAttribute('data-pn-key') === key);
      if (!target) {
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
      document.querySelectorAll('.row-hotlink').forEach((r) => r.classList.remove('row-hotlink'));
      target.classList.add('row-hotlink');

      // NOT scrollToDetailRow: it waits for every <img> in the row to fire
      // load/error first, and our thumbnails are loading="lazy". An off-screen
      // lazy image never loads until it is scrolled into view, so that wait
      // deadlocks and the scroll never happens.
      const header = document.querySelector('.site-header');
      const offset = (header ? header.offsetHeight : 64) + 8;
      window.scrollTo({
        top: window.scrollY + target.getBoundingClientRect().top - offset,
        behavior: 'smooth',
      });
    });
    attempt(3);
  };

  const goToEntry = (query) => {
    const raw = String(query || '').trim().replace(/^id\s*:\s*/i, '');
    if (!raw) return;

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

  options.setNavigate?.(goToEntry);
  const initial = options.initialParams?.get?.('q');
  if (initial) goToEntry(initial);

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
