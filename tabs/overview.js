import { el } from '../lib/utils.js';

export function renderOverview(data, { switchTab }) {
  const { overview } = data;
  const stats = overview.stats;
  const frag = document.createDocumentFragment();

  const titleDiv = el('div', {
    style: { textAlign: 'center', padding: '24px 0 40px' },
  });
  titleDiv.appendChild(
    el('h2', {
      style: {
        fontSize: '36px',
        fontWeight: '900',
        letterSpacing: '-0.5px',
        color: 'var(--accent)',
      },
      textContent: 'MSCW DATAMINE',
    })
  );

  titleDiv.appendChild(
    el('div', {
      style: {
        display: 'inline-block',
        marginTop: '12px',
        padding: '4px 12px',
        borderRadius: '4px',
        background: 'var(--secondary)',
        color: 'var(--bg)',
        fontSize: '13px',
        fontWeight: '700',
        letterSpacing: '0.5px',
      },
      textContent: 'Current Version: Closed Beta Test (CBT)',
    })
  );

  const subtitle = el('p', {
    style: {
      color: 'var(--dim)',
      marginTop: '8px',
      fontSize: '16px',
      maxWidth: '560px',
      margin: '8px auto 0',
    },
  });
  subtitle.append('MapleStory Classic World — reverse-engineered from WZ metadata. Content era ');
  subtitle.appendChild(
    el('span', {
      style: { color: 'var(--secondary)', fontWeight: '700' },
      textContent: stats.version,
    })
  );
  titleDiv.appendChild(subtitle);
  frag.appendChild(titleDiv);

  const navSection = el('div');
  navSection.appendChild(
    el('h3', {
      style: {
        fontSize: '18px',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        marginBottom: '12px',
      },
      textContent: 'Explore',
    })
  );

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
  findingsSection.appendChild(
    el('h3', {
      style: {
        fontSize: '18px',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        marginBottom: '12px',
      },
      textContent: 'Key Findings',
    })
  );

  const findingsGrid = el('div', { className: 'findings-grid' });
  [
    ['Content Era',        stats.version],
    ['Classes',            stats.classes],
    ['CBT Window',         `${stats.cbt_start} — ${stats.cbt_end}`],
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
