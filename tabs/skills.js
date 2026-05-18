import { el, matchSearch, makeCollapsible, makeThumbnail, makeDeepLinkButton, parseIdFilter, makePillGroup, wireSearch, makeCopyableId, padSkillId } from '../lib/utils.js';

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
  const container = el('div');



  wireSearch(container, 'Search by name or description...', options, (query) => {
    searchQuery = query;
    renderData();
  });

  const CLASS_PILLS = [
    { label: 'All', value: '' },
    { label: 'Warrior', value: 'Warrior' },
    { label: 'Mage', value: 'Magician' },
    { label: 'Bowman', value: 'Archer' },
    { label: 'Thief', value: 'Rogue' },
  ];
  const pillGroup = makePillGroup(CLASS_PILLS, classFilter, (value) => {
    classFilter = value;
    renderData();
  });
  container.appendChild(pillGroup);
  container.appendChild(
    el('div', { className: 'count-text', textContent: `${totalSkills} skills` })
  );

  const dataDiv = el('div');
  container.appendChild(dataDiv);

  function renderData() {
    pillGroup.setActive(classFilter);
    dataDiv.innerHTML = '';
    const exactId = parseIdFilter(searchQuery);
    // Filter by main_class property
    let filteredClasses = classes;
    if (classFilter) {
      filteredClasses = classes.filter((cls) => {
        // Use main_class for robust filtering
        return cls.main_class && cls.main_class.toLowerCase() === classFilter.toLowerCase();
      });
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
        skRightWrap.appendChild(makeCopyableId(skill.id != null ? padSkillId(skill.id) : ''));
        nameRow.appendChild(skRightWrap);
        card.appendChild(nameRow);

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

            statLevels.style.cursor = 'pointer';
            statLevels.title = 'Show intermediate levels';
            statLevels.addEventListener('click', () => {
              levelsList.hidden = !levelsList.hidden;
              arrow.textContent = levelsList.hidden ? '▼' : '▲';
            });
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
  }

  renderData();
  return container;
}
