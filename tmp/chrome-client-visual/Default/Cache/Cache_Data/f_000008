import { el, matchSearch, makeCollapsible, makeThumbnail, makeDeepLinkButton, parseIdFilter, makePillGroup, wireSearch, makeCopyableId, padSkillId, scrollToDetailRow, autoExpandById, showFilterBanner, hideFilterBanner } from '../lib/utils.js';
import { Router } from '../lib/Router.js';

function makeLevelRow(className, label, text) {
  const row = el('div', { className });
  row.appendChild(el('span', { className: 'label', textContent: label }));
  row.appendChild(document.createTextNode(text));
  return row;
}

// mob_count / attack_count come through as a plain number when the value holds
// for every level, or an array (one entry per level) when it scales with rank.
// Collapse an array to its span so the card stays one line: "1-4 monsters".
function countSpan(value) {
  if (typeof value === 'number') return { text: String(value), max: value };
  if (!Array.isArray(value)) return null;
  const nums = value.filter((v) => typeof v === 'number');
  if (nums.length === 0) return null;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return { text: lo === hi ? String(hi) : `${lo}-${hi}`, max: hi };
}

function formatTargeting(skill) {
  const mobs = countSpan(skill.mob_count);
  const hits = countSpan(skill.attack_count);
  if (!mobs && !hits) return '';
  const parts = [];
  if (mobs) parts.push(`${mobs.text} ${mobs.max === 1 ? 'monster' : 'monsters'}`);
  // A single hit per monster is the default and says nothing worth the space.
  if (hits && hits.max > 1) parts.push(`${hits.text} ${hits.max === 1 ? 'hit' : 'hits'} each`);
  return parts.join(' · ');
}

// cooldown is seconds, same scalar-or-per-level shape as mob_count. Long buff
// cooldowns (Holy Symbol: 2700s) read better as minutes.
function formatSeconds(n) {
  if (n >= 60 && n % 60 === 0) return `${n / 60} min`;
  return `${n}s`;
}

function formatCooldown(value) {
  const span = countSpan(value);
  if (!span) return '';
  const nums = Array.isArray(value) ? value.filter((v) => typeof v === 'number') : [value];
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return lo === hi ? formatSeconds(hi) : `${formatSeconds(lo)} - ${formatSeconds(hi)}`;
}

// item_consume is an item name (or per-level list of names when the item
// changes with rank -- Three Snails), item_consume_count the usual
// scalar-or-per-level count. money_consume is a meso cost per cast.
function formatConsumes(skill) {
  const parts = [];
  if (skill.item_consume) {
    const names = Array.isArray(skill.item_consume)
      ? [...new Set(skill.item_consume.filter(Boolean))].join(' / ')
      : skill.item_consume;
    const count = countSpan(skill.item_consume_count);
    if (names) parts.push(count && count.max > 1 ? `${count.text} × ${names}` : names);
  }
  const mesos = countSpan(skill.money_consume);
  if (mesos) parts.push(`${mesos.text} mesos`);
  return parts.join(' · ');
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



  // Search and filters stay pinned at the top while the list scrolls past.
  const toolbar = el('div', { className: 'sticky-toolbar' });

  wireSearch(toolbar, 'Search by name or description...', options, (query) => {
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
  // Each job line is one advancement path: 2nd job -> 3rd job (and beyond).
  // The shared 1st job class is implicitly part of every line of its main class.
  const JOB_LINES = {
    Warrior: {
      Fighter: ['Fighter', 'Crusader'],
      Page: ['Page', 'White Knight'],
      Spearman: ['Spearman', 'Dragon Knight'],
    },
    Magician: {
      'F/P Wizard': ['F/P Wizard', 'F/P Mage'],
      'I/L Wizard': ['I/L Wizard', 'I/L Mage'],
      Cleric: ['Cleric', 'Priest'],
    },
    Archer: {
      Hunter: ['Hunter', 'Ranger'],
      Crossbowman: ['Crossbowman', 'Sniper'],
    },
    Rogue: {
      Assassin: ['Assassin', 'Hermit'],
      Bandit: ['Bandit', 'Chief Bandit'],
    },
  };

  // Map every class name to the line it belongs to, keeping only lines present in the data.
  const SUBCLASS_PILLS = {};
  const LINE_MEMBERS = {};
  const CLASS_TO_LINE = {};
  for (const [key, arr] of Object.entries(skillsData)) {
    const flat = [].concat(arr);
    const pill = CLASS_PILLS.find(p => p.value && p.value.toLowerCase() === key);
    if (!pill) continue;
    const present = new Set(flat.map(cls => cls.class_name));
    const lines = [];
    const claimed = new Set();
    for (const [line, members] of Object.entries(JOB_LINES[pill.value] || {})) {
      const inData = members.filter(m => present.has(m));
      members.forEach(m => claimed.add(m));
      if (inData.length === 0) continue;
      lines.push(line);
      LINE_MEMBERS[line] = new Set(inData);
      inData.forEach(m => { CLASS_TO_LINE[m] = line; });
    }
    // Any class not covered by a known line (and not the 1st job root) becomes its own pill.
    for (const cls of flat) {
      const cn = cls.class_name;
      if (claimed.has(cn) || cn === pill.value) continue;
      if (!LINE_MEMBERS[cn]) {
        lines.push(cn);
        LINE_MEMBERS[cn] = new Set([cn]);
      }
      CLASS_TO_LINE[cn] = cn;
    }
    if (lines.length === 0) continue;
    SUBCLASS_PILLS[pill.value] = [
      { label: 'All', value: '' },
      ...lines.map(line => ({ label: line, value: line })),
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
  toolbar.appendChild(pillGroup);

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
  toolbar.appendChild(subPillsWrapper);
  container.appendChild(toolbar);
  const countText = el('div', { className: 'count-text', textContent: `${totalSkills} skills` });
  container.appendChild(countText);

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
      const members = LINE_MEMBERS[subclassFilter];
      filteredClasses = filteredClasses.filter(
        (cls) =>
          // the shared 1st job class stays visible for every line
          (classFilter && cls.class_name === classFilter) ||
          (members ? members.has(cls.class_name) : cls.class_name === subclassFilter)
      );
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

    const shownSkills = filtered.reduce((sum, cls) => sum + cls.skills.length, 0);
    countText.textContent =
      shownSkills === totalSkills ? `${totalSkills} skills` : `${shownSkills} of ${totalSkills} skills`;

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
        if (skill.target === 'party') {
          nameWrap.appendChild(
            el('span', { className: 'badge badge-party', textContent: 'Party Buff', title: 'Applies to party members in range' })
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

        const targeting = formatTargeting(skill);
        if (targeting) {
          const row = el('div', { className: 'targeting' });
          row.appendChild(el('span', { className: 'label', textContent: 'Targets: ' }));
          row.appendChild(el('span', { className: 'value', textContent: targeting }));
          card.appendChild(row);
        }

        const cooldown = formatCooldown(skill.cooldown);
        if (cooldown) {
          const row = el('div', { className: 'targeting' });
          row.appendChild(el('span', { className: 'label', textContent: 'Cooldown: ' }));
          row.appendChild(el('span', { className: 'value', textContent: cooldown }));
          card.appendChild(row);
        }

        const duration = formatCooldown(skill.duration);
        if (duration) {
          const row = el('div', { className: 'targeting' });
          row.appendChild(el('span', { className: 'label', textContent: 'Duration: ' }));
          row.appendChild(el('span', { className: 'value', textContent: duration }));
          card.appendChild(row);
        }

        const range = countSpan(skill.range);
        if (range) {
          const row = el('div', { className: 'targeting' });
          row.appendChild(el('span', { className: 'label', textContent: 'Range: ' }));
          row.appendChild(el('span', { className: 'value', textContent: range.text }));
          card.appendChild(row);
        }

        const distance = countSpan(skill.distance);
        if (distance) {
          const row = el('div', { className: 'targeting' });
          row.appendChild(el('span', { className: 'label', textContent: 'Distance: ' }));
          row.appendChild(el('span', { className: 'value', textContent: distance.text }));
          card.appendChild(row);
        }

        const consumes = formatConsumes(skill);
        if (consumes) {
          const row = el('div', { className: 'targeting' });
          row.appendChild(el('span', { className: 'label', textContent: 'Consumes: ' }));
          row.appendChild(el('span', { className: 'value', textContent: consumes }));
          card.appendChild(row);
        }

        const ammo = countSpan(skill.bullet_consume);
        if (ammo) {
          const row = el('div', { className: 'targeting' });
          row.appendChild(el('span', { className: 'label', textContent: 'Ammo per use: ' }));
          row.appendChild(el('span', { className: 'value', textContent: ammo.text }));
          card.appendChild(row);
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
        makeCollapsible(`${cls.class_name} (${cls.job})`, cls.skills.length, true, null, content)
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
      // a deep link may name any class in a line (e.g. "F/P Mage") — resolve it to its line pill
      if (sub) { subclassFilter = CLASS_TO_LINE[sub] || sub; if (subPillGroup) subPillGroup.setActive(subclassFilter); }
      updateFilterUrl();
      const parts = [];
      if (classFilter) parts.push(CLASS_PILLS.find(p => p.value === classFilter)?.label ?? classFilter);
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
