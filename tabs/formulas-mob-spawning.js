import { el, tabHref } from '../lib/utils.js';
import { attachTooltip, buildTable, makeCollapsibleSection } from './formulas-shared.js';
import { markFormulaSection } from './formulas-layout.js';
import { createSpawnAnimation } from './spawn-animation.js';

// Evidence and measurements: docs/SPAWN_CAPACITY_RESEARCH.md.
function paragraph(parent, text) {
  parent.appendChild(el('p', { textContent: text }));
}

function formula(parent, text) {
  parent.appendChild(el('pre', { className: 'spawn-reference-formula' }, el('code', { textContent: text })));
}

function table(parent, columns, rows) {
  parent.appendChild(el('div', { className: 'formulas-table-wrap' }, buildTable(columns, rows)));
}


function section(title, key, status, build) {
  const body = el('div', { className: 'spawn-reference-body' });
  if (status && !['unverified', 'partially-verified', 'verified'].includes(status)) {
    body.appendChild(el('div', { className: 'spawn-reference-evidence', textContent: status }));
  }
  build(body);
  const node = markFormulaSection(makeCollapsibleSection(title, '', () => body), key);
  if (status === 'unverified' || status === 'partially-verified') {
    node.querySelector('.right').appendChild(attachTooltip(el('span', {
      className: 'formulas-status-tag formulas-status-warn', textContent: status === 'partially-verified' ? 'Partially verified' : 'Unverified',
    }), 'Based on in-game timing tests; exact respawn timer and spawn-point rules are still being confirmed.'));
  }
  if (status === 'verified') {
    node.querySelector('.right').appendChild(attachTooltip(el('span', {
      className: 'formulas-status-tag formulas-status-ok', textContent: 'Verified',
    }), 'Verified with in-game monster counts across tested maps.'));
  }
  return node;
}

function buildGuide() {
  const page = el('div', { className: 'formulas-full spawn-reference' });
  page.appendChild(section('Spawn Points, Capacity, and Refill Speed', 'spawn-overview', 'Key terms', body => {
    table(body, [['Term', ''], ['What it means', '']], [
      ['Spawn points', 'Locations on a map where a monster can appear. The counts beside each mob on the Maps page are spawn points.'],
      ['Mob capacity', 'The shared cap on how many monsters can be alive on the map at once. The Maps page shows the solo estimate, shared across all mob types.'],
    ]);
    paragraph(body, 'For example, Dangerous Croko I has 54 spawn points, but a solo mob capacity of 40. Having 27 Jr. Necki spawn points does not mean 27 Jr. Neckis are alive at once.');
    body.appendChild(el('a', { className: 'tab-link', href: tabHref('maps', { q: 'id:010003093' }), textContent: 'View Dangerous Croko I on the Maps page →' }));
  }));

  page.appendChild(section('Mob Capacity', 'spawn-capacity', 'verified', body => {
    paragraph(body, 'Map width and height are measured across all horizontal and sloped platforms (excluding vertical walls).');
    formula(body, 'W = xmax − xmin − 40\nH = ymax − ymin + 330\n\nM = clamp(floor(max(W, 800) × max(H − 450, 600) × mobRate / 128000), 1, 40)');
    table(body, [['Input', ''], ['Meaning', '']], [
      ['W and H', 'Map width and height in pixels'],
      ['mobRate', 'The map’s spawn rate multiplier (default 1.0)'],
    ]);
    const geometry = el('div', { className: 'hitviz-details-body' });
    body.appendChild(el('details', { className: 'hitviz-details hitviz-details--content' },
      el('summary', { textContent: 'Why exclude vertical walls?' }), geometry));
    paragraph(geometry, 'Vertical walls at platform edges can extend below the lowest walkable platform and are excluded from the map size calculation.');
    geometry.appendChild(el('img', {
      className: 'spawn-reference-diagram', src: './assets/reference/mob-spawning-bounds.png',
      alt: 'Kerning City Middle Forest III map bounds showing vertical walls excluded from the platform boundary.', loading: 'lazy',
    }));
  }));

  page.appendChild(section('Player-Based Spawn Bonus', 'spawn-players', 'verified', body => {
    body.appendChild(el('p', {},
      'Mob capacity increases with the number of players in ', el('strong', { textContent: 'active combat' }),
      ' on the map. AFK or dead players do not count (the exact activity threshold is still being tested).'));
    formula(body, 'Target = M + floor(0.75 × max(P − 5, 0))\nM = base mob capacity\nP = players in active combat on the map');
    const data = el('div', { className: 'hitviz-details-body' });
    body.appendChild(el('details', { className: 'hitviz-details hitviz-details--content' },
      el('summary', { textContent: 'In-game counts' }), data));
    table(data, [['Map', ''], ['M', 'num'], ['Players', 'num'], ['Counted mobs', 'num'], ['Expected', 'num']], [
      ['Sunset Sky', 19, 1, 19, 19], ['Sunset Sky', 19, '8 ±1', 21, '20–22'],
      ['Sunset Sky', 19, '11 ±1', 22, '22–24'], ['Sunset Sky', 19, '21 ±1', 31, '30–31'],
      ['Sleepy Dungeon IV', 18, '11 ±1', 22, '21–23'],
    ]);
  }));

  page.appendChild(section('How Mobs Refill', 'spawn-refill', 'partially-verified', body => {
    table(body, [['Timing', ''], ['What it controls', '']], [
      ['Map refill timer (~7s)', 'Wait between respawn cycles.'],
      ['Spawn-point cooldown', 'How long a specific spawn point waits before spawning again.'],
    ]);
    paragraph(body, 'Monsters respawn when the map refill timer is ready, the map is below capacity, and a spawn point is available. Each ready point spawns up to one monster per cycle.');
    body.appendChild(el('h3', { textContent: 'When a spawn point is ready' }));
    table(body, [['Point type', ''], ['How it behaves', '']], [
      ['No set cooldown', 'Ready on the next respawn cycle unless another monster is within 100 pixels. Can spawn multiple monsters over time.'],
      ['Timed cooldown', 'Cannot spawn again until its cooldown finishes. The cooldown starts after the monster from this point is defeated.'],
    ]);
    paragraph(body, 'Both types still need mob count below capacity and a ready map refill timer.');
    body.appendChild(createSpawnAnimation());
    body.appendChild(el('h3', { textContent: 'Full maps keep the timer ready' }));
    paragraph(body, 'When a map is at capacity, the refill timer stays ready, so killing a monster can trigger a near-instant respawn. That respawn resets the map timer, while individual spawn-point cooldowns still apply.');
  }));

  return page;
}

export function createMobSpawningPage() {
  return {
    key: 'mob-spawning', label: 'Mob Spawning', kicker: 'Reference · map population and refill behavior',
    description: 'How spawn points, mob capacity, player bonuses, and respawn timers work.',
    sections: [
      { key: 'spawn-overview', label: 'Overview' }, { key: 'spawn-capacity', label: 'Solo capacity' },
      { key: 'spawn-players', label: 'Player bonus' },
      { key: 'spawn-refill', label: 'Refill waves' },
    ],
    render: buildGuide,
  };
}
