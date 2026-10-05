import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildQuestGraph, renderQuestGraph } from '../tabs/quest-graph.js';

// A small DOM fixture tests rendered content and event wiring without a browser.
class Element {
  constructor(tag) {
    this.tag = tag; this.children = []; this.attrs = {}; this.events = {}; this.style = {};
    this.clientWidth = 1000; this.clientHeight = 300; this.offsetWidth = 380; this.offsetHeight = 300;
    this.className = '';
    this.classList = {
      contains: name => this.className.split(' ').includes(name),
      add: (...names) => { for (const name of names) this.classList.toggle(name, true); },
      remove: (...names) => { for (const name of names) this.classList.toggle(name, false); },
      toggle: (name, value) => {
        const names = new Set(this.className.split(' ').filter(Boolean));
        if (value ?? !names.has(name)) names.add(name); else names.delete(name);
        this.className = [...names].join(' ');
      },
    };
  }
  setAttribute(name, value) { this.attrs[name] = String(value); if (name === 'class') this.className = value; }
  removeAttribute(name) { delete this.attrs[name]; }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  prepend(...children) { this.children.unshift(...children); }
  querySelectorAll(selector) { return walk(this).slice(1).filter(node => selector.startsWith('.') ? node.classList.contains(selector.slice(1)) : node.tag === selector); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(name, callback) { (this.events[name] ||= []).push(callback); }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return (this.text || '') + this.children.map(child => child.textContent).join(' '); }
  set innerHTML(value) { this.children = []; this.text = value; }
  getBoundingClientRect() { return { left: 100, bottom: 200, width: 232 }; }
  fire(name, event = {}) { for (const callback of this.events[name] || []) callback(event); }
}
globalThis.document = {
  body: new Element('body'),
  createElement: tag => new Element(tag),
  createElementNS: (_, tag) => new Element(tag),
  createTextNode: text => { const node = new Element('#text'); node.textContent = text; return node; },
};
globalThis.window = { location: { pathname: '/index.html', search: '?patch=example' }, innerWidth: 1200, innerHeight: 800, addEventListener() {} };
globalThis.requestAnimationFrame = callback => callback();
const { renderQuestTooltip, renderQuestCard } = await import('../tabs/quests.js');
const walk = node => [node, ...node.children.flatMap(walk)];
const quests = JSON.parse(readFileSync(new URL('../data/current/quests.json', import.meta.url), 'utf8')).quests;
const quest = quests.find(q => Number(q.id) === 10402);
const npcs = new Map([['manji', { thumbnail: 'images/npcs/manji.png' }]]);
const tooltip = new Element('div');
renderQuestTooltip(tooltip, quest, new Map(), npcs);
const text = tooltip.textContent;
for (const value of ['Old Gladius', 'Manji', 'Find Manji in Perion.', 'Requirements', 'Delivering the Weird Medicine', 'Rewards', '7,987 EXP', '1,462 mesos']) assert.ok(text.includes(value), value);
assert.ok(!text.includes('I visited Manji again'), 'Use the collapsed summary, not the expanded story');
assert.ok(walk(tooltip).some(node => node.tag === 'img' && node.attrs.src?.endsWith('images/npcs/manji.png')));
for (const node of walk(tooltip).filter(node => node.text && /#\d+/.test(node.text))) assert.ok(node.classList.contains('id'), 'Tooltip IDs must use the shared Show IDs class');

const panel = renderQuestGraph(quest, buildQuestGraph(quests), {}, (tip, linked) => renderQuestTooltip(tip, linked, new Map(), npcs), npcs);
const nodes = walk(panel).filter(node => node.classList.contains('quest-graph-node'));
assert.equal(nodes.length, 14);
assert.ok(nodes.every(node => node.querySelector('.quest-graph-npc-thumb')), 'Every graph node has an NPC portrait or fallback');
const manjiNode = nodes.find(node => node.attrs['aria-label'] === 'Open Old Gladius');
assert.ok(walk(manjiNode).some(node => node.tag === 'img' && node.attrs.src?.endsWith('images/npcs/manji.png')));
const arrowMarker = walk(panel).find(node => node.tag === 'marker');
assert.equal(arrowMarker.attrs.markerUnits, 'userSpaceOnUse', 'Arrowheads should keep a fixed size on hover');
assert.equal(arrowMarker.attrs.markerWidth, '12');
assert.equal(arrowMarker.children[0].attrs.fill, 'context-stroke', 'Arrowheads should be solid and match the connector');
assert.ok(arrowMarker.children[0].attrs.d.endsWith('Z'), 'Arrowheads use a filled triangle');
for (const node of walk(panel).filter(node => node.text && /#\d+/.test(node.text))) assert.ok(node.classList.contains('id'), 'Graph IDs must use the shared Show IDs class');
const target = nodes.find(node => node.attrs['aria-label'] === 'Open Reawakening the Gladius');
assert.equal(target.tag, 'a');
assert.equal(target.attrs.href, '/index.html?patch=example#quests?q=id%3A10403');
target.fire('mouseenter', { clientX: 100, clientY: 100 });
const floating = document.body.children.find(node => node.attrs.id === 'craft-item-tooltip');
assert.ok(floating.classList.contains('visible'));
assert.ok(floating.textContent.includes('Reawakening the Gladius'));
assert.ok(!floating.textContent.includes('Star Rock'), 'Item requirement names are replaced by thumbnails');
assert.ok(walk(floating).some(node => node.tag === 'img' && node.attrs.alt === 'Star Rock'));
assert.ok(floating.textContent.includes('Blue Potion'));
let stopped = false;
target.fire('click', { stopPropagation() { stopped = true; }, preventDefault() { assert.fail('Navigation must follow the real link'); } });
assert.ok(stopped);
assert.ok(!floating.classList.contains('visible'), 'Hide tooltip when navigating');
target.fire('focus');
assert.ok(floating.classList.contains('visible'), 'Keyboard focus also shows quest details');
target.fire('blur');
assert.ok(!floating.classList.contains('visible'));
const expandedIds = new Set();
const card = renderQuestCard({ id: '10402', name: 'Old Gladius', description: 'Summary\nFull quest story' }, {}, () => {}, new Map(), new Map(), new Map(), expandedIds);
const details = card.querySelector('.quest-stages');
const story = card.querySelector('.quest-story');
assert.equal(details.hidden, true);
card._expandDetails();
assert.equal(details.hidden, false);
assert.equal(story.open, true, 'Deep links expand the quest story');
assert.ok(expandedIds.has('10402'));
card._expandDetails();
assert.equal(details.hidden, false, 'Repeated navigation must keep details open');
assert.equal(story.open, true);
const standalone = { id: '99999', name: 'Standalone', description: 'Standalone summary' };
const standaloneGraph = buildQuestGraph([standalone]);
assert.equal(renderQuestGraph(standalone, standaloneGraph, {}), null);
const standaloneCard = renderQuestCard(standalone, {}, () => {}, new Map(), new Map(), new Map(), new Set(), null, standaloneGraph);
assert.equal(standaloneCard.querySelector('.quest-graph-trigger'), null);
standaloneCard._expandDetails();
assert.equal(standaloneCard.querySelector('.quest-graph'), null);
assert.equal(standaloneCard.querySelector('.quest-story').open, true, 'Standalone quests still support deep-linked details');
const branches = [
  { id: '1', name: 'Start', next_quest: '2' },
  { id: '2', name: 'Upper branch' },
  { id: '3', name: 'Lower branch', requirements_list: [{ type: 'quest', id: '1', state: 2 }] },
];
const branchPanel = renderQuestGraph(branches[0], buildQuestGraph(branches), {});
const connectors = walk(branchPanel).filter(node => node.classList.contains('quest-graph-edge'));
assert.equal(connectors.length, 2);
assert.notEqual(connectors[0].attrs.d.split(' C ')[0], connectors[1].attrs.d.split(' C ')[0], 'Branch connectors use separate ports on the source card');
console.log('Quest UI checks passed: NPC thumbnail, collapsed summary, requirements, rewards, hover/focus, and direct quest links.');
