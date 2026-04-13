import { el, fmt, matchSearch, makeSearchBox, makeThumbnail } from '../lib/utils.js';

const CHAIN_COLORS = [
  '#f59e0b', '#3b82f6', '#22c55e', '#a855f7',
  '#ec4899', '#14b8a6', '#eab308', '#ef4444',
];

const QUEST_COMPLETION_STORAGE_KEY = 'questsCompletionById';

function loadCompletionState() {
  try {
    const raw = localStorage.getItem(QUEST_COMPLETION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveCompletionState(state) {
  try {
    localStorage.setItem(QUEST_COMPLETION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures (private mode/quota/etc.) so the UI still works.
  }
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

const rewardChipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 10px',
  borderRadius: '999px',
  border: '1px solid var(--border)',
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--text)',
  fontSize: '12px',
  lineHeight: '1.4',
};

function getItemThumbPath(itemId) {
  const numericId = Number(itemId);
  if (!Number.isFinite(numericId) || numericId <= 0) return '';
  return `images/items/${String(numericId).padStart(8, '0')}.png`;
}

function getMobThumbPath(mobId) {
  const numericId = Number(mobId);
  if (!Number.isFinite(numericId) || numericId < 0) return '';
  return `images/monsters/${String(numericId).padStart(7, '0')}.png`;
}

function getRequirementThumbPath(requirement) {
  if (!requirement || !requirement.type) return '';
  if (requirement.type === 'item') return getItemThumbPath(requirement.id);
  if (requirement.type === 'mob') return getMobThumbPath(requirement.id);
  return '';
}

function formatRequirementLabel(requirement) {
  if (!requirement) return '';
  if (requirement.label) return requirement.label;
  if (requirement.type === 'mob') {
    return `Defeat ${requirement.name} x ${requirement.count}`;
  }
  return `${requirement.name} x ${requirement.count}`;
}

function renderRequirementChips(requirements) {
  const wrap = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } });
  requirements.forEach((requirement) => {
    wrap.appendChild(
      el(
        'span',
        { style: rewardChipStyle, className: 'quest-requirement-chip' },
        makeThumbnail(
          getRequirementThumbPath(requirement),
          `${requirement.name || requirement.label || 'Requirement'} thumbnail`,
          {
            className: requirement.type === 'mob' ? 'monster-thumb' : 'item-thumb',
            fallbackText: requirement.type === 'mob' ? 'MOB' : 'ITEM',
          }
        ),
        el('span', { textContent: formatRequirementLabel(requirement) })
      )
    );
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

function renderRewardItemChips(itemList) {
  const wrap = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } });
  itemList.forEach((item) => {
    wrap.appendChild(
      el(
        'span',
        { style: rewardChipStyle, className: 'quest-reward-chip' },
        makeThumbnail(getItemThumbPath(item.id), `${item.name || item.label || 'Reward'} thumbnail`, {
          className: 'item-thumb',
          fallbackText: 'ITEM',
        }),
        el('span', { textContent: formatRewardItemLabel(item) })
      )
    );
  });
  return wrap;
}

function renderRewardContent(quest) {
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
    const fallback = el('span', { className: 'value' });
    fallback.style.whiteSpace = 'pre-line';
    fallback.textContent = quest.rewards_items;
    return fallback;
  }

  const content = el('div', {
    className: 'value',
    style: { display: 'flex', flexDirection: 'column', gap: '8px' },
  });

  if (guaranteedItems.length) {
    if (rewardChoices.length || weightedBlocks.length) {
      content.appendChild(
        el('div', {
          style: {
            fontSize: '11px',
            fontWeight: '700',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--secondary)',
          },
          textContent: 'Guaranteed',
        })
      );
    }
    content.appendChild(renderRewardItemChips(guaranteedItems));
  }

  weightedBlocks.forEach((weighted) => {
    const weightedBlock = el('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '6px' },
    });
    weightedBlock.appendChild(
      el('div', {
        style: { fontWeight: '700', color: 'var(--text)' },
        textContent: weighted.class_specific
          ? 'Weighted random (class-specific):'
          : 'Weighted random:',
      })
    );

    const groups = Array.isArray(weighted.groups) ? weighted.groups : [];
    groups.forEach((group) => {
      if (!group || !Array.isArray(group.items) || !group.items.length) return;
      const groupBlock = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } });
      if (weighted.class_specific || group.job_name !== 'Any Class') {
        groupBlock.appendChild(
          el('div', {
            style: { fontSize: '12px', fontWeight: '700', color: 'var(--secondary)' },
            textContent: group.job_name,
          })
        );
      }
      const itemsWithChance = group.items.map((item) => ({
        ...item,
        total_weight: group.total_weight,
      }));
      groupBlock.appendChild(renderRewardItemChips(itemsWithChance));
      weightedBlock.appendChild(groupBlock);
    });

    content.appendChild(weightedBlock);
  });

  rewardChoices.forEach((choice) => {
    const choiceBlock = el('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '6px' },
    });
    choiceBlock.appendChild(
      el('div', {
        style: { fontWeight: '700', color: 'var(--text)' },
        textContent: choice.class_specific ? 'Pick one (class-specific):' : 'Pick one:',
      })
    );

    const groups = Array.isArray(choice.groups) ? choice.groups : [];
    groups.forEach((group) => {
      if (!group || !Array.isArray(group.items) || !group.items.length) return;
      const groupBlock = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } });
      if (choice.class_specific || group.job_name !== 'Any Class') {
        groupBlock.appendChild(
          el('div', {
            style: { fontSize: '12px', fontWeight: '700', color: 'var(--secondary)' },
            textContent: group.job_name,
          })
        );
      }
      groupBlock.appendChild(renderRewardItemChips(group.items));
      choiceBlock.appendChild(groupBlock);
    });

    content.appendChild(choiceBlock);
  });

  return content;
}

function renderQuestCard(quest, completionState, onToggleCompletion) {
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
      el('span', { className: 'level-badge', textContent: `Lv.${quest.level_min}+` })
    );
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
    nameRow.appendChild(el('span', { className: 'id', style: { marginLeft: 'auto' }, textContent: quest.id }));
  }
  card.appendChild(nameRow);

  if (quest.npc_name) {
    card.appendChild(el('div', { className: 'quest-npc', textContent: quest.npc_name }));
  }
  if (quest.description) {
    card.appendChild(el('p', { className: 'quest-desc', textContent: quest.description }));
  }
  if (Array.isArray(quest.requirements_list) && quest.requirements_list.length) {
    const reqBox = el('div', { className: 'quest-meta-box', style: { marginTop: '8px' } });
    reqBox.appendChild(el('span', { className: 'label', textContent: 'Requirements: ' }));
    reqBox.appendChild(renderRequirementChips(quest.requirements_list));
    card.appendChild(reqBox);
  } else if (quest.requirements) {
    const reqBox = el('div', { className: 'quest-meta-box', style: { marginTop: '8px' } });
    reqBox.appendChild(el('span', { className: 'label', textContent: 'Requirements: ' }));
    reqBox.appendChild(el('span', { className: 'value', textContent: quest.requirements }));
    card.appendChild(reqBox);
  }

  const meta = el('div', { className: 'quest-meta' });
  const rewardContent = renderRewardContent(quest);
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

export function renderQuests(data) {
  const { quests } = data;
  let searchQuery = '';
  let regionFilter = 'All';
  let sortByLevel = true;
  const completionState = loadCompletionState();
  const container = el('div');

  const chainMetaByParent = new Map(
    Array.isArray(quests.chains)
      ? quests.chains.map((chain) => [chain.parent, chain])
      : []
  );

  container.appendChild(
    makeSearchBox('Search quests...', (value) => {
      searchQuery = value;
      renderData();
    })
  );

  const regions = ['All', ...(quests.regions || [])];
  const filterRow = el('div', {
    style: {
      display: 'flex', flexWrap: 'wrap', gap: '6px',
      marginBottom: '16px', alignItems: 'center',
    },
  });

  regions.forEach((region) => {
    const button = el('button', {
      className: `pill${region === regionFilter ? ' active' : ''}`,
      textContent: region,
    });
    button.addEventListener('click', () => {
      regionFilter = region;
      filterRow.querySelectorAll('.pill:not(.sort-pill)').forEach((pill) =>
        pill.classList.remove('active')
      );
      button.classList.add('active');
      renderData();
    });
    filterRow.appendChild(button);
  });

  filterRow.appendChild(
    el('div', {
      style: { width: '1px', height: '24px', background: '#555', margin: '0 4px' },
    })
  );

  const sortBtn = el('button', {
    className: 'pill sort-pill active',
    textContent: 'Level ▲',
  });
  sortBtn.addEventListener('click', () => {
    sortByLevel = !sortByLevel;
    sortBtn.classList.toggle('active', sortByLevel);
    sortBtn.textContent = sortByLevel ? 'Level ▲' : 'Sort by Level';
    renderData();
  });
  filterRow.appendChild(sortBtn);
  container.appendChild(filterRow);

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
    const allQuests = quests.quests.filter(
      (quest) =>
        (regionFilter === 'All' || quest.region === regionFilter) &&
        (matchSearch(quest.name, searchQuery) || matchSearch(quest.description, searchQuery))
    );

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
        dataDiv.appendChild(renderQuestCard(item.quest, completionState, toggleQuestCompletion));
      } else {
        const chain = item.chain;
        const color = CHAIN_COLORS[item.idx % CHAIN_COLORS.length];
        const chainDiv = el('div', {
          className: 'quest-chain',
          style: { borderColor: color, background: `${color}08` },
        });
        const header = el('div', {
          className: 'quest-chain-header',
          style: { color, background: `${color}15` },
          textContent: `${chain.parent} · ${chain.quests.length} quests`,
        });
        chainDiv.appendChild(header);
        chain.quests.forEach((quest) =>
          chainDiv.appendChild(renderQuestCard(quest, completionState, toggleQuestCompletion))
        );
        dataDiv.appendChild(chainDiv);
      }
    });
  }

  renderData();
  return container;
}
