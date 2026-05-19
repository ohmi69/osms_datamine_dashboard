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
        onChange('');
        onDeeplink(exactId);
      } else {
        searchBox._input.value = typeof query === 'string' ? query : '';
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

export function autoExpandById(container, id, rowSelector = 'tr') {
  setTimeout(() => {
    for (const row of container.querySelectorAll(rowSelector)) {
      const idCell = row.querySelector('.id');
      if (idCell && Number(idCell.textContent.replace(/^#/, '')) === id) {
        container.querySelectorAll('.row-hotlink').forEach(r => r.classList.remove('row-hotlink'));
        row.click();
        row.classList.add('row-hotlink');
        // Scroll directly — don't wait for lazy images (page is at scrollY=0 so
        // getBoundingClientRect().top equals the absolute offset from page top)
        requestAnimationFrame(() => {
          const header = document.querySelector('.site-header');
          const headerHeight = header ? header.offsetHeight : 64;
          window.scrollTo({ top: window.scrollY + row.getBoundingClientRect().top - headerHeight, behavior: 'smooth' });
        });
        break;
      }
    }
  }, 300);
}

export function scrollToDetailRow(row, detailRow) {
  const scroll = () => {
    requestAnimationFrame(() => {
      const header = document.querySelector('.site-header');
      const headerHeight = header ? header.offsetHeight : 64;
      window.scrollTo({ top: window.scrollY + row.getBoundingClientRect().top - headerHeight, behavior: 'smooth' });
    });
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

export function matchSearch(text, query) {
  if (!query) return true;
  if (!text) return false;
  return text.toLowerCase().includes(query.toLowerCase());
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
  box.appendChild(iconSpan);

  const input = el('input', { type: 'text', placeholder });

  const clearBtn = el('button', { className: 'search-clear', type: 'button', title: 'Clear' });
  clearBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  input.addEventListener('input', () => onInput(input.value));
  clearBtn.addEventListener('click', () => {
    input.value = '';
    onInput('');
    input.focus();
  });

  box.appendChild(input);
  box.appendChild(clearBtn);
  box._input = input;

  return box;
}

export function normalizeAssetPath(path) {
  if (!path || typeof path !== 'string') return '';
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  const base = getDataBase();
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
