import { el, fmt, matchSearch, makeThumbnail, makeDeepLinkButton, parseIdFilter, makePillGroup, wireSearch, toItemThumbPath, toMobThumbPath, makeCopyableId, padQuestId, scrollToDetailRow, autoExpandById } from '../lib/utils.js';
import { attachTooltip } from '../lib/tooltip.js';


import state from '../lib/data.js';

function loadCompletionState() {
  return state.get('questsCompletionById', {});
}

function saveCompletionState(val) {
  state.set('questsCompletionById', val);
}

function getQuestCompletionKey(quest) {
  if (!quest || quest.id == null) return '';
  return String(quest.id);
}

function isQuestCompleted(quest, completionState) {
  const key = getQuestCompletionKey(quest);
  if (!key) return false;
  return completionState[key] === true;
}



function getRequirementThumbPath(requirement) {
  if (!requirement || !requirement.type) return '';
  if (requirement.type === 'item') return toItemThumbPath(requirement.id);
  if (requirement.type === 'mob') return toMobThumbPath(requirement.id);
  return '';
}


function formatRequirementLabel(requirement) {
  if (!requirement) return '';
  const count = Number(requirement.count) || 1;
  const name = requirement.name || requirement.label || '';

  if (requirement.type === 'mob') {
    return `Defeat ${count}x ${name}`;
  }

  if (requirement.type === 'item') {
    return `${count}x ${name}`;
  }

  if (requirement.type === 'skill') {
    const level = requirement.level;
    const cond = requirement.level_condition || '';
    if (level && level > 0) return cond ? `${name} Lv. ${level} ${cond}` : `${name} Lv. ${level}`;
    return name;
  }

  if (requirement.label) return requirement.label;
  return name;
}

function renderRequirementChips(requirements, itemById, monsterById) {
  const wrap = el('div', { className: 'quest-chip-list' });
  requirements.forEach((requirement) => {
    // Only make items clickable
    let chip;
    if (requirement.type === 'item' || requirement.type === 'mob') {
      // Items: link to items/equipment, Mobs: link to monsters tab
      let tabId = 'items';
      let isMob = requirement.type === 'mob';
      if (isMob) tabId = 'monsters';
      else if (requirement.category === 'Equipment') {
        tabId = 'equipment';
      } else if (!requirement.category && typeof requirement.id !== 'undefined') {
        const idNum = Number(requirement.id);
        if (idNum >= 1000000 && idNum < 2000000) {
          tabId = 'equipment';
        }
      }
      chip = el(
        'span',
        { className: 'quest-chip quest-requirement-chip', tabIndex: 0, role: 'button' },
        makeThumbnail(
          getRequirementThumbPath(requirement),
          `${requirement.name || requirement.label || 'Requirement'} thumbnail`,
          {
            className: isMob ? 'monster-thumb' : 'item-thumb',
            fallbackText: isMob ? 'MOB' : 'ITEM',
          }
        ),
        el('span', { textContent: formatRequirementLabel(requirement) })
      );
      chip.addEventListener('click', () => {
        window.location.hash = `#${tabId}?q=${encodeURIComponent('id:' + requirement.id)}`;
      });
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          window.location.hash = `#${tabId}?q=${encodeURIComponent('id:' + requirement.id)}`;
          e.preventDefault();
        }
      });
      if (isMob) {
        attachTooltip(chip, () => monsterById.get(String(requirement.id)), 'mob');
      } else {
        attachTooltip(chip, () => itemById.get(String(requirement.id)));
      }
    } else {
      chip = el(
        'span',
        { className: 'quest-chip quest-requirement-chip', tabIndex: 0, role: 'button' },
        makeThumbnail(
          getRequirementThumbPath(requirement),
          `${requirement.name || requirement.label || 'Requirement'} thumbnail`,
          {
            className: requirement.type === 'mob' ? 'monster-thumb' : 'item-thumb',
            fallbackText: requirement.type === 'mob' ? 'MOB' : 'ITEM',
          }
        ),
        el('span', { textContent: formatRequirementLabel(requirement) })
      );
      // Tooltip on hover (for non-clickable chips)
      if (chip) {
        if (requirement.type === 'mob') {
          attachTooltip(chip, () => monsterById.get(String(requirement.id)), 'mob');
        } else if (requirement.type === 'item') {
          attachTooltip(chip, () => itemById.get(String(requirement.id)));
        }
      }
    }
    wrap.appendChild(chip);
  });
  return wrap;
}

function formatPercent(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function formatRewardItemLabel(item) {
  const base = (item && item.label)
    ? item.label
    : `${item && item.count && item.count > 1 ? `${item.count}x ` : ''}${item && item.name ? item.name : ''}`.trim();
  if (item && typeof item.chance_pct === 'number') {
    return `${base} (${formatPercent(item.chance_pct)}%)`;
  }
  if (item && typeof item.weight === 'number' && item.total_weight > 0) {
    const chance = (item.weight / item.total_weight) * 100;
    return `${base} (${formatPercent(chance)}%)`;
  }
  return base;
}

function renderRewardItemChips(itemList, itemById) {
  const wrap = el('div', { className: 'quest-chip-list' });
  itemList.forEach((item) => {
    // Determine tab: equipment if category is Equipment, else items. If category is missing, infer from item ID.
    let tabId = 'items';
    if (item.category === 'Equipment') {
      tabId = 'equipment';
    } else if (!item.category && typeof item.id !== 'undefined') {
      // Equipment item IDs in MapleStory typically start with 1 (e.g., 1002001)
      const idNum = Number(item.id);
      if (idNum >= 1000000 && idNum < 2000000) {
        tabId = 'equipment';
      }
    }
    const chip = el(
      'span',
      { className: 'quest-chip quest-reward-chip', tabIndex: 0, role: 'button' },
      makeThumbnail(toItemThumbPath(item.id), `${item.name || item.label || 'Reward'} thumbnail`, {
        className: 'item-thumb',
        fallbackText: 'ITEM',
      }),
      el('span', { textContent: formatRewardItemLabel(item) }),
    );
    chip.addEventListener('click', () => {
      window.location.hash = `#${tabId}?q=${encodeURIComponent('id:' + item.id)}`;
    });
    chip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        window.location.hash = `#${tabId}?q=${encodeURIComponent('id:' + item.id)}`;
        e.preventDefault();
      }
    });
    attachTooltip(chip, () => itemById.get(String(item.id)));
    wrap.appendChild(chip);
  });
  return wrap;
}

function renderRewardContent(quest, itemById) {
  const rewardChoices = Array.isArray(quest.reward_choices) ? quest.reward_choices : [];
  const rewardWeighted = Array.isArray(quest.reward_weighted) ? quest.reward_weighted : [];
  const weightedItems = (Array.isArray(quest.rewards) ? quest.rewards : []).filter(
    (reward) => reward && reward.type === 'item' && typeof reward.prop === 'number' && reward.prop > 0
  );
  const inferredWeighted = !rewardWeighted.length && weightedItems.length
    ? [{
        type: 'weighted_random',
        class_specific: weightedItems.some((item) => item.job_mask),
        groups: [{
          job_mask: 0,
          job_name: 'Any Class',
          total_weight: weightedItems.reduce((sum, item) => sum + item.prop, 0),
          items: weightedItems.map((item) => ({
            id: item.id,
            name: item.name,
            count: item.count,
            label: formatRewardItemLabel(item),
            weight: item.prop,
          })),
        }],
      }]
    : [];
  const weightedBlocks = rewardWeighted.length ? rewardWeighted : inferredWeighted;
  const guaranteedItems = (Array.isArray(quest.rewards) ? quest.rewards : []).filter(
    (reward) =>
      reward
      && reward.type === 'item'
      && reward.guaranteed !== false
      && !(typeof reward.prop === 'number' && reward.prop > 0)
  );

  if (!rewardChoices.length && !weightedBlocks.length && !guaranteedItems.length) {
    if (!quest.rewards_items) return null;
    const fallback = el('span', { className: 'value value--pre' });
    fallback.textContent = quest.rewards_items;
    return fallback;
  }

  const content = el('div', { className: 'value quest-reward-content' });

  if (guaranteedItems.length) {
    if (rewardChoices.length || weightedBlocks.length) {
      content.appendChild(
        el('div', { className: 'quest-reward-section-label', textContent: 'Guaranteed' })
      );
    }
    content.appendChild(renderRewardItemChips(guaranteedItems, itemById));
  }

  weightedBlocks.forEach((weighted) => {
    const weightedBlock = el('div', { className: 'quest-reward-block' });
    weightedBlock.appendChild(
      el('div', {
        className: 'quest-reward-heading',
        textContent: weighted.class_specific
          ? 'Weighted random (class-specific):'
          : 'Weighted random:',
      })
    );

    const groups = Array.isArray(weighted.groups) ? weighted.groups : [];
    groups.forEach((group) => {
      if (!group || !Array.isArray(group.items) || !group.items.length) return;
      const groupBlock = el('div', { className: 'quest-reward-group' });
      if (weighted.class_specific || group.job_name !== 'Any Class') {
        groupBlock.appendChild(
          el('div', { className: 'quest-reward-group-label', textContent: group.job_name })
        );
      }
      const itemsWithChance = group.items.map((item) => ({
        ...item,
        total_weight: group.total_weight,
      }));
      groupBlock.appendChild(renderRewardItemChips(itemsWithChance, itemById));
      weightedBlock.appendChild(groupBlock);
    });

    content.appendChild(weightedBlock);
  });

  rewardChoices.forEach((choice) => {
    const choiceBlock = el('div', { className: 'quest-reward-block' });
    choiceBlock.appendChild(
      el('div', {
        className: 'quest-reward-heading',
        textContent: choice.class_specific ? 'Pick one (class-specific):' : 'Pick one:',
      })
    );

    const groups = Array.isArray(choice.groups) ? choice.groups : [];
    groups.forEach((group) => {
      if (!group || !Array.isArray(group.items) || !group.items.length) return;
      const groupBlock = el('div', { className: 'quest-reward-group' });
      if (choice.class_specific || group.job_name !== 'Any Class') {
        groupBlock.appendChild(
          el('div', { className: 'quest-reward-group-label', textContent: group.job_name })
        );
      }
      groupBlock.appendChild(renderRewardItemChips(group.items, itemById));
      choiceBlock.appendChild(groupBlock);
    });

    content.appendChild(choiceBlock);
  });

  return content;
}

function renderQuestCard(quest, completionState, onToggleCompletion, itemById, monsterById) {
  const card = el('div', { className: 'quest-card' });
  const nameRow = el('div', { className: 'quest-name' });

  const completionControl = el('label', { className: 'quest-complete-control' });
  const completionCheckbox = el('input', {
    type: 'checkbox',
    className: 'quest-complete-checkbox',
    'aria-label': `Mark ${quest.name} complete`,
  });
  completionCheckbox.checked = isQuestCompleted(quest, completionState);
  completionCheckbox.addEventListener('change', () => {
    onToggleCompletion(quest, completionCheckbox.checked);
  });
  completionControl.setAttribute('title', 'Mark quest as complete');
  completionControl.appendChild(completionCheckbox);
  nameRow.appendChild(completionControl);

  nameRow.appendChild(document.createTextNode(quest.name));
  if (quest.level_min > 0) {
    nameRow.appendChild(
      el('span', { className: 'badge level-badge', textContent: `Lv.${quest.level_min}+` })
    );
  }
  if (Array.isArray(quest.requirements_list)) {
    quest.requirements_list.filter(r => r.type === 'skill').forEach(r => {
      const cond = r.level_condition ? ` ${r.level_condition}` : '';
      nameRow.appendChild(
        el('span', { className: 'badge badge-crafting', textContent: `${r.name} Lv.${r.level}${cond}` })
      );
    });
  }
  if (quest.is_daily) {
    nameRow.appendChild(el('span', { className: 'badge badge-daily', textContent: 'DAILY' }));
  }
  if (quest.is_weekly) {
    nameRow.appendChild(el('span', { className: 'badge badge-weekly', textContent: 'WEEKLY' }));
  }
  if (quest.is_repeatable) {
    nameRow.appendChild(
      el('span', { className: 'badge badge-repeatable', textContent: 'REPEATABLE' })
    );
  }
  if (quest.id != null) {
    const qIdWrap = el('span', { className: 'quest-id-wrap' });
    qIdWrap.appendChild(makeDeepLinkButton('quests', padQuestId(quest.id)));
    qIdWrap.appendChild(makeCopyableId(`#${padQuestId(quest.id)}`));
    nameRow.appendChild(qIdWrap);
  }
  card.appendChild(nameRow);
  if (quest.id != null) {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button, input')) return;
      history.replaceState(null, '', `#quests?q=${encodeURIComponent('id:' + padQuestId(quest.id))}`);
      scrollToDetailRow(card, card);
    });
  }

  if (quest.npc_name) {
    card.appendChild(el('div', { className: 'quest-npc', textContent: quest.npc_name }));
  }
  if (quest.description) {
    card.appendChild(el('p', { className: 'quest-desc', textContent: quest.description }));
  }
  const nonSkillReqs = Array.isArray(quest.requirements_list)
    ? quest.requirements_list.filter(r => r.type !== 'skill')
    : [];
  if (nonSkillReqs.length) {
    const reqBox = el('div', { className: 'quest-meta-box', style: { marginTop: '8px' } });
    reqBox.appendChild(el('span', { className: 'label', textContent: 'Requirements: ' }));
    reqBox.appendChild(renderRequirementChips(nonSkillReqs, itemById, monsterById));
    card.appendChild(reqBox);
  } else if (quest.requirements) {
    const reqBox = el('div', { className: 'quest-meta-box', style: { marginTop: '8px' } });
    reqBox.appendChild(el('span', { className: 'label', textContent: 'Requirements: ' }));
    reqBox.appendChild(el('span', { className: 'value', textContent: quest.requirements }));
    card.appendChild(reqBox);
  }

  const meta = el('div', { className: 'quest-meta' });
  const rewardContent = renderRewardContent(quest, itemById);
  const hasRewards = quest.rewards_exp > 0 || quest.rewards_money > 0 || rewardContent;
  if (hasRewards) {
    const box = el('div', { className: 'quest-meta-box' });
    box.appendChild(el('span', { className: 'label', textContent: 'Reward: ' }));
    if (rewardContent) {
      box.appendChild(rewardContent);
    }
    if (quest.rewards_exp > 0) {
      const expBox = el('span', { className: 'quest-stat-chip' });
      expBox.appendChild(el('span', { className: 'label', textContent: 'EXP: ' }));
      expBox.appendChild(el('span', { className: 'value', textContent: fmt(quest.rewards_exp) }));
      box.appendChild(expBox);
    }
    if (quest.rewards_money > 0) {
      const mesoBox = el('span', { className: 'quest-stat-chip' });
      mesoBox.appendChild(el('span', { className: 'label', textContent: 'Meso: ' }));
      mesoBox.appendChild(el('span', { className: 'value', textContent: fmt(quest.rewards_money) }));
      box.appendChild(mesoBox);
    }
    meta.appendChild(box);
  }

  if (meta.children.length > 0) card.appendChild(meta);
  if (quest.next_quest) {
    card.appendChild(
      el('div', {
        className: 'quest-next',
        textContent: `Next: ${quest.next_quest_name || quest.next_quest}`,
      })
    );
  }

  card.classList.toggle('quest-complete', completionCheckbox.checked);
  completionCheckbox.addEventListener('change', () => {
    card.classList.toggle('quest-complete', completionCheckbox.checked);
  });

  return card;
}

export function renderQuests(data, options = {}) {
  const { quests } = data;
  const itemById = new Map(
    [...(data.items?.items || []), ...(data.items?.scrolls || [])].map(item => [String(item.id), item])
  );
  const monsterById = new Map(
    (data.monsters?.monsters || []).map(mob => [String(mob.id), mob])
  );
  let searchQuery = '';
  let autoExpandAfterId = null;
  let regionFilter = 'All';
  const sortByLevel = true;
  const completionState = loadCompletionState();
  const container = el('div');

  const chainMetaByParent = new Map(
    Array.isArray(quests.chains)
      ? quests.chains.map((chain) => [chain.parent, chain])
      : []
  );

  wireSearch(container, 'Search by name, NPC, or reward...', options, (query) => {
    searchQuery = query;
    renderData();
  }, (id) => {
    autoExpandAfterId = id;
    renderData();
  });

  const hasRegions = Array.isArray(quests.regions) && quests.regions.length > 0;
  const regions = ['All', ...(quests.regions || [])];
  if (hasRegions) {
    const filterRow = el('div', { className: 'filter-row' });
    const regionPills = makePillGroup(
      regions.map((r) => ({ label: r, value: r })),
      regionFilter,
      (value) => { regionFilter = value; regionPills.setActive(value); renderData(); }
    );
    filterRow.appendChild(regionPills);
    container.appendChild(filterRow);
  }

  const dataDiv = el('div');
  container.appendChild(dataDiv);

  function getCompletedCount(questList) {
    return questList.reduce(
      (count, quest) => count + (isQuestCompleted(quest, completionState) ? 1 : 0),
      0
    );
  }

  function toggleQuestCompletion(quest, completed) {
    const key = getQuestCompletionKey(quest);
    if (!key) return;
    completionState[key] = completed;
    saveCompletionState(completionState);
    renderData();
  }

  function renderData() {
    dataDiv.innerHTML = '';
    const exactId = parseIdFilter(searchQuery);
    const allQuests = quests.quests.filter((quest) => {
      if (exactId != null) return Number(quest.id) === exactId;
      return (
        (regionFilter === 'All' || quest.region === regionFilter) &&
        (matchSearch(quest.name, searchQuery) || matchSearch(quest.description, searchQuery) || matchSearch(quest.npc_name, searchQuery) || matchSearch(quest.rewards_items, searchQuery))
      );
    });

    const groups = {};
    allQuests.forEach((quest) => {
      const parent = quest.parent || '';
      (groups[parent] = groups[parent] || []).push(quest);
    });

    const standaloneQuests = [];
    const chains = [];
    Object.entries(groups).forEach(([parent, groupedQuests]) => {
      const chainMeta = chainMetaByParent.get(parent);
      if (!parent || !chainMeta || chainMeta.count <= 1 || groupedQuests.length === 1) {
        standaloneQuests.push(...groupedQuests);
      } else {
        chains.push({ parent, quests: groupedQuests, level_min: chainMeta.level_min });
      }
    });

    if (sortByLevel) {
      standaloneQuests.sort((a, b) => (a.level_min || 0) - (b.level_min || 0));
      chains.sort((a, b) => a.level_min - b.level_min);
    }

    const allItems = [];
    standaloneQuests.forEach((quest) => {
      allItems.push({ type: 'quest', quest, level: quest.level_min || 0 });
    });
    chains.forEach((chain, index) => {
      allItems.push({ type: 'chain', chain, level: chain.level_min, idx: index });
    });
    if (sortByLevel) {
      allItems.sort((a, b) => a.level - b.level);
    }

    const totalQuestCount = Array.isArray(quests.quests) ? quests.quests.length : 0;
    const totalCompleted = getCompletedCount(Array.isArray(quests.quests) ? quests.quests : []);
    const visibleCompleted = getCompletedCount(allQuests);
    const progressText = `${visibleCompleted}/${allQuests.length} completed`;
    const overallText = allQuests.length === totalQuestCount
      ? ''
      : ` (${totalCompleted}/${totalQuestCount} total)`;
    dataDiv.appendChild(
      el('div', { className: 'count-text quest-progress-text', textContent: `${allQuests.length} quests · ${progressText}${overallText}` })
    );

    allItems.forEach((item) => {
      if (item.type === 'quest') {
        dataDiv.appendChild(renderQuestCard(item.quest, completionState, toggleQuestCompletion, itemById, monsterById));
      } else {
        const chain = item.chain;
        const chainDiv = el('div', { className: 'quest-chain' });
        const header = el('div', {
          className: 'quest-chain-header',
          textContent: `${chain.parent} · ${chain.quests.length} quests`,
        });
        chainDiv.appendChild(header);
        chain.quests.forEach((quest) =>
          chainDiv.appendChild(renderQuestCard(quest, completionState, toggleQuestCompletion, itemById, monsterById))
        );
        dataDiv.appendChild(chainDiv);
      }
    });

    if (allQuests.length === 0) {
      dataDiv.appendChild(
        el('p', { className: 'empty-state', textContent: 'No quests match your filters.' })
      );
    }

    if (autoExpandAfterId != null) {
      autoExpandById(dataDiv, autoExpandAfterId, '.quest-card');
      autoExpandAfterId = null;
    }
  }

  renderData();
  return container;
}
