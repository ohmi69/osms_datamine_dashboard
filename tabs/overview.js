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
  const heroBadge = el('div', {
    style: {
      padding: '4px 10px',
      borderRadius: '4px',
      background: 'var(--secondary)',
      color: 'var(--bg)',
      fontSize: '11px',
      fontWeight: '800',
      letterSpacing: '1px',
      whiteSpace: 'nowrap',
      flexShrink: '0',
    },
    textContent: 'Patch: Closed Beta Test (CBT)',
  });
  const heroText = el('p', {
    style: { color: 'var(--dim)', fontSize: '13px', lineHeight: '1.6' },
  });
  heroText.appendChild(el('span', {
    style: { color: 'var(--accent)', fontWeight: '700' },
    textContent: stats.version,
  }));
  heroText.append('.');
  heroBanner.appendChild(heroBadge);
  heroBanner.appendChild(heroText);
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
    ['Max Level',          '51 · Same EXP curve as old school MS'],
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
