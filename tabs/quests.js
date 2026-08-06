import { el, fmt, matchSearch, makeThumbnail, makeDeepLinkButton, parseIdFilter, makePillGroup, wireSearch, toItemThumbPath, makeCopyableId, makeTabLink, padQuestId, scrollToDetailRow, autoExpandById, showFilterBanner, hideFilterBanner } from '../lib/utils.js';
import { Router } from '../lib/Router.js';
import { attachTooltip, attachCustomTooltip } from '../lib/tooltip.js';
import state, { getMobThumbUrl } from '../lib/data.js';

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



function getRequirementThumbPath(requirement, monsterById) {
  if (!requirement || !requirement.type) return '';
  if (requirement.type === 'item') return toItemThumbPath(requirement.id);
  if (requirement.type === 'mob') return getMobThumbUrl(monsterById?.get(String(requirement.id))?.thumbnail);
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
      // A real link, so the chip can be opened in a new tab; a plain click just
      // follows the href and the Router picks it up as an in-page hash change.
      chip = makeTabLink(tabId, `id:${requirement.id}`, {
        className: 'quest-chip quest-requirement-chip',
        stopPropagation: true,
      });
      chip.append(
        makeThumbnail(
          getRequirementThumbPath(requirement, monsterById),
          `${requirement.name || requirement.label || 'Requirement'} thumbnail`,
          {
            className: isMob ? 'monster-thumb' : 'item-thumb',
            fallbackText: isMob ? 'MOB' : 'ITEM',
          }
        ),
        el('span', { textContent: formatRequirementLabel(requirement) })
      );
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
          getRequirementThumbPath(requirement, monsterById),
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
    : `${item && item.count ? `${item.count}x ` : ''}${item && item.name ? item.name : ''}`.trim();
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
    const chip = makeTabLink(tabId, `id:${item.id}`, {
      className: 'quest-chip quest-reward-chip',
      stopPropagation: true,
    });
    chip.append(
      makeThumbnail(toItemThumbPath(item.id), `${item.name || item.label || 'Reward'} thumbnail`, {
        className: 'item-thumb',
        fallbackText: 'ITEM',
      }),
      el('span', { textContent: formatRewardItemLabel(item) }),
    );
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

// Residency contribution scales with the player's citizenship grade, so the
// hover spells out the payout at every grade rather than a single number.
function renderContributionTooltip(tip, contribution) {
  const title = contribution.town_name
    ? `${contribution.town_name} Contribution`
    : 'Residency Contribution';
  tip.appendChild(el('div', { className: 'item-tooltip-header' },
    el('span', { className: 'item-tooltip-name', textContent: title })));

  if (contribution.formula) {
    tip.appendChild(
      el('p', { className: 'item-tooltip-desc', textContent: contribution.formula })
    );
  }

  const byGrade = Array.isArray(contribution.by_grade) ? contribution.by_grade : [];
  if (byGrade.length) {
    // Ten grades stacked vertically make a needlessly tall tooltip, so fold the
    // list in half and run the second half alongside the first.
    const half = Math.ceil(byGrade.length / 2);
    const table = el('table', { className: 'contribution-grade-table' });
    const head = el('tr', null,
      el('th', { textContent: 'Grade' }),
      el('th', { textContent: 'Points' }),
      el('th', { className: 'contribution-grade-split', textContent: 'Grade' }),
      el('th', { textContent: 'Points' }),
    );
    table.appendChild(el('thead', null, head));

    const body = el('tbody');
    for (let i = 0; i < half; i += 1) {
      const row = el('tr', null,
        el('th', { scope: 'row', textContent: String(i + 1) }),
        el('td', { textContent: fmt(byGrade[i]) }),
      );
      const j = i + half;
      if (j < byGrade.length) {
        row.append(
          el('th', { scope: 'row', className: 'contribution-grade-split', textContent: String(j + 1) }),
          el('td', { textContent: fmt(byGrade[j]) }),
        );
      } else {
        row.append(el('td', { className: 'contribution-grade-split' }), el('td'));
      }
      body.appendChild(row);
    }
    table.appendChild(body);
    tip.appendChild(table);
  } else {
    tip.appendChild(el('p', {
      className: 'item-tooltip-desc',
      textContent: `${fmt(contribution.amount)} at every grade, this quest does not scale with level.`,
    }));
  }
  return true;
}

function renderQuestCard(quest, completionState, onToggleCompletion, itemById, monsterById, expandedIds) {
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
  // Rotation-pool quests belong to a RecurringQuestGroup; how the game picks
  // from that pool is not known, so the group is surfaced only as hover detail.
  const rot = quest.rotation;
  const rotTitle = rot
    ? `${rot.group} — ${rot.select_count} of ${rot.pool_size} offered per ${rot.cadence} rotation`
    : '';
  if (quest.is_daily) {
    nameRow.appendChild(el('span', {
      className: 'badge badge-daily', textContent: 'DAILY', title: rotTitle,
    }));
  }
  if (quest.is_weekly) {
    nameRow.appendChild(el('span', {
      className: 'badge badge-weekly', textContent: 'WEEKLY', title: rotTitle,
    }));
  }
  if (rot) {
    if (rot.one_time) {
      nameRow.appendChild(el('span', {
        className: 'badge badge-onetime',
        textContent: 'ONE-TIME',
        title: `${rot.group} — drawn from the pool at most once, then never again`,
      }));
    }
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

  const stages = quest.description ? quest.description.split('\n').filter(s => s.trim()) : [];
  let descEl = null;
  let detailSection = null;

  if (quest.id != null) {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button, input, label')) return;
      if (detailSection) {
        if (!detailSection.hidden) {
          detailSection.hidden = true;
          if (descEl) descEl.hidden = false;
          card.classList.remove('quest-expanded', 'row-hotlink');
          if (expandedIds) expandedIds.delete(String(quest.id));
          history.replaceState(null, '', '#quests');
          return;
        }
        detailSection.hidden = false;
        if (descEl) descEl.hidden = true;
        card.classList.add('quest-expanded');
        if (expandedIds) expandedIds.add(String(quest.id));
      }
      history.replaceState(null, '', `#quests?q=${encodeURIComponent('id:' + padQuestId(quest.id))}`);
      document.querySelectorAll('.row-hotlink').forEach(r => r.classList.remove('row-hotlink'));
      card.classList.add('row-hotlink');
      scrollToDetailRow(card, detailSection || card);
    });
  }

  if (quest.npc_name) {
    card.appendChild(el('div', { className: 'quest-npc', textContent: quest.npc_name }));
  }
  if (stages.length > 0) {
    descEl = el('p', { className: 'quest-desc', textContent: stages[0] });
    card.appendChild(descEl);
  }
  if (stages.length > 1) {
    const isExpanded = expandedIds ? expandedIds.has(String(quest.id)) : false;
    detailSection = el('div', { className: 'quest-stages' });
    detailSection.hidden = !isExpanded;
    if (isExpanded) {
      if (descEl) descEl.hidden = true;
      card.classList.add('quest-expanded');
    }
    stages.forEach((stage, i) => {
      detailSection.appendChild(el('p', { className: 'quest-stage', textContent: `${i + 1}) ${stage}` }));
    });
    card.appendChild(detailSection);
  }
  const startItems = Array.isArray(quest.start_items) ? quest.start_items : [];
  if (startItems.length) {
    const startBox = el('div', { className: 'quest-meta-box', style: { marginTop: '8px' } });
    startBox.appendChild(el('span', { className: 'label', textContent: 'Given on start: ' }));
    startBox.appendChild(renderRewardItemChips(startItems, itemById));
    card.appendChild(startBox);
  }

  const nonSkillReqs = Array.isArray(quest.requirements_list)
    ? quest.requirements_list.filter(r => r.type !== 'skill')
    : [];
  const reqBox = el('div', { className: 'quest-meta-box', style: { marginTop: startItems.length ? '0' : '8px' } });
  reqBox.appendChild(el('span', { className: 'label', textContent: 'Requirements: ' }));
  if (nonSkillReqs.length) {
    reqBox.appendChild(renderRequirementChips(nonSkillReqs, itemById, monsterById));
  } else if (quest.requirements) {
    reqBox.appendChild(el('span', { className: 'value', textContent: quest.requirements }));
  } else {
    reqBox.appendChild(el('span', { className: 'value value--none', textContent: 'None' }));
  }
  card.appendChild(reqBox);

  const rewardContent = renderRewardContent(quest, itemById);
  const contribution = quest.rewards_contribution;
  const hasRewards = quest.rewards_exp > 0 || quest.rewards_money > 0 || rewardContent || contribution;
  const rewardBox = el('div', { className: 'quest-meta-box' });
  rewardBox.appendChild(el('span', { className: 'label', textContent: 'Reward: ' }));
  if (hasRewards) {
    if (rewardContent) {
      rewardBox.appendChild(rewardContent);
    }
    if (quest.rewards_exp > 0) {
      const expBox = el('span', { className: 'quest-stat-chip' });
      expBox.appendChild(el('span', { className: 'label', textContent: 'EXP: ' }));
      expBox.appendChild(el('span', { className: 'value', textContent: fmt(quest.rewards_exp) }));
      rewardBox.appendChild(expBox);
    }
    if (quest.rewards_money > 0) {
      const mesoBox = el('span', { className: 'quest-stat-chip' });
      mesoBox.appendChild(el('span', { className: 'label', textContent: 'Meso: ' }));
      mesoBox.appendChild(el('span', { className: 'value', textContent: fmt(quest.rewards_money) }));
      rewardBox.appendChild(mesoBox);
    }
    // Residency contribution is either a flat amount or a grade-scaling formula,
    // so show the formula verbatim rather than a single misleading number.
    if (contribution) {
      const contrBox = el('span', { className: 'quest-stat-chip quest-stat-chip--contribution' });
      contrBox.appendChild(el('span', { className: 'label', textContent: 'Contribution: ' }));
      contrBox.appendChild(el('span', {
        className: 'value',
        textContent: contribution.amount != null ? fmt(contribution.amount) : contribution.formula,
      }));
      if (contribution.town_name) {
        contrBox.appendChild(
          el('span', { className: 'label', textContent: ` (${contribution.town_name})` })
        );
      }
      attachCustomTooltip(contrBox, (tip) => renderContributionTooltip(tip, contribution));
      rewardBox.appendChild(contrBox);
    }
  } else {
    rewardBox.appendChild(el('span', { className: 'value value--none', textContent: 'None' }));
  }
  card.appendChild(rewardBox);
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

const CITIZENSHIP_REGION = 'Citizenship';

// The four job regions are one system - a pill each buried among the towns read
// as four unrelated places - so they collapse into a single synthetic region
// with the job itself demoted to a subfilter.
const JOB_ADVANCEMENT_REGION = 'Job Advancement';
const JOB_REGIONS = ['Warrior', 'Magician', 'Bowman', 'Thief'];
const SYSTEM_REGIONS = [JOB_ADVANCEMENT_REGION, CITIZENSHIP_REGION, 'Crafting'];

// Residency quests belong to one town, named on the contribution they pay out.
// The two intro quests ("become a resident") pay no contribution and belong to
// neither town - they gate both, so they survive any town filter.
function getQuestTown(quest) {
  const contribution = quest.rewards_contribution
    || (Array.isArray(quest.rewards) ? quest.rewards.find(r => r.type === 'citizenship_contribution') : null);
  return contribution?.town_name || null;
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
  let townFilter = 'All';
  let jobFilter = 'All';
  const sortByLevel = true;
  const completionState = loadCompletionState();
  const expandedIds = new Set();
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

  function updateFilterUrl() {
    const params = {};
    if (regionFilter !== 'All') params.region = regionFilter;
    if (regionFilter === CITIZENSHIP_REGION && townFilter !== 'All') params.town = townFilter;
    if (regionFilter === JOB_ADVANCEMENT_REGION && jobFilter !== 'All') params.job = jobFilter;
    Router.updateFilter('quests', params);
  }

  const citizenshipTowns = [...new Set(
    (quests.quests || [])
      .filter(q => q.region === CITIZENSHIP_REGION)
      .map(getQuestTown)
      .filter(Boolean)
  )].sort();

  let townPillGroup = null;
  let townFilterRow = null;
  let jobPillGroup = null;
  let jobFilterRow = null;

  // A subfilter row is only meaningful while its parent region is selected, so it
  // is shown and reset alongside that pill rather than sitting stale underneath
  // some unrelated region.
  function syncSubFilterRows() {
    if (townFilterRow) {
      const show = regionFilter === CITIZENSHIP_REGION;
      townFilterRow.style.display = show ? '' : 'none';
      if (!show && townFilter !== 'All') {
        townFilter = 'All';
        townPillGroup.setActive('All');
      }
    }
    if (jobFilterRow) {
      const show = regionFilter === JOB_ADVANCEMENT_REGION;
      jobFilterRow.style.display = show ? '' : 'none';
      if (!show && jobFilter !== 'All') {
        jobFilter = 'All';
        jobPillGroup.setActive('All');
      }
    }
  }

  const hasRegions = Array.isArray(quests.regions) && quests.regions.length > 0;
  const allRegions = quests.regions || [];
  const jobRegions = JOB_REGIONS.filter(r => allRegions.includes(r));
  // Job Advancement is synthetic - it stands in for the four job regions, which
  // are no longer pills of their own.
  const systemRegions = SYSTEM_REGIONS.filter(
    r => allRegions.includes(r) || (r === JOB_ADVANCEMENT_REGION && jobRegions.length > 0)
  );
  // Crafting, Citizenship and job advancement are systems rather than places, and
  // are easy to miss at the tail of a long row of towns - so they get their own row.
  const hiddenFromPlaces = new Set([...systemRegions, ...jobRegions]);
  const placeRegions = ['All', ...allRegions.filter(r => !hiddenFromPlaces.has(r))];

  let regionPillGroup = null;
  let systemPillGroup = null;

  // Region lives in one variable but is split across two pill groups, so both get
  // told about every change - the group without a matching pill just clears.
  function selectRegion(value) {
    regionFilter = value;
    regionPillGroup?.setActive(value);
    systemPillGroup?.setActive(value);
    syncSubFilterRows();
    hideFilterBanner();
    updateFilterUrl();
    renderData();
  }

  if (hasRegions) {
    const filterRow = el('div', { className: 'filter-row' });
    regionPillGroup = makePillGroup(
      placeRegions.map((r) => ({ label: r, value: r })),
      regionFilter,
      selectRegion
    );
    filterRow.appendChild(regionPillGroup);
    container.appendChild(filterRow);

    if (systemRegions.length) {
      const systemRow = el('div', { className: 'filter-row' });
      systemPillGroup = makePillGroup(
        systemRegions.map((r) => ({ label: r, value: r })),
        regionFilter,
        selectRegion,
        { groupLabel: 'Systems' }
      );
      systemRow.appendChild(systemPillGroup);
      container.appendChild(systemRow);
    }
  }

  if (jobRegions.length > 1) {
    jobFilterRow = el('div', { className: 'filter-row' });
    jobPillGroup = makePillGroup(
      ['All', ...jobRegions].map((j) => ({ label: j, value: j })),
      jobFilter,
      (value) => {
        jobFilter = value;
        jobPillGroup.setActive(value);
        updateFilterUrl();
        renderData();
      },
      { groupLabel: 'Job' }
    );
    jobFilterRow.appendChild(jobPillGroup);
    container.appendChild(jobFilterRow);
  }

  if (citizenshipTowns.length > 1) {
    townFilterRow = el('div', { className: 'filter-row' });
    townPillGroup = makePillGroup(
      ['All', ...citizenshipTowns].map((t) => ({ label: t, value: t })),
      townFilter,
      (value) => {
        townFilter = value;
        townPillGroup.setActive(value);
        updateFilterUrl();
        renderData();
      },
      { groupLabel: 'Town' }
    );
    townFilterRow.appendChild(townPillGroup);
    container.appendChild(townFilterRow);
  }

  syncSubFilterRows();

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
      const town = getQuestTown(quest);
      const townMatches = regionFilter !== CITIZENSHIP_REGION
        || townFilter === 'All'
        || town === null
        || town === townFilter;
      // Job Advancement is not a value any quest carries - it matches the four
      // job regions, narrowed to one by the Job subfilter.
      const regionMatches = regionFilter === 'All'
        || (regionFilter === JOB_ADVANCEMENT_REGION
          ? jobRegions.includes(quest.region) && (jobFilter === 'All' || quest.region === jobFilter)
          : quest.region === regionFilter);
      return (
        regionMatches &&
        townMatches &&
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
        const wrapper = el('div', { className: 'quest-standalone' });
        if (isQuestCompleted(item.quest, completionState)) wrapper.classList.add('quest-group-complete');
        wrapper.appendChild(renderQuestCard(item.quest, completionState, toggleQuestCompletion, itemById, monsterById, expandedIds));
        dataDiv.appendChild(wrapper);
      } else {
        const chain = item.chain;
        const chainDiv = el('div', { className: 'quest-chain' });
        if (chain.quests.every(q => isQuestCompleted(q, completionState))) chainDiv.classList.add('quest-group-complete');
        const header = el('div', {
          className: 'quest-chain-header',
          textContent: `${chain.parent} · ${chain.quests.length} quests`,
        });
        chainDiv.appendChild(header);
        chain.quests.forEach((quest) =>
          chainDiv.appendChild(renderQuestCard(quest, completionState, toggleQuestCompletion, itemById, monsterById, expandedIds))
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

  if (options.initialParams) {
    const region = options.initialParams.get('region');
    if (region && region !== 'All') {
      // Links predating the Job Advancement grouping point straight at a job
      // region, so they land on the group with that job preselected.
      if (jobRegions.includes(region)) {
        regionFilter = JOB_ADVANCEMENT_REGION;
        jobFilter = region;
      } else {
        regionFilter = region;
      }
      const job = options.initialParams.get('job');
      if (regionFilter === JOB_ADVANCEMENT_REGION && job && jobRegions.includes(job)) {
        jobFilter = job;
      }
      const town = options.initialParams.get('town');
      if (regionFilter === CITIZENSHIP_REGION && town && citizenshipTowns.includes(town)) {
        townFilter = town;
      }
      regionPillGroup?.setActive(regionFilter);
      systemPillGroup?.setActive(regionFilter);
      jobPillGroup?.setActive(jobFilter);
      townPillGroup?.setActive(townFilter);
      syncSubFilterRows();
      updateFilterUrl();
      const subLabel = townFilter !== 'All' ? townFilter : (jobFilter !== 'All' ? jobFilter : null);
      showFilterBanner(subLabel ? `${regionFilter} · ${subLabel}` : regionFilter, () => {
        regionFilter = 'All';
        regionPillGroup?.setActive('All');
        systemPillGroup?.setActive('All');
        townFilter = 'All';
        townPillGroup?.setActive('All');
        jobFilter = 'All';
        jobPillGroup?.setActive('All');
        syncSubFilterRows();
        updateFilterUrl();
        renderData();
      });
    }
  }

  renderData();
  return container;
}
