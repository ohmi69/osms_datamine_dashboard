import { el, matchSearch, makeCollapsible, makeThumbnail, makeDeepLinkButton, parseIdFilter, makePillGroup, wireSearch, makeCopyableId, padSkillId, scrollToDetailRow, autoExpandById, showFilterBanner, hideFilterBanner } from '../lib/utils.js';
import { Router } from '../lib/Router.js';

function makeLevelRow(className, label, text) {
  const row = el('div', { className });
  row.appendChild(el('span', { className: 'label', textContent: label }));
  row.appendChild(document.createTextNode(text));
  return row;
}

function getSkillThumbnail(skill) {
  if (skill.thumbnail) return skill.thumbnail;
  const id = padSkillId(skill.id || '');
  if (!id) return '';
  return `images/skills/${id}.png`;
}

export function renderSkills(data, options = {}) {
  // Flatten new skills.json schema: top-level keys are classes, each value is an array of job/class objects
  const skillsData = data.skills;
  // Flatten all class/job objects into a single array
  const classes = Object.values(skillsData).flat();
  // Compute total number of skills
  const totalSkills = classes.reduce((sum, cls) => sum + (cls.skills?.length || 0), 0);
  let searchQuery = '';
  let classFilter = '';
  let autoExpandAfterId = null;
  const container = el('div');



  wireSearch(container, 'Search by name or description...', options, (query) => {
    searchQuery = query;
    renderData();
  }, (id) => {
    autoExpandAfterId = id;
    renderData();
  });

  const CLASS_PILLS = [
    { label: 'All', value: '' },
    { label: 'Warrior', value: 'Warrior' },
    { label: 'Mage', value: 'Magician' },
    { label: 'Bowman', value: 'Archer' },
    { label: 'Thief', value: 'Rogue' },
  ];
  const SUBCLASS_PILLS = {};
  for (const [key, arr] of Object.entries(skillsData)) {
    const flat = [].concat(arr);
    if (flat.length <= 1) continue;
    const pill = CLASS_PILLS.find(p => p.value && p.value.toLowerCase() === key);
    if (!pill) continue;
    SUBCLASS_PILLS[pill.value] = [
      { label: 'All', value: '' },
      ...flat.map(cls => ({ label: cls.class_name, value: cls.class_name })),
    ];
  }
  let subclassFilter = '';
  let subPillGroup = null;
  const subPillsWrapper = el('div');

  function updateFilterUrl() {
    Router.updateFilter('skills', {
      ...(classFilter && { class: classFilter }),
      ...(subclassFilter && { subclass: subclassFilter }),
    });
  }

  const pillGroup = makePillGroup(CLASS_PILLS, classFilter, (value) => {
    classFilter = value;
    subclassFilter = '';
    hideFilterBanner();
    buildSubclassPills();
    updateFilterUrl();
    renderData();
  }, { groupLabel: 'Class:' });
  container.appendChild(pillGroup);

  function buildSubclassPills() {
    subPillsWrapper.innerHTML = '';
    subPillGroup = null;
    const subs = SUBCLASS_PILLS[classFilter];
    if (!subs) return;
    subPillGroup = makePillGroup(subs, subclassFilter, (value) => {
      subclassFilter = value;
      hideFilterBanner();
      updateFilterUrl();
      renderData();
    }, { groupLabel: 'Subclass:' });
    subPillsWrapper.appendChild(subPillGroup);
  }
  container.appendChild(subPillsWrapper);
  container.appendChild(
    el('div', { className: 'count-text', textContent: `${totalSkills} skills` })
  );

  const dataDiv = el('div');
  container.appendChild(dataDiv);

  function renderData() {
    pillGroup.setActive(classFilter);
    if (subPillGroup) subPillGroup.setActive(subclassFilter);
    dataDiv.innerHTML = '';
    const exactId = parseIdFilter(searchQuery);
    let filteredClasses = classes;
    if (classFilter) {
      filteredClasses = classes.filter(
        (cls) => cls.main_class && cls.main_class.toLowerCase() === classFilter.toLowerCase()
      );
    }
    if (subclassFilter) {
      filteredClasses = filteredClasses.filter((cls) => cls.class_name === subclassFilter);
    }
    const JOB_TIER_ORDER = { Beginner: 0, '1st Job': 1, '2nd Job': 2, '3rd Job': 3, '4th Job': 4 };
    filteredClasses = [...filteredClasses].sort(
      (a, b) => (JOB_TIER_ORDER[a.job] ?? 99) - (JOB_TIER_ORDER[b.job] ?? 99)
    );
    const filtered = filteredClasses
      .map((cls) => ({
        ...cls,
        skills: (cls.skills || []).filter(
          (skill) =>
            exactId != null
              ? Number(skill.id) === exactId
              : matchSearch(skill.name, searchQuery) || matchSearch(skill.description, searchQuery)
        ),
      }))
      .filter((cls) => cls.skills.length > 0);

    filtered.forEach((cls) => {
      const content = el('div');
      cls.skills.forEach((skill) => {
        const card = el('div', { className: 'skill-card' });
        const nameRow = el('div', { className: 'top-line' });
        const nameWrap = el('span', { className: 'item-name-wrap' });
        nameWrap.appendChild(
          makeThumbnail(getSkillThumbnail(skill), `${skill.name} thumbnail`, {
            className: 'skill-thumb',
            fallbackText: 'SKL',
          })
        );
        nameWrap.appendChild(el('span', { className: 'skill-name', textContent: skill.name }));
        if (skill.max_level > 0) {
          nameWrap.appendChild(
            el('span', { className: 'max-level', textContent: `Max Lv.${skill.max_level}` })
          );
        }
        nameRow.appendChild(nameWrap);
        const skRightWrap = el('span', { className: 'item-id-wrap' });
        if (skill.id != null) skRightWrap.appendChild(makeDeepLinkButton('skills', padSkillId(skill.id)));
        skRightWrap.appendChild(makeCopyableId(skill.id != null ? `#${padSkillId(skill.id)}` : ''));
        nameRow.appendChild(skRightWrap);
        card.appendChild(nameRow);
        if (skill.id != null) {
          card.addEventListener('click', (e) => {
            if (e.target.closest('button, input')) return;
            history.replaceState(null, '', `#skills?q=${encodeURIComponent('id:' + padSkillId(skill.id))}`);
            const levelsList = card.querySelector('.all-levels-list');
            const arrow = card.querySelector('.all-levels-arrow');
            if (levelsList) {
              levelsList.hidden = !levelsList.hidden;
              if (arrow) arrow.textContent = levelsList.hidden ? '▼' : '▲';
              if (!levelsList.hidden) {
                document.querySelectorAll('.row-hotlink').forEach(r => r.classList.remove('row-hotlink'));
                card.classList.add('row-hotlink');
                scrollToDetailRow(card, card);
              } else {
                card.classList.remove('row-hotlink');
              }
            } else {
              document.querySelectorAll('.row-hotlink').forEach(r => r.classList.remove('row-hotlink'));
              card.classList.add('row-hotlink');
              scrollToDetailRow(card, card);
            }
          });
        }

        if (skill.description) {
          const desc = skill.description.replace(/^\[Master Level\s*:\s*\d+\]\n?/i, '').trim();
          if (desc) card.appendChild(el('p', { className: 'skill-desc', textContent: desc }));
        }

        if (skill.required_skill) {
          const req = el('div', { className: 'required' });
          req.appendChild(el('span', { className: 'label', textContent: 'Required: ' }));
          req.appendChild(el('span', { className: 'value', textContent: skill.required_skill }));
          card.appendChild(req);
        }

        if (Array.isArray(skill.all_level_stats) && skill.all_level_stats.length > 0) {
          const statLevels = el('div', { className: 'stat-levels' });
          const lastIdx = skill.all_level_stats.length - 1;

          statLevels.appendChild(makeLevelRow('lv1', 'Lv.1: ', skill.all_level_stats[0]));

          if (skill.all_level_stats.length > 2) {
            const levelsList = el('div', { className: 'all-levels-list' });
            for (let idx = 1; idx < lastIdx; idx++) {
              levelsList.appendChild(makeLevelRow('midlevel', `Lv.${idx + 1}: `, skill.all_level_stats[idx]));
            }
            levelsList.hidden = true;

            const arrow = el('span', { className: 'all-levels-arrow', textContent: '▼' });
            statLevels.appendChild(arrow);
            statLevels.appendChild(levelsList);
            statLevels.appendChild(makeLevelRow('lvmax', `Lv.${lastIdx + 1}: `, skill.all_level_stats[lastIdx]));

          } else if (lastIdx > 0) {
            statLevels.appendChild(makeLevelRow('lvmax', `Lv.${lastIdx + 1}: `, skill.all_level_stats[lastIdx]));
          }

          card.appendChild(statLevels);
        }

        content.appendChild(card);
      });

      dataDiv.appendChild(
        makeCollapsible(`${cls.class_name} — ${cls.job}`, cls.skills.length, true, null, content)
      );
    });

    if (filtered.length === 0) {
      dataDiv.appendChild(
        el('p', { className: 'empty-state', textContent: 'No skills match your filters.' })
      );
    }

    if (autoExpandAfterId != null) {
      autoExpandById(dataDiv, autoExpandAfterId, '.skill-card');
      autoExpandAfterId = null;
    }
  }

  if (options.initialParams) {
    const cls = options.initialParams.get('class');
    const sub = options.initialParams.get('subclass');
    if (cls || sub) {
      if (cls) { classFilter = cls; pillGroup.setActive(classFilter); buildSubclassPills(); }
      if (sub && subPillGroup) { subclassFilter = sub; subPillGroup.setActive(subclassFilter); }
      updateFilterUrl();
      const parts = [CLASS_PILLS.find(p => p.value === classFilter)?.label ?? classFilter];
      if (subclassFilter) parts.push(subclassFilter);
      showFilterBanner(parts.join(' · '), () => {
        classFilter = '';
        subclassFilter = '';
        pillGroup.setActive('');
        buildSubclassPills();
        updateFilterUrl();
        renderData();
      });
    }
  }

  renderData();
  return container;
}
