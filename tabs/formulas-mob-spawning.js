import { el, tabHref } from '../lib/utils.js';
import { attachTooltip, buildTable, makeCollapsibleSection } from './formulas-shared.js';
import { markFormulaSection } from './formulas-layout.js';

// Historical reconstruction: tmp/spawn_research/README.md and REA evidence.
// Current measurements and unresolved questions: SPAWN_CAPACITY_RESEARCH.md.
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
  if (status && status !== 'unverified') {
    body.appendChild(el('div', { className: 'spawn-reference-evidence', textContent: status }));
  }
  build(body);
  const node = markFormulaSection(makeCollapsibleSection(title, '', () => body), key);
  if (status === 'unverified') {
    node.querySelector('.right').appendChild(attachTooltip(el('span', {
      className: 'formulas-status-tag formulas-status-warn', textContent: 'Unverified',
    }), 'These refill timings and spawn-point rules have not been verified in current gameplay.'));
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

  page.appendChild(section('Solo Mob Capacity', 'spawn-capacity', 'Calculation', body => {
    paragraph(body, 'Start with the endpoints of horizontal and sloped foothold segments. Exclude vertical segments where x1 = x2.');
    formula(body, 'W = xmax − xmin − 40\nH = ymax − ymin + 330\n\nM = clamp(floor(max(W, 800) × max(H − 450, 600) × mobRate / 128000), 1, 40)');
    table(body, [['Input', ''], ['Meaning', '']], [
      ['W and H', 'Derived map width and height in game-coordinate pixels'],
      ['mobRate', 'The map’s mobRate multiplier, defaulting to 1.0. It affects the capacity calculation'],
    ]);
  }));

  page.appendChild(section('Why Exclude Vertical Segments?', 'spawn-geometry', 'Geometry hypothesis supported by independent map counts', body => {
    paragraph(body, 'Vertical collision segments at platform edges can extend below the lowest horizontal or sloped platform. The mob capacity calculation does NOT include these in the height/width.');
    body.appendChild(el('img', {
      className: 'spawn-reference-diagram', src: './assets/reference/mob-spawning-bounds.png',
      alt: 'Actual Kerning City Middle Forest III geometry. Including vertical walls sets the bottom boundary at their ends; excluding them sets the boundary at the lowest platform endpoints.', loading: 'lazy',
    }));
   
  }));

  page.appendChild(section('Players on the Map', 'spawn-players', '', body => {
    const theoryHeading = el('h3', { className: 'spawn-reference-status-heading' });
    theoryHeading.appendChild(el('span', { textContent: 'Theorized Current Player Bonus' }));
    theoryHeading.appendChild(attachTooltip(el('span', {
      className: 'formulas-status-tag formulas-status-warn', textContent: 'Unverified',
    }), 'Based on two multiplayer observations from one map. The general rule has not been verified against the current server or other maps.'));
    body.appendChild(theoryHeading);
    paragraph(body, 'We know for certain that more players on the map increases the mob capacity, but we\'re not exactly sure on the formula or the cap. Based on a very limited set of observations, we think this is the formula. If you\'re able to find a map with fully AFK people, and you can count the number of mobs on the map without interruption, reach out to @ohmi on the CW Discord!');
    formula(body, 'Target = M + floor(0.75 × max(P − 5, 0))\nM = base mob capacity\nP = players on the map');
    table(body, [['Players', 'num'], ['Reported mobs', 'num'], ['Theorized target (M = 19)', 'num']], [
      [1, 19, 19], [8, 21, 21], ['21 ±1', 31, '30–31'],
    ]);
  }));

  page.appendChild(section('How Mobs Refill', 'spawn-refill', 'unverified', body => {
    paragraph(body, 'Based on the older server; unverified in current Classic World.');
    table(body, [['Timing', ''], ['What it controls', '']], [
      ['Map tick (~4s)', 'When the server checks spawning.'],
      ['Map refill timer (7s)', 'Minimum time between refill passes.'],
      ['Spawn-point cooldown', 'Some points have their own wait before they can spawn again. Ordinary points have no timed cooldown, but nearby mobs can block them.'],
    ]);
    paragraph(body, 'On a map tick, spawning needs the refill timer to be ready, room below capacity, and usable spawn points whose cooldowns have ended. Each usable point can add one mob that wave. More points can fill more free slots; they do not shorten either map timer.');
    body.appendChild(el('h3', { textContent: 'Full maps keep the timer ready' }));
    paragraph(body, 'Checks at full capacity do not reset the map refill timer. Once 7 seconds have elapsed, killing mobs allows replacements on the next tick. Spawn-point cooldowns still apply.');
    paragraph(body, 'Example: refill at 0s, kill 5 mobs at 9s, next tick at 12s. If 5 points are usable, up to 5 mobs spawn. If only 2 are usable, up to 2 spawn.');
    paragraph(body, 'A refill pass resets the timer even if no mobs spawn. A check skipped because the map is full does not.');
  }));

  return page;
}

export function createMobSpawningPage() {
  return {
    key: 'mob-spawning', label: 'Mob Spawning', kicker: 'Reference · map population and refill behavior',
    description: 'Understand spawn points, solo mob capacity, and the historical refill rules behind the current estimate.',
    sections: [
      { key: 'spawn-overview', label: 'Overview' }, { key: 'spawn-capacity', label: 'Solo capacity' },
      { key: 'spawn-geometry', label: 'Map bounds' }, { key: 'spawn-players', label: 'Player bonus' },
      { key: 'spawn-refill', label: 'Refill waves' },
    ],
    render: buildGuide,
  };
}
