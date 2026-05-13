// Navigator Game — Portal Runner mini-game
// Navigate from start to end map by clicking portal overlays.

import { el, padMapId } from '../lib/utils.js';
import { getDataBase } from '../lib/data.js';

/* ── seeded PRNG ─────────────────────────────────────────────── */

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAILY_EPOCH = Date.UTC(2026, 4, 4);

function getDailyInfo() {
  const now = new Date();
  const y = now.getUTCFullYear(), mo = now.getUTCMonth(), d = now.getUTCDate();
  const today = Date.UTC(y, mo, d);
  const puzzleNum = Math.floor((today - DAILY_EPOCH) / 86400000) + 1;
  // Stable seed from the date string
  const seedStr = `portalrunner-${y}-${mo}-${d}`;
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (Math.imul(31, seed) + seedStr.charCodeAt(i)) | 0;
  const dateStr = new Date(today).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return { puzzleNum, seed: seed >>> 0, dateStr };
}

/* ── helpers ─────────────────────────────────────────────────── */

function getAllMapsFlat(data) {
  return data.maps.regions
    .filter(r => r.region !== 'Other' && r.region !== 'etc' && r.region !== 'Event')
    .flatMap(r => r.maps);
}

function buildMapGraph(allMaps) {
  const graph = {};
  for (const m of allMaps) {
    graph[m.id] = Array.isArray(m.exits) ? m.exits.slice() : [];
  }
  return graph;
}

function findShortestPath(graph, fromId, toId) {
  const queue = [[fromId]];
  const visited = new Set([fromId]);
  while (queue.length) {
    const path = queue.shift();
    const last = path[path.length - 1];
    if (last === toId) return path;
    for (const n of graph[last] || []) {
      if (!visited.has(n)) {
        visited.add(n);
        queue.push([...path, n]);
      }
    }
  }
  return null;
}

function shuffle(arr, rand) {
  rand = rand || Math.random;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickRandom(arr, rand) {
  rand = rand || Math.random;
  return arr[Math.floor(rand() * arr.length)];
}

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const frac = Math.floor((ms % 1000) / 100);
  return min > 0
    ? `${min}:${String(sec).padStart(2, '0')}.${frac}`
    : `${sec}.${frac}s`;
}

/* ── daily result persistence ────────────────────────────────── */

const STREAK_KEY = 'portalrunner-streak';

function loadStreak() {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    return raw ? JSON.parse(raw) : { lastPuzzleNum: 0, streak: 0, completed: [] };
  } catch { return { lastPuzzleNum: 0, streak: 0, completed: [] }; }
}

function saveStreak(s) {
  try { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); } catch {}
}

function loadDailyResult(puzzleNum) {
  const s = loadStreak();
  return s.lastResult?.puzzleNum === puzzleNum ? s.lastResult : null;
}

function loadCompleted() {
  return loadStreak().completed ?? [];
}

function saveDailyResult(puzzleNum, result) {
  const s = loadStreak();
  s.lastResult = { puzzleNum, ...result };
  saveStreak(s);
}

function markCompleted(puzzleNum) {
  const s = loadStreak();
  s.completed = s.completed ?? [];
  if (!s.completed.includes(puzzleNum)) s.completed.push(puzzleNum);
  saveStreak(s);
}

function updateStreak(puzzleNum) {
  const s = loadStreak();
  if (s.lastPuzzleNum === puzzleNum) return;
  s.streak = s.lastPuzzleNum === puzzleNum - 1 ? s.streak + 1 : 1;
  s.lastPuzzleNum = puzzleNum;
  saveStreak(s);
}

/* ── challenge generation ────────────────────────────────────── */

function generateChallenge(allMaps, graph, rand) {
  rand = rand || Math.random;
  const candidates = allMaps.filter(m => m.exits && m.exits.length > 0 && graph[m.id]);
  const maxAttempts = 40;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const start = pickRandom(candidates, rand);
    const targetDepth = 5 + Math.floor(rand() * 6); // 5-10
    const visited = new Set([start.id]);
    const path = [start.id];
    let current = start.id;

    for (let i = 0; i < targetDepth; i++) {
      const neighbors = (graph[current] || []).filter(n => !visited.has(n) && graph[n] !== undefined);
      if (neighbors.length === 0) break;
      const next = pickRandom(shuffle(neighbors.slice(), rand), rand);
      visited.add(next);
      path.push(next);
      current = next;
    }

    if (path.length < 4) continue;

    const endId = path[path.length - 1];
    const bfsPath = findShortestPath(graph, start.id, endId);
    const optimalLength = bfsPath ? bfsPath.length - 1 : path.length - 1;

    return {
      startId: start.id,
      endId,
      dfsPathLength: path.length - 1,
      optimalLength,
    };
  }
  // fallback — just pick two connected maps
  const start = pickRandom(candidates, rand);
  const endId = pickRandom(graph[start.id], rand);
  return { startId: start.id, endId, dfsPathLength: 1, optimalLength: 1 };
}

/* ── difficulty presets ──────────────────────────────────────── */

const DIFFICULTIES = [
  { id: 'easy',   label: 'Easy (3-5)',   min: 3, max: 5 },
  { id: 'medium', label: 'Medium (5-8)', min: 5, max: 8 },
  { id: 'hard',   label: 'Hard (8-12)',  min: 8, max: 12 },
];

function generateChallengeWithDifficulty(allMaps, graph, diff, rand) {
  rand = rand || Math.random;
  const candidates = allMaps.filter(m => m.exits && m.exits.length > 0 && graph[m.id]);
  for (let attempt = 0; attempt < 60; attempt++) {
    const start = pickRandom(candidates, rand);
    const targetDepth = diff.min + Math.floor(rand() * (diff.max - diff.min + 1));
    const visited = new Set([start.id]);
    const path = [start.id];
    let current = start.id;

    for (let i = 0; i < targetDepth; i++) {
      const neighbors = (graph[current] || []).filter(n => !visited.has(n) && graph[n] !== undefined);
      if (neighbors.length === 0) break;
      const next = pickRandom(shuffle(neighbors.slice(), rand), rand);
      visited.add(next);
      path.push(next);
      current = next;
    }

    if (path.length - 1 < diff.min) continue;

    const endId = path[path.length - 1];
    const bfsPath = findShortestPath(graph, start.id, endId);
    const optimalLength = bfsPath ? bfsPath.length - 1 : path.length - 1;
    if (optimalLength < diff.min) continue;

    const intermediates = bfsPath ? bfsPath.slice(1, -1) : [];
    if (intermediates.length > 0) {
      const avgExits = intermediates.reduce((sum, id) => sum + (graph[id]?.length || 0), 0) / intermediates.length;
      if (avgExits < 2.5) continue;
    }

    return { startId: start.id, endId, dfsPathLength: path.length - 1, optimalLength };
  }
  return generateChallenge(allMaps, graph, rand);
}

/* ── challenge link encoding ─────────────────────────────────── */

function encodeChallenge(startId, endId, elapsed, moves) {
  return btoa(`${startId},${endId},${Math.round(elapsed)},${moves}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function decodeChallenge(encoded) {
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - encoded.length % 4) % 4);
    const [startId, endId, elapsed, moves] = atob(padded).split(',').map(Number);
    if (Number.isFinite(startId) && Number.isFinite(endId)) return { startId, endId, elapsed: elapsed || 0, moves: moves || 0 };
  } catch {}
  return null;
}

function encodeDailyPerf(elapsed, moves) {
  return btoa(`${Math.round(elapsed)},${moves}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function decodeDailyPerf(encoded) {
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - encoded.length % 4) % 4);
    const [elapsed, moves] = atob(padded).split(',').map(Number);
    if (Number.isFinite(elapsed) && Number.isFinite(moves)) return { elapsed, moves };
  } catch {}
  return null;
}

/* ── portal overlay rendering ────────────────────────────────── */

async function ensurePortals() {
  if (!window._allPortalsCache) {
    try {
      const res = await fetch(`${getDataBase()}/maps/portals.json`);
      window._allPortalsCache = res.ok ? await res.json() : {};
    } catch {
      window._allPortalsCache = {};
    }
  }
  return window._allPortalsCache;
}

function renderPortals(imgContainer, img, mapId, onPortalClick, entryPortalName) {
  const allPortals = window._allPortalsCache || {};
  const portals = allPortals[padMapId(mapId)] || [];

  imgContainer.querySelectorAll('.navgame-portal').forEach(e => e.remove());
  if (!Array.isArray(portals) || portals.length === 0) return;

  const naturalW = img.naturalWidth, naturalH = img.naturalHeight;
  const displayW = img.width, displayH = img.height;
  if (!naturalW || !naturalH || !displayW || !displayH) return;

  const scaleX = displayW / naturalW;
  const scaleY = displayH / naturalH;
  const imgScale = Math.min(scaleX, scaleY);
  const portalR = Math.max(10, Math.min(22, Math.round(12 + 18 * imgScale)));
  const portalBorder = Math.max(2, Math.round(2.5 + imgScale));

  portals.forEach(portal => {
    // Skip spawn points
    if (portal.dest_map === '999999999') return;
    // Skip intra-map portals
    if (portal.intra_map) return;
    // Skip portals that don't go anywhere real
    if (!portal.dest_map) return;

    const px = portal.x * scaleX;
    const py = portal.y * scaleY;
    const isEntry = entryPortalName && portal.name === entryPortalName;

    const overlay = el('div', {
      className: `navgame-portal${isEntry ? ' navgame-portal--entry' : ''}`,
      style: {
        position: 'absolute',
        left: `${px - portalR}px`,
        top: `${py - portalR}px`,
        width: `${portalR * 2}px`,
        height: `${portalR * 2}px`,
        borderRadius: '50%',
        border: `${portalBorder}px solid ${isEntry ? '#555' : '#3af'}`,
        background: isEntry ? 'rgba(200,200,200,0.5)' : 'rgba(0,120,255,0.22)',
        boxShadow: isEntry ? '0 0 8px 2px rgba(80,80,80,0.4)' : '0 0 12px 3px rgba(51,170,255,0.5)',
        zIndex: 10,
        cursor: 'pointer',
        pointerEvents: 'auto',
      }
    });

    const destId = Number(portal.dest_map);
    overlay.dataset.destMap = String(destId);

    const hoverShadow = isEntry ? '0 0 12px 4px rgba(80,80,80,0.6)'  : '0 0 20px 6px rgba(255,255,255,0.6)';
    const hoverBg    = isEntry ? 'rgba(200,200,200,0.7)'             : 'rgba(0,120,255,0.4)';
    const idleShadow = isEntry ? '0 0 8px 2px rgba(80,80,80,0.4)'   : '0 0 12px 3px rgba(51,170,255,0.5)';
    const idleBg     = isEntry ? 'rgba(200,200,200,0.5)'            : 'rgba(0,120,255,0.22)';

    overlay.addEventListener('mouseenter', () => {
      overlay.style.boxShadow = hoverShadow;
      overlay.style.background = hoverBg;
    });
    overlay.addEventListener('mouseleave', () => {
      overlay.style.boxShadow = idleShadow;
      overlay.style.background = idleBg;
    });
    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      onPortalClick(destId, portal.dest_portal || null);
    });

    imgContainer.appendChild(overlay);
  });
}

/* ── main render ─────────────────────────────────────────────── */

export function renderNavigatorGame(data, options = {}) {
  const root = el('div', { className: 'navgame' });
  const allMaps = getAllMapsFlat(data);
  const graph = buildMapGraph(allMaps);

  // Build lookup
  const mapLookup = {};
  allMaps.forEach(m => { mapLookup[m.id] = m; });
  window._navGameMapLookup = mapLookup;

  /* ── state ─── */
  let challenge = null;
  let currentMapId = null;
  let moves = 0;
  let timerStart = 0;
  let timerInterval = null;
  let visitedPath = [];
  let navStack = [];
  let gameActive = false;
  let selectedDifficulty = DIFFICULTIES[1]; // default medium
  let isDailyMode = false;
  let activeDailyInfo = null;
  let pendingLinkedChallenge = null;
  let hintsUsed = 0;
  let destPeeked = false;

  /* ── DOM refs ─── */
  const startScreen = el('div', { className: 'navgame-start' });
  const gameScreen = el('div', { className: 'navgame-play', style: { display: 'none' } });
  const resultScreen = el('div', { className: 'navgame-result', style: { display: 'none' } });
  root.appendChild(startScreen);
  root.appendChild(gameScreen);
  root.appendChild(resultScreen);

  /* ── start screen ─── */
  const titleWrap = el('div', { className: 'navgame-title-wrap' });
  titleWrap.appendChild(el('h1', { className: 'navgame-title', textContent: '🗺️ Portal Runner' }));
  titleWrap.appendChild(el('p', { className: 'navgame-subtitle', textContent: 'Navigate between maps using portals. Find your way from start to finish as fast as you can!' }));
  startScreen.appendChild(titleWrap);

  // Linked challenge card (hidden until a challenge link is opened)
  const challengeCard = el('div', { className: 'navgame-challenge-card', style: { display: 'none' } });
  const challengeRouteEl = el('span', { className: 'navgame-challenge-route' });
  const challengeBeatEl = el('span', { className: 'navgame-challenge-beat' });
  const challengeCardTop = el('div', { className: 'navgame-challenge-card-top' });
  challengeCardTop.appendChild(el('span', { className: 'navgame-challenge-label', textContent: "🔗 Friend's Challenge" }));
  challengeCardTop.appendChild(challengeRouteEl);
  challengeCard.appendChild(challengeCardTop);
  challengeCard.appendChild(challengeBeatEl);
  const acceptBtn = el('button', { className: 'navgame-start-btn navgame-daily-btn', textContent: '▶ Accept Challenge' });
  acceptBtn.addEventListener('click', () => {
    if (!pendingLinkedChallenge) return;
    const { startId, endId } = pendingLinkedChallenge;
    pendingLinkedChallenge = null;
    challengeCard.style.display = 'none';
    startLinkedGame(startId, endId);
  });
  challengeCard.appendChild(acceptBtn);
  startScreen.appendChild(challengeCard);

  // Daily puzzle card
  const di = getDailyInfo();
  const dailyCard = el('div', { className: 'navgame-daily-card' });
  const dailyCardTop = el('div', { className: 'navgame-daily-card-top' });
  dailyCardTop.appendChild(el('span', { className: 'navgame-daily-label', textContent: '🗓️ Daily Puzzle' }));
  const dailyMeta = el('span', { className: 'navgame-daily-meta' });
  dailyMeta.appendChild(el('span', { className: 'navgame-daily-num', textContent: `#${di.puzzleNum}` }));
  dailyMeta.appendChild(el('span', { className: 'navgame-daily-date', textContent: di.dateStr }));
  dailyCardTop.appendChild(dailyMeta);
  dailyCard.appendChild(dailyCardTop);
  const dailyStreakEl = el('div', { className: 'navgame-daily-streak' });
  dailyCard.appendChild(dailyStreakEl);
  const dailyStatus = el('div', { className: 'navgame-daily-status' });
  dailyCard.appendChild(dailyStatus);
  const dailyChallengeBeat = el('span', { className: 'navgame-challenge-beat' });
  dailyCard.appendChild(dailyChallengeBeat);
  const dailyBtn = el('button', { className: 'navgame-start-btn navgame-daily-btn', textContent: "▶ Play Today's Puzzle" });
  dailyCard.appendChild(dailyBtn);
  startScreen.appendChild(dailyCard);

  function renderDailyCard() {
    const saved = loadDailyResult(di.puzzleNum);
    const streak = loadStreak();
    const streakCount = (streak.lastPuzzleNum === di.puzzleNum || streak.lastPuzzleNum === di.puzzleNum - 1)
      ? streak.streak : 0;

    dailyStreakEl.innerHTML = '';
    const totalPlayed = loadCompleted().length;
    if (streakCount > 0 || totalPlayed > 0) {
      const statsRow = el('div', { className: 'navgame-daily-stats-row' });
      if (streakCount > 0) {
        statsRow.appendChild(el('span', { className: 'navgame-streak-badge', textContent: `🔥 ${streakCount}-day streak` }));
      }
      if (totalPlayed > 0) {
        statsRow.appendChild(el('span', { className: 'navgame-streak-badge navgame-streak-badge--total', textContent: `📅 ${totalPlayed} day${totalPlayed !== 1 ? 's' : ''} played` }));
      }
      dailyStreakEl.appendChild(statsRow);
    }

    dailyStatus.innerHTML = '';
    if (saved) {
      dailyBtn.textContent = '▶ Play Again';
      const row = el('div', { className: 'navgame-daily-completed' });
      row.appendChild(el('span', { className: 'navgame-daily-check', textContent: '✓ Completed!' }));
      row.appendChild(el('span', { className: `navgame-daily-grade navgame-daily-grade--${saved.gradeCls}`, textContent: `${saved.grade} (${saved.score}/1000)` }));
      row.appendChild(el('span', { className: 'navgame-daily-stats-inline', textContent: `${saved.moves} move${saved.moves !== 1 ? 's' : ''} · ${formatTime(saved.elapsed)}` }));
      dailyStatus.appendChild(row);
    } else {
      dailyBtn.textContent = "▶ Play Today's Puzzle";
    }
  }
  renderDailyCard();

  startScreen.appendChild(el('div', { className: 'navgame-divider', textContent: 'or practice' }));

  const rulesBox = el('div', { className: 'navgame-rules' });
  rulesBox.innerHTML = `
    <div class="navgame-rule"><span class="navgame-rule-icon">🔵</span> Click blue portal circles to travel to connected maps</div>
    <div class="navgame-rule"><span class="navgame-rule-icon">⏱️</span> Timer starts when the game begins</div>
    <div class="navgame-rule"><span class="navgame-rule-icon">🏆</span> Reach the destination in as few moves as possible</div>
  `;
  startScreen.appendChild(rulesBox);

  // Difficulty selector
  const diffWrap = el('div', { className: 'navgame-diff-wrap' });
  diffWrap.appendChild(el('span', { className: 'navgame-diff-label', textContent: 'Difficulty:' }));
  const diffBtns = [];
  DIFFICULTIES.forEach(diff => {
    const btn = el('button', {
      className: `navgame-diff-btn${diff.id === selectedDifficulty.id ? ' active' : ''}`,
      textContent: diff.label,
    });
    btn.addEventListener('click', () => {
      selectedDifficulty = diff;
      diffBtns.forEach(b => b.classList.toggle('active', b._diffId === diff.id));
    });
    btn._diffId = diff.id;
    diffBtns.push(btn);
    diffWrap.appendChild(btn);
  });
  startScreen.appendChild(diffWrap);

  const startBtn = el('button', { className: 'navgame-start-btn', textContent: '▶ Start Game' });
  startScreen.appendChild(startBtn);

  /* ── game screen ─── */
  const hud = el('div', { className: 'navgame-hud' });
  const hudFrom = el('span', { className: 'navgame-hud-from' });
  const hudArrow = el('span', { className: 'navgame-hud-arrow', textContent: '→' });
  const hudTo = el('span', { className: 'navgame-hud-to' });
  const hudTimer = el('span', { className: 'navgame-hud-timer', textContent: '0.0s' });
  const hudMoves = el('span', { className: 'navgame-hud-moves', textContent: '0 moves' });
  const hudScore = el('span', { className: 'navgame-hud-score', textContent: '1000' });
  hud.appendChild(hudFrom);
  hud.appendChild(hudArrow);
  hud.appendChild(hudTo);
  hud.appendChild(el('div', { className: 'navgame-hud-spacer' }));
  hud.appendChild(hudTimer);
  hud.appendChild(hudMoves);
  gameScreen.appendChild(hud);

  const currentLabel = el('div', { className: 'navgame-current-label' });
  gameScreen.appendChild(currentLabel);

  const mapArea = el('div', { className: 'navgame-map-area' });
  gameScreen.appendChild(mapArea);

  // hint panel (destination preview — hidden until peeked)
  const hintPanel = el('div', { className: 'navgame-hint-panel', style: { display: 'none' } });
  gameScreen.appendChild(hintPanel);

  // hint buttons
  const hintRow = el('div', { className: 'navgame-hint-row' });
  const peekBtn   = el('button', { className: 'navgame-hint-btn', textContent: '🗺️ Peek Destination  (−100pts)' });
  const revealBtn = el('button', { className: 'navgame-hint-btn', textContent: '💡 Reveal Next Portal (−100pts)' });
  hintRow.appendChild(peekBtn);
  hintRow.appendChild(revealBtn);
  gameScreen.appendChild(hintRow);

  // breadcrumb trail
  const breadcrumb = el('div', { className: 'navgame-breadcrumb' });
  gameScreen.appendChild(breadcrumb);

  const gameFooter = el('div', { className: 'navgame-game-footer' });
  const backBtn = el('button', { className: 'navgame-back-btn', textContent: '← Back', disabled: true });
  const giveUpBtn = el('button', { className: 'navgame-giveup-btn', textContent: '🏳️ Give Up' });
  gameFooter.appendChild(backBtn);
  gameFooter.appendChild(giveUpBtn);
  gameScreen.appendChild(gameFooter);

  /* ── result screen ─── */
  const resultContent = el('div', { className: 'navgame-result-content' });
  resultScreen.appendChild(resultContent);

  /* ── functions ─── */

  function updateTimer() {
    if (!gameActive) return;
    const elapsed = Date.now() - timerStart;
    hudTimer.textContent = formatTime(elapsed);
  }

  function updateBreadcrumb() {
    breadcrumb.innerHTML = '';
    const label = el('span', { className: 'navgame-breadcrumb-label', textContent: 'Path: ' });
    breadcrumb.appendChild(label);
    visitedPath.forEach((mapId, idx) => {
      const m = mapLookup[mapId];
      const name = m ? m.name : `Map ${mapId}`;
      const dot = el('span', {
        className: `navgame-breadcrumb-dot${mapId === challenge.endId ? ' destination' : ''}${idx === visitedPath.length - 1 ? ' current' : ''}`,
        textContent: name,
        title: name,
      });
      if (idx > 0) breadcrumb.appendChild(el('span', { className: 'navgame-breadcrumb-sep', textContent: ' → ' }));
      breadcrumb.appendChild(dot);
    });
  }

  function buildDestPreview(endId, endName) {
    const wrap = el('div', { className: 'navgame-result-dest-preview' });
    wrap.appendChild(el('div', { className: 'navgame-result-dest-label', textContent: `🎯 Destination: ${endName}` }));
    wrap.appendChild(el('img', { src: `${getDataBase()}/maps/${padMapId(endId)}.img.webp`, alt: endName, className: 'navgame-result-dest-img' }));
    return wrap;
  }

  function calcScore() {
    return Math.max(0, 1000 - hintsUsed * 100);
  }

  function scoreGrade(score) {
    if (score === 1000) return { label: 'S+', cls: 'perfect' };
    if (score >= 900) return { label: 'S', cls: 'godly' };
    if (score >= 700) return { label: 'A', cls: 'pro' };
    if (score >= 500) return { label: 'B', cls: 'decent' };
    if (score >= 300) return { label: 'C', cls: 'grind' };
    return               { label: 'D', cls: 'grind' };
  }

  function updateScoreDisplay() {
    hudScore.textContent = calcScore();
  }

  function showPeekModal() {
    const existing = document.getElementById('navgame-peek-modal');
    if (existing) {
      clearTimeout(existing._dismissTimer);
      existing.remove();
    }
    const destMap = mapLookup[challenge.endId];
    const name = destMap?.name || `Map ${challenge.endId}`;
    const imgPath = `${getDataBase()}/maps/${padMapId(challenge.endId)}.img.webp`;

    const modal = document.createElement('div');
    modal.id = 'navgame-peek-modal';
    modal.className = 'navgame-peek-modal';

    const inner = el('div', { className: 'navgame-peek-modal-inner' });
    inner.appendChild(el('div', { className: 'navgame-peek-modal-label', textContent: `🎯 Destination: ${name}` }));
    inner.appendChild(el('img', { src: imgPath, alt: name, className: 'navgame-peek-modal-img' }));
    const bar = el('div', { className: 'navgame-peek-modal-bar' });
    inner.appendChild(bar);
    modal.appendChild(inner);
    document.body.appendChild(modal);

    requestAnimationFrame(() => {
      bar.style.transition = 'width 3s linear';
      bar.style.width = '0%';
    });

    const dismiss = () => {
      clearTimeout(modal._dismissTimer);
      modal.classList.add('navgame-peek-modal--fade');
      setTimeout(() => modal.remove(), 250);
    };
    modal._dismissTimer = setTimeout(dismiss, 3000);
    modal.addEventListener('click', dismiss);
  }

  function hintPeekDestination() {
    if (!destPeeked) {
      destPeeked = true;
      hintsUsed++;
      updateScoreDisplay();
      peekBtn.textContent = '🗺️ Peek Again';
      peekBtn.classList.add('navgame-hint-btn--used');
    }
    showPeekModal();
  }

  function hintRevealNextPortal() {
    const bfsPath = findShortestPath(graph, currentMapId, challenge.endId);
    if (!bfsPath || bfsPath.length < 2) return;
    hintsUsed++;
    updateScoreDisplay();
    revealBtn.disabled = true;
    revealBtn.textContent = '✓ Next Portal Revealed';
    revealBtn.classList.add('navgame-hint-btn--used');
    const nextMapId = bfsPath[1];
    mapArea.querySelectorAll(`.navgame-portal[data-dest-map="${nextMapId}"]`)
      .forEach(p => p.classList.add('navgame-portal--hint'));
  }

  async function showMap(mapId, entryPortalName) {
    currentMapId = mapId;
    // Re-enable reveal hint for the new map
    revealBtn.disabled = false;
    revealBtn.textContent = '💡 Reveal Next Portal (−100pts)';
    revealBtn.classList.remove('navgame-hint-btn--used');
    mapArea.innerHTML = '';
    mapArea.classList.remove('navgame-transition');
    // Force reflow to restart animation
    void mapArea.offsetWidth;
    mapArea.classList.add('navgame-transition');

    const m = mapLookup[mapId];
    const name = m ? m.name : `Map ${mapId}`;
    currentLabel.innerHTML = '';
    currentLabel.appendChild(el('span', { textContent: '📍 Current: ' }));
    currentLabel.appendChild(el('strong', { textContent: name }));

    if (mapId === challenge.endId) {
      currentLabel.appendChild(el('span', { className: 'navgame-dest-badge', textContent: ' — DESTINATION!' }));
    }

    const imgPath = `${getDataBase()}/maps/${padMapId(mapId)}.img.webp`;
    const imgWrap = el('div', { className: 'navgame-img-wrap' });
    const img = el('img', { src: imgPath, alt: name, className: 'navgame-map-img' });

    img.addEventListener('error', () => {
      imgWrap.innerHTML = '<div class="navgame-no-img">Map image not available</div>';
    });

    img.addEventListener('load', () => {
      renderPortals(imgWrap, img, mapId, onPortalClick, entryPortalName);
    });

    imgWrap.appendChild(img);
    mapArea.appendChild(imgWrap);

    // For cached images the load event may already have fired before the listener was added.
    if (img.complete && img.naturalWidth > 0) {
      renderPortals(imgWrap, img, mapId, onPortalClick, entryPortalName);
    }
    updateBreadcrumb();
    backBtn.disabled = navStack.length <= 1;
  }

  function onPortalClick(destMapId, entryPortalName) {
    if (!gameActive) return;
    // Skip portals that lead outside the known map graph
    if (!mapLookup[destMapId]) return;
    moves++;
    hudMoves.textContent = `${moves} move${moves !== 1 ? 's' : ''}`;
    updateScoreDisplay();
    visitedPath.push(destMapId);
    navStack.push(destMapId);

    if (destMapId === challenge.endId) {
      // Win!
      gameActive = false;
      clearInterval(timerInterval);
      const elapsed = Date.now() - timerStart;
      showMap(destMapId, entryPortalName).then(() => showResult(elapsed));
      return;
    }

    showMap(destMapId, entryPortalName);
  }

  function showResult(elapsed) {
    gameScreen.style.display = 'none';
    resultScreen.style.display = '';
    resultContent.innerHTML = '';

    const optimal = challenge.optimalLength;
    const bfsPath = findShortestPath(graph, challenge.startId, challenge.endId);
    const optimalSet = new Set(bfsPath || []);
    const detourMaps = bfsPath ? visitedPath.filter(id => !optimalSet.has(id)).length : 0;
    const detourPenalty = Math.round((1000 / optimal)/2);
    const score = Math.max(0, 1000 - detourMaps * detourPenalty - hintsUsed * 100);
    const { label: grade, cls: gradeClass } = scoreGrade(score);

    if (isDailyMode && activeDailyInfo) {
      saveDailyResult(activeDailyInfo.puzzleNum, { score, grade, gradeCls: gradeClass, moves, elapsed, optimal });
      markCompleted(activeDailyInfo.puzzleNum);
      updateStreak(activeDailyInfo.puzzleNum);
      renderDailyCard();
    }

    const rating = `${grade} (${score}/1000)`;

    const startName = mapLookup[challenge.startId]?.name || `Map ${challenge.startId}`;
    const endName = mapLookup[challenge.endId]?.name || `Map ${challenge.endId}`;

    if (isDailyMode && activeDailyInfo) {
      const dailyHeader = el('div', { className: 'navgame-result-daily-header' });
      dailyHeader.appendChild(el('span', { className: 'navgame-daily-num', textContent: `#${activeDailyInfo.puzzleNum}` }));
      dailyHeader.appendChild(el('span', { className: 'navgame-daily-date', textContent: activeDailyInfo.dateStr }));
      const s = loadStreak();
      const streakCount = s.lastPuzzleNum === activeDailyInfo.puzzleNum ? s.streak : 0;
      if (streakCount > 0) {
        dailyHeader.appendChild(el('span', { className: 'navgame-streak-badge', textContent: `🔥 ${streakCount}-day streak` }));
      }
      resultContent.appendChild(dailyHeader);
    }

    resultContent.appendChild(el('h2', { className: 'navgame-result-title', textContent: '🎉 Destination Reached!' }));
    resultContent.appendChild(buildDestPreview(challenge.endId, endName));

    const scoreBadge = el('div', { className: `navgame-score-badge navgame-score-badge--${gradeClass}` });
    scoreBadge.appendChild(el('span', { className: 'navgame-score-grade', textContent: grade }));
    scoreBadge.appendChild(el('span', { className: 'navgame-score-num', textContent: `${score} / 1000` }));
    resultContent.appendChild(scoreBadge);

    const statsGrid = el('div', { className: 'navgame-stats' });
    const stats = [
      ['Route', `${startName} → ${endName}`],
      ['Time', formatTime(elapsed)],
      ['Your Moves', `${moves}`],
      ['Optimal Path', `${optimal} move${optimal !== 1 ? 's' : ''}`],
      ['Detour Maps', detourMaps > 0 ? `${detourMaps} (−${detourPenalty} pts each)` : 'None'],
      ['Hints Used', hintsUsed > 0 ? `${hintsUsed} (−${hintsUsed * 100} pts)` : 'None'],
    ];
    stats.forEach(([label, value]) => {
      const row = el('div', { className: 'navgame-stat-row' });
      row.appendChild(el('span', { className: 'navgame-stat-label', textContent: label }));
      row.appendChild(el('span', { className: 'navgame-stat-value', textContent: value }));
      statsGrid.appendChild(row);
    });
    resultContent.appendChild(statsGrid);

    // Show actual path
    const actualWrap = el('div', { className: 'navgame-optimal-path' });
    actualWrap.appendChild(el('div', { className: 'navgame-optimal-label', textContent: 'Your Route:' }));
    const actualSteps = el('div', { className: 'navgame-optimal-steps' });
    visitedPath.forEach((mid, i) => {
      const name = mapLookup[mid]?.name || `Map ${mid}`;
      const isDetour = bfsPath && !optimalSet.has(mid);
      if (i > 0) actualSteps.appendChild(el('span', { className: 'navgame-breadcrumb-sep', textContent: ' → ' }));
      actualSteps.appendChild(el('span', {
        className: `navgame-breadcrumb-dot${isDetour ? ' navgame-breadcrumb-dot--detour' : ''}`,
        textContent: name,
      }));
    });
    actualWrap.appendChild(actualSteps);
    resultContent.appendChild(actualWrap);

    // Show optimal path if they took a detour
    if (bfsPath && moves > optimal) {
      const optWrap = el('div', { className: 'navgame-optimal-path' });
      optWrap.appendChild(el('div', { className: 'navgame-optimal-label', textContent: 'Optimal Route:' }));
      const optSteps = el('div', { className: 'navgame-optimal-steps' });
      bfsPath.forEach((mid, i) => {
        const name = mapLookup[mid]?.name || `Map ${mid}`;
        if (i > 0) optSteps.appendChild(el('span', { className: 'navgame-breadcrumb-sep', textContent: ' → ' }));
        optSteps.appendChild(el('span', { className: 'navgame-breadcrumb-dot', textContent: name }));
      });
      optWrap.appendChild(optSteps);
      resultContent.appendChild(optWrap);
    }

    const btnRow = el('div', { className: 'navgame-result-btns' });
    const playAgain = el('button', { className: 'navgame-start-btn', textContent: '▶ Play Again' });
    playAgain.addEventListener('click', () => {
      resultScreen.style.display = 'none';
      startScreen.style.display = '';
    });
    btnRow.appendChild(playAgain);

    const shareBtn = el('button', { className: 'navgame-share-btn', textContent: '📋 Share Result' });
    shareBtn.addEventListener('click', () => {
      const base = window.location.href.split('#')[0];
      const challengeUrl = isDailyMode && activeDailyInfo
        ? `${base}#portal-runner?q=daily:${encodeDailyPerf(elapsed, moves)}`
        : `${base}#portal-runner?q=${encodeChallenge(challenge.startId, challenge.endId, elapsed, moves)}`;
      const efficiency = moves <= optimal ? '100%' : `${Math.round((optimal / moves) * 100)}%`;
      const header = isDailyMode && activeDailyInfo
        ? `Portal Runner Daily #${activeDailyInfo.puzzleNum} (${activeDailyInfo.dateStr})`
        : `Portal Runner`;
      const shareText = [
        header,
        `${startName} → ${endName}`,
        `${rating} — ${moves} move${moves !== 1 ? 's' : ''} (optimal: ${optimal}, efficiency: ${efficiency})`,
        `⏱ ${formatTime(elapsed)}`,
        `\n${challengeUrl}`,
      ].join('\n');
      navigator.clipboard?.writeText(shareText).catch(() => {});
      shareBtn.textContent = '✓ Copied!';
      setTimeout(() => { shareBtn.textContent = '📋 Share Result'; }, 2000);
    });
    btnRow.appendChild(shareBtn);
    resultContent.appendChild(btnRow);
  }

  function showGiveUpResult() {
    gameActive = false;
    clearInterval(timerInterval);
    const elapsed = Date.now() - timerStart;

    gameScreen.style.display = 'none';
    resultScreen.style.display = '';
    resultContent.innerHTML = '';

    const optimal = challenge.optimalLength;
    const startName = mapLookup[challenge.startId]?.name || `Map ${challenge.startId}`;
    const endName = mapLookup[challenge.endId]?.name || `Map ${challenge.endId}`;

    resultContent.appendChild(el('h2', { className: 'navgame-result-title', textContent: '🏳️ You gave up!' }));
    resultContent.appendChild(buildDestPreview(challenge.endId, endName));
    resultContent.appendChild(el('div', { className: 'navgame-rating navgame-rating--grind', textContent: 'Better luck next time! 💪' }));

    const statsGrid = el('div', { className: 'navgame-stats' });
    const stats = [
      ['Route', `${startName} → ${endName}`],
      ['Time', formatTime(elapsed)],
      ['Moves Made', `${moves}`],
      ['Optimal Path', `${optimal} move${optimal !== 1 ? 's' : ''}`],
    ];
    stats.forEach(([label, value]) => {
      const row = el('div', { className: 'navgame-stat-row' });
      row.appendChild(el('span', { className: 'navgame-stat-label', textContent: label }));
      row.appendChild(el('span', { className: 'navgame-stat-value', textContent: value }));
      statsGrid.appendChild(row);
    });
    resultContent.appendChild(statsGrid);

    // Show optimal path
    const bfsPath = findShortestPath(graph, challenge.startId, challenge.endId);
    if (bfsPath) {
      const optWrap = el('div', { className: 'navgame-optimal-path' });
      optWrap.appendChild(el('div', { className: 'navgame-optimal-label', textContent: 'Optimal Route:' }));
      const optSteps = el('div', { className: 'navgame-optimal-steps' });
      bfsPath.forEach((mid, i) => {
        const name = mapLookup[mid]?.name || `Map ${mid}`;
        if (i > 0) optSteps.appendChild(el('span', { className: 'navgame-breadcrumb-sep', textContent: ' → ' }));
        optSteps.appendChild(el('span', { className: 'navgame-breadcrumb-dot', textContent: name }));
      });
      optWrap.appendChild(optSteps);
      resultContent.appendChild(optWrap);
    }

    const btnRow = el('div', { className: 'navgame-result-btns' });
    const playAgain = el('button', { className: 'navgame-start-btn', textContent: '▶ Try Again' });
    playAgain.addEventListener('click', () => {
      resultScreen.style.display = 'none';
      startScreen.style.display = '';
    });
    btnRow.appendChild(playAgain);
    resultContent.appendChild(btnRow);
  }

  async function startLinkedGame(startId, endId) {
    await ensurePortals();
    isDailyMode = false;
    activeDailyInfo = null;
    const bfsPath = findShortestPath(graph, startId, endId);
    const optimalLength = bfsPath ? bfsPath.length - 1 : 1;
    challenge = { startId, endId, dfsPathLength: optimalLength, optimalLength };
    beginGame();
  }

  async function startDailyGame() {
    dailyChallengeBeat.textContent = '';
    await ensurePortals();
    isDailyMode = true;
    activeDailyInfo = getDailyInfo();
    const rand = mulberry32(activeDailyInfo.seed);
    challenge = generateChallengeWithDifficulty(allMaps, graph, DIFFICULTIES[1], rand);
    beginGame();
  }

  async function startGame() {
    await ensurePortals();
    isDailyMode = false;
    activeDailyInfo = null;
    challenge = generateChallengeWithDifficulty(allMaps, graph, selectedDifficulty);
    beginGame();
  }

  function beginGame() {
    currentMapId = challenge.startId;
    moves = 0;
    hintsUsed = 0;
    destPeeked = false;
    visitedPath = [challenge.startId];
    navStack = [challenge.startId];
    gameActive = true;
    // Reset hint UI
    peekBtn.textContent = '🗺️ Peek Destination (−100pts)';
    peekBtn.classList.remove('navgame-hint-btn--used');
    revealBtn.textContent = '💡 Reveal Next Portal (−100pts)';
    revealBtn.disabled = false;
    revealBtn.classList.remove('navgame-hint-btn--used');
    hintPanel.style.display = 'none';
    hintPanel.innerHTML = '';

    const startName = mapLookup[challenge.startId]?.name || `Map ${challenge.startId}`;
    const endName = mapLookup[challenge.endId]?.name || `Map ${challenge.endId}`;

    hudFrom.textContent = startName;
    hudTo.textContent = endName;
    hudTimer.textContent = '0.0s';
    hudMoves.textContent = '0 moves';
    hudScore.textContent = '1000';

    startScreen.style.display = 'none';
    resultScreen.style.display = 'none';
    gameScreen.style.display = '';

    timerStart = Date.now();
    clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 100);

    showMap(challenge.startId);
  }

  /* ── wire events ─── */
  dailyBtn.addEventListener('click', startDailyGame);
  startBtn.addEventListener('click', startGame);
  giveUpBtn.addEventListener('click', showGiveUpResult);
  peekBtn.addEventListener('click', hintPeekDestination);
  revealBtn.addEventListener('click', hintRevealNextPortal);
  backBtn.addEventListener('click', () => {
    if (!gameActive || navStack.length < 2) return;
    navStack.pop();
    const prevMapId = navStack[navStack.length - 1];
    moves++;
    hudMoves.textContent = `${moves} move${moves !== 1 ? 's' : ''}`;
    updateScoreDisplay();
    visitedPath.push(prevMapId);
    showMap(prevMapId, null);
  });

  // Deep-link: #portal-runner?q=<base64url encoded startId,endId>
  if (options.setNavigate) {
    options.setNavigate((query) => {
      if (query.startsWith('daily:')) {
        const perf = decodeDailyPerf(query.slice('daily:'.length));
        dailyChallengeBeat.textContent = (perf?.elapsed && perf?.moves)
          ? `Can you beat your friend's time of ${formatTime(perf.elapsed)} in ${perf.moves} move${perf.moves !== 1 ? 's' : ''}?`
          : '';
        clearInterval(timerInterval);
        gameActive = false;
        gameScreen.style.display = 'none';
        resultScreen.style.display = 'none';
        startScreen.style.display = '';
        return;
      }
      const ids = decodeChallenge(query || '');
      if (!ids) return;
      const { startId, endId } = ids;
      if (!mapLookup[startId] || !mapLookup[endId] || startId === endId) return;

      pendingLinkedChallenge = { startId, endId };
      const startName = mapLookup[startId]?.name || `Map ${startId}`;
      const endName = mapLookup[endId]?.name || `Map ${endId}`;
      challengeRouteEl.textContent = `${startName} → ${endName}`;
      challengeBeatEl.textContent = (ids.elapsed && ids.moves)
        ? `Can you beat their time of ${formatTime(ids.elapsed)} in ${ids.moves} move${ids.moves !== 1 ? 's' : ''}?`
        : '';
      challengeCard.style.display = '';

      // Always bring user back to the start screen to see the card
      clearInterval(timerInterval);
      gameActive = false;
      gameScreen.style.display = 'none';
      resultScreen.style.display = 'none';
      startScreen.style.display = '';
    });
  }

  return root;
}
