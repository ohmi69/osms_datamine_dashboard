import { el } from '../lib/utils.js';
import { getDataBase } from '../lib/data.js';

function buildBanner(title, subtitle, accent = { rgb: '251,146,60', hex: '#fb923c' }, link = null) {
  const banner = el('div', {
    style: {
      background: `linear-gradient(135deg, rgba(${accent.rgb},.18) 0%, rgba(${accent.rgb},.08) 100%)`,
      border: `2px solid rgba(${accent.rgb},.55)`,
      borderRadius: '12px',
      padding: '28px 32px',
      marginBottom: '28px',
      textAlign: 'center',
      boxShadow: `0 4px 24px rgba(${accent.rgb},.12)`,
    },
  });
  banner.appendChild(el('div', {
    style: { fontSize: '22px', fontWeight: '800', color: accent.hex, letterSpacing: '.5px', marginBottom: '8px' },
    textContent: title,
  }));
  banner.appendChild(el('div', {
    style: { fontSize: '15px', color: 'var(--dim)', opacity: '.85' },
    textContent: subtitle,
  }));
  if (link) {
    const linkEl = el('a', {
      href: '#',
      style: {
        display: 'inline-block',
        marginTop: '14px',
        padding: '7px 16px',
        borderRadius: '99px',
        background: `rgba(${accent.rgb},.16)`,
        border: `1px solid rgba(${accent.rgb},.55)`,
        color: accent.hex,
        fontSize: '13px',
        fontWeight: '700',
        textDecoration: 'none',
        cursor: 'pointer',
      },
      textContent: link.label,
    });
    linkEl.addEventListener('click', (e) => { e.preventDefault(); link.onClick(); });
    banner.appendChild(linkEl);
  }
  return banner;
}

function buildNavSection(stats, switchTab, isTimeTravelMode = false) {
  const section = el('div');
  section.appendChild(el('div', { className: 'section-heading', textContent: 'Explore' }));
  const grid = el('div', { className: 'nav-grid' });
  [
    ['monsters',  'Monsters',   stats.monsters,   ''],
    ['maps',      'Maps',       stats.maps,        `${stats.num_regions} regions`],
    ['skills',    'Skills',     stats.skills,      `${stats.num_classes} classes`],
   !isTimeTravelMode ?  ['crafting',  'Crafting',   stats.recipes,     `${stats.num_disciplines} disciplines, all recipes`]: null,
    ['items',     'Items',      stats.scrolls + stats.consumables + stats.etc + stats.setup, 'Scrolls, consumables, etc'],
    ['equipment', 'Equipment',  stats.equipment,   'Weapons, armor, accessories'],
    ['cashshop',  'Cash Shop',  stats.cash_shop_items, 'NX items, pets, coupons'],
    ['quests',    'Quests',     stats.quests,      'Full quest chains, rewards'],
  ].filter(Boolean)
  .forEach(([tabId, label, count, desc]) => {
    const card = el('div', { className: 'nav-card' });
    card.appendChild(el('div', { className: 'nav-count', textContent: count }));
    card.appendChild(el('div', { className: 'nav-label', textContent: label }));
    card.appendChild(el('div', { className: 'nav-desc', textContent: desc }));
    card.addEventListener('click', () => switchTab(tabId));
    grid.appendChild(card);
  });
  section.appendChild(grid);
  return section;
}

export function renderOverview(data, options) {
  const { switchTab } = options;
  const { overview } = data;
  const stats = overview.stats;
  const frag = document.createDocumentFragment();
  const isTimeTravelMode = getDataBase() !== './data/current';

  if (isTimeTravelMode) {
    const meta = data.patchMeta;
    const version = meta?.label || meta?.version || new URLSearchParams(window.location.search).get('patch') || 'unknown';
    const dateStr = meta?.date
      ? new Date(meta.date + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : '';
    frag.appendChild(buildBanner(
      `Welcome back to ${dateStr} (${version})`,
      dateStr ? `Enjoy the walk down memory lane` : 'Historical datamine snapshot',
    ));
    frag.appendChild(buildNavSection(stats, switchTab, true));
    return frag;
  }

  frag.appendChild(buildBanner(
    'Welcome back to Closed Online Test 2!',
    "The COT2 datamine is complete! Formulas and other data from COT1 may be outdated until re-verified, check back often as things change!",
    { rgb: '34,197,94', hex: '#22c55e' },
    data.patchNotes ? { label: 'View COT1 → COT2 patch notes →', onClick: () => switchTab('patchnotes') } : null,
  ));

  // Hero banner
  const heroBanner = el('div', {
    style: {
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderLeft: '6px solid var(--accent)',
      borderRadius: '0 10px 10px 0',
      padding: '14px 20px',
      marginBottom: '24px',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      boxShadow: '0 2px 8px rgba(0,0,0,.2)',
    },
  });
  const heroBadgeMeta = el('div', {
    style: { display: 'flex', flexDirection: 'column', gap: '5px', flexShrink: '0' },
  });
  const heroBadge = el('div', {
    style: {
      padding: '2px 8px',
      borderRadius: '99px',
      background: 'rgba(251,146,60,.18)',
      border: '1px solid rgba(251,146,60,.45)',
      color: '#fb923c',
      fontSize: '10px',
      fontWeight: '700',
      letterSpacing: '.6px',
      whiteSpace: 'nowrap',
      alignSelf: 'flex-start',
    },
    textContent: 'Closed Online Test 2 (COT2)',
  });
  const heroPatchHash = el('div', { style: { display: 'flex', alignItems: 'center', gap: '5px' }, title: 'c80c0a8a' });
  heroPatchHash.appendChild(el('span', {
    style: { fontSize: '9px', color: 'var(--dim)', opacity: '.5', letterSpacing: '.4px', fontWeight: '600', textTransform: 'uppercase' },
    textContent: 'hash',
  }));
  heroPatchHash.appendChild(el('code', {
    style: {
      fontSize: '10px', color: 'var(--dim)', opacity: '.65',
      background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0 4px',
    },
    textContent: '0a8ccb68',
  }));
  heroBadgeMeta.appendChild(heroBadge);
  heroBadgeMeta.appendChild(heroPatchHash);
  heroBanner.appendChild(heroBadgeMeta);
  heroBanner.appendChild(el('div', {
    style: { width: '1px', alignSelf: 'stretch', background: 'var(--border)', flexShrink: '0', margin: '0 4px' },
  }));
  const heroInfo = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } });
  heroInfo.appendChild(el('p', {
    style: { fontSize: '12px', color: 'var(--dim)', lineHeight: '1.5', margin: '0' },
    textContent: 'Latest datamine for this patch. All data is extracted directly from the game client.',
  }));
  const heroTimeLine = el('div', { style: { display: 'flex', alignItems: 'center', gap: '5px' } });
  heroTimeLine.appendChild(el('span', {
    style: { fontSize: '9px', color: 'var(--dim)', opacity: '.5', letterSpacing: '.4px', fontWeight: '600', textTransform: 'uppercase' },
    textContent: 'Last Datamine Time:',
  }));
  heroTimeLine.appendChild(el('span', {
    style: { fontSize: '10px', color: 'var(--dim)', opacity: '.75', fontFamily: 'monospace' },
    textContent: 'August 4, 2026 11:10 PT',
  }));
  heroInfo.appendChild(heroTimeLine);
  heroBanner.appendChild(heroInfo);
  frag.appendChild(heroBanner);

  // Disclaimer
  const disclaimer = el('div', {
    style: {
      background: 'rgba(254,178,114,.08)',
      border: '1px solid rgba(254,178,114,.35)',
      borderLeft: '6px solid var(--accent)',
      borderRadius: '0 10px 10px 0',
      padding: '12px 18px',
      marginBottom: '24px',
      fontSize: '13px',
      color: 'var(--dim)',
      lineHeight: '1.6',
    },
  });
  disclaimer.appendChild(el('span', {
    style: { color: 'var(--accent)', fontWeight: '700', marginRight: '6px' },
    textContent: 'Disclaimer:',
  }));
  disclaimer.append(
    'This data comes from the game files but does not guarantee that everything will appear on release, or ever. Content may be cut, delayed, or changed before launch.'
  );
  frag.appendChild(disclaimer);

  frag.appendChild(buildNavSection(stats, switchTab));

  const findingsSection = el('div', { style: { marginBottom: '24px' } });
  findingsSection.appendChild(el('div', { className: 'section-heading', textContent: 'Key Findings' }));
  const findingsGrid = el('div', { className: 'findings-grid' });

  // "15 (Archer, Assassin, ...) — 2nd Job cap" -> { count: '15', items: [...], suffix: '2nd Job cap' }
  function parseCountedList(text) {
    const match = /^(\d+)\s*\(([^)]*)\)\s*(?:—|-)?\s*(.*)$/.exec(text || '');
    if (!match) return null;
    return {
      count: match[1],
      items: match[2].split(',').map(s => s.trim()).filter(Boolean),
      suffix: match[3].trim(),
    };
  }

  function appendChipCard(title, unit, text, onChipClick) {
    const parsed = parseCountedList(text);
    if (!parsed) {
      const card = el('div', { className: 'info-card' });
      card.appendChild(el('div', { className: 'title', textContent: title }));
      card.appendChild(el('div', { className: 'text', textContent: text }));
      findingsGrid.appendChild(card);
      return;
    }
    const card = el('div', { className: 'info-card' });
    card.appendChild(el('div', { className: 'title', textContent: title }));
    const summary = `${parsed.count} ${unit}` + (parsed.suffix ? ` · ${parsed.suffix}` : '');
    card.appendChild(el('div', { className: 'text', textContent: summary }));
    const chipRow = el('div', { className: 'info-chip-row' });
    parsed.items.forEach(item => {
      if (onChipClick) {
        const chip = el('button', { className: 'info-chip info-chip--link', textContent: item });
        chip.addEventListener('click', () => onChipClick(item));
        chipRow.appendChild(chip);
      } else {
        chipRow.appendChild(el('span', { className: 'info-chip', textContent: item }));
      }
    });
    card.appendChild(chipRow);
    findingsGrid.appendChild(card);
  }

  // Chip label -> skills tab filter params (class pill and/or subclass pill)
  const skillClasses = Object.values(data.skills || {}).flat().filter(c => c && c.class_name);
  function openSkillsForClass(label) {
    const cls = skillClasses.find(c => c.class_name === label);
    if (!cls) return;
    const params = {};
    if (cls.main_class) params.class = cls.main_class;
    if (cls.class_name !== cls.main_class) params.subclass = cls.class_name;
    options.openTabWithParams('skills', params);
  }

  appendChipCard('Classes', 'classes', stats.classes,
    options.openTabWithParams ? openSkillsForClass : null);
  appendChipCard('Craft Disciplines', 'disciplines', stats.disciplines,
    options.openTabWithParams ? (label => options.openTabWithParams('crafting', { discipline: label })) : null);
  appendChipCard('Bosses', 'bosses', stats.bosses,
    label => switchTab('monsters', true, label));

  // "4 tiers — Lesser (100%, +1 stat), Intermediate (60%, +2 stat), ..." -> one row per tier
  function appendScrollSystemCard(title, text) {
    const headMatch = /^(.*?)—\s*(.*)$/.exec(text || '');
    const tierPairs = [...(headMatch ? headMatch[2] : text || '').matchAll(/([\w./]+(?:\s[\w./]+)*)\s*\(([^)]*)\)/g)];
    if (!headMatch || !tierPairs.length) {
      const card = el('div', { className: 'info-card' });
      card.appendChild(el('div', { className: 'title', textContent: title }));
      card.appendChild(el('div', { className: 'text', textContent: text }));
      findingsGrid.appendChild(card);
      return;
    }
    const card = el('div', { className: 'info-card' });
    card.appendChild(el('div', { className: 'title', textContent: title }));
    card.appendChild(el('div', { className: 'text', textContent: headMatch[1].trim() }));
    const tierList = el('div', { className: 'info-tier-list' });
    tierPairs.forEach(([, name, detail]) => {
      const row = el('div', { className: 'info-tier-row' });
      row.appendChild(el('span', { className: 'info-tier-name', textContent: name.trim() }));
      row.appendChild(el('span', { className: 'info-tier-detail', textContent: detail.trim() }));
      tierList.appendChild(row);
    });
    card.appendChild(tierList);
    findingsGrid.appendChild(card);
  }

  appendScrollSystemCard('Scroll System', stats.scroll_system);

  [
    ['Repeatable Quests', stats.repeatable_quests],
  ].forEach(([title, text]) => {
    const card = el('div', { className: 'info-card' });
    card.appendChild(el('div', { className: 'title', textContent: title }));
    card.appendChild(el('div', { className: 'text', textContent: text }));
    findingsGrid.appendChild(card);
  });
  findingsSection.appendChild(findingsGrid);
  frag.appendChild(findingsSection);

  // Portal Runner callout
  const gameCallout = el('div', {
    style: {
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderLeft: '6px solid var(--accent)',
      borderRadius: '0 10px 10px 0',
      padding: '16px 20px',
      marginBottom: '24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      flexWrap: 'wrap',
      cursor: 'pointer',
    },
  });
  const gameCalloutText = el('div');
  gameCalloutText.appendChild(el('div', {
    style: { fontSize: '14px', fontWeight: '700', color: 'var(--text)', marginBottom: '2px' },
    textContent: "While you're waiting for the release...",
  }));
  gameCalloutText.appendChild(el('div', {
    style: { fontSize: '13px', color: 'var(--dim)' },
    textContent: '🗺️ Check out Portal Runner, a little game to pass the time!',
  }));
  gameCallout.appendChild(gameCalloutText);
  gameCallout.appendChild(el('div', {
    className: 'pill active',
    style: { flexShrink: '0' },
    textContent: 'Play now',
  }));
  gameCallout.addEventListener('click', () => switchTab('portal-runner'));
  frag.appendChild(gameCallout);

  return frag;
}
