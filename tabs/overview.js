import { el } from '../lib/utils.js';

export function renderOverview(data, { switchTab }) {
  const { overview } = data;
  const stats = overview.stats;
  const frag = document.createDocumentFragment();

  // Hero banner (compact, since site header now carries the branding)
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
    textContent: 'Closed Beta Test (CBT) Patch 2',
  });
  const heroPatchHash = el('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
    },
    title: 'c80c0a8a',
  });
  heroPatchHash.appendChild(el('span', {
    style: { fontSize: '9px', color: 'var(--dim)', opacity: '.5', letterSpacing: '.4px', fontWeight: '600', textTransform: 'uppercase' },
    textContent: 'hash',
  }));
  heroPatchHash.appendChild(el('code', {
    style: {
      fontSize: '10px',
      color: 'var(--dim)',
      opacity: '.65',
      background: 'rgba(255,255,255,.04)',
      border: '1px solid var(--border)',
      borderRadius: '3px',
      padding: '0 4px',
    },
    textContent: 'c80c0a8a',
  }));
  heroBadgeMeta.appendChild(heroBadge);
  heroBadgeMeta.appendChild(heroPatchHash);
  heroBanner.appendChild(heroBadgeMeta);

  const heroDivider = el('div', {
    style: { width: '1px', alignSelf: 'stretch', background: 'var(--border)', flexShrink: '0', margin: '0 4px' },
  });
  heroBanner.appendChild(heroDivider);

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
    textContent: 'April 21, 2026 09:01 PT',
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
    'This data comes from the game files but does not guarantee that everything will appear on release — or ever. Content may be cut, delayed, or changed before launch.'
  );
  frag.appendChild(disclaimer);

  const navSection = el('div');
  navSection.appendChild(el('div', { className: 'section-heading', textContent: 'Explore' }));

  const navGrid = el('div', { className: 'nav-grid' });
  const navItems = [
    ['monsters',  'Monsters',   stats.monsters,   'Sortable stats, elements'],
    ['maps',      'Maps',       stats.maps,        `${stats.num_regions} regions, all zones`],
    ['skills',    'Skills',     stats.skills,      `${stats.num_classes} classes, full stats`],
    ['crafting',  'Crafting',   stats.recipes,     `${stats.num_disciplines} disciplines, all recipes`],
    ['items',     'Items',      stats.scrolls + stats.consumables + stats.etc + stats.setup, 'Scrolls, consumables, etc'],
    ['equipment', 'Equipment',  stats.equipment,   'Weapons, armor, accessories'],
    ['cashshop',  'Cash Shop',  stats.cash_shop_items, 'NX items, pets, coupons'],
    ['quests',    'Quests',     stats.quests,      'Full chains, rewards, repeats'],
  ];

  navItems.forEach(([tabId, label, count, desc]) => {
    const card = el('div', { className: 'nav-card' });
    card.appendChild(el('div', { className: 'nav-count', textContent: count }));
    card.appendChild(el('div', { className: 'nav-label', textContent: label }));
    card.appendChild(el('div', { className: 'nav-desc', textContent: desc }));
    card.addEventListener('click', () => switchTab(tabId));
    navGrid.appendChild(card);
  });

  navSection.appendChild(navGrid);
  frag.appendChild(navSection);

  const findingsSection = el('div', { style: { marginBottom: '24px' } });
  findingsSection.appendChild(el('div', { className: 'section-heading', textContent: 'Key Findings' }));

  const findingsGrid = el('div', { className: 'findings-grid' });
  [
    ['Content Era',        stats.version],
    ['Classes',            stats.classes],
    ['Max Level',          '50 · Same EXP curve as old school MS'],
    ['Craft Disciplines',  stats.disciplines],
    ['Bosses',             stats.bosses],
    ['Mob Level Range',        stats.level_range],
    ['Scroll System',      stats.scroll_system],
    ['Repeatable Quests',  stats.repeatable_quests],
  ].forEach(([title, text]) => {
    const card = el('div', { className: 'info-card' });
    card.appendChild(el('div', { className: 'title', textContent: title }));
    card.appendChild(el('div', { className: 'text', textContent: text }));
    findingsGrid.appendChild(card);
  });

  findingsSection.appendChild(findingsGrid);
  frag.appendChild(findingsSection);
  return frag;
}
