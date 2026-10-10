import { el } from '../lib/utils.js';

const ASSETS = {
  ordinary: {
    idle: './assets/reference/spawn-slime-idle.webp',
    death: './assets/reference/spawn-slime-death.webp',
    still: './assets/reference/spawn-slime-still.png',
  },
  timed: {
    idle: './assets/reference/spawn-iron-hog-idle.webp',
    death: './assets/reference/spawn-iron-hog-death.webp',
    still: './assets/reference/spawn-iron-hog-still.png',
  },
};
export function createSpawnAnimation() {
  const root = el('figure', { className: 'spawn-demo', 'aria-label': 'Animated spawning examples' });
  const scene = el('div', { className: 'spawn-demo-scene' });
  const population = el('span', { className: 'spawn-demo-population' });
  const point = el('span', { className: 'spawn-demo-point', textContent: 'Iron Hog spawn point', style: { left: '33%' } });
  const slimePoint = el('span', { className: 'spawn-demo-point', textContent: 'Slime spawn point', style: { left: '67%' } });
  scene.append(population, point, slimePoint, el('div', { className: 'spawn-demo-ground' }));
  const sprites = [33, 67].map(left => {
    const sprite = el('img', { className: 'spawn-demo-mob', src: ASSETS.ordinary.still, alt: 'Slime', style: { left: `${left}%` } });
    scene.appendChild(sprite);
    return sprite;
  });
  const status = el('div', { className: 'spawn-demo-status', role: 'status', 'aria-live': 'polite' });
  const mapValue = el('strong');
  const pointValue = el('strong');
  const pointLabel = el('span', { textContent: 'Iron Hog spawn point (10s cooldown)' });
  const slimePointValue = el('strong');
  const slimeTimer = el('div', {}, el('span', { textContent: 'Slime spawn point (no cooldown)' }), slimePointValue);
  const timers = el('div', { className: 'spawn-demo-timers has-two-points' },
    el('div', {}, el('span', { textContent: 'Next map refill' }), mapValue),
    el('div', {}, pointLabel, pointValue), slimeTimer);
  const play = el('button', { type: 'button', className: 'spawn-demo-button' });
  const replay = el('button', { type: 'button', className: 'spawn-demo-button', textContent: 'Replay' });
  const controls = el('div', { className: 'spawn-demo-controls' }, play, replay);
  root.append(scene, status, timers, controls,
    el('figcaption', { textContent: 'Illustrative timing, with space to spawn. The point cooldown shown is an example.' }));

  let elapsed = 0;
  let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let visible = false;
  let frameId = null;
  let lastTime = null;
  function draw() {
    const firstKill = 1.5;
    const firstRefill = 14;
    const dead = elapsed >= firstKill && elapsed < firstRefill;
    const dying = dead && elapsed - firstKill < 0.6;
    const slimeDead = elapsed >= 3 && elapsed < 7;
    const slimeDying = slimeDead && elapsed < 3.6;
    const lastRefill = elapsed >= 14 ? 14 : elapsed >= 7 ? 7 : 0;
    const remaining = Math.max(0, 7 - (elapsed - lastRefill));
    const justRefilled = lastRefill > 0 && elapsed - lastRefill < 0.8;
    // The Iron Hog's illustrative ten-second cooldown starts on removal.
    const removedAt = firstKill + 0.6;
    const cooldown = elapsed >= removedAt && elapsed < firstRefill
      ? Math.max(0, 10 - (elapsed - removedAt)) : 0;
    const pointText = !dead || dying ? 'Occupied by its mob' : cooldown > 0 ? `${cooldown.toFixed(1)}s cooldown` : 'Ready ✅';
    const message = elapsed < firstKill ? 'Iron Hog has a point cooldown. Slime has none.'
        : dying ? 'Iron Hog killed.'
        : elapsed < 3 ? 'Iron Hog removed. Its point cooldown starts.'
        : slimeDying ? 'Slime killed. Its point has no cooldown.'
        : elapsed < 7 ? 'Both are gone. Only the Iron Hog point has a cooldown.'
        : elapsed < 12.1 ? 'Slime returns on the refill. Iron Hog is still cooling down.'
        : elapsed < 14 ? 'Iron Hog point is ready. Waiting for the next map refill.'
        : 'Iron Hog returns on the next refill.';
    if (status.textContent !== message) status.textContent = message;
    population.textContent = `${2 - Number(dead) - Number(slimeDead)} / 2 mobs`;
    mapValue.textContent = justRefilled ? 'Refill ✅' : remaining > 0 ? `In ${remaining.toFixed(1)}s` : 'Ready';
    mapValue.parentElement.classList.toggle('is-refilling', justRefilled);
    pointValue.textContent = pointText;
    slimePointValue.textContent = slimeDead ? 'Ready ✅' : 'Blocked by nearby mob';
    slimePoint.classList.toggle('is-ready', slimeDead && !slimeDying);
    point.classList.toggle('is-ready', dead && !dying && cooldown === 0);
    const flashPoint = (timer, killedAt, spawnedAt) => {
      const justKilled = elapsed >= killedAt && elapsed - killedAt < 0.8;
      const justSpawned = elapsed >= spawnedAt && elapsed - spawnedAt < 0.8;
      timer.classList.toggle('is-killed', justKilled);
      timer.classList.toggle('is-spawned', justSpawned);
    };
    flashPoint(pointLabel.parentElement, firstKill, firstRefill);
    flashPoint(slimeTimer, 3, 7);
    sprites.forEach((sprite, i) => {
      const assets = i === 0 ? ASSETS.timed : ASSETS.ordinary;
      const spriteDying = i === 0 ? dying : i === 1 && slimeDying;
      sprite.hidden = (i === 0 && dead && !dying) || (i === 1 && slimeDead && !slimeDying);
      const asset = spriteDying ? assets.death : playing && visible ? assets.idle : assets.still;
      sprite.alt = i === 0 ? 'Iron Hog' : 'Slime';
      if (sprite.getAttribute('src') !== asset) sprite.src = asset;
    });
    play.textContent = elapsed >= duration() ? 'Play again' : playing ? 'Pause' : 'Play';
  }

  function duration() { return 16.5; }
  function frame(time) {
    frameId = null;
    if (!playing || !visible || !root.isConnected || document.hidden) { lastTime = null; return; }
    if (lastTime != null) elapsed = Math.min(duration(), elapsed + Math.min(time - lastTime, 100) / 1000);
    lastTime = time;
    if (elapsed >= duration()) playing = false;
    draw();
    if (playing) frameId = requestAnimationFrame(frame);
  }
  function schedule() {
    if (playing && visible && !document.hidden && frameId == null) frameId = requestAnimationFrame(frame);
  }
  function restart() {
    elapsed = 0;
    lastTime = null;
    playing = true;
    draw();
    schedule();
  }
  play.onclick = () => {
    if (elapsed >= duration()) { restart(); return; }
    playing = !playing;
    lastTime = null;
    draw();
    schedule();
  };
  replay.onclick = restart;
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    lastTime = null;
    draw();
    schedule();
  }, { threshold: 0.2 });
  observer.observe(root);
  document.addEventListener('visibilitychange', () => { lastTime = null; schedule(); });
  draw();
  return root;
}
