import { el, makeThumbnail, tabHref } from './utils.js';
import { ICONS } from './config.js';

export const GLOBAL_SEARCH_CATEGORIES = [
  { id: 'monsters', label: 'Monsters', collection: 'Bestiary', tabId: 'monsters', fallback: 'MOB' },
  { id: 'maps', label: 'Maps', collection: 'Atlas', tabId: 'maps', fallback: 'MAP' },
  { id: 'skills', label: 'Skills', collection: 'Skill Book', tabId: 'skills', fallback: 'SKL' },
  { id: 'items', label: 'Items', collection: 'Inventory', tabId: 'items', fallback: 'ITM' },
  { id: 'equipment', label: 'Equipment', collection: 'Armory', tabId: 'equipment', fallback: 'EQP' },
  { id: 'crafting', label: 'Recipes', collection: 'Crafting Bench', tabId: 'crafting', fallback: 'RCP' },
  { id: 'quests', label: 'Quests', collection: 'Quest Log', tabId: 'quests', fallback: 'QST' },
  { id: 'cashshop', label: 'Cash Shop', collection: 'Cash Shop', tabId: 'cashshop', fallback: 'NX' },
  { id: 'beauty', label: 'Beauty', collection: 'Salon', tabId: 'beauty', fallback: 'STY' },
];

const CATEGORY_META = new Map(GLOBAL_SEARCH_CATEGORIES.map((category) => [category.id, category]));

function normalized(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function shortText(value, maxLength = 110) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function joinParts(parts) {
  return parts.filter(Boolean).join(' · ');
}

function itemThumb(id) {
  const number = Number(id);
  return Number.isFinite(number) ? `images/items/${String(number).padStart(8, '0')}.png` : '';
}

function addRecord(index, record, supporting = []) {
  if (record.entityId == null || !record.title || !CATEGORY_META.has(record.category)) return;
  const id = String(record.entityId);
  const searchFields = [
    { value: record.title, weight: 0, kind: 'name' },
    { value: id, weight: 1, kind: 'id' },
    { value: `id:${id}`, weight: 1, kind: 'id' },
    ...supporting
      .flat(Infinity)
      .filter((value) => value != null && value !== '')
      .map((value) => ({ value: String(value), weight: 3, kind: 'supporting' })),
  ];
  index.push(Object.freeze({
    category: record.category,
    tabId: record.tabId || CATEGORY_META.get(record.category).tabId,
    entityId: id,
    title: String(record.title),
    subtitle: shortText(record.subtitle || ''),
    thumbnail: record.thumbnail || '',
    searchFields: Object.freeze(searchFields),
  }));
}

function getNpcLookup(maps) {
  if (maps?.npc_lookup instanceof Map) return maps.npc_lookup;
  return new Map(Object.entries(maps?.npc_lookup || {}).map(([id, npc]) => [Number(id), npc]));
}

function getSkillClasses(skills) {
  return Object.values(skills || {})
    .filter(Array.isArray)
    .flat()
    .filter((entry) => entry && Array.isArray(entry.skills));
}

function getRecipes(recipes) {
  const flattened = [];
  for (const discipline of recipes?.disciplines || []) {
    for (const outputType of discipline.output_types || []) {
      for (const level of outputType.levels || []) {
        for (const recipe of level.recipes || []) {
          flattened.push({ recipe, discipline, outputType, level });
        }
      }
    }
  }
  return flattened;
}

/**
 * Build once per loaded patch. Records deliberately carry only the text and
 * presentation data needed by the Overview combobox, so the index does not
 * retain renderer-specific DOM or state.
 */
export function buildGlobalSearchIndex(data) {
  const index = [];
  const mapMonsterNames = new Map();
  const monsters = data?.monsters?.monsters || [];

  for (const monster of monsters) {
    const locations = (monster.maps || []).map((map) => map.name).filter(Boolean);
    addRecord(index, {
      category: 'monsters',
      entityId: monster.id,
      title: monster.name,
      subtitle: joinParts([
        monster.level != null ? `Lv. ${monster.level}` : '',
        locations.length ? `Found in ${locations.slice(0, 2).join(', ')}${locations.length > 2 ? ` +${locations.length - 2}` : ''}` : 'No known habitat',
      ]),
      thumbnail: monster.thumbnail ? `./data/images/monsters/${monster.thumbnail}.png` : '',
    }, locations);

    for (const map of monster.maps || []) {
      if (!mapMonsterNames.has(String(map.id))) mapMonsterNames.set(String(map.id), []);
      mapMonsterNames.get(String(map.id)).push(monster.name);
    }
  }

  const npcLookup = getNpcLookup(data?.maps);
  const npcByName = new Map();
  for (const npc of npcLookup.values()) {
    if (npc?.name) npcByName.set(normalized(npc.name), npc);
  }

  for (const region of data?.maps?.regions || []) {
    for (const map of region.maps || []) {
      const mobNames = mapMonsterNames.get(String(map.id)) || [];
      const npcNames = (map.npcs || []).map((id) => npcLookup.get(Number(id))?.name).filter(Boolean);
      addRecord(index, {
        category: 'maps',
        entityId: map.id,
        title: map.name,
        subtitle: joinParts([
          map.street_name,
          map.region || region.region,
          mobNames.length ? `${mobNames.length} monster${mobNames.length === 1 ? '' : 's'}` : '',
          npcNames.length ? `${npcNames.length} NPC${npcNames.length === 1 ? '' : 's'}` : '',
        ]),
        thumbnail: map.thumbnail || map.minimap || '',
      }, [map.street_name, map.region || region.region, mobNames, npcNames]);
    }
  }

  for (const skillClass of getSkillClasses(data?.skills)) {
    for (const skill of skillClass.skills || []) {
      const mechanicValues = skill.mechanics && typeof skill.mechanics === 'object'
        ? Object.values(skill.mechanics)
        : [skill.mechanics];
      const classNames = [skill.class_name, skill.job, skillClass.class_name, skillClass.main_class];
      const previewDescription = String(skill.description || '')
        .replace(/^\s*\[Master Level:\s*\d+\]\s*/i, '')
        .trim();
      addRecord(index, {
        category: 'skills',
        entityId: skill.id,
        title: skill.name,
        subtitle: joinParts([
          skill.class_name || skillClass.class_name,
          shortText(previewDescription, 82),
        ]),
        thumbnail: skill.thumbnail || '',
      }, [skill.description, classNames, mechanicValues, skill.all_level_stats, skill.item_consume]);
    }
  }

  for (const item of data?.items?.items || []) {
    const isEquipment = item.category === 'Equipment';
    addRecord(index, {
      category: isEquipment ? 'equipment' : 'items',
      entityId: item.id,
      title: item.name,
      subtitle: joinParts([
        item.weapon_type || item.sub_category || item.category,
        shortText(item.description, 76),
      ]),
      thumbnail: item.thumbnail || itemThumb(item.id),
    }, [item.description]);
  }

  for (const scroll of data?.items?.scrolls || []) {
    addRecord(index, {
      category: 'items',
      entityId: scroll.id,
      title: scroll.name,
      subtitle: joinParts([scroll.equip_slot && `${scroll.equip_slot} scroll`, shortText(scroll.description, 76)]),
      thumbnail: scroll.thumbnail || itemThumb(scroll.id),
    }, [scroll.description]);
  }

  for (const { recipe, discipline, outputType, level } of getRecipes(data?.recipes)) {
    const ingredients = (recipe.ingredients || []).map((ingredient) => ingredient.item_name).filter(Boolean);
    addRecord(index, {
      category: 'crafting',
      entityId: recipe.output_id,
      title: recipe.result_item_name,
      subtitle: joinParts([
        discipline.discipline,
        level.level != null ? `Lv. ${level.level}` : '',
        ingredients.length ? `Needs ${ingredients.slice(0, 2).join(', ')}${ingredients.length > 2 ? ` +${ingredients.length - 2}` : ''}` : '',
      ]),
      thumbnail: itemThumb(recipe.output_id),
    }, [ingredients, outputType.output_type]);
  }

  for (const quest of data?.quests?.quests || []) {
    const rewardNames = [
      quest.rewards_items,
      ...(quest.rewards || []).map((reward) => reward.name || reward.item_name || reward.label),
    ].filter(Boolean);
    const npc = npcByName.get(normalized(quest.npc_name));
    addRecord(index, {
      category: 'quests',
      entityId: quest.id,
      title: quest.name,
      subtitle: joinParts([
        quest.npc_name && `From ${quest.npc_name}`,
        quest.region,
        rewardNames.length ? `Rewards ${shortText(rewardNames[0], 46)}` : '',
      ]),
      thumbnail: quest.thumbnail || npc?.thumbnail || '',
    }, [quest.description, quest.npc_name, quest.region, rewardNames]);
  }

  for (const category of data?.cashShop?.categories || []) {
    for (const item of category.items || []) {
      addRecord(index, {
        category: 'cashshop',
        entityId: item.id,
        title: item.name,
        subtitle: joinParts([
          item.sub_category || item.category || category.category,
          item.price != null ? `${Number(item.price).toLocaleString()} NX` : '',
          shortText(item.description, 66),
        ]),
        thumbnail: item.thumbnail || itemThumb(item.id),
      }, [item.description]);
    }
  }

  for (const type of ['hair', 'face']) {
    for (const style of data?.beauty_coupons?.[type] || []) {
      addRecord(index, {
        category: 'beauty',
        entityId: style.id,
        title: style.name,
        subtitle: joinParts([
          `${type === 'hair' ? 'Hair' : 'Face'} style`,
          style.gender ? `${style.gender[0].toUpperCase()}${style.gender.slice(1)}` : '',
          `#${style.id}`,
        ]),
        thumbnail: style.thumbnail || '',
      }, [style.gender, type]);
    }
  }

  return Object.freeze(index);
}

function scoreRecord(record, query) {
  const title = normalized(record.title);
  if (title === query) return 0;
  if (title.startsWith(query)) return 100 + Math.min(title.length - query.length, 50);
  const titlePosition = title.indexOf(query);
  if (titlePosition !== -1) return 200 + Math.min(titlePosition, 50);

  let score = Infinity;
  for (const field of record.searchFields || []) {
    if (field.kind === 'name') continue;
    const value = normalized(field.value);
    if (!value) continue;
    const position = value.indexOf(query);
    if (position === -1) continue;
    if (field.kind === 'id') {
      score = Math.min(score, value === query ? 25 : 250 + Math.min(position, 60));
    } else {
      score = Math.min(score, field.weight * 100 + Math.min(position, 60));
    }
  }
  return score;
}

export function searchGlobalIndex(index, rawQuery) {
  const query = normalized(rawQuery);
  if (query.length < 2) return [];
  return (index || [])
    .map((record, order) => ({ record, order, score: scoreRecord(record, query) }))
    .filter((match) => Number.isFinite(match.score))
    .sort((a, b) => a.score - b.score
      || a.record.title.localeCompare(b.record.title, undefined, { sensitivity: 'base' })
      || a.order - b.order)
    .map((match) => match.record);
}

function groupMatches(matches) {
  const grouped = new Map();
  for (const record of matches) {
    if (!grouped.has(record.category)) grouped.set(record.category, []);
    grouped.get(record.category).push(record);
  }
  return GLOBAL_SEARCH_CATEGORIES
    .filter((category) => grouped.has(category.id))
    .map((category) => ({ category, records: grouped.get(category.id) }));
}

export function renderGlobalSearch(index, options = {}) {
  const minLength = options.minLength ?? 2;
  const perCategory = options.perCategory ?? 5;
  const root = el('section', { className: 'global-search', 'aria-label': 'Search this datamine' });
  const externalEvents = new AbortController();
  const heading = el('div', { className: 'global-search__heading' });
  heading.appendChild(el('span', { className: 'global-search__eyebrow', textContent: 'Datamine index' }));
  heading.appendChild(el('span', { className: 'global-search__scope', textContent: 'Bestiary · Atlas · Inventory · Quest Log · more' }));

  const combobox = el('div', { className: 'global-search__combobox' });
  const inputWrap = el('div', { className: 'global-search__input-wrap' });
  const searchIcon = el('span', { className: 'global-search__icon', 'aria-hidden': 'true' });
  searchIcon.innerHTML = ICONS.search;
  const input = el('input', {
    className: 'global-search__input',
    type: 'search',
    placeholder: 'Search the datamine…',
    autocomplete: 'off',
    spellcheck: 'false',
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': 'globalSearchResults',
    'aria-describedby': 'globalSearchHint',
  });
  const shortcut = el('span', { className: 'global-search__shortcut', 'aria-hidden': 'true', textContent: '2+ letters' });
  const clear = el('button', { className: 'global-search__clear', type: 'button', 'aria-label': 'Clear search' });
  clear.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  clear.hidden = true;
  inputWrap.append(searchIcon, input, shortcut, clear);

  const hint = el('div', {
    id: 'globalSearchHint',
    className: 'global-search__hint',
    textContent: 'Type a name, location, NPC, ingredient, reward, mechanic, or ID.',
  });
  const status = el('div', { className: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const panel = el('div', { id: 'globalSearchResults', className: 'global-search__panel', role: 'listbox' });
  panel.hidden = true;
  combobox.append(inputWrap, hint, status, panel);
  root.append(heading, combobox);

  let activeIndex = -1;
  let optionLinks = [];

  function fitPanelToViewport() {
    if (panel.hidden) return;
    const available = window.innerHeight - panel.getBoundingClientRect().top - 12;
    panel.style.maxHeight = `${Math.max(120, Math.min(680, available))}px`;
  }

  function setOpen(open) {
    panel.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    root.classList.toggle('global-search--open', open);
    if (open) fitPanelToViewport();
    if (!open) setActive(-1);
  }

  function setActive(next) {
    optionLinks.forEach((link, index_) => {
      const active = index_ === next;
      link.classList.toggle('global-search__result--active', active);
      link.setAttribute('aria-selected', String(active));
    });
    activeIndex = next;
    const active = optionLinks[activeIndex];
    if (active) {
      input.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function render() {
    const query = input.value.trim();
    clear.hidden = !input.value;
    shortcut.hidden = Boolean(input.value);
    panel.innerHTML = '';
    optionLinks = [];
    setActive(-1);

    if (normalized(query).length < minLength) {
      status.textContent = '';
      setOpen(false);
      return;
    }

    const matches = searchGlobalIndex(index, query);
    const groups = groupMatches(matches);
    if (!matches.length) {
      const empty = el('div', { className: 'global-search__empty' });
      empty.appendChild(el('span', { className: 'global-search__empty-mark', 'aria-hidden': 'true', textContent: '?' }));
      const copy = el('div');
      copy.appendChild(el('strong', { textContent: 'No records found in this patch' }));
      copy.appendChild(el('span', { textContent: `Try another name, location, or ID for “${query}”.` }));
      empty.appendChild(copy);
      panel.appendChild(empty);
      status.textContent = `No matches for ${query}.`;
      setOpen(true);
      return;
    }

    let optionNumber = 0;
    for (const { category, records } of groups) {
      const group = el('div', { className: 'global-search__group', role: 'group', 'aria-label': category.label });
      const groupHead = el('div', { className: 'global-search__group-head' });
      const label = el('div', { className: 'global-search__group-title' });
      label.appendChild(el('span', { className: `global-search__collection global-search__collection--${category.id}`, textContent: category.collection }));
      label.appendChild(el('span', { textContent: category.label }));
      groupHead.appendChild(label);
      groupHead.appendChild(el('span', { className: 'global-search__count', textContent: `${records.length} match${records.length === 1 ? '' : 'es'}` }));
      group.appendChild(groupHead);

      for (const record of records.slice(0, perCategory)) {
        const link = el('a', {
          id: `globalSearchOption${optionNumber++}`,
          className: 'global-search__result tab-link',
          href: tabHref(record.tabId, `id:${record.entityId}`),
          role: 'option',
          'aria-selected': 'false',
        });
        const categoryMeta = CATEGORY_META.get(record.category);
        link.appendChild(makeThumbnail(record.thumbnail, `${record.title} thumbnail`, {
          className: 'global-search__thumb',
          fallbackText: categoryMeta?.fallback || 'DAT',
        }));
        const resultCopy = el('span', { className: 'global-search__result-copy' });
        const titleRow = el('span', { className: 'global-search__result-title-row' });
        titleRow.appendChild(el('span', { className: 'global-search__result-title', textContent: record.title }));
        titleRow.appendChild(el('span', { className: `global-search__type global-search__type--${record.category}`, textContent: categoryMeta?.label || record.category }));
        resultCopy.appendChild(titleRow);
        resultCopy.appendChild(el('span', { className: 'global-search__result-subtitle', textContent: record.subtitle || `#${record.entityId}` }));
        link.appendChild(resultCopy);
        link.appendChild(el('span', { className: 'global-search__arrow', 'aria-hidden': 'true', textContent: '→' }));
        link.addEventListener('mousemove', () => setActive(optionLinks.indexOf(link)));
        link.addEventListener('click', () => setOpen(false));
        optionLinks.push(link);
        group.appendChild(link);
      }

      const allLink = el('a', {
        className: 'global-search__all tab-link',
        href: tabHref(category.tabId, query),
        textContent: `See all ${records.length} ${category.label.toLowerCase()} match${records.length === 1 ? '' : 'es'}`,
      });
      allLink.addEventListener('click', () => setOpen(false));
      group.appendChild(allLink);
      panel.appendChild(group);
    }

    status.textContent = `${matches.length} matches across ${groups.length} categories.`;
    setOpen(true);
  }

  input.addEventListener('input', render);
  input.addEventListener('focus', () => {
    if (normalized(input.value).length >= minLength) render();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!panel.hidden) {
        event.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (panel.hidden) render();
      if (!optionLinks.length) return;
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const next = activeIndex === -1
        ? (delta > 0 ? 0 : optionLinks.length - 1)
        : (activeIndex + delta + optionLinks.length) % optionLinks.length;
      setActive(next);
      return;
    }
    if (event.key === 'Enter' && !panel.hidden && optionLinks.length) {
      event.preventDefault();
      optionLinks[activeIndex === -1 ? 0 : activeIndex].click();
    }
  });
  clear.addEventListener('click', () => {
    input.value = '';
    render();
    input.focus();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!root.contains(event.target)) setOpen(false);
  }, { signal: externalEvents.signal });
  window.addEventListener('resize', fitPanelToViewport, { passive: true, signal: externalEvents.signal });
  window.addEventListener('scroll', fitPanelToViewport, { passive: true, signal: externalEvents.signal });

  // Overview panels are deliberately discarded when another tab opens. Stop
  // the document/window listeners with the panel instead of accumulating them
  // each time somebody returns to Overview.
  let wasConnected = false;
  const removalObserver = new MutationObserver(() => {
    if (root.isConnected) {
      wasConnected = true;
    } else if (wasConnected) {
      externalEvents.abort();
      removalObserver.disconnect();
    }
  });
  removalObserver.observe(document.body, { childList: true, subtree: true });

  return root;
}
