import { el, matchSearch, makeSearchBox, makeCollapsible, makeThumbnail } from '../lib/utils.js';

function getSkillThumbnail(skill) {
  if (skill.thumbnail) return skill.thumbnail;
  const id = String(skill.id || '').padStart(7, '0');
  if (!id) return '';
  return `images/skills/${id}.png`;
}

export function renderSkills(data) {
  // Flatten new skills.json schema: top-level keys are classes, each value is an array of job/class objects
  const skillsData = data.skills;
  // Flatten all class/job objects into a single array
  const classes = Object.values(skillsData).flat();
  // Compute total number of skills
  const totalSkills = classes.reduce((sum, cls) => sum + (cls.skills?.length || 0), 0);
  let searchQuery = '';
  let classFilter = '';
  const container = el('div');

  const banner = el('div', {
    className: 'warning-banner',
    style: { borderColor: 'var(--accent)' },
  });
  banner.appendChild(
    el('p', {
      style: { fontSize: '13px', color: 'var(--accent)' },
      textContent: 'All skills are rebalanced.',
    })
  );
  container.appendChild(banner);

  // Pills for class filtering (by main_class)
  const pillGroup = el('div', { className: 'pill-group' });
  const CLASS_PILLS = [
    { label: 'All', value: '' },
    { label: 'Warrior', value: 'Warrior' },
    { label: 'Mage', value: 'Magician' },
    { label: 'Bowman', value: 'Archer' },
    { label: 'Thief', value: 'Rogue' },
  ];
  function rebuildPills() {
    pillGroup.innerHTML = '';
    CLASS_PILLS.forEach(({ label, value }) => {
      const pill = el('button', {
        className: `pill${classFilter === value ? ' active' : ''}`,
        textContent: label,
      });
      pill.addEventListener('click', () => {
        classFilter = value;
        rebuildPills();
        renderData();
      });
      pillGroup.appendChild(pill);
    });
  }
  rebuildPills();
  container.appendChild(pillGroup);

  container.appendChild(
    makeSearchBox('Search skills...', (value) => {
      searchQuery = value;
      renderData();
    })
  );
  container.appendChild(
    el('div', { className: 'count-text', textContent: `${totalSkills} skills` })
  );

  const dataDiv = el('div');
  container.appendChild(dataDiv);

  function renderData() {
    dataDiv.innerHTML = '';
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
            matchSearch(skill.name, searchQuery) ||
            matchSearch(skill.description, searchQuery)
        ),
      }))
      .filter((cls) => cls.skills.length > 0);

    filtered.forEach((cls) => {
      const content = el('div');
      cls.skills.forEach((skill) => {
        const card = el('div', { className: 'skill-card' });
        const nameRow = el('div', {
          style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' },
        });
        nameRow.appendChild(
          makeThumbnail(getSkillThumbnail(skill), `${skill.name} thumbnail`, {
            className: 'skill-thumb',
            fallbackText: 'SKL',
          })
        );
        nameRow.appendChild(el('span', { className: 'skill-name', textContent: skill.name }));
        if (skill.max_level > 0) {
          nameRow.appendChild(
            el('span', { className: 'max-level', textContent: `Max Lv.${skill.max_level}` })
          );
        }
        if (skill.id != null) {
          nameRow.appendChild(el('span', { className: 'id', style: { marginLeft: 'auto' }, textContent: skill.id }));
        }
        card.appendChild(nameRow);

        if (skill.description) {
          card.appendChild(
            el('p', { className: 'skill-desc', textContent: skill.description })
          );
        }

        if (skill.required_skill) {
          const req = el('div', { className: 'required' });
          req.appendChild(el('span', { className: 'label', textContent: 'Required: ' }));
          req.appendChild(el('span', { className: 'value', textContent: skill.required_skill }));
          card.appendChild(req);
        }

        if (skill.level1_stats || skill.max_level_stats) {
          const statLevels = el('div', { className: 'stat-levels' });
          if (skill.level1_stats) {
            const lv1 = el('div', { className: 'lv1' });
            lv1.appendChild(el('span', { className: 'label', textContent: 'Lv.1: ' }));
            lv1.appendChild(document.createTextNode(skill.level1_stats));
            statLevels.appendChild(lv1);
          }
          if (skill.max_level_stats && skill.max_level > 0) {
            const lvmax = el('div', { className: 'lvmax' });
            lvmax.appendChild(
              el('span', { className: 'label', textContent: `Lv.${skill.max_level}: ` })
            );
            lvmax.appendChild(document.createTextNode(skill.max_level_stats));
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
  }

  renderData();
  return container;
}
