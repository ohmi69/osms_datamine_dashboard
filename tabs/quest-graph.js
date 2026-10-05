import { el, makeTabLink, makeThumbnail, padQuestId } from '../lib/utils.js';
import { attachCustomTooltip, hideItemTooltip } from '../lib/tooltip.js';

const key = id => String(Number(id));

// Keep chain membership separate from dependency direction. A shared parent
// does not mean that one quest must be completed before another.
export function buildQuestGraph(quests) {
  const byId = new Map(quests.map(q => [key(q.id), q]));
  const links = new Map();
  const related = new Map([...byId.keys()].map(id => [id, new Set()]));
  function add(from, to, kind) {
    from = key(from);
    to = key(to);
    if (from === to) return;
    for (const id of [from, to]) {
      if (!byId.has(id)) byId.set(id, { id, name: 'Unknown quest', unavailable: true });
      if (!related.has(id)) related.set(id, new Set());
    }
    related.get(from).add(to);
    related.get(to).add(from);
    const pair = `${from}:${to}`;
    if (!links.has(pair) || kind !== 'next') links.set(pair, { from, to, kind });
  }
  for (const quest of quests) {
    if (quest.next_quest != null && Number(quest.next_quest) > 0) add(quest.id, quest.next_quest, 'next');
    for (const requirement of quest.requirements_list || []) {
      if (requirement.type !== 'quest') continue;
      add(requirement.id, quest.id, Number(requirement.state) === 0 ? 'not-started' : Number(requirement.state) === 1 ? 'in-progress' : 'complete');
    }
  }
  const parents = new Map();
  for (const quest of quests) {
    if (!quest.parent) continue;
    const ids = parents.get(quest.parent) || [];
    ids.push(key(quest.id));
    parents.set(quest.parent, ids);
  }
  // Only draw membership bridges when the real dependency links don't already
  // connect the chain. This avoids redundant lines on ordinary quest chains.
  for (const ids of parents.values()) {
    const reached = new Set([ids[0]]);
    const visit = start => {
      const pending = [start];
      while (pending.length) for (const id of related.get(pending.pop()) || []) {
        if (!reached.has(id)) { reached.add(id); pending.push(id); }
      }
    };
    visit(ids[0]);
    for (const id of ids.slice(1)) if (!reached.has(id)) {
      add(ids[0], id, 'chain');
      reached.add(id);
      visit(id);
    }
  }
  return { byId, related, links: [...links.values()] };
}

export function getQuestComponent(graph, rootId) {
  const ids = new Set([key(rootId)]);
  const pending = [...ids];
  while (pending.length) for (const id of graph.related.get(pending.pop()) || []) {
    if (!ids.has(id)) { ids.add(id); pending.push(id); }
  }
  return { quests: [...ids].map(id => graph.byId.get(id)).filter(Boolean), links: graph.links.filter(e => ids.has(e.from) && ids.has(e.to)) };
}

// Collapse cycles before ranking the directed graph, so cyclic or reciprocal
// conditions cannot produce an infinite layout or ever-growing coordinates.
export function layoutQuestGraph(component) {
  const outgoing = new Map(component.quests.map(q => [key(q.id), []]));
  component.links.filter(e => e.kind !== 'chain' && e.kind !== 'not-started').forEach(e => outgoing.get(e.from).push(e.to));
  let counter = 0;
  const index = new Map(), low = new Map(), stack = [], active = new Set(), groups = [], groupById = new Map();
  function visit(id) {
    index.set(id, counter); low.set(id, counter++); stack.push(id); active.add(id);
    for (const next of outgoing.get(id)) {
      if (!index.has(next)) { visit(next); low.set(id, Math.min(low.get(id), low.get(next))); }
      else if (active.has(next)) low.set(id, Math.min(low.get(id), index.get(next)));
    }
    if (low.get(id) === index.get(id)) {
      const group = [];
      let member;
      do { member = stack.pop(); active.delete(member); groupById.set(member, groups.length); group.push(member); } while (member !== id);
      groups.push(group);
    }
  }
  for (const id of outgoing.keys()) if (!index.has(id)) visit(id);
  const ranks = groups.map(() => 0), incoming = groups.map(() => 0), edges = groups.map(() => new Set());
  for (const [id, targets] of outgoing) for (const target of targets) {
    const from = groupById.get(id), to = groupById.get(target);
    if (from !== to && !edges[from].has(to)) { edges[from].add(to); incoming[to]++; }
  }
  const queue = incoming.flatMap((count, i) => count === 0 ? [i] : []);
  for (let i = 0; i < queue.length; i++) for (const to of edges[queue[i]]) {
    ranks[to] = Math.max(ranks[to], ranks[queue[i]] + 1);
    if (--incoming[to] === 0) queue.push(to);
  }
  const columns = [];
  for (const quest of component.quests) {
    const rank = ranks[groupById.get(key(quest.id))];
    (columns[rank] ||= []).push(quest);
  }
  const height = Math.max(180, ...columns.map(column => column.length * 116 + 48));
  const positions = new Map();
  columns.forEach((column, x) => {
    column.sort((a, b) => Number(a.id) - Number(b.id));
    column.forEach((quest, y) => positions.set(key(quest.id), { x: 24 + x * 292, y: (height - column.length * 116) / 2 + y * 116 }));
  });
  return { positions, width: columns.length * 292 + 8, height };
}

let graphNumber = 0;
export function renderQuestGraph(root, graph, completionState, buildTooltip, npcByName = new Map()) {
  const component = getQuestComponent(graph, root.id);
  if (!component.links.length) return null;
  const layout = layoutQuestGraph(component);
  const panel = el('section', { className: 'quest-graph', 'aria-label': `Linked quests for ${root.name}` });
  panel.addEventListener('click', event => event.stopPropagation());
  const toolbar = el('div', { className: 'quest-graph-toolbar' },
    el('div', { className: 'quest-graph-heading' },
      el('span', { className: 'quest-graph-eyebrow', textContent: 'Quest dependencies' }),
      el('strong', { textContent: root.parent || root.name })));
  const controls = el('div', { className: 'quest-graph-controls' });
  toolbar.appendChild(controls);
  panel.appendChild(toolbar);
  const workspace = el('div', { className: 'quest-graph-workspace' });
  panel.appendChild(workspace);
  const viewport = el('div', { className: 'quest-graph-viewport', tabIndex: 0, 'aria-label': 'Scrollable quest dependency graph' });
  viewport.addEventListener('scroll', hideItemTooltip);
  const sizer = el('div', { className: 'quest-graph-sizer' });
  const canvas = el('div', { className: 'quest-graph-canvas', style: { width: `${layout.width}px`, height: `${layout.height}px` } });
  viewport.appendChild(sizer); sizer.appendChild(canvas); workspace.appendChild(viewport);
  const svgEl = (tag, attrs) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    return node;
  };
  const svg = svgEl('svg', { width: layout.width, height: layout.height, 'aria-hidden': 'true' });
  const markerId = `quest-arrow-${++graphNumber}`;
  const defs = svgEl('defs', {}), marker = svgEl('marker', { id: markerId, viewBox: '0 0 12 12', refX: 11, refY: 6, markerWidth: 12, markerHeight: 12, markerUnits: 'userSpaceOnUse', orient: 'auto' });
  marker.appendChild(svgEl('path', { d: 'M 1 1 L 11 6 L 1 11 Z', fill: 'context-stroke' })); defs.appendChild(marker); svg.appendChild(defs); canvas.appendChild(svg);
  const labels = { complete: 'Complete prerequisite', next: 'Follow-up quest', 'in-progress': 'Must be in progress', 'not-started': 'Must not be started', chain: 'Same named chain; no dependency implied' };
  const paths = [];
  for (const edge of component.links) {
    const a = layout.positions.get(edge.from), b = layout.positions.get(edge.to);
    const forward = b.x > a.x;
    const siblings = component.links.filter(link => link.from === edge.from)
      .sort((left, right) => layout.positions.get(left.to).y - layout.positions.get(right.to).y);
    const sourceY = a.y + 24 + 40 * (siblings.indexOf(edge) + 1) / (siblings.length + 1);
    let d;
    if (forward) {
      const x1 = a.x + 234, x2 = b.x - 4, y2 = b.y + 44;
      const bend = (x1 + x2) / 2;
      d = `M ${x1} ${sourceY} C ${bend} ${sourceY}, ${bend} ${y2}, ${x2} ${y2}`;
    } else if (a.x === b.x) {
      // Cycles and membership links enter and leave the right edge horizontally.
      const x1 = a.x + 234, x2 = b.x + 236, y2 = b.y + 44, bend = x2 + 28;
      d = `M ${x1} ${sourceY} C ${bend} ${sourceY}, ${bend} ${y2}, ${x2} ${y2}`;
    } else {
      // Backward state conditions run above the cards, rather than through them.
      const x1 = a.x + 116, x2 = b.x + 116, y1 = a.y - 2, y2 = b.y - 4;
      d = `M ${x1} ${y1} L ${x1} 24 Q ${x1} 12 ${x1 - 12} 12 L ${x2 + 12} 12 Q ${x2} 12 ${x2} 24 L ${x2} ${y2}`;
    }
    const path = svgEl('path', { d, class: `quest-graph-edge quest-graph-edge--${edge.kind}` });
    if (edge.kind !== 'chain') path.setAttribute('marker-end', `url(#${markerId})`);
    const title = svgEl('title', {}); title.textContent = labels[edge.kind]; path.appendChild(title);
    svg.appendChild(path); paths.push({ edge, path });
  }
  const nodes = new Map();
  const legend = el('div', { className: 'quest-graph-legend' });
  for (const [kind, label] of [['dependency', 'Prerequisite / follow-up'], ['condition', 'State condition'], ['chain', 'Same chain']]) {
    legend.appendChild(el('span', null, el('i', { className: `quest-graph-line quest-graph-line--${kind}`, 'aria-hidden': 'true' }), document.createTextNode(label)));
  }
  legend.appendChild(el('span', { className: 'quest-graph-hint', textContent: component.links.length ? 'Hover for details \u00b7 Click to open quest' : 'No linked quests in this dataset' }));
  panel.appendChild(legend);
  function highlight(id) {
    for (const [nodeId, node] of nodes) node.classList.toggle('is-selected', nodeId === id);
    for (const { edge, path } of paths) path.classList.toggle('is-highlighted', edge.from === id || edge.to === id);
  }
  for (const quest of component.quests) {
    const id = key(quest.id), pos = layout.positions.get(id);
    const node = makeTabLink('quests', `id:${quest.id}`, { className: 'quest-graph-node', stopPropagation: true });
    node.style.left = `${pos.x}px`; node.style.top = `${pos.y}px`;
    node.setAttribute('aria-label', `Open ${quest.name}`);
    const identity = el('span', { className: 'quest-graph-node-meta quest-graph-node-identity' });
    if (key(root.id) === id) identity.appendChild(el('span', { textContent: 'Opened quest' }));
    identity.appendChild(el('span', { className: 'id', textContent: `#${padQuestId(id)}` }));
    if (completionState[String(quest.id)]) identity.appendChild(el('span', { textContent: 'Completed' }));
    const npc = npcByName.get(String(quest.npc_name || '').trim().toLowerCase());
    const copy = el('span', { className: 'quest-graph-node-copy' },
      identity,
      el('strong', { textContent: quest.name }),
      el('span', { className: 'quest-graph-node-meta', textContent: [quest.npc_name, quest.level_min ? `Lv. ${quest.level_min}+` : quest.region].filter(Boolean).join(' \u00b7 ') }));
    node.append(
      makeThumbnail(npc?.thumbnail || '', `${quest.npc_name || 'NPC'} portrait`, { className: 'quest-graph-npc-thumb', fallbackText: 'NPC' }),
      copy);
    node.classList.toggle('is-root', id === key(root.id));
    node.classList.toggle('is-complete', completionState[String(quest.id)] === true);
    if (buildTooltip) attachCustomTooltip(node, tip => buildTooltip(tip, quest));
    node.addEventListener('click', hideItemTooltip);
    node.addEventListener('mouseenter', () => highlight(id));
    node.addEventListener('mouseleave', () => highlight(key(root.id)));
    node.addEventListener('focus', () => highlight(id));
    node.addEventListener('blur', () => highlight(key(root.id)));
    nodes.set(id, node); canvas.appendChild(node);
  }
  let zoom = 1;
  const zoomLabel = el('span', { className: 'quest-graph-count' });
  function setZoom(value) {
    zoom = Math.max(0.2, Math.min(1.5, value));
    canvas.style.transform = `scale(${zoom})`;
    sizer.style.width = `${layout.width * zoom}px`; sizer.style.height = `${layout.height * zoom}px`;
    canvas.style.top = `${Math.max(0, (viewport.clientHeight - layout.height * zoom) / 2)}px`;
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }
  function center() {
    const pos = layout.positions.get(key(root.id));
    viewport.scrollLeft = (pos.x + 116) * zoom - viewport.clientWidth / 2;
    viewport.scrollTop = (pos.y + 44) * zoom - viewport.clientHeight / 2;
  }
  for (const [label, title, action] of [ ['−', 'Zoom out', () => { setZoom(zoom - 0.15); center(); }], ['+', 'Zoom in', () => { setZoom(zoom + 0.15); center(); }], ['Fit', 'Fit all linked quests', () => { setZoom(Math.min(1, viewport.clientWidth / layout.width, viewport.clientHeight / layout.height)); viewport.scrollLeft = 0; viewport.scrollTop = 0; }], ['Focus', 'Focus opened quest', () => { setZoom(1); center(); }] ]) {
    const button = el('button', { type: 'button', textContent: label, title, 'aria-label': title }); button.addEventListener('click', action); controls.appendChild(button);
  }
  controls.appendChild(zoomLabel); setZoom(1); highlight(key(root.id));
  // Cards may initially be hidden. Focus after real dimensions are available.
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => {
      if (viewport.clientWidth > 0) { setZoom(zoom); center(); }
    });
    observer.observe(viewport);
    panel._dispose = () => observer.disconnect();
  }
  requestAnimationFrame(() => { setZoom(zoom); center(); });
  return panel;
}
