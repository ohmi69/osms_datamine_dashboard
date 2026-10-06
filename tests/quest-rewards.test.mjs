import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A small DOM fixture, same shape as quest-graph-ui.test.mjs.
class Element {
  constructor(tag) {
    this.tag = tag; this.children = []; this.attrs = {}; this.events = {}; this.style = {};
    this.className = '';
    this.hidden = false;
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
  insertBefore(child, before) {
    const at = before ? this.children.indexOf(before) : -1;
    if (at === -1) this.children.push(child); else this.children.splice(at, 0, child);
    return child;
  }
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
globalThis.window = { location: { pathname: '/index.html', search: '' }, innerWidth: 1200, innerHeight: 800, addEventListener() {} };
globalThis.requestAnimationFrame = callback => callback();
const walk = node => [node, ...node.children.flatMap(walk)];

const { getQuestRewardIndex, makeQuestRewardPanel, makeQuestRewardContext } = await import('../tabs/quest-rewards.js');

const quests = JSON.parse(readFileSync(new URL('../data/current/quests.json', import.meta.url), 'utf8')).quests;
const index = getQuestRewardIndex(quests);
assert.ok(index.size > 100, `Reward index covers the dataset (${index.size} items)`);

// Guaranteed payouts, with the stack size in the chip meta.
const potions = index.get('2000000');
assert.ok(potions.length > 0);
assert.match(potions[0].quest.name, /Olaf/);
assert.ok(potions.every(entry => entry.guaranteed));
assert.equal(potions[0].count, 5);

// Weighted blocks keep their chance, and sort by level so the list reads as progression.
const weighted = index.get('2043001');
assert.ok(weighted.length > 0, 'Weighted scroll rewards are indexed');
assert.ok(weighted.every(entry => entry.weighted && entry.chancePct > 0));
for (let i = 1; i < weighted.length; i++) {
  assert.ok((weighted[i - 1].quest.level_min || 0) <= (weighted[i].quest.level_min || 0));
}

// Class-specific pick-ones (prop: -1 in the flat reward list) show their job.
const greater = index.get('2043002');
assert.ok(greater.some(entry => entry.choice && entry.jobName === 'Warrior'));

// The same quest listed through two paths stays a single chip.
for (const entries of index.values()) {
  const ids = entries.map(entry => String(entry.quest.id));
  assert.equal(new Set(ids).size, ids.length, 'One chip per quest');
}

const emptyContext = { index, npcByName: new Map(), tooltip: null };

// Panel shape: label, chips deep-linking to the quest tab, nothing for unknown items.
const panel = makeQuestRewardPanel('2043002', emptyContext);
assert.ok(panel);
assert.match(panel.querySelector('.item-quest-rewards-label').textContent, /^Quest Rewards \(\d+\)$/);
const chips = panel.querySelectorAll('.item-quest-reward-chip');
assert.ok(chips.length > 0);
assert.ok(chips[0].attrs.href.includes('#quests?q=id%3A'));
assert.match(chips[0].querySelector('.item-quest-reward-meta').textContent, /pick one \(Warrior\)/);
assert.equal(makeQuestRewardPanel('999999999', emptyContext), null, 'Items no quest rewards skip the panel');

// The 97-quest scroll caps its list and grows on demand.
const busy = [...index.entries()].sort((a, b) => b[1].length - a[1].length)[0];
const busyPanel = makeQuestRewardPanel(busy[0], emptyContext);
const more = busyPanel.querySelector('.item-quest-reward-more');
assert.ok(more, 'Long reward lists get a show-all toggle');
const before = busyPanel.querySelectorAll('.item-quest-reward-chip').length;
more.fire('click', { stopPropagation() {} });
assert.ok(busyPanel.querySelectorAll('.item-quest-reward-chip').length > before);
assert.match(more.textContent, /Show fewer/);

// Single-quest items read as a label, not a count.
const single = [...index.entries()].find(([, entries]) => entries.length === 1);
assert.equal(
  makeQuestRewardPanel(single[0], emptyContext).querySelector('.item-quest-rewards-label').textContent,
  'Quest Reward'
);

// NPC portraits come from the maps lookup, keyed by the quest's npc_name.
const npcContext = makeQuestRewardContext({
  quests: { quests },
  items: { items: [], scrolls: [] },
  monsters: { monsters: [] },
  maps: { npc_lookup: { olaf: { name: 'Olaf', thumbnail: 'images/npcs/olaf.png' } } },
});
assert.equal(npcContext.index, index, 'Both tabs share one index per dataset');
const olaf = quests.find(q => q.npc_name === 'Olaf');
const olafItem = olaf.rewards.find(r => r.type === 'item' && r.id === 2000000).id;
const olafChip = makeQuestRewardPanel(olafItem, npcContext).querySelector('.item-quest-reward-chip');
const olafThumb = olafChip.querySelector('.item-quest-reward-thumb');
assert.equal(walk(olafThumb).find(node => node.tag === 'img').attrs.src, './data/current/images/npcs/olaf.png');
assert.match(olafChip.querySelector('.item-quest-reward-meta').textContent, /^Olaf · /);
assert.ok(olafChip.querySelector('.item-quest-reward-name'));

// A quest whose NPC has no portrait still falls back to a placeholder.
const noNpc = makeQuestRewardPanel(olafItem, { index, npcByName: new Map(), tooltip: null });
assert.equal(
  noNpc.querySelector('.item-quest-reward-thumb').querySelector('.thumb-fallback').textContent,
  'NPC'
);

console.log(`Quest reward checks passed: ${index.size} items indexed, weighted chances, class-specific picks, NPC portraits, dedupe, and capped lists.`);