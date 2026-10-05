import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildQuestGraph, getQuestComponent, layoutQuestGraph } from '../tabs/quest-graph.js';

const quests = JSON.parse(readFileSync(new URL('../data/current/quests.json', import.meta.url), 'utf8')).quests;
const graph = buildQuestGraph(quests);
const gladius = getQuestComponent(graph, '010402');
for (const id of ['10112', '10402', '10403', '10404']) assert.ok(gladius.quests.some(q => String(Number(q.id)) === id));
assert.equal(gladius.links.filter(e => e.from === '10402' && e.to === '10403').length, 1);
const layout = layoutQuestGraph(gladius);
assert.ok(layout.positions.get('10112').x < layout.positions.get('10402').x);
assert.ok(layout.positions.get('10402').x < layout.positions.get('10403').x);
assert.ok(layout.positions.get('10403').x < layout.positions.get('10404').x);

const fixtures = buildQuestGraph([
  { id: '1', parent: 'Shared chain', next_quest: '2' },
  { id: '2', parent: 'Shared chain', next_quest: '1', requirements_list: [{ type: 'quest', id: '9', state: 0 }] },
  { id: '3', parent: 'Shared chain' },
  { id: '4' },
]);
const cycle = getQuestComponent(fixtures, 1);
assert.equal(cycle.quests.length, 4);
assert.ok(cycle.links.some(e => e.kind === 'chain'));
assert.ok(cycle.links.some(e => e.kind === 'not-started'));
assert.ok(cycle.quests.find(q => q.id === '9').unavailable);
assert.equal(getQuestComponent(fixtures, 4).quests.length, 1);
const cycleLayout = layoutQuestGraph(cycle);
for (const pos of cycleLayout.positions.values()) assert.ok(Number.isFinite(pos.x) && Number.isFinite(pos.y));
assert.equal(cycleLayout.positions.get('1').x, cycleLayout.positions.get('2').x);

// Check each component in the real dataset for finite, non-overlapping nodes.
const checked = new Set();
for (const quest of quests) {
  const id = String(Number(quest.id));
  if (checked.has(id)) continue;
  const component = getQuestComponent(graph, id);
  const result = layoutQuestGraph(component);
  const occupied = new Set();
  for (const [member, position] of result.positions) {
    checked.add(member);
    assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y));
    const coordinate = `${position.x},${position.y}`;
    assert.ok(!occupied.has(coordinate));
    occupied.add(coordinate);
  }
}
console.log(`Quest graph checks passed (${checked.size} quests; Gladius component: ${gladius.quests.length} quests).`);
