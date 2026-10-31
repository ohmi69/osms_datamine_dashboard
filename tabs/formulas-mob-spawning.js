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
    }), 'One gameplay timing test supports the seven-second refill model. The exact timer and spawn-point rules remain unconfirmed.'));
  }
  if (status === 'verified') {
    node.querySelector('.right').appendChild(attachTooltip(el('span', {
      className: 'formulas-status-tag formulas-status-ok', textContent: 'Verified',
    }), 'Supported by recorded in-game map counts. Verification covers the tested maps.'));
  }
  return node;
}

function buildGuide() {
  const page = el('div', { className: 'formulas-full spawn-reference' });
  page.appendChild(section('Spawn Points, Capacity, and Refill Speed', 'spawn-overview', 'Three different measurements', body => {
    table(body, [['Term', ''], ['What it means', '']], [
      ['Spawn points', 'Locations in the map data where a mob type can be generated. The counts beside each mob on the Maps page are spawn points.'],
      ['Mob capacity', 'A shared population target across mob types. The Maps page shows an estimated base target for solo play, not a target for each species.'],
    ]);
    paragraph(body, 'Dangerous Croko I has 54 spawn points, but the mob capacity (single player on map) is 40. It does not predict 27 live Jr. Neckis just because that type has 27 spawn points.');
    body.appendChild(el('a', { className: 'tab-link', href: tabHref('maps', { q: 'id:010003093' }), textContent: 'View Dangerous Croko I on the Maps page →' }));
  }));

  page.appendChild(section('Solo Mob Capacity', 'spawn-capacity', 'verified', body => {
    paragraph(body, 'Start with the endpoints of horizontal and sloped foothold segments. Exclude vertical segments where x1 = x2.');
    formula(body, 'W = xmax − xmin − 40\nH = ymax − ymin + 330\n\nM = clamp(floor(max(W, 800) × max(H − 450, 600) × mobRate / 128000), 1, 40)');
    table(body, [['Input', ''], ['Meaning', '']], [
      ['W and H', 'Derived map width and height in game-coordinate pixels'],
      ['mobRate', 'The map’s mobRate multiplier, defaulting to 1.0. It affects the capacity calculation'],
    ]);
  }));

  page.appendChild(section('Why Exclude Vertical Segments?', 'spawn-geometry', 'verified', body => {
    paragraph(body, 'Vertical collision segments at platform edges can extend below the lowest horizontal or sloped platform. The mob capacity calculation does NOT include these in the height/width.');
    body.appendChild(el('img', {
      className: 'spawn-reference-diagram', src: './assets/reference/mob-spawning-bounds.png',
      alt: 'Actual Kerning City Middle Forest III geometry. Including vertical walls sets the bottom boundary at their ends; excluding them sets the boundary at the lowest platform endpoints.', loading: 'lazy',
    }));
   
  }));

  page.appendChild(section('Player-Based Spawn Bonus', 'spawn-players', 'verified', body => {
    body.appendChild(el('p', {},
      'Mob capacity increases with the number of players in ', el('strong', { textContent: 'active combat' }),
      ' on the map. AFK/dead players do not count. We aren\'t sure what defines ', el('strong', { textContent: 'active combat' }), ' quite yet'));
    formula(body, 'Target = M + floor(0.75 × max(P − 5, 0))\nM = base mob capacity\nP = players in active combat on the map');
    const data = el('div', { className: 'hitviz-details-body' });
    body.appendChild(el('details', { className: 'hitviz-details hitviz-details--content' },
      el('summary', { textContent: 'Recorded observations' }), data));
    table(data, [['Map', ''], ['M', 'num'], ['Players', 'num'], ['Counted mobs', 'num'], ['Expected', 'num']], [
      ['Sunset Sky', 19, 1, 19, 19], ['Sunset Sky', 19, '8 ±1', 21, '20–22'],
      ['Sunset Sky', 19, '11 ±1', 22, '22–24'], ['Sunset Sky', 19, '21 ±1', 31, '30–31'],
      ['Sleepy Dungeon IV', 18, '11 ±1', 22, '21–23'],
    ]);
  }));

  page.appendChild(section('How Mobs Refill', 'spawn-refill', 'partially-verified', body => {
    table(body, [['Timing', ''], ['What it controls', '']], [
      ['Map refill timer (~7s)', 'Wait between mob refills.'],
      ['Spawn-point cooldown', 'Cooldown for when a specific spawn point can be used again'],
    ]);
    paragraph(body, 'A refill needs the map timer to be ready, mob count below capacity, and usable spawn points. Each usable point can add one mob per refill.');
    body.appendChild(el('h3', { textContent: 'When a spawn point is ready' }));
    table(body, [['Point type', ''], ['Readiness rule being investigated', '']], [
      ['No specified cooldown', 'A mob can spawn on the next refill pass, with one exception: A nearby mob blocks the point when it is within 100 pixels. Multiple mobs can be spawned from the same spawn point.'],
      ['Specified cooldown', 'A mob can\t spawn until the cooldown has passed since the last spawn from the point. The mob spawned here must be killed before the cooldown starts.'],
    ]);
    paragraph(body, 'Both types still need mob count below capacity and a ready map refill timer.');
    body.appendChild(createSpawnAnimation());
    body.appendChild(el('h3', { textContent: 'Full maps keep the timer ready' }));
    paragraph(body, 'The refill timer stays ready when the map is full. Killing a mob can then allow a near-instant replacement. That refill restarts the map timer. Spawn-point cooldowns still apply.');
  }));

  return page;
}

export function createMobSpawningPage() {
  return {
    key: 'mob-spawning', label: 'Mob Spawning', kicker: 'Reference · map population and refill behavior',
    description: 'Understand spawn points, solo mob capacity, and measured refill timing.',
    sections: [
      { key: 'spawn-overview', label: 'Overview' }, { key: 'spawn-capacity', label: 'Solo capacity' },
      { key: 'spawn-geometry', label: 'Map bounds' }, { key: 'spawn-players', label: 'Player bonus' },
      { key: 'spawn-refill', label: 'Refill waves' },
    ],
    render: buildGuide,
  };
}
