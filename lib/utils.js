// Shows a persistent banner at bottom-left when a tab loads with a filter hotlink.
// onClear() is called when the user dismisses it or clicks Clear.
export function showFilterBanner(label, onClear) {
  const existing = document.getElementById('filterActiveBanner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'filterActiveBanner';
  banner.className = 'filter-active-banner';

  const text = document.createElement('span');
  text.className = 'filter-active-banner__text';
  text.innerHTML = `Filter: <strong>${label}</strong>`;

  const clearBtn = document.createElement('button');
  clearBtn.className = 'filter-active-banner__clear';
  clearBtn.textContent = 'Clear';
  clearBtn.addEventListener('click', () => {
    banner.remove();
    onClear();
  });

  banner.appendChild(text);
  banner.appendChild(clearBtn);
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('filter-active-banner--visible'));
}

export function hideFilterBanner() {
  document.getElementById('filterActiveBanner')?.remove();
}

// Reusable pill group (filter buttons)
// pills: [{label, value}], activeValue: string, onChange: fn, options: {groupLabel?: string, className?: string}
// Returns element with setActive(value) to update active pill without recreation.
export function makePillGroup(pills, activeValue, onChange, options = {}) {
  const { groupLabel = '', className = '' } = options;
  const group = el('div', { className: `pill-group${className ? ' ' + className : ''}` });
  if (groupLabel) {
    group.appendChild(el('span', { className: 'pill-group-label', textContent: groupLabel }));
  }
  pills.forEach(({ label, value, className: pillClass }) => {
    const pill = el('button', {
      className: `pill${activeValue === value ? ' active' : ''}${pillClass ? ' ' + pillClass : ''}`,
      textContent: label,
    });
    pill._pillValue = value;
    pill.addEventListener('click', () => onChange(value));
    group.appendChild(pill);
  });
  group.setActive = (value) => {
    group.querySelectorAll('button.pill').forEach((p) => {
      if ('_pillValue' in p) p.classList.toggle('active', p._pillValue === value);
    });
  };
  return group;
}

// Collapses dense filter controls behind one compact, in-flow disclosure on
// phones. The wrapper remains transparent on desktop, so tabs keep their
// existing layouts and can continue replacing filter groups dynamically.
export function enableMobileFilterDrawer(toolbar, options = {}) {
  const { keep = [], label = 'Filters' } = options;
  toolbar.classList.add('mobile-filter-toolbar');
  keep.filter(Boolean).forEach((node) => node.classList.add('mobile-filter-keep'));

  const iconNode = el('span', {
    className: 'mobile-filter-toggle__icon',
    'aria-hidden': 'true',
  });
  iconNode.innerHTML = ICONS.filter;
  const labelNode = el('span', {
    className: 'mobile-filter-toggle__label',
    textContent: label,
  });
  const statusNode = el('span', {
    className: 'mobile-filter-toggle__status',
    textContent: 'Default view',
  });
  const chevron = el('span', {
    className: 'mobile-filter-toggle__chevron',
    'aria-hidden': 'true',
  });
  const toggle = el('button', {
    className: 'mobile-filter-toggle',
    type: 'button',
    'aria-expanded': 'false',
    'aria-label': `Toggle ${label.toLowerCase()}`,
  }, iconNode, labelNode, statusNode, chevron);

  const firstFilter = [...toolbar.children].find(
    (node) => !node.classList.contains('mobile-filter-keep')
  );
  toolbar.insertBefore(toggle, firstFilter || null);

  function isStructurallyHidden(node) {
    for (let current = node.parentElement; current && current !== toolbar; current = current.parentElement) {
      if (current.classList.contains('hidden') || current.style.display === 'none') return true;
    }
    return false;
  }

  function refresh() {
    const selections = [];
    toolbar.querySelectorAll('.pill-group').forEach((group) => {
      const buttons = [...group.querySelectorAll('button.pill')];
      const active = buttons.find((button) => button.classList.contains('active'));
      if (active && active !== buttons[0] && !isStructurallyHidden(active)) {
        selections.push(active.textContent.trim());
      }
    });
    toolbar.querySelectorAll('.hide-toggle.active').forEach((button) => {
      if (!isStructurallyHidden(button)) selections.push(button.textContent.trim());
    });
    const columnCount = toolbar.querySelectorAll('.col-toggle.active').length;
    if (columnCount) selections.push(`${columnCount} cols`);

    const nextStatus = selections.length ? selections.join(' · ') : 'Default view';
    if (statusNode.textContent !== nextStatus) statusNode.textContent = nextStatus;
    toggle.classList.toggle('has-active-filter', selections.length > 0);
  }

  function setOpen(open) {
    toolbar.classList.toggle('mobile-filters-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }

  toggle.addEventListener('click', () => {
    setOpen(!toolbar.classList.contains('mobile-filters-open'));
  });

  let refreshQueued = false;
  const observer = new MutationObserver(() => {
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      refresh();
    });
  });
  observer.observe(toolbar, {
    attributes: true,
    attributeFilter: ['class', 'style'],
    childList: true,
    subtree: true,
  });
  refresh();

  return { refresh, setOpen, toggle };
}

// Wires up a search box + setNavigate handler in one call.
// Appends the search box to container; returns it for direct input access.
export function wireSearch(container, placeholder, options, onChange, onDeeplink = null) {
  const searchBox = makeSearchBox(placeholder, onChange);
  container.appendChild(searchBox);
  if (options.setNavigate) {
    options.setNavigate((query) => {
      const exactId = typeof query === 'string' ? parseIdFilter(query) : null;
      if (onDeeplink && exactId != null) {
        searchBox._input.value = '';
        searchBox._sync();
        onChange('');
        onDeeplink(exactId);
      } else {
        searchBox._input.value = typeof query === 'string' ? query : '';
        searchBox._sync();
        onChange(typeof query === 'string' ? query : String(query || ''));
      }
      window.scrollTo(0, 0);
    });
  }
  return searchBox;
}

// Toggle button with a checkmark indicator, styled via .hide-toggle CSS classes.
export function makeHideToggle(label, isActive, onChange) {
  const check = el('span', { className: 'hide-toggle-check', textContent: isActive ? '✓' : '' });
  const btn = el('button', { className: `hide-toggle${isActive ? ' active' : ''}` });
  btn.appendChild(check);
  btn.appendChild(document.createTextNode(label));
  btn.addEventListener('click', () => {
    isActive = !isActive;
    btn.classList.toggle('active', isActive);
    check.textContent = isActive ? '✓' : '';
    onChange(isActive);
  });
  return btn;
}
import { getDataBase } from './data.js';

export const padItemId  = (id) => String(id).padStart(8, '0');
export const padMobId   = (id) => String(id).padStart(7, '0');
export const padMapId   = (id) => String(id).padStart(9, '0');
export const padSkillId = (id) => String(id).padStart(7, '0');
export const padQuestId = (id) => String(id).padStart(6, '0');

export function toItemThumbPath(itemId) {
  const n = Number(itemId);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `images/items/${padItemId(n)}.png`;
}

export function toMobThumbPath(mobId) {
  const n = Number(mobId);
  if (!Number.isFinite(n) || n < 0) return '';
  return `images/monsters/${padMobId(n)}.png`;
}

// Parse "id:123" filter from search query
export function parseIdFilter(query) {
  const match = /^id\s*:\s*(\d+)\s*$/i.exec((query || '').trim());
  if (!match) return null;
  return Number(match[1]);
}
import { ICONS } from './config.js';

// Deep link to another tab, mirroring Router's "#<tab>?<params>" hash format and
// preserving the ?patch= dataset selector that lives in the search string.
// `target` is either a search query ("id:0100100") or a map of filter params.
export function tabHref(tabId, target = null) {
  const { pathname, search } = window.location;
  let qs = '';
  if (typeof target === 'string' && target) {
    qs = `?q=${encodeURIComponent(target)}`;
  } else if (target && typeof target === 'object') {
    const params = new URLSearchParams(
      Object.entries(target).filter(([, v]) => v != null && v !== '')
    ).toString();
    if (params) qs = `?${params}`;
  }
  return `${pathname}${search}#${tabId}${qs}`;
}

// Wires a deep-link anchor so a plain left-click navigates in-page, while
// ctrl/cmd/shift/middle-click and "Open in new tab" fall through to the browser.
// `stopPropagation` runs for every button so a modifier-click on a link inside a
// clickable row opens the new tab without also toggling that row.
export function onLinkActivate(anchor, onActivate, options = {}) {
  const { stopPropagation = false, capture = false } = options;
  anchor.addEventListener('click', (event) => {
    if (stopPropagation) event.stopPropagation();
    if (event.defaultPrevented || event.button !== 0
        || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onActivate(event);
  }, capture);
  return anchor;
}

// An <a> carrying a real href to another tab, so it can be opened in a new tab.
// It keeps whatever chip/card class it is given; `.tab-link` only strips the
// browser's default link colour and underline.
// Without `onActivate` a plain click just follows the href, which the Router
// picks up as an in-page hash change.
export function makeTabLink(tabId, target, options = {}) {
  const { className = '', title = '', onActivate = null, stopPropagation = false, capture = false } = options;
  const anchor = el('a', {
    className: `tab-link${className ? ` ${className}` : ''}`,
    href: tabHref(tabId, target),
  });
  if (title) anchor.title = title;
  if (onActivate) {
    onLinkActivate(anchor, onActivate, { stopPropagation, capture });
  } else if (stopPropagation) {
    anchor.addEventListener('click', (e) => e.stopPropagation(), capture);
  }
  return anchor;
}

export function makeDeepLinkButton(tabId, itemId) {
  const btn = el('button', { className: 'deep-link-btn', title: 'Copy link' });
  btn.innerHTML = ICONS.copy;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const base = window.location.href.split('#')[0];
    const url = `${base}#${tabId}?q=${encodeURIComponent('id:' + itemId)}`;
    const done = () => {
      btn.innerHTML = ICONS.check;
      btn.classList.add('deep-link-btn--copied');
      setTimeout(() => {
        btn.innerHTML = ICONS.copy;
        btn.classList.remove('deep-link-btn--copied');
      }, 1500);
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(done).catch(done);
    } else {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      ta.remove();
      done();
    }
  });

  return btn;
}

// Scrolls a row to just below whatever is pinned at the top of the viewport
// (site header, plus a sticky toolbar if the tab has one).
function scrollRowToTop(row) {
  // Count the header even while it's slid away: a smooth scroll upwards brings
  // it back mid-flight, and it would land on top of the row we just revealed.
  const header = document.querySelector('.site-header');
  const headerHeight = header ? header.offsetHeight : 64;
  const toolbar = [...document.querySelectorAll('.sticky-toolbar')].find((t) => t.offsetParent);
  const toolbarHeight = toolbar ? toolbar.offsetHeight : 0;
  // The row's own table head pins under those two, so it eats the same space.
  const thead = row.closest('table')?.tHead;
  const theadHeight = thead && getComputedStyle(thead.rows[0] || thead).position === 'sticky'
    ? thead.offsetHeight
    : 0;
  const offset = Math.max(headerHeight + toolbarHeight + theadHeight, 64);
  window.scrollTo({ top: window.scrollY + row.getBoundingClientRect().top - offset, behavior: 'smooth' });
}

export function autoExpandById(container, id, rowSelector = 'tr') {
  setTimeout(() => {
    for (const row of container.querySelectorAll(rowSelector)) {
      const idCell = row.querySelector('.id');
      if (idCell && Number(idCell.textContent.replace(/^#/, '')) === id) {
        container.querySelectorAll('.row-hotlink').forEach(r => r.classList.remove('row-hotlink'));
        row.click();
        row.classList.add('row-hotlink');
        // Scroll directly, don't wait for lazy images.
        requestAnimationFrame(() => scrollRowToTop(row));
        break;
      }
    }
  }, 300);
}

export function scrollToDetailRow(row, detailRow) {
  const scroll = () => {
    requestAnimationFrame(() => scrollRowToTop(row));
  };
  const imgs = detailRow.querySelectorAll('img');
  if (imgs.length === 0) { scroll(); return; }
  let loaded = 0, fired = false;
  imgs.forEach(img => {
    if (img.complete) {
      loaded++;
    } else {
      const done = () => { loaded++; if (loaded === imgs.length && !fired) { fired = true; scroll(); } };
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }
  });
  if (loaded === imgs.length && !fired) { fired = true; scroll(); }
}

export function makeCopyableId(text, extraClass = '') {
  const span = el('span', {
    className: 'id' + (extraClass ? ' ' + extraClass : ''),
    textContent: text,
    title: 'Click to copy',
  });
  span.addEventListener('click', (e) => {
    e.stopPropagation();
    const done = () => {
      span.classList.add('id--copied');
      setTimeout(() => span.classList.remove('id--copied'), 1000);
      const rect = span.getBoundingClientRect();
      const tip = document.createElement('div');
      tip.className = 'copy-tip';
      tip.textContent = 'Copied!';
      tip.style.left = `${rect.left + rect.width / 2}px`;
      tip.style.top = `${rect.top}px`;
      document.body.appendChild(tip);
      tip.addEventListener('animationend', () => tip.remove());
    };
    const copyText = String(text).replace(/^#/, '');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(copyText).then(done).catch(done);
    } else {
      const ta = document.createElement('textarea');
      ta.value = copyText;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      ta.remove();
      done();
    }
  });
  return span;
}

export function el(tag, attrs, ...children) {
  const element = document.createElement(tag);

  if (attrs) {
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'className') {
        element.className = value;
      } else if (key === 'innerHTML') {
        element.innerHTML = value;
      } else if (key === 'textContent') {
        element.textContent = value;
      } else if (key.startsWith('on')) {
        element.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(element.style, value);
      } else if (key === 'title') {
        element.title = value;
      } else {
        element.setAttribute(key, value);
      }
    });
  }

  children.forEach((child) => {
    if (child == null) return;
    if (typeof child === 'string' || typeof child === 'number') {
      element.appendChild(document.createTextNode(child));
    } else if (Array.isArray(child)) {
      child.forEach((nestedChild) => {
        if (nestedChild) element.appendChild(nestedChild);
      });
    } else {
      element.appendChild(child);
    }
  });

  return element;
}

// Element badge shared by the mobs table, the mob detail header and the mob
// tooltip so all three read identically. Takes a descriptor from
// describeElements() in constants.js.
export function makeElementBadge(elem) {
  return el(
    'span',
    { className: `elem-badge elem-attr ${elem.cls}`, title: elem.title },
    el('span', { className: 'elem-emoji', textContent: elem.emoji }),
    el('span', { className: 'elem-name', textContent: elem.name }),
    el('span', { className: 'elem-effect', textContent: elem.effect })
  );
}

export function $(selector, context) {
  return (context || document).querySelector(selector);
}

export function $$(selector, context) {
  return [...(context || document).querySelectorAll(selector)];
}

export function fmt(value) {
  return typeof value === 'number' ? value.toLocaleString() : value;
}

export function makeDetailPanel(chips, options = {}) {
  const { noBorder = false } = options;
  if (!Array.isArray(chips) || chips.length === 0) return null;

  const panel = el('div', {
    className: `item-detail-panel${noBorder ? ' item-detail-panel--no-border' : ''}`,
  });
  const row = el('div', { className: 'item-detail-chips' });

  chips.forEach(({ label, value }) => {
    const chip = el('div', { className: 'item-detail-chip' });
    chip.appendChild(el('span', { className: 'chip-label', textContent: label }));
    chip.appendChild(el('span', { className: 'chip-value', textContent: value }));
    row.appendChild(chip);
  });

  panel.appendChild(row);
  return panel;
}

// Builds a predicate for a search query. A query wrapped in slashes ("/^Red/i") is
// treated as a regex; anything else stays a plain case-insensitive substring match,
// since item names are full of regex metacharacters ("Red Whip (Lv. 30)", "Max HP +10%").
// Returns { test, isRegex, error }; an invalid pattern matches nothing rather than throwing.
//
// Single-entry memo: matchSearch runs per row per field, so recompiling the pattern on
// every call would mean tens of thousands of RegExp constructions per keystroke.
const _matcherCache = { key: null, value: null };

export function makeMatcher(query) {
  const raw = (query || '').trim();
  if (_matcherCache.key === raw) return _matcherCache.value;

  let matcher;
  const slashed = /^\/(.+)\/([a-z]*)$/s.exec(raw);
  if (!raw) {
    matcher = { test: () => true, isRegex: false, error: null };
  } else if (slashed) {
    // Drop g/y: their stateful lastIndex makes re.test() alternate across rows in a filter.
    const flags = [...new Set((slashed[2] + 'i').split(''))].filter((f) => 'imsu'.includes(f)).join('');
    try {
      const re = new RegExp(slashed[1], flags);
      matcher = { test: (t) => t != null && t !== '' && re.test(String(t)), isRegex: true, error: null };
    } catch (e) {
      matcher = { test: () => false, isRegex: true, error: e.message };
    }
  } else {
    const lower = raw.toLowerCase();
    matcher = { test: (t) => !!t && String(t).toLowerCase().includes(lower), isRegex: false, error: null };
  }

  _matcherCache.key = raw;
  _matcherCache.value = matcher;
  return matcher;
}

export function matchSearch(text, query) {
  return makeMatcher(query).test(text);
}

export function makeSVG(svgString) {
  const template = document.createElement('template');
  template.innerHTML = svgString.trim();
  return template.content.firstChild || document.createTextNode('');
}

export function makeSearchBox(placeholder, onInput) {
  const box = el('div', { className: 'search-box' });
  const iconSpan = el('span', { className: 'search-icon' });
  iconSpan.appendChild(makeSVG(ICONS.search));
  iconSpan.appendChild(el('span', { className: 'search-icon-regex', textContent: '.*' }));
  box.appendChild(iconSpan);

  const baseTitle = 'Wrap the query in slashes for a regex, e.g. /^Red.*Whip$/';
  const input = el('input', { type: 'text', placeholder, title: baseTitle });

  const clearBtn = el('button', { className: 'search-clear', type: 'button', title: 'Clear' });
  clearBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  // Reflect regex / invalid-pattern state on the box so an incomplete pattern
  // ("/foo(") reads as a typo rather than as "nothing matched".
  const syncMatcherState = () => {
    const { isRegex, error } = makeMatcher(input.value);
    box.classList.toggle('search-box--regex', isRegex && !error);
    box.classList.toggle('search-box--invalid', !!error);
    input.title = error ? `Invalid regex: ${error}` : baseTitle;
  };

  let _debounce;
  input.addEventListener('input', () => {
    syncMatcherState();
    clearTimeout(_debounce);
    _debounce = setTimeout(() => onInput(input.value), 150);
  });
  clearBtn.addEventListener('click', () => {
    clearTimeout(_debounce);
    input.value = '';
    syncMatcherState();
    onInput('');
    input.focus();
  });

  box.appendChild(input);
  box.appendChild(clearBtn);
  box._input = input;
  // Call after assigning _input.value programmatically (deep links, tab navigation).
  box._sync = syncMatcherState;

  return box;
}

export function normalizeAssetPath(path) {
  if (!path || typeof path !== 'string') return '';
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  const base = getDataBase();
  if (path.startsWith('./data/images/') || path.startsWith('./data/maps/')) return path;
  if (path.startsWith('./data/')) return `${base}/${path.slice(7)}`;
  if (path.startsWith('data/')) return `${base}/${path.slice(5)}`;
  if (path.startsWith('./images/')) return `${base}/${path.slice(2)}`;
  if (path.startsWith('images/')) return `${base}/${path}`;
  return path;
}

export function makeThumbnail(src, alt, options = {}) {
  const {
    className = '',
    fallbackText = 'N/A',
    title,
  } = options;

  const wrapper = el('span', {
    className: `thumb ${className}`.trim(),
  });
  const img = el('img', {
    loading: 'lazy',
    decoding: 'async',
    alt: alt || '',
  });
  const fallback = el('span', {
    className: 'thumb-fallback',
    textContent: fallbackText,
    'aria-hidden': 'true',
  });

  const showPlaceholder = () => {
    wrapper.classList.add('is-placeholder');
    img.removeAttribute('src');
  };

  const imagePath = normalizeAssetPath(src);
  if (imagePath) {
    img.addEventListener('error', showPlaceholder, { once: true });
    img.addEventListener('load', () => { if (img.naturalWidth === 0) showPlaceholder(); }, { once: true });
    img.setAttribute('src', imagePath);
  } else {
    wrapper.classList.add('is-placeholder');
  }

  wrapper.appendChild(img);
  wrapper.appendChild(fallback);

  return wrapper;
}

export function makeEquipStatLine(item) {
  const stats = item.stats || {};
  const parts = [];
  const accent = 'var(--accent)';

  if (stats.incPAD)     parts.push({ t: `ATK+${stats.incPAD}`,                      c: 'var(--secondary)' });
  if (stats.incMAD)     parts.push({ t: `M.ATK+${stats.incMAD}`,                     c: 'var(--secondary)' });
  if (stats.incPDD)     parts.push({ t: `DEF+${stats.incPDD}`,                      c: null });
  if (stats.incMDD)     parts.push({ t: `M.DEF+${stats.incMDD}`,                     c: null });

  const baseStats = [];
  if (stats.incSTR) baseStats.push(`STR+${stats.incSTR}`);
  if (stats.incDEX) baseStats.push(`DEX+${stats.incDEX}`);
  if (stats.incINT) baseStats.push(`INT+${stats.incINT}`);
  if (stats.incLUK) baseStats.push(`LUK+${stats.incLUK}`);
  if (baseStats.length) parts.push({ t: baseStats.join(', '), c: null });

  if (stats.incMHP)     parts.push({ t: `HP+${stats.incMHP}`,                       c: null });
  if (stats.incMMP)     parts.push({ t: `MP+${stats.incMMP}`,                       c: null });
  if (stats.incACC)     parts.push({ t: `Acc+${stats.incACC}`,                      c: null });
  if (stats.incEVA)     parts.push({ t: `Avoid+${stats.incEVA}`,                    c: null });
  if (stats.incSpeed)   parts.push({ t: `Speed+${stats.incSpeed}`,                  c: null });
  if (stats.incJump)    parts.push({ t: `Jump+${stats.incJump}`,                    c: null });
  if (stats.knockback)  parts.push({ t: `KB ${stats.knockback}%`,                   c: null });
  if (stats.incCRT)     parts.push({ t: `Crit Rate+${stats.incCRT}`,                c: accent });
  if (stats.incCRD)     parts.push({ t: `Crit Damage+${stats.incCRD}`,              c: accent });
  if (stats.recovery)   parts.push({ t: `Recovery ×${stats.recovery}`,              c: accent });
  if (stats.attackSpeed) {
    const label = item.attack_speed_label || stats.attackSpeed;
    parts.push({ t: `Speed:${label}(${stats.attackSpeed})`, c: null });
  }
  if (stats.tuc) parts.push({ t: `Slots:${stats.tuc}`, c: null });

  if (parts.length === 0) return null;

  const line = el('div', { className: 'equip-stat-line' });
  parts.forEach((part, i) => {
    if (i > 0) line.appendChild(el('span', { className: 'text-dim', textContent: '·' }));
    const vSpan = el('span', { textContent: part.t });
    if (part.c) vSpan.style.color = part.c; else vSpan.classList.add('text-dim');
    line.appendChild(vSpan);
  });
  return line;
}

export function makeEquipReqLine(item) {
  const stats = item.stats || {};
  const reqs = [];
  if (stats.reqLevel) reqs.push(`Lv.${stats.reqLevel}`);
  if (stats.reqPOP)   reqs.push(`Fame ${stats.reqPOP}`);
  if (stats.reqSTR)   reqs.push(`STR ${stats.reqSTR}`);
  if (stats.reqDEX)   reqs.push(`DEX ${stats.reqDEX}`);
  if (stats.reqINT)   reqs.push(`INT ${stats.reqINT}`);
  if (stats.reqLUK)   reqs.push(`LUK ${stats.reqLUK}`);
  const jobStr = item.req_job_label || 'All';
  const gender = item.gender;

  if (reqs.length === 0 && jobStr === 'All' && !gender) return null;

  const line = el('div', { className: 'equip-req-line' });
  line.appendChild(el('span', { className: 'text-dim', textContent: 'Req:' }));
  if (gender) {
    const label = gender === 'male' ? 'Male' : 'Female';
    line.appendChild(el('span', { className: `equip-req-gender equip-req-gender--${gender}`, textContent: `[${label}]` }));
  }
  if (jobStr !== 'All') {
    line.appendChild(el('span', { className: 'equip-req-job', textContent: `[${jobStr}]` }));
  }
  reqs.forEach((req) => {
    line.appendChild(el('span', { className: 'text-dim', textContent: req }));
  });
  return line;
}

export function makeCollapsible(title, count, defaultOpen, badgeText, content) {
  const section = el('div', { className: `collapsible${defaultOpen ? ' open' : ''}` });
  const header = el('button', { className: 'collapsible-header' });

  const left = el('span', { className: 'left' });
  left.appendChild(el('span', { className: 'title', textContent: title }));
  if (badgeText) {
    left.appendChild(el('span', { className: 'badge-label', textContent: badgeText }));
  }

  const right = el('span', { className: 'right' });
  if (count !== undefined && count !== null) {
    right.appendChild(el('span', { className: 'count', textContent: count }));
  }
  right.innerHTML += `<span class="chevron">${ICONS.chevronRight}</span>`;

  header.appendChild(left);
  header.appendChild(right);
  header.addEventListener('click', () => section.classList.toggle('open'));
  section.appendChild(header);

  const body = el('div', { className: 'collapsible-body' });
  if (typeof content === 'function') {
    let rendered = false;
    const observer = new MutationObserver(() => {
      if (section.classList.contains('open') && !rendered) {
        rendered = true;
        body.appendChild(content());
      }
    });
    observer.observe(section, { attributes: true, attributeFilter: ['class'] });
    if (defaultOpen) {
      rendered = true;
      body.appendChild(content());
    }
  } else {
    body.appendChild(content);
  }

  section.appendChild(body);
  return section;
}
