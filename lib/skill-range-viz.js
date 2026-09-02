import { el, normalizeAssetPath } from './utils.js';

let rangeVizId = 0;

const CHARACTER = normalizeAssetPath('images/hair/00030000.png');
const STUMP = 'assets/hitviz/stump.png';
const GROUND_EDGE = 'assets/hitviz/grassy-soil-edge.png';
const GROUND_FILL = 'assets/hitviz/grassy-soil-fill.png';

// Current-client Character.Afterimage rectangles. Coordinates are mirrored for
// a character facing right and remain relative to the character's foot origin.
const ACTION_SETS = {
  swordOL: [
    { action: 'swingO1', left: 18, right: 88, top: -62, bottom: -6 },
    { action: 'swingO2', left: -5, right: 73, top: -50, bottom: 17 },
    { action: 'swingO3', left: 22, right: 102, top: -50, bottom: -10 },
    { action: 'stabO1', left: 20, right: 84, top: -30, bottom: -15 },
    { action: 'stabO2', left: 12, right: 83, top: -30, bottom: -16 },
  ],
  swordOS: [
    { action: 'swingO1', left: 11, right: 85, top: -51, bottom: -11 },
    { action: 'swingO2', left: -5, right: 64, top: -50, bottom: 2 },
    { action: 'swingO3', left: 18, right: 78, top: -41, bottom: -14 },
    { action: 'stabO1', left: 27, right: 74, top: -28, bottom: -18 },
    { action: 'stabO2', left: 27, right: 70, top: -26, bottom: -15 },
  ],
  mace: [
    { action: 'swingO1', left: 0, right: 77, top: -61, bottom: -9 },
    { action: 'swingO2', left: -12, right: 69, top: -55, bottom: 11 },
    { action: 'swingO3', left: 20, right: 94, top: -50, bottom: -14 },
    { action: 'stabO1', left: 17, right: 82, top: -30, bottom: -14 },
    { action: 'stabO2', left: 14, right: 82, top: -30, bottom: -12 },
  ],
  swordTL: [
    { action: 'swingT1', left: 47, right: 100, top: -95, bottom: 2 },
    { action: 'swingT2', left: 31, right: 86, top: -87, bottom: -8 },
    { action: 'swingT3', left: 28, right: 87, top: -83, bottom: 24 },
    { action: 'stabO1', left: 16, right: 110, top: -32, bottom: -10 },
    { action: 'stabO2', left: 44, right: 127, top: -32, bottom: -10 },
  ],
  axe: [
    { action: 'swingT1', left: 51, right: 99, top: -90, bottom: 18 },
    { action: 'swingT2', left: 35, right: 84, top: -79, bottom: 14 },
    { action: 'swingT3', left: 0, right: 85, top: -81, bottom: 26 },
    { action: 'stabO1', left: 9, right: 90, top: -36, bottom: -6 },
    { action: 'stabO2', left: 9, right: 90, top: -36, bottom: -6 },
  ],
  spear: [
    { action: 'swingT2', left: 52, right: 120, top: -125, bottom: 20 },
    { action: 'swingP1', left: 51, right: 133, top: -120, bottom: 24 },
    { action: 'swingP2', left: 47, right: 116, top: -122, bottom: 20 },
    { action: 'stabT1', left: 36, right: 130, top: -33, bottom: -4 },
    { action: 'stabT2', left: 24, right: 111, top: -46, bottom: 0 },
  ],
  swordTS: [
    { action: 'swingT1', left: 47, right: 86, top: -81, bottom: 5 },
    { action: 'swingT3', left: 30, right: 78, top: -73, bottom: 14 },
  ],
  crossBow: [
    { action: 'swingT1', left: 47, right: 86, top: -81, bottom: 5 },
    { action: 'stabT1', left: 21, right: 84, top: -26, bottom: -10 },
  ],
};

const ACTION_WEAPON_TYPES = [
  { key: '1h-sword', label: '1H Sword', source: 'swordOL', actions: ACTION_SETS.swordOL },
  { key: '1h-axe', label: '1H Axe', source: 'swordOL', actions: ACTION_SETS.swordOL },
  { key: '1h-blunt', label: '1H Blunt Weapon', source: 'mace', actions: ACTION_SETS.mace },
  { key: 'dagger', label: 'Dagger', source: 'swordOS', actions: ACTION_SETS.swordOS },
  { key: '2h-sword', label: '2H Sword', source: 'swordTL', actions: ACTION_SETS.swordTL },
  { key: '2h-axe', label: '2H Axe', source: 'axe', actions: ACTION_SETS.axe },
  { key: '2h-blunt', label: '2H Blunt Weapon', source: 'axe', actions: ACTION_SETS.axe },
  { key: 'spear', label: 'Spear', source: 'spear', actions: ACTION_SETS.spear },
  { key: 'polearm', label: 'Polearm', source: 'poleArm', actions: ACTION_SETS.spear },
  { key: 'bow', label: 'Bow', source: 'swordTS', actions: ACTION_SETS.swordTS },
  { key: 'crossbow', label: 'Crossbow', source: 'crossBow', actions: ACTION_SETS.crossBow },
  { key: 'claw', label: 'Claw', source: 'swordOL', actions: ACTION_SETS.swordOL.filter(a => a.action.startsWith('stab')) },
];

const ACTION_WEAPONS_BY_CLASS = {
  Warrior: ['1h-sword', '1h-axe', '1h-blunt', '2h-sword', '2h-axe', '2h-blunt', 'spear', 'polearm'],
  Fighter: ['1h-sword', '1h-axe', '2h-sword', '2h-axe'],
  Crusader: ['1h-sword', '1h-axe', '2h-sword', '2h-axe'],
  Hero: ['1h-sword', '1h-axe', '2h-sword', '2h-axe'],
  Page: ['1h-sword', '1h-blunt', '2h-sword', '2h-blunt'],
  'White Knight': ['1h-sword', '1h-blunt', '2h-sword', '2h-blunt'],
  Paladin: ['1h-sword', '1h-blunt', '2h-sword', '2h-blunt'],
  Spearman: ['spear', 'polearm'],
  'Dragon Knight': ['spear', 'polearm'],
  'Dark Knight': ['spear', 'polearm'],
  Archer: ['bow', 'crossbow'],
  Hunter: ['bow'],
  Ranger: ['bow'],
  Bowmaster: ['bow'],
  Crossbowman: ['crossbow'],
  Sniper: ['crossbow'],
  Marksman: ['crossbow'],
  Rogue: ['dagger', 'claw'],
  Assassin: ['claw'],
  Hermit: ['claw'],
  'Night Lord': ['claw'],
  Bandit: ['dagger'],
  'Chief Bandit': ['dagger'],
  Shadower: ['dagger'],
};

const ACTION_WEAPONS_BY_SKILL = {
  '4001002': ['dagger'], // Double Stab
  '4211002': ['dagger'], // Band of Thieves
};

const ACTION_ANIMATIONS_BY_SKILL = {
  '4001002': ['stabO1', 'stabO2'],       // Double Stab pins its action list.
  '1311001': ['swingP1', 'swingP2'],    // Dragon Fury pins its action list.
};

function actionWeaponTypesForSkill(skill) {
  const id = String(skill.id ?? '').padStart(7, '0');
  const keys = ACTION_WEAPONS_BY_SKILL[id] || ACTION_WEAPONS_BY_CLASS[skill.class_name];
  if (!keys) return [ACTION_WEAPON_TYPES[0]];
  const allowed = new Set(keys);
  const allowedActions = ACTION_ANIMATIONS_BY_SKILL[id];
  return ACTION_WEAPON_TYPES
    .filter(weapon => allowed.has(weapon.key))
    .map(weapon => ({
      ...weapon,
      actions: allowedActions
        ? weapon.actions.filter(action => allowedActions.includes(action.action))
        : weapon.actions,
    }))
    .filter(weapon => weapon.actions.length);
}

function svgEl(name, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}

function addGrid(svg, id, minX, minY, width, height) {
  const defs = svgEl('defs');
  const pattern = svgEl('pattern', { id, width: 20, height: 20, patternUnits: 'userSpaceOnUse' });
  pattern.appendChild(svgEl('path', { d: 'M 20 0 L 0 0 0 20', class: 'hitviz-grid-line' }));
  defs.appendChild(pattern);
  svg.appendChild(defs);
  svg.appendChild(svgEl('rect', {
    x: minX, y: minY, width, height, fill: `url(#${id})`, class: 'hitviz-grid-fill',
  }));
}

function addGround(svg, minX, maxX) {
  const width = maxX - minX;
  const terrain = svgEl('svg', {
    x: minX, y: -13, width, height: 98, viewBox: `0 0 ${width} 98`,
    class: 'hitviz-terrain-crop', overflow: 'hidden', 'aria-hidden': 'true',
  });
  for (let x = 0; x < width; x += 90) {
    terrain.appendChild(svgEl('image', {
      href: GROUND_EDGE, x, y: 0, width: 90, height: 38, class: 'hitviz-terrain-sprite',
    }));
    terrain.appendChild(svgEl('image', {
      href: GROUND_FILL, x, y: 38, width: 90, height: 60, class: 'hitviz-terrain-sprite',
    }));
  }
  svg.appendChild(terrain);
  svg.appendChild(svgEl('line', { x1: minX, y1: 0, x2: maxX, y2: 0, class: 'skill-range-ground' }));
}

function addCharacter(svg) {
  svg.appendChild(svgEl('image', {
    href: CHARACTER, x: -23, y: -66, width: 39, height: 66,
    transform: 'translate(-7 0) scale(-1 1)', class: 'hitviz-sprite', 'aria-hidden': 'true',
  }));
  svg.appendChild(svgEl('line', { x1: -8, y1: 0, x2: 8, y2: 0, class: 'hitviz-origin' }));
  svg.appendChild(svgEl('line', { x1: 0, y1: -8, x2: 0, y2: 8, class: 'hitviz-origin' }));
  svg.appendChild(svgEl('circle', { cx: 0, cy: 0, r: 3, class: 'hitviz-origin-dot' }));
}

function addDestinationCharacter(svg, x, groundY = 0, facingRight = true) {
  const attrs = {
    href: CHARACTER, x: x - 16, y: groundY - 66, width: 39, height: 66,
    class: 'hitviz-sprite skill-range-destination', 'aria-hidden': 'true',
  };
  if (facingRight) attrs.transform = `translate(${2 * x + 7} 0) scale(-1 1)`;
  svg.appendChild(svgEl('image', attrs));
  svg.appendChild(svgEl('circle', {
    cx: x, cy: groundY, r: 4, class: 'skill-range-destination-point',
  }));
}

function addMob(svg, x, groundY = 0) {
  const width = 62;
  const height = 51;
  svg.appendChild(svgEl('image', {
    href: STUMP, x: x - width / 2, y: groundY - height, width, height,
    class: 'hitviz-sprite hitviz-mob-sprite', 'aria-hidden': 'true',
  }));
  svg.appendChild(svgEl('rect', {
    x: x - 23, y: groundY - 46, width: 46, height: 46, class: 'hitviz-mob-box',
  }));
}

function addAlly(svg, x, groundY = 0) {
  svg.appendChild(svgEl('image', {
    href: CHARACTER, x: x - 23, y: groundY - 66, width: 39, height: 66,
    transform: `translate(${2 * x - 7} 0) scale(-1 1)`, class: 'hitviz-sprite', 'aria-hidden': 'true',
  }));
  svg.appendChild(svgEl('rect', {
    x: x - 20, y: groundY - 64, width: 39, height: 64, class: 'skill-range-ally-box',
  }));
  addLabel(svg, 'ally', x, groundY - 74, 'hitviz-svg-text--muted');
}

function addLabel(svg, text, x, y, className = '') {
  const node = svgEl('text', { x, y, class: `hitviz-svg-text ${className}`.trim() });
  node.textContent = text;
  svg.appendChild(node);
}

function selectedGeometry(visual, level) {
  const levels = Array.isArray(visual.levels) ? visual.levels : [];
  if (!levels.length) return null;
  return [...levels].reverse().find(item => item.level <= level) || levels[0];
}

function mirroredBoxes(geometry) {
  if (!geometry) return [];
  const boxes = [[geometry.lt, geometry.rb]];
  if (geometry.lt2 && geometry.rb2) boxes.push([geometry.lt2, geometry.rb2]);
  return boxes.map(([lt, rb]) => ({
    left: Math.min(-rb.x, -lt.x),
    right: Math.max(-rb.x, -lt.x),
    top: Math.min(lt.y, rb.y),
    bottom: Math.max(lt.y, rb.y),
  }));
}

function storedRectangleNeedsOverview(visual) {
  const boxes = (visual.levels || []).flatMap(item => mirroredBoxes(item));
  if (!boxes.length) return false;
  const width = Math.max(...boxes.map(box => box.right))
    - Math.min(...boxes.map(box => box.left));
  const height = Math.max(...boxes.map(box => box.bottom))
    - Math.min(...boxes.map(box => box.top));
  return width >= 400 || height >= 300;
}

function animateRect(rect, from, to) {
  const attributes = {
    x: ['left', value => value],
    y: ['top', value => value],
    width: ['right', value => value - to.left],
    height: ['bottom', value => value - to.top],
  };
  Object.entries(attributes).forEach(([attribute, [key, convert]]) => {
    const fromValue = attribute === 'width'
      ? from.right - from.left
      : attribute === 'height'
        ? from.bottom - from.top
        : convert(from[key]);
    const toValue = attribute === 'width'
      ? to.right - to.left
      : attribute === 'height'
        ? to.bottom - to.top
        : convert(to[key]);
    if (fromValue === toValue) return;
    rect.appendChild(svgEl('animate', {
      attributeName: attribute,
      from: fromValue,
      to: toValue,
      dur: '180ms',
      fill: 'freeze',
      calcMode: 'spline',
      keyTimes: '0;1',
      keySplines: '.2 0 0 1',
    }));
  });
}

function numericRange(value) {
  if (typeof value === 'number') return value;
  if (!Array.isArray(value)) return null;
  const numbers = value.filter(v => typeof v === 'number');
  return numbers.length ? Math.max(...numbers) : null;
}

function numericMagnitude(value) {
  if (typeof value === 'number') return Math.abs(value);
  if (!Array.isArray(value)) return null;
  const numbers = value.filter(v => typeof v === 'number').map(Math.abs);
  return numbers.length ? Math.max(...numbers) : null;
}

function numericAtLevel(value, level) {
  if (typeof value === 'number') return value;
  if (!Array.isArray(value) || !value.length) return null;
  const direct = value[Math.max(0, level - 1)];
  if (typeof direct === 'number') return direct;
  for (let index = Math.min(value.length - 1, level - 1); index >= 0; index -= 1) {
    if (typeof value[index] === 'number') return value[index];
  }
  return value.find(item => typeof item === 'number') ?? null;
}

function attackRangeValue(visual, skillLevel, passiveLevel) {
  const attackRange = visual.attack_range;
  if (!attackRange) return null;
  const base = numericAtLevel(attackRange.base, skillLevel);
  if (base == null) return null;
  const bonus = passiveLevel > 0
    ? numericAtLevel(attackRange.passive?.values, passiveLevel) || 0
    : 0;
  return base + bonus;
}

function hasLevelChanges(value) {
  if (!Array.isArray(value)) return false;
  const numbers = value.filter(item => typeof item === 'number');
  return numbers.length > 1 && new Set(numbers).size > 1;
}

function fixedRectangleScene(visual, level, uid, previousLevel = null) {
  const geometry = selectedGeometry(visual, level);
  if (!geometry) return null;
  const mirrored = mirroredBoxes(geometry);
  const previous = mirroredBoxes(selectedGeometry(visual, previousLevel ?? level));
  const allBoxes = visual.levels.flatMap(item => mirroredBoxes(item));
  const minX = Math.min(-55, ...allBoxes.map(box => box.left)) - 30;
  const maxX = Math.max(90, ...allBoxes.map(box => box.right)) + 55;
  const minY = Math.min(-90, ...allBoxes.map(box => box.top)) - 25;
  const maxY = Math.max(35, ...allBoxes.map(box => box.bottom)) + 20;
  const svg = makeSvg(uid, minX, minY, maxX, maxY,
    `Skill target rectangle at level ${geometry.level}, measured from the character's feet`);
  mirrored.forEach((box, index) => {
    const rect = svgEl('rect', {
      x: box.left, y: box.top, width: Math.max(1, box.right - box.left),
      height: Math.max(1, box.bottom - box.top),
      class: index ? 'hitviz-hitbox hitviz-hitbox--secondary' : 'hitviz-hitbox',
    });
    if (previousLevel != null) animateRect(rect, previous[index] || box, box);
    svg.appendChild(rect);
  });
  const primary = mirrored[0];
  const anchor = mirroredBoxes(visual.levels[0])[0] || primary;
  const centered = anchor.left < 0 && anchor.right > 0;
  const preferredX = centered ? Math.max(60, anchor.right * 0.62) : (anchor.left + anchor.right) / 2;
  const mobX = Math.min(anchor.right - 20, Math.max(anchor.left + 20, preferredX));
  if (visual.target === 'party') addAlly(svg, mobX, Math.min(0, anchor.bottom));
  else addMob(svg, mobX, Math.min(0, anchor.bottom));
  addCharacter(svg);
  addLabel(svg, `Lv.${level}`, minX + 12, minY + 18, 'hitviz-svg-text--muted');
  return svg;
}

function addMotionArrow(svg, uid, x1, y1, x2, y2) {
  const markerId = `skill-range-arrow-${uid}`;
  const defs = svgEl('defs');
  const marker = svgEl('marker', {
    id: markerId, markerWidth: 8, markerHeight: 8, refX: 7, refY: 4,
    orient: 'auto', markerUnits: 'strokeWidth', viewBox: '0 0 8 8',
  });
  marker.appendChild(svgEl('path', { d: 'M 0 0 L 8 4 L 0 8 z', class: 'skill-range-motion-arrowhead' }));
  defs.appendChild(marker);
  svg.appendChild(defs);
  svg.appendChild(svgEl('line', {
    x1, y1, x2, y2, class: 'skill-range-motion-vector', 'marker-end': `url(#${markerId})`,
  }));
}

function teleportScene(visual, level, uid) {
  const distance = numericAtLevel(visual.distance, level);
  const maxDistance = numericMagnitude(visual.distance);
  if (distance == null || maxDistance == null) return null;
  const minX = -55;
  const maxX = maxDistance + 70;
  const minY = -125;
  const maxY = 45;
  const svg = makeSvg(uid, minX, minY, maxX, maxY,
    `Maximum teleport displacement at skill level ${level}: ${distance} pixels`);
  const dimensionY = -88;
  svg.appendChild(svgEl('line', {
    x1: 0, y1: dimensionY, x2: distance, y2: dimensionY,
    class: 'hitviz-dimension skill-range-motion-dimension',
  }));
  [0, distance].forEach(x => svg.appendChild(svgEl('line', {
    x1: x, y1: dimensionY - 7, x2: x, y2: dimensionY + 7,
    class: 'hitviz-dimension skill-range-motion-dimension',
  })));
  svg.appendChild(svgEl('line', {
    x1: distance, y1: dimensionY + 8, x2: distance, y2: 0,
    class: 'skill-range-motion-guide',
  }));
  addMotionArrow(svg, uid, 18, -28, Math.max(30, distance - 18), -28);
  addDestinationCharacter(svg, distance);
  addCharacter(svg);
  addLabel(svg, `${distance} px max`, distance / 2, dimensionY - 12, 'hitviz-svg-text--dimension');
  addLabel(svg, 'destination', distance, -76, 'hitviz-svg-text--muted');
  return svg;
}

function jumpTrajectoryValues(visual, level) {
  const horizontal = numericAtLevel(visual.horizontal, level);
  const vertical = numericAtLevel(visual.vertical, level);
  const gravity = visual.physics?.gravity_acc;
  const fallSpeed = visual.physics?.fall_speed;
  const jumpSpeed = visual.physics?.normal_jump_speed;
  if (![horizontal, vertical, gravity, fallSpeed, jumpSpeed].every(Number.isFinite)
      || gravity <= 0 || fallSpeed <= 0) return null;
  const vx = horizontal;
  const vy = Math.abs(vertical);
  const activationHeight = jumpSpeed ** 2 / (2 * gravity);
  const riseTime = vy / gravity;
  const peakHeight = activationHeight + vy ** 2 / (2 * gravity);
  const terminalTime = fallSpeed / gravity;
  const terminalDistance = fallSpeed ** 2 / (2 * gravity);
  const fallTime = peakHeight <= terminalDistance
    ? Math.sqrt(2 * peakHeight / gravity)
    : terminalTime + (peakHeight - terminalDistance) / fallSpeed;
  const airtime = riseTime + fallTime;
  return {
    vx, vy, gravity, fallSpeed, activationHeight, riseTime, peakHeight, airtime,
    distance: vx * airtime,
  };
}

function trajectoryHeightAt(values, time) {
  if (time <= values.riseTime) {
    return values.activationHeight + values.vy * time - .5 * values.gravity * time ** 2;
  }
  const fallingFor = time - values.riseTime;
  const terminalTime = values.fallSpeed / values.gravity;
  const terminalDistance = values.fallSpeed ** 2 / (2 * values.gravity);
  const fallen = fallingFor <= terminalTime
    ? .5 * values.gravity * fallingFor ** 2
    : terminalDistance + values.fallSpeed * (fallingFor - terminalTime);
  return Math.max(0, values.peakHeight - fallen);
}

function jumpTrajectoryScene(visual, level, uid) {
  const current = jumpTrajectoryValues(visual, level);
  if (!current) return null;
  const levelCount = Math.max(
    Array.isArray(visual.horizontal) ? visual.horizontal.length : 1,
    Array.isArray(visual.vertical) ? visual.vertical.length : 1,
  );
  const all = Array.from({ length: levelCount }, (_, index) => jumpTrajectoryValues(visual, index + 1))
    .filter(Boolean);
  const furthestLeft = Math.min(0, ...all.map(item => item.distance));
  const furthestRight = Math.max(0, ...all.map(item => item.distance));
  const highest = Math.max(...all.map(item => item.peakHeight));
  const minX = furthestLeft - 65;
  const maxX = furthestRight + 65;
  const minY = -highest - 42;
  const maxY = 45;
  const svg = makeSvg(uid, minX, minY, maxX, maxY,
    `Calculated flat-ground trajectory at skill level ${level}: ${Math.round(Math.abs(current.distance))} pixels horizontally over ${current.airtime.toFixed(2)} seconds`);

  const points = Array.from({ length: 41 }, (_, index) => {
    const time = current.airtime * index / 40;
    return `${(current.vx * time).toFixed(2)},${(-trajectoryHeightAt(current, time)).toFixed(2)}`;
  });
  const markerId = `skill-range-arrow-${uid}`;
  const defs = svgEl('defs');
  const marker = svgEl('marker', {
    id: markerId, markerWidth: 8, markerHeight: 8, refX: 7, refY: 4,
    orient: 'auto', markerUnits: 'strokeWidth', viewBox: '0 0 8 8',
  });
  marker.appendChild(svgEl('path', { d: 'M 0 0 L 8 4 L 0 8 z', class: 'skill-range-motion-arrowhead' }));
  defs.appendChild(marker);
  svg.appendChild(defs);

  svg.appendChild(svgEl('line', {
    x1: 0, y1: 0, x2: 0, y2: -current.activationHeight,
    class: 'skill-range-jump-ascent',
  }));
  svg.appendChild(svgEl('polyline', {
    points: points.join(' '), class: 'skill-range-jump-trajectory',
    'marker-end': `url(#${markerId})`,
  }));
  svg.appendChild(svgEl('line', {
    x1: current.distance, y1: -current.peakHeight, x2: current.distance, y2: 0,
    class: 'skill-range-motion-guide',
  }));
  const facingRight = current.distance >= 0;
  addDestinationCharacter(svg, current.distance, 0, facingRight);
  addDestinationCharacter(svg, 0, -current.activationHeight, facingRight);
  addLabel(svg, 'activate at jump apex', 0, -current.activationHeight - 76, 'hitviz-svg-text--muted');
  addLabel(svg, `${Math.round(Math.abs(current.distance))} px`, current.distance / 2, -12, 'hitviz-svg-text--dimension');
  addLabel(svg, 'normal jump', 11, -current.activationHeight / 2, 'hitviz-svg-text--muted');
  return svg;
}

function corridorScene(visual, uid, far) {
  const geometry = visual.geometry;
  if (!geometry || far == null) return null;
  const near = geometry.near;
  const nearHalf = geometry.base_half_height + Math.trunc(near / geometry.height_divisor);
  const farHalf = geometry.base_half_height + Math.trunc(far / geometry.height_divisor);
  const minX = -45;
  const maxX = far + 70;
  const minY = -Math.max(90, farHalf) - 30;
  const maxY = Math.max(45, farHalf) + 25;
  const svg = makeSvg(uid, minX, minY, maxX, maxY,
    'Widening ranged target corridor beginning in front of the character');
  svg.appendChild(svgEl('polygon', {
    points: `${near},${-nearHalf} ${far},${-farHalf} ${far},${farHalf} ${near},${nearHalf}`,
    class: 'hitviz-hitbox',
  }));
  const stripY = geometry.reference_y;
  svg.appendChild(svgEl('line', {
    x1: near, y1: stripY, x2: far, y2: stripY,
    class: 'hitviz-hitbox hitviz-hitbox--strip hitviz-hitbox--secondary',
  }));
  const mobX = Math.round(far * 0.73);
  addMob(svg, mobX, 0);
  if (visual.terrain_check) {
    svg.appendChild(svgEl('line', { x1: 0, y1: 0, x2: mobX, y2: -25, class: 'hitviz-los' }));
  }
  addCharacter(svg);
  return svg;
}

function actionExtensionLimit(visual, level, actionRight) {
  const geometry = selectedGeometry(visual, level);
  const primary = mirroredBoxes(geometry)[0];
  return Math.max(actionRight, primary?.right || numericRange(visual.range) || 150);
}

function actionScene(visual, uid, action, level, previousLevel = null) {
  const extended = visual.family === 'action_extended';
  const { left: actionLeft, right: actionRight, top: actionTop, bottom: actionBottom } = action;
  const extendedRight = extended ? actionExtensionLimit(visual, level, actionRight) : actionRight;
  const previousRight = extended && previousLevel != null
    ? actionExtensionLimit(visual, previousLevel, actionRight)
    : extendedRight;
  const extensionLevels = Array.isArray(visual.levels) && visual.levels.length
    ? visual.levels
    : [{ level }];
  const maxExtendedRight = extended
    ? Math.max(...extensionLevels.map(item => actionExtensionLimit(visual, item.level, actionRight)))
    : actionRight;
  const minX = -50;
  const maxX = Math.max(155, actionRight + 55, extended ? maxExtendedRight + 55 : 0);
  const minY = Math.min(-125, actionTop - 35);
  const maxY = 45;
  const svg = makeSvg(uid, minX, minY, maxX, maxY,
    extended
      ? 'Weapon animation target area with a conditional forward extension'
      : 'Representative target area supplied by the current weapon animation');
  svg.appendChild(svgEl('rect', {
    x: actionLeft,
    y: actionTop,
    width: actionRight - actionLeft,
    height: actionBottom - actionTop,
    class: 'hitviz-hitbox',
  }));
  if (extended) {
    const extension = svgEl('rect', {
      x: actionRight,
      y: actionTop,
      width: extendedRight - actionRight,
      height: actionBottom - actionTop,
      class: 'hitviz-hitbox hitviz-hitbox--secondary',
    });
    if (previousLevel != null) {
      animateRect(extension, {
        left: actionRight, right: previousRight, top: actionTop, bottom: actionBottom,
      }, {
        left: actionRight, right: extendedRight, top: actionTop, bottom: actionBottom,
      });
    }
    svg.appendChild(extension);
  }
  addMob(svg, (extended ? maxExtendedRight : actionRight) + 10, 0);
  addCharacter(svg);
  return svg;
}

function makePillSelector(options, selected, config) {
  const group = el('div', {
    className: 'skill-range-pill-group',
    role: 'group',
    'aria-label': config.ariaLabel,
  });
  const buttons = [];

  function sync(next) {
    buttons.forEach(button => {
      const active = button._option === next;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  options.forEach(option => {
    const button = el('button', {
      className: 'skill-range-choice',
      type: 'button',
      textContent: config.label(option),
      title: config.title?.(option) || '',
      'aria-pressed': 'false',
    });
    button._option = option;
    button.addEventListener('click', event => {
      event.stopPropagation();
      sync(option);
      config.onSelect(option);
    });
    buttons.push(button);
    group.appendChild(button);
  });
  sync(selected);
  return group;
}

function makeWeaponActionSelector(weapons, selectedWeapon, selectedAction, onSelect) {
  const wrap = el('div', { className: 'skill-range-weapon-selector' });
  const weaponField = el('div', { className: 'skill-range-selector-field' });
  const actionField = el('div', { className: 'skill-range-selector-field' });
  weaponField.appendChild(el('span', { className: 'skill-range-selector-label', textContent: 'Weapon' }));

  function buildActionField(weapon, action) {
    actionField.innerHTML = '';
    actionField.appendChild(el('span', { className: 'skill-range-selector-label', textContent: 'Animation' }));
    actionField.appendChild(makePillSelector(weapon.actions, action, {
      ariaLabel: 'Weapon animation',
      label: option => option.action,
      title: option => `${option.right - option.left} px wide by ${option.bottom - option.top} px high`,
      onSelect: option => onSelect(weapon, option),
    }));
  }

  weaponField.appendChild(makePillSelector(weapons, selectedWeapon, {
    ariaLabel: 'Weapon type',
    label: option => option.label,
    title: option => `${option.actions.length} animation${option.actions.length === 1 ? '' : 's'}`,
    onSelect: weapon => {
      const action = weapon.actions[0];
      buildActionField(weapon, action);
      onSelect(weapon, action);
    },
  }));
  buildActionField(selectedWeapon, selectedAction);
  wrap.append(weaponField, actionField);
  return wrap;
}

function makeHitboxMetrics(bounds, visual, level, extensionStart = null) {
  const metrics = el('aside', { className: 'skill-range-action-metrics', 'aria-label': 'Hitbox dimensions' });
  metrics.appendChild(el('div', { className: 'skill-range-metrics-title', textContent: 'Hitbox dimensions' }));

  const horizontal = fact('Horizontal', `${bounds.right - bounds.left} px`);
  horizontal.appendChild(el('span', {
    className: 'skill-range-metric-bounds',
    textContent: `${bounds.left} to ${bounds.right} px`,
  }));
  const vertical = fact('Vertical', `${bounds.bottom - bounds.top} px`);
  vertical.appendChild(el('span', {
    className: 'skill-range-metric-bounds',
    textContent: `${bounds.top} to ${bounds.bottom} px`,
  }));
  metrics.append(horizontal, vertical);

  if (visual.family === 'action_extended' && extensionStart != null) {
    const limit = actionExtensionLimit(visual, level, extensionStart);
    const extension = fact('Forward limit', `${limit} px`);
    extension.appendChild(el('span', {
      className: 'skill-range-metric-bounds',
      textContent: `${Math.max(0, limit - extensionStart)} px beyond action area`,
    }));
    metrics.appendChild(extension);
  }
  return metrics;
}

function makeMovementMetrics(visual, level) {
  const metrics = el('aside', { className: 'skill-range-action-metrics', 'aria-label': 'Movement values' });
  metrics.appendChild(el('div', { className: 'skill-range-metrics-title', textContent: 'Movement values' }));
  if (visual.family === 'teleport_range') {
    const distance = numericAtLevel(visual.distance, level);
    const displacement = fact('Max displacement', distance == null ? 'Unavailable' : `${distance} px`);
    displacement.appendChild(el('span', {
      className: 'skill-range-metric-bounds',
      textContent: 'Horizontal reference shown',
    }));
    metrics.appendChild(displacement);
  } else if (visual.family === 'jump_trajectory') {
    const values = jumpTrajectoryValues(visual, level);
    const distanceFact = fact('Flat-ground reach', values ? `~${Math.round(Math.abs(values.distance))} px` : 'Unavailable');
    distanceFact.appendChild(el('span', {
      className: 'skill-range-metric-bounds',
      textContent: values?.vx < 0 ? 'Backward' : 'Forward',
    }));
    const airtimeFact = fact('After activation', values ? `${values.airtime.toFixed(2)} s` : 'Unavailable');
    airtimeFact.appendChild(el('span', {
      className: 'skill-range-metric-bounds',
      textContent: 'Until flat-ground landing',
    }));
    const heightFact = fact('Peak above ground', values ? `~${Math.round(values.peakHeight)} px` : 'Unavailable');
    heightFact.appendChild(el('span', {
      className: 'skill-range-metric-bounds',
      textContent: 'Includes normal-jump height',
    }));
    metrics.append(distanceFact, airtimeFact, heightFact);
  }
  return metrics;
}

function piercingScene(visual, uid, far) {
  if (far == null) return null;
  const near = 65;
  const minX = -45;
  const maxX = far + 55;
  const minY = -125;
  const maxY = 45;
  const svg = makeSvg(uid, minX, minY, maxX, maxY,
    'One piercing projectile crossing several monsters already selected by the skill');
  svg.appendChild(svgEl('rect', {
    x: near, y: -72, width: Math.max(1, far - near), height: 72, class: 'hitviz-hitbox',
  }));
  [0.3, 0.6, 0.86].forEach(position => addMob(svg, Math.round(near + (far - near) * position), 0));
  svg.appendChild(svgEl('line', { x1: 23, y1: -30, x2: far, y2: -30, class: 'skill-range-projectile' }));
  addCharacter(svg);
  addLabel(svg, `${far} px piercing path`, (near + far) / 2, -87, 'hitviz-svg-text--dimension');
  return svg;
}

function specialScene(visual, uid) {
  const minX = -45;
  const maxX = 320;
  const minY = -125;
  const maxY = 45;
  const svg = makeSvg(uid, minX, minY, maxX, maxY,
    'Representative special target area; exact geometry depends on the skill route');
  svg.appendChild(svgEl('rect', { x: 55, y: -80, width: 210, height: 80, class: 'hitviz-hitbox hitviz-hitbox--secondary' }));
  addMob(svg, 205, 0);
  addCharacter(svg);
  addLabel(svg, 'special target route', 160, -95, 'hitviz-svg-text--muted');
  return svg;
}

function makeSvg(uid, minX, minY, maxX, maxY, ariaLabel) {
  const width = maxX - minX;
  const height = maxY - minY;
  const svg = svgEl('svg', {
    viewBox: `${minX} ${minY} ${width} ${height}`,
    class: 'hitviz-svg hitviz-svg--mini skill-range-svg',
    role: 'img', 'aria-label': ariaLabel, preserveAspectRatio: 'xMidYMid meet',
    style: `--skill-range-natural-height: ${height}px`,
  });
  addGrid(svg, `skill-range-grid-${uid}`, minX, minY, width, height);
  addGround(svg, minX, maxX);
  return svg;
}

function fact(label, value) {
  const item = el('div', { className: 'skill-range-fact' });
  item.appendChild(el('span', { className: 'skill-range-fact-label', textContent: label }));
  item.appendChild(el('span', { className: 'skill-range-fact-value', textContent: value }));
  return item;
}

function buildAttackRangeSection(skill, visual, skillLevel, passiveLevel, onPassiveLevel) {
  const attackRange = visual.attack_range;
  const section = el('section', { className: 'skill-attack-range' });
  const heading = el('div', { className: 'skill-attack-range-heading' });
  const headingText = el('div');
  headingText.appendChild(el('div', { className: 'skill-range-eyebrow', textContent: 'Attack range' }));
  const total = attackRangeValue(visual, skillLevel, passiveLevel);
  const totalValue = el('div', {
    className: 'skill-attack-range-total',
    textContent: total == null ? 'Exact value unavailable' : `${total} px`,
  });
  headingText.appendChild(totalValue);
  heading.appendChild(headingText);

  const passive = attackRange?.passive;
  let passiveFactValue = null;
  if (passive?.max_level > 0) {
    const control = el('label', { className: 'skill-range-level-slider skill-attack-range-slider' });
    const controlHeading = el('span', { className: 'skill-range-level-slider-heading' });
    controlHeading.appendChild(el('span', { textContent: passive.name }));
    const value = el('strong', { textContent: `Lv.${passiveLevel}` });
    controlHeading.appendChild(value);
    const input = el('input', {
      type: 'range', min: 0, max: passive.max_level, step: 1, value: passiveLevel,
      'aria-label': `${passive.name} level`,
    });
    input.addEventListener('input', event => {
      event.stopPropagation();
      const nextLevel = Number(input.value);
      value.textContent = `Lv.${nextLevel}`;
      const nextTotal = attackRangeValue(visual, skillLevel, nextLevel);
      totalValue.textContent = nextTotal == null ? 'Exact value unavailable' : `${nextTotal} px`;
      const nextBonus = nextLevel > 0 ? numericAtLevel(passive.values, nextLevel) || 0 : 0;
      if (passiveFactValue) {
        passiveFactValue.textContent = `+${nextBonus} px · ${passive.name} Lv.${nextLevel}`;
      }
      onPassiveLevel(nextLevel);
    });
    control.append(controlHeading, input);
    heading.appendChild(control);
  }
  section.appendChild(heading);

  const factors = el('div', { className: 'skill-attack-range-factors' });
  if (attackRange) {
    const base = numericAtLevel(attackRange.base, skillLevel);
    const weaponSource = attackRange.source === 'weapon';
    const defaultSource = attackRange.source === 'client_default';
    const source = weaponSource
      ? (attackRange.weapons || []).join(' / ')
      : defaultSource ? 'Property-119 fallback' : skill.name;
    factors.appendChild(fact(
      weaponSource ? 'Weapon base' : defaultSource ? 'Client default' : 'Skill value',
      base == null ? 'Unavailable' : `${base} px · ${source}`,
    ));
    if (passive) {
      const bonus = passiveLevel > 0 ? numericAtLevel(passive.values, passiveLevel) || 0 : 0;
      const passiveFact = fact('Passive bonus', `+${bonus} px · ${passive.name} Lv.${passiveLevel}`);
      passiveFactValue = passiveFact.querySelector('.skill-range-fact-value');
      factors.appendChild(passiveFact);
    }
  } else {
    factors.appendChild(fact('Range source', 'Not exposed by the current skill data'));
  }
  if (visual.geometry?.near != null) {
    factors.appendChild(fact('Target search begins', `${visual.geometry.near} px in front of feet`));
  }
  section.appendChild(factors);
  return section;
}

function familyLabel(family) {
  return ({
    fixed_rectangle: 'Stored attack rectangle',
    effect_rectangle: 'Stored party-effect rectangle',
    ranged_corridor: 'Widening ranged corridor',
    action_hitbox: 'Weapon animation area',
    action_extended: 'Weapon area + conditional extension',
    piercing_line: 'Piercing projectile route',
    teleport_range: 'Teleport displacement',
    jump_trajectory: 'Flat-ground jump trajectory',
    special: 'Special target route',
  })[family] || 'Target area';
}

function rangeSourceDescription(visual) {
  if (visual.family === 'action_hitbox') {
    return 'Determined by the selected weapon type and attack action.';
  }
  if (visual.family === 'action_extended') {
    return 'Starts with the selected weapon type and attack action; skill logic can extend it forward.';
  }
  if (visual.family === 'fixed_rectangle') {
    return "Hardcoded in this skill's stored attack rectangle.";
  }
  if (visual.family === 'effect_rectangle') {
    return "Hardcoded in this skill's stored party-effect rectangle.";
  }
  if (visual.family === 'ranged_corridor') {
    const attackRange = visual.attack_range;
    if (attackRange?.source === 'weapon') {
      const weapons = (attackRange.weapons || []).join(' / ');
      const passive = attackRange.passive?.name;
      return `Determined by the weapon type${weapons ? ` (${weapons})` : ''}${passive ? `, with ${passive} added when learned` : ''}.`;
    }
    if (attackRange?.source === 'skill') {
      return `Hardcoded in this skill's stored range value${hasLevelChanges(attackRange.base) ? ' and changes with skill level' : ''}.`;
    }
    if (attackRange?.source === 'client_default') {
      return `Uses the client's ${numericAtLevel(attackRange.base, 1)} px default for widening ranged attacks.`;
    }
    return 'Uses the client ranged-attack route; an exact range value is not exposed by the skill data.';
  }
  if (visual.family === 'piercing_line') {
    const attackRange = visual.attack_range;
    if (attackRange?.source === 'weapon') {
      const weapons = (attackRange.weapons || []).join(' / ');
      const base = numericAtLevel(attackRange.base, 1);
      const passive = attackRange.passive?.name;
      return `Maximum targeting distance is the ${weapons || 'equipped weapon'} base range${base == null ? '' : ` (${base} px)`}${passive ? ` plus the selected ${passive} bonus` : ''}. The projectile then follows the selected targets, up to the skill's target limit.`;
    }
    return 'The projectile follows the selected targets, up to the skill\'s target limit; an exact maximum distance is not exposed by the current data.';
  }
  if (visual.family === 'teleport_range') {
    return `Uses the skill's stored maximum displacement${hasLevelChanges(visual.distance) ? ', which changes with skill level' : ''}. The horizontal reference is shown; direction and map collision determine the actual endpoint.`;
  }
  if (visual.family === 'jump_trajectory') {
    return `Calculated from the skill's signed launch velocity and the current client's gravity, fall-speed, and normal-jump values${hasLevelChanges(visual.horizontal) || hasLevelChanges(visual.vertical) ? '; reach changes with skill level' : ''}. Model: activate at the apex of a stationary normal jump over flat ground, with no collision or inherited horizontal speed.`;
  }
  return 'Determined by skill-specific client logic; no fixed range geometry is exposed.';
}

export function buildSkillRangeVisual(skill) {
  const visual = skill.range_visual;
  if (!visual) return null;
  const uid = ++rangeVizId;
  const usesWeaponAction = visual.family === 'action_hitbox' || visual.family === 'action_extended';
  const usesStoredRectangle = visual.family === 'fixed_rectangle' || visual.family === 'effect_rectangle';
  const usesAttackRange = visual.family === 'ranged_corridor' || visual.family === 'piercing_line';
  const usesMovement = visual.family === 'teleport_range' || visual.family === 'jump_trajectory';
  const usesRectangleOverview = usesStoredRectangle && storedRectangleNeedsOverview(visual);
  const actionWeapons = usesWeaponAction ? actionWeaponTypesForSkill(skill) : [ACTION_WEAPON_TYPES[0]];
  let actionWeapon = actionWeapons[0];
  let actionAnimation = actionWeapon.actions[0];
  let currentPassiveLevel = visual.attack_range?.passive?.max_level || 0;
  const figure = el('figure', { className: 'skill-range-figure' });
  const header = el('figcaption', { className: 'skill-range-header' });
  const titleWrap = el('div');
  titleWrap.appendChild(el('div', {
    className: 'skill-range-eyebrow',
    textContent: usesMovement ? 'Movement & reach' : 'Range & targeting',
  }));
  titleWrap.appendChild(el('div', { className: 'skill-range-title', textContent: familyLabel(visual.family) }));
  header.appendChild(titleWrap);

  const levels = Array.isArray(visual.levels) ? visual.levels : [];
  let currentLevel = levels[levels.length - 1]?.level || skill.max_level || 1;
  const levelMin = levels[0]?.level || 1;
  const levelMax = levels[levels.length - 1]?.level || skill.max_level || 1;
  const levelSensitive = (levels.length > 1
    && (usesStoredRectangle || visual.family === 'action_extended')
    && levels[0].level !== levels[levels.length - 1].level)
    || hasLevelChanges(visual.attack_range?.base)
    || hasLevelChanges(visual.distance)
    || hasLevelChanges(visual.horizontal)
    || hasLevelChanges(visual.vertical);
  if (levelSensitive) {
    const levelControl = el('label', { className: 'skill-range-level-slider' });
    const levelHeading = el('span', { className: 'skill-range-level-slider-heading' });
    levelHeading.appendChild(el('span', { textContent: 'Skill level' }));
    const levelValue = el('strong', { textContent: `Lv.${currentLevel}` });
    levelHeading.appendChild(levelValue);
    const levelInput = el('input', {
      type: 'range',
      min: levelMin,
      max: levelMax,
      step: 1,
      value: currentLevel,
      'aria-label': 'Diagram skill level',
    });
    levelInput.addEventListener('input', event => {
      event.stopPropagation();
      const previousLevel = currentLevel;
      currentLevel = Number(levelInput.value);
      levelValue.textContent = `Lv.${currentLevel}`;
      renderStage(previousLevel);
    });
    levelControl.append(levelHeading, levelInput);
    header.appendChild(levelControl);
  }
  figure.appendChild(header);

  const showsMetrics = usesWeaponAction || usesStoredRectangle || usesMovement;
  const stage = el('div', {
    className: `hitviz-stage skill-range-stage${showsMetrics ? ' skill-range-stage--with-metrics' : ''}${usesRectangleOverview ? ' skill-range-stage--overview' : ''}`,
  });
  figure.appendChild(stage);
  const attackRangeHost = el('div');
  if (usesAttackRange) figure.appendChild(attackRangeHost);
  if (usesWeaponAction) {
    figure.appendChild(makeWeaponActionSelector(actionWeapons, actionWeapon, actionAnimation, (weapon, animation) => {
      actionWeapon = weapon;
      actionAnimation = animation;
      renderStage();
    }));
  }
  const sourceNote = el('p', { className: 'skill-range-source' });
  sourceNote.appendChild(el('strong', { textContent: 'Range source' }));
  sourceNote.appendChild(el('span', { textContent: rangeSourceDescription(visual) }));
  figure.appendChild(sourceNote);
  function renderStage(previousLevel = null, rebuildAttackRange = true) {
    stage.innerHTML = '';
    let svg;
    if (usesStoredRectangle) {
      svg = fixedRectangleScene(visual, currentLevel, uid, previousLevel);
    }
    else if (visual.family === 'ranged_corridor') {
      svg = corridorScene(visual, uid, attackRangeValue(visual, currentLevel, currentPassiveLevel));
    }
    else if (visual.family === 'action_hitbox' || visual.family === 'action_extended') {
      svg = actionScene(visual, uid, actionAnimation, currentLevel, previousLevel);
    }
    else if (visual.family === 'piercing_line') {
      svg = piercingScene(visual, uid, attackRangeValue(visual, currentLevel, currentPassiveLevel));
    }
    else if (visual.family === 'teleport_range') {
      svg = teleportScene(visual, currentLevel, uid);
    }
    else if (visual.family === 'jump_trajectory') {
      svg = jumpTrajectoryScene(visual, currentLevel, uid);
    }
    else svg = specialScene(visual, uid);
    if (svg) stage.appendChild(svg);
    else if (visual.family === 'ranged_corridor') {
      stage.appendChild(el('div', {
        className: 'skill-range-unavailable',
        textContent: 'The target shape is known, but the current data does not expose a numeric attack range for this route.',
      }));
    }
    if (usesAttackRange && rebuildAttackRange) {
      attackRangeHost.innerHTML = '';
      attackRangeHost.appendChild(buildAttackRangeSection(
        skill,
        visual,
        currentLevel,
        currentPassiveLevel,
        level => {
          currentPassiveLevel = level;
          renderStage(null, false);
        },
      ));
    }
    if (usesWeaponAction) {
      const metricBounds = visual.family === 'action_extended'
        ? { ...actionAnimation, right: actionExtensionLimit(visual, currentLevel, actionAnimation.right) }
        : actionAnimation;
      stage.appendChild(makeHitboxMetrics(metricBounds, visual, currentLevel, actionAnimation.right));
    } else if (usesStoredRectangle) {
      const primary = mirroredBoxes(selectedGeometry(visual, currentLevel))[0];
      if (primary) stage.appendChild(makeHitboxMetrics(primary, visual, currentLevel));
    } else if (usesMovement) {
      stage.appendChild(makeMovementMetrics(visual, currentLevel));
    }
  }

  renderStage();
  return figure;
}
