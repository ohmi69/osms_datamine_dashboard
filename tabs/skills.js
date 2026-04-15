import { el, matchSearch, makeSearchBox, makeCollapsible, makeThumbnail, makeDeepLinkButton, parseIdFilter, makePillGroup } from '../lib/utils.js';

function getSkillThumbnail(skill) {
  if (skill.thumbnail) return skill.thumbnail;
  const id = String(skill.id || '').padStart(7, '0');
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



  // Pills for class filtering (by main_class) using reusable utility
  const CLASS_PILLS = [
    { label: 'All', value: '' },
    { label: 'Warrior', value: 'Warrior' },
    { label: 'Mage', value: 'Magician' },
    { label: 'Bowman', value: 'Archer' },
    { label: 'Thief', value: 'Rogue' },
  ];
  function handleClassPillChange(value) {
    classFilter = value;
    renderData();
  }
  let pillGroup = makePillGroup(CLASS_PILLS, classFilter, handleClassPillChange);
  const searchBox = makeSearchBox('Search by name or description...', (value) => {
    searchQuery = value;
    renderData();
  });
  container.appendChild(searchBox);

  if (options.setNavigate) {
    options.setNavigate((query) => {
      searchQuery = query;
      searchBox._input.value = query;
      renderData();
      window.scrollTo(0, 0);
    });
  }

  container.appendChild(pillGroup);
  container.appendChild(
    el('div', { className: 'count-text', textContent: `${totalSkills} skills` })
  );

  const dataDiv = el('div');
  container.appendChild(dataDiv);

  function renderData() {
    // Rebuild pills to update active state
    const newPillGroup = makePillGroup(CLASS_PILLS, classFilter, handleClassPillChange);
    container.replaceChild(newPillGroup, pillGroup);
    pillGroup = newPillGroup;
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
        const nameRow = el('div', {
          className: 'top-line',
          style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: '8px' },
        });
        const nameWrap = el('span', {
          style: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: '0' },
        });
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
        const skRightWrap = el('span', { style: { display: 'flex', alignItems: 'center', gap: '4px', flexShrink: '0' } });
        if (skill.id != null) skRightWrap.appendChild(makeDeepLinkButton('skills', skill.id));
        skRightWrap.appendChild(el('span', { className: 'id', textContent: skill.id != null ? `${skill.id}` : '' }));
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
          // Always show Lv.1
          const lv1 = el('div', { className: 'lv1' });
          lv1.appendChild(el('span', { className: 'label', textContent: 'Lv.1: ' }));
          lv1.appendChild(document.createTextNode(skill.all_level_stats[0]));
          statLevels.appendChild(lv1);

          // Only show foldout if there are intermediate levels
          if (skill.all_level_stats.length > 2) {
            let expanded = false;
            let levelsList = null;
            const arrow = el('span', { className: 'all-levels-arrow', textContent: '▼', style: { fontSize: '13px', color: 'var(--dim)', marginLeft: 'auto', transition: 'transform .2s' } });
            statLevels.appendChild(arrow);
            statLevels.style.cursor = 'pointer';
            statLevels.title = 'Show intermediate levels';
            statLevels.addEventListener('click', () => {
              expanded = !expanded;
              arrow.textContent = expanded ? '▲' : '▼';
              if (expanded) {
                if (!levelsList) {
                  levelsList = el('div', { className: 'all-levels-list' });
                  // Show intermediate levels (Lv.2 to Lv.max-1)
                  for (let idx = 1; idx < skill.all_level_stats.length - 1; idx++) {
                    const stats = skill.all_level_stats[idx];
                    const lv = el('div', { className: 'midlevel' });
                    lv.appendChild(el('span', { className: 'label', textContent: `Lv.${idx + 1}: ` }));
                    lv.appendChild(document.createTextNode(stats));
                    levelsList.appendChild(lv);
                  }
                }
                // Insert the levelsList right before Lv.max
                const lvmaxIdx = skill.all_level_stats.length - 1;
                const lvmaxDivs = Array.from(statLevels.getElementsByClassName('lvmax'));
                if (lvmaxDivs.length > 0) {
                  statLevels.insertBefore(levelsList, lvmaxDivs[0]);
                } else {
                  statLevels.appendChild(levelsList);
                }
                levelsList.style.display = '';
              } else {
                if (levelsList && levelsList.parentNode) {
                  levelsList.style.display = 'none';
                }
              }
            });
          }

          // Always show Lv.max
          const lvmaxIdx = skill.all_level_stats.length - 1;
          if (lvmaxIdx > 0) {
            const lvmax = el('div', { className: 'lvmax' });
            lvmax.appendChild(el('span', { className: 'label', textContent: `Lv.${lvmaxIdx + 1}: ` }));
            lvmax.appendChild(document.createTextNode(skill.all_level_stats[lvmaxIdx]));
            statLevels.appendChild(lvmax);
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
        el('p', {
          style: { color: 'var(--dim)', padding: '20px', textAlign: 'center' },
          textContent: 'No skills match your filters.',
        })
      );
    }
  }

  renderData();
  return container;
}
