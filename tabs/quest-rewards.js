import { el, makeTabLink, makeThumbnail, padItemId } from '../lib/utils.js';
import { attachCustomTooltip } from '../lib/tooltip.js';
import { renderQuestTooltip } from './quests.js';

// An item can be paid out by a lot of quests (one scroll is a reward for 97 of
// them), so the panel opens on a readable slice and grows on demand.
const MAX_VISIBLE = 12;

function formatPercent(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

// Reverse index: item id -> the quests that hand it out.
// Rebuilt per dataset at most once; both item tabs ask for the same quests array.
let _indexQuests = null;
let _index = null;

export function getQuestRewardIndex(quests) {
  if (_indexQuests === quests) return _index;
  _indexQuests = quests;
  _index = buildQuestRewardIndex(quests);
  return _index;
}

function buildQuestRewardIndex(quests) {
  const index = new Map();

  function push(itemId, quest, info) {
    if (itemId == null || !quest || quest.id == null) return;
    const key = String(itemId);
    let list = index.get(key);
    if (!list) index.set(key, (list = []));
    const existing = list.find((entry) => String(entry.quest.id) === String(quest.id));
    if (existing) {
      // The same quest can pay the same item through two paths (a weighted block
      // alongside a flat entry). Merge into one chip instead of repeating it.
      existing.guaranteed = existing.guaranteed || info.guaranteed;
      existing.choice = existing.choice || info.choice;
      existing.weighted = existing.weighted || info.weighted;
      existing.chancePct = existing.chancePct ?? info.chancePct ?? null;
      existing.jobName = existing.jobName || info.jobName || null;
      existing.count = Math.max(existing.count, info.count || 1);
      return;
    }
    list.push({
      quest,
      count: info.count || 1,
      guaranteed: Boolean(info.guaranteed),
      choice: Boolean(info.choice),
      weighted: Boolean(info.weighted),
      chancePct: info.chancePct ?? null,
      jobName: info.jobName || null,
    });
  }

  for (const quest of quests || []) {
    const rewards = Array.isArray(quest.rewards) ? quest.rewards : [];
    const rewardWeighted = Array.isArray(quest.reward_weighted) ? quest.reward_weighted : [];
    // Same split the quest detail uses: `prop > 0` marks a weighted entry, so
    // those never count as guaranteed drops. Where a weighted block spells the
    // same thing out, it wins - it carries the real weights.
    const totalWeight = rewards.reduce(
      (sum, reward) => sum + (reward?.type === 'item' && typeof reward.prop === 'number' && reward.prop > 0 ? reward.prop : 0),
      0
    );
    for (const reward of rewards) {
      if (reward?.type !== 'item') continue;
      if (typeof reward.prop === 'number' && reward.prop > 0) {
        if (rewardWeighted.length) continue;
        push(reward.id, quest, {
          weighted: true,
          chancePct: totalWeight > 0 ? (reward.prop / totalWeight) * 100 : null,
          count: reward.count,
          jobName: reward.job_name,
        });
      } else if (reward.guaranteed === false) {
        // Non-guaranteed without a weight is a class-specific pick-one, which the
        // quest detail can only show as flattened text.
        push(reward.id, quest, { choice: true, count: reward.count, jobName: reward.job_name });
      } else {
        push(reward.id, quest, { guaranteed: true, count: reward.count });
      }
    }

    for (const block of rewardWeighted) {
      for (const group of Array.isArray(block?.groups) ? block.groups : []) {
        for (const item of Array.isArray(group?.items) ? group.items : []) {
          const chancePct = typeof item.chance_pct === 'number'
            ? item.chance_pct
            : group.total_weight > 0 && typeof item.weight === 'number'
              ? (item.weight / group.total_weight) * 100
              : null;
          push(item.id, quest, { weighted: true, chancePct, count: item.count, jobName: group.job_name });
        }
      }
    }

    for (const block of Array.isArray(quest.reward_choices) ? quest.reward_choices : []) {
      for (const group of Array.isArray(block?.groups) ? block.groups : []) {
        for (const item of Array.isArray(group?.items) ? group.items : []) {
          push(item.id, quest, { choice: true, count: item.count, jobName: group.job_name });
        }
      }
    }
  }

  for (const list of index.values()) {
    list.sort((a, b) =>
      (a.quest.level_min || 0) - (b.quest.level_min || 0) ||
      String(a.quest.name || '').localeCompare(String(b.quest.name || ''))
    );
  }
  return index;
}

function entryMeta(entry) {
  const parts = [];
  if (entry.count > 1) parts.push(`×${entry.count}`);
  if (entry.chancePct != null) parts.push(`${formatPercent(entry.chancePct)}%`);
  else if (entry.weighted) parts.push('weighted');
  if (entry.choice) {
    parts.push(entry.jobName && entry.jobName !== 'Any Class' ? `pick one (${entry.jobName})` : 'pick one');
  }
  if (entry.guaranteed && parts.length === 0) parts.push('guaranteed');
  return parts.join(' · ');
}

function makeRewardChip(entry, npcByName, tooltip) {
  const quest = entry.quest;
  const meta = entryMeta(entry);
  const where = [quest.level_min ? `Lv. ${quest.level_min}+` : '', quest.region].filter(Boolean).join(' · ');
  const npc = npcByName?.get(String(quest.npc_name || '').trim().toLowerCase());
  const chip = makeTabLink('quests', `id:${quest.id}`, {
    className: 'quest-chip item-quest-reward-chip',
    stopPropagation: true,
    title: [quest.name, quest.npc_name, where, meta].filter(Boolean).join(' — '),
  });
  chip.append(
    makeThumbnail(npc?.thumbnail || '', `${quest.npc_name || 'NPC'} portrait`, {
      className: 'item-quest-reward-thumb',
      fallbackText: 'NPC',
    }),
    el('span', { className: 'item-quest-reward-copy' },
      el('span', { className: 'item-quest-reward-name', textContent: quest.name }),
      el('span', { className: 'item-quest-reward-meta', textContent: [quest.npc_name, meta].filter(Boolean).join(' · ') }))
  );
  if (tooltip) attachCustomTooltip(chip, (tip) => tooltip(tip, quest));
  return chip;
}

// Returns null when no quest hands this item out, so callers can skip the panel.
export function makeQuestRewardPanel(itemId, context) {
  const { index, npcByName, tooltip } = context;
  const entries = index?.get(String(itemId));
  if (!entries || entries.length === 0) return null;

  const panel = el('div', { className: 'item-quest-rewards' });
  panel.appendChild(
    el('div', {
      className: 'item-quest-rewards-label',
      textContent: entries.length === 1 ? 'Quest Reward' : `Quest Rewards (${entries.length})`,
    })
  );
  const list = el('div', { className: 'quest-chip-list item-quest-reward-list' });
  panel.appendChild(list);

  function fill(limit) {
    list.innerHTML = '';
    entries.slice(0, limit).forEach((entry) => list.appendChild(makeRewardChip(entry, npcByName, tooltip)));
  }
  fill(MAX_VISIBLE);

  if (entries.length > MAX_VISIBLE) {
    let showingAll = false;
    const more = el('button', { className: 'item-quest-reward-more', type: 'button' });
    function syncLabel() {
      more.textContent = showingAll ? 'Show fewer' : `Show all ${entries.length} quests`;
    }
    more.addEventListener('click', (event) => {
      event.stopPropagation();
      showingAll = !showingAll;
      fill(showingAll ? entries.length : MAX_VISIBLE);
      syncLabel();
    });
    syncLabel();
    panel.appendChild(more);
  }

  return panel;
}

// One shared bundle for both item tabs: the reward index, the NPC portraits the
// chips show, and the hover preview the quest graph uses.
export function makeQuestRewardContext(data) {
  const itemByName = new Map(
    [...(data.items?.items || []), ...(data.items?.scrolls || [])].filter(item => item?.name).map(item => [item.name, item])
  );
  const itemById = new Map(
    [...(data.items?.items || []), ...(data.items?.scrolls || [])].map((item) => [String(item.id), item])
  );
  const monsterById = new Map((data.monsters?.monsters || []).map((mob) => [String(mob.id), mob]));
  const npcValues = data.maps?.npc_lookup instanceof Map
    ? data.maps.npc_lookup.values()
    : Object.values(data.maps?.npc_lookup || {});
  const npcByName = new Map(
    [...npcValues].filter((npc) => npc?.name).map((npc) => [String(npc.name).trim().toLowerCase(), npc])
  );
  return {
    index: getQuestRewardIndex(data.quests?.quests),
    craftingIndex: getCraftingResultIndex(data.recipes),
    itemByName,
    npcByName,
    tooltip: (tip, quest) => renderQuestTooltip(tip, quest, itemById, npcByName, monsterById),
  };
}

// Reverse index from crafted output to every recipe that produces it.
export function getCraftingResultIndex(crafting) {
  const index = new Map();
  for (const discipline of crafting?.disciplines || []) {
    for (const outputType of discipline.output_types || []) {
      for (const level of outputType.levels || []) {
        for (const recipe of level.recipes || []) {
          if (recipe.output_id == null) continue;
          const key = String(recipe.output_id);
          if (!index.has(key)) index.set(key, []);
          index.get(key).push({ discipline: discipline.discipline, level: level.level, recipe });
        }
      }
    }
  }
  return index;
}

export function makeCraftingResultPanel(itemId, context) {
  const entries = context?.craftingIndex?.get(String(itemId));
  if (!entries?.length) return null;
  const panel = el('div', { className: 'item-quest-rewards item-crafting-results' });
  panel.appendChild(el('div', { className: 'item-quest-rewards-label', textContent: entries.length === 1 ? 'Crafting Recipe' : `Crafting Recipes (${entries.length})` }));
  const list = el('div', { className: 'quest-chip-list item-quest-reward-list' });
  for (const { discipline, level, recipe } of entries) {
    const link = makeTabLink('crafting', `id:${itemId}`, {
      className: 'quest-chip item-quest-reward-chip', stopPropagation: true,
      title: `${discipline} · Level ${level}`,
    });
    const ingredientRow = el('span', { className: 'item-crafting-ingredients', 'aria-label': 'Ingredients' });
    for (const ingredient of recipe.ingredients || []) {
      const item = context.itemByName?.get(ingredient.item_name);
      const ingredientChip = el('span', { className: 'item-crafting-ingredient', title: `${ingredient.count || 1}× ${ingredient.item_name}` });
      if (item) ingredientChip.appendChild(makeThumbnail(`images/items/${padItemId(item.id)}.png`, ingredient.item_name, { className: 'item-crafting-ingredient-thumb', fallbackText: 'ITEM' }));
      else ingredientChip.appendChild(el('span', { className: 'item-crafting-ingredient-fallback', textContent: ingredient.item_name.slice(0, 3).toUpperCase() }));
      if ((ingredient.count || 1) > 1) ingredientChip.appendChild(el('span', { className: 'item-crafting-ingredient-count', textContent: String(ingredient.count) }));
      ingredientRow.appendChild(ingredientChip);
    }
    link.appendChild(el('span', { className: 'item-quest-reward-copy' },
      el('span', { className: 'item-quest-reward-name', textContent: `${discipline} · Level ${level}` }),
      ingredientRow));
    list.appendChild(link);
  }
  panel.appendChild(list);
  return panel;
}
