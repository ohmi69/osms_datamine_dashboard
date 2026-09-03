import { el, matchSearch, makeCollapsible, makeThumbnail, makeDeepLinkButton, parseIdFilter, wireSearch, makeCopyableId, padSkillId, scrollToDetailRow, autoExpandById } from '../lib/utils.js';
import { Router } from '../lib/Router.js';
import { buildSkillRangeVisual } from '../lib/skill-range-viz.js';
import { attachCustomTooltip } from '../lib/tooltip.js';

const MECHANIC_EXPLANATIONS = {
  attack: 'Deals damage to one or more monsters.',
  passive: 'Always active once learned; it does not need to be cast.',
  self_buff: 'Temporarily applies an effect to the character using the skill.',
  summon: 'Creates a summoned ally or object that acts for a limited time.',
  mobility: 'Moves or repositions the character instead of directly attacking.',
  party_support: 'Applies a beneficial effect to eligible party members.',
  weapon_projectile: 'Launches a weapon-based projectile, such as an arrow or throwing star, to deliver the attack.',
  magic_projectile: 'Launches a magic projectile to deliver the attack to its target.',
  action_hitbox: 'Hits monsters that overlap the active area of the character\'s weapon animation.',
  special: 'Uses a skill-specific mechanic that does not fit the standard attack or buff handlers.',
  target_routed: 'Selects a monster first, then routes the attack toward that selected target.',
  ranged_corridor: 'Finds targets inside a widening area that extends forward from the character.',
  piercing: 'A single projectile continues through multiple selected monsters.',
  ignores_terrain: 'Walls, ledges, and slopes do not block this skill from reaching its target.',
};

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

function mechanicsText(skill) {
  const mechanics = skill.mechanics;
  const labels = mechanics
    ? [mechanics.label, ...(mechanics.modifiers || []).map(item => item.label)]
    : [];
  if (skill.range_visual?.terrain_check === false) labels.push('Ignores terrain');
  return labels.join(' ');
}

function makeMechanicBadges(skill) {
  const mechanics = skill.mechanics;
  const ignoresTerrain = skill.range_visual?.terrain_check === false;
  if (!mechanics && !ignoresTerrain) return null;
  const wrap = el('div', { className: 'skill-mechanics', 'aria-label': 'Skill mechanics' });

  function makeBadge(key, label, className) {
    const explanation = MECHANIC_EXPLANATIONS[key]
      || 'Describes how the game processes this skill.';
    const badge = el('span', {
      className,
      textContent: label,
      tabindex: '0',
      'aria-label': `${label}: ${explanation}`,
    });
    attachCustomTooltip(badge, (tip) => {
      tip.appendChild(el('div', { className: 'item-tooltip-name', textContent: label }));
      tip.appendChild(el('p', { className: 'item-tooltip-desc', textContent: explanation }));
    });
    return badge;
  }

  if (mechanics) {
    const kind = mechanics.kind || 'special';
    wrap.appendChild(makeBadge(
      kind,
      mechanics.label,
      `skill-mechanic skill-mechanic--${kind}`,
    ));
    (mechanics.modifiers || []).forEach(modifier => {
      wrap.appendChild(makeBadge(
        modifier.key,
        modifier.label,
        `skill-mechanic skill-mechanic--modifier skill-mechanic--${modifier.key}`,
      ));
    });
  }
  if (ignoresTerrain) {
    wrap.appendChild(makeBadge(
      'ignores_terrain',
      'Ignores terrain',
      'skill-mechanic skill-mechanic--modifier skill-mechanic--ignores-terrain',
    ));
  }
  return wrap;
}

function appendDetailPill(parent, label, value) {
  if (!value) return;
  const row = el('div', { className: 'targeting' });
  row.appendChild(el('span', { className: 'label', textContent: `${label}: ` }));
  row.appendChild(el('span', { className: 'value', textContent: value }));
  parent.appendChild(row);
}

export function renderSkills(data, options = {}) {
  const skillsData = data.skills;
  const classes = Object.values(skillsData)
    .filter(Array.isArray)
    .flat()
    .filter(cls => cls && typeof cls === 'object' && typeof cls.class_name === 'string' && Array.isArray(cls.skills));
  let searchQuery = '';
  let classFilter = '';
  let subclassFilter = '';
  let viewAll = false;
  let autoExpandAfterId = null;
  const CLASS_DEFS = [
    { label: 'Beginner', value: 'Beginner', key: 'beginner' },
    { label: 'Warrior', value: 'Warrior', key: 'warrior' },
    { label: 'Mage', value: 'Magician', key: 'magician' },
    { label: 'Bowman', value: 'Archer', key: 'archer' },
    { label: 'Thief', value: 'Rogue', key: 'rogue' },
  ];
  const JOB_LINES = {
    Warrior: {
      Fighter: ['Fighter', 'Crusader', 'Hero'],
      Page: ['Page', 'White Knight', 'Paladin'],
      Spearman: ['Spearman', 'Dragon Knight', 'Dark Knight'],
    },
    Magician: {
      'F/P Wizard': ['F/P Wizard', 'F/P Mage', 'Archmage F/P'],
      'I/L Wizard': ['I/L Wizard', 'I/L Mage', 'Archmage I/L'],
      Cleric: ['Cleric', 'Priest', 'Bishop'],
    },
    Archer: {
      Hunter: ['Hunter', 'Ranger', 'Bowmaster'],
      Crossbowman: ['Crossbowman', 'Sniper', 'Marksman'],
    },
    Rogue: {
      Assassin: ['Assassin', 'Hermit', 'Night Lord'],
      Bandit: ['Bandit', 'Chief Bandit', 'Shadower'],
    },
  };
  const PATHS_BY_CLASS = {};
  const LINE_MEMBERS = {};
  const CLASS_TO_LINE = {};
  const CLASS_TO_MAIN = {};

  for (const definition of CLASS_DEFS) {
    const flat = Array.isArray(skillsData[definition.key]) ? skillsData[definition.key] : [];
    const present = new Set(flat.map(cls => cls.class_name));
    const paths = [];
    const claimed = new Set();
    flat.forEach(cls => { CLASS_TO_MAIN[cls.class_name] = definition.value; });
    for (const [line, members] of Object.entries(JOB_LINES[definition.value] || {})) {
      const inData = members.filter(m => present.has(m));
      members.forEach(m => claimed.add(m));
      if (inData.length === 0) continue;
      LINE_MEMBERS[line] = new Set(inData);
      inData.forEach(m => { CLASS_TO_LINE[m] = line; });
      paths.push({ value: line, members: inData });
    }
    for (const cls of flat) {
      const cn = cls.class_name;
      if (claimed.has(cn) || cn === definition.value || definition.value === 'Beginner') continue;
      if (!LINE_MEMBERS[cn]) {
        LINE_MEMBERS[cn] = new Set([cn]);
        paths.push({ value: cn, members: [cn] });
      }
      CLASS_TO_LINE[cn] = cn;
    }
    PATHS_BY_CLASS[definition.value] = paths;
  }

  const container = el('div', { className: 'skills-page' });
  const toolbar = el('div', { className: 'sticky-toolbar skills-toolbar' });

  let searchBox;
  searchBox = wireSearch(toolbar, 'Search all skills by name, description, or mechanic...', options, (query) => {
    searchQuery = query;
    renderData();
  }, (id) => {
    classFilter = '';
    subclassFilter = '';
    viewAll = false;
    searchQuery = `id:${padSkillId(id)}`;
    searchBox._input.value = searchQuery;
    searchBox._sync();
    autoExpandAfterId = id;
    renderData();
  });
  container.appendChild(toolbar);

  const dataDiv = el('div', { className: 'skills-browser' });
  container.appendChild(dataDiv);

  function classDefinition(value) {
    return CLASS_DEFS.find(definition => definition.value === value);
  }

  function classesForMain(value) {
    return classes.filter(cls => (cls.main_class || cls.class_name) === value);
  }

  function pathLabel(path) {
    return path.members.join(' → ');
  }

  function currentFilterParams() {
    return {
      ...(searchQuery && { q: searchQuery }),
      ...(classFilter && { class: classFilter }),
      ...(subclassFilter && { subclass: subclassFilter }),
      ...(viewAll && { view: 'all' }),
    };
  }

  // Discrete drill-down steps get their own history entry so Back walks back
  // up one level at a time instead of jumping to the previous tab.
  function pushFilterUrl() {
    Router.pushFilter('skills', currentFilterParams());
  }

  function navigateToClass(value) {
    classFilter = value;
    subclassFilter = '';
    viewAll = false;
    pushFilterUrl();
    renderData();
  }

  function navigateToPath(value) {
    subclassFilter = value;
    viewAll = false;
    pushFilterUrl();
    renderData();
  }

  function navigateHome() {
    classFilter = '';
    subclassFilter = '';
    viewAll = false;
    pushFilterUrl();
    renderData();
  }

  function makeBreadcrumb() {
    const nav = el('nav', { className: 'skills-breadcrumb', 'aria-label': 'Skill class hierarchy' });
    const home = el('button', { type: 'button', textContent: 'All classes' });
    home.addEventListener('click', navigateHome);
    nav.appendChild(home);
    if (viewAll) {
      nav.append(el('span', { className: 'skills-breadcrumb-separator', textContent: '/' }), el('span', { 'aria-current': 'page', textContent: 'All skills' }));
    } else if (classFilter) {
      nav.appendChild(el('span', { className: 'skills-breadcrumb-separator', textContent: '/' }));
      const definition = classDefinition(classFilter);
      if (subclassFilter) {
        const classButton = el('button', { type: 'button', textContent: definition?.label || classFilter });
        classButton.addEventListener('click', () => navigateToClass(classFilter));
        nav.appendChild(classButton);
        nav.append(el('span', { className: 'skills-breadcrumb-separator', textContent: '/' }), el('span', { 'aria-current': 'page', textContent: pathLabel((PATHS_BY_CLASS[classFilter] || []).find(path => path.value === subclassFilter) || { members: [subclassFilter] }) }));
      } else {
        nav.appendChild(el('span', { 'aria-current': 'page', textContent: definition?.label || classFilter }));
      }
    }
    return nav;
  }

  function makePathCard(path, selected = false) {
    const pathClasses = path.members.map(name => classes.find(cls => cls.class_name === name)).filter(Boolean);
    const button = el('button', {
      type: 'button',
      className: `skill-path-card${selected ? ' active' : ''}`,
      'aria-pressed': selected ? 'true' : 'false',
      'aria-label': `Browse ${pathLabel(path)} skills`,
    });
    const trail = el('span', { className: 'skill-path-trail' });
    trail.style.setProperty('--skill-path-steps', path.members.length);
    path.members.forEach((member, index) => {
      const cls = pathClasses.find(item => item.class_name === member);
      const node = el('span', { className: 'skill-path-node' });
      node.append(el('span', { className: 'skill-path-tier', textContent: cls?.job || `${index + 2}nd Job` }), el('strong', { textContent: member }));
      trail.appendChild(node);
    });
    button.appendChild(trail);
    button.addEventListener('click', () => navigateToPath(path.value));
    return button;
  }

  function renderClassDirectory() {
    const intro = el('div', { className: 'skills-browser-heading' });
    intro.append(el('div', { className: 'skills-eyebrow', textContent: 'Job advancement' }), el('h2', { textContent: 'Choose a class' }),);
    dataDiv.appendChild(intro);

    const grid = el('div', { className: 'skill-class-grid' });
    CLASS_DEFS.forEach(definition => {
      const classList = classesForMain(definition.value);
      if (classList.length === 0) return;
      const paths = PATHS_BY_CLASS[definition.value] || [];
      const button = el('button', { type: 'button', className: 'skill-class-card', 'aria-label': `Browse ${definition.label} skills` });
      const top = el('span', { className: 'skill-class-card-top' });
      top.appendChild(el('strong', { textContent: definition.label }));
      button.appendChild(top);
      if (paths.length > 0) {
        const previews = el('span', { className: 'skill-class-paths' });
        paths.forEach(path => previews.appendChild(el('span', { textContent: pathLabel(path) })));
        button.appendChild(previews);
      }
      button.appendChild(el('span', { className: 'skill-class-action', textContent: 'Browse class →' }));
      button.addEventListener('click', () => navigateToClass(definition.value));
      grid.appendChild(button);
    });
    dataDiv.appendChild(grid);

    const allButton = el('button', { type: 'button', className: 'skills-view-all' });
    allButton.appendChild(el('strong', { textContent: 'View all skills' }));
    allButton.addEventListener('click', () => {
      classFilter = '';
      subclassFilter = '';
      viewAll = true;
      pushFilterUrl();
      renderData();
    });
    dataDiv.appendChild(allButton);
  }

  function renderClassHeader() {
    const definition = classDefinition(classFilter);
    dataDiv.appendChild(makeBreadcrumb());
    const heading = el('div', { className: 'skills-browser-heading skills-browser-heading--compact' });
    heading.append(el('div', { className: 'skills-eyebrow', textContent: subclassFilter ? 'Selected advancement path' : 'Class overview' }), el('h2', { textContent: subclassFilter ? pathLabel((PATHS_BY_CLASS[classFilter] || []).find(path => path.value === subclassFilter) || { members: [subclassFilter] }) : definition?.label || classFilter }));
    if (!subclassFilter) heading.appendChild(el('p', { textContent: 'Browse every advancement below, or choose a path to focus the list.' }));
    dataDiv.appendChild(heading);

    const paths = PATHS_BY_CLASS[classFilter] || [];
    if (paths.length > 0) {
      const pathSection = el('section', { className: 'skill-path-section', 'aria-label': `${definition?.label || classFilter} advancement paths` });
      pathSection.appendChild(el('h3', { textContent: subclassFilter ? 'Switch path' : 'Advancement paths' }));
      const pathGrid = el('div', { className: 'skill-path-grid' });
      paths.forEach(path => pathGrid.appendChild(makePathCard(path, path.value === subclassFilter)));
      pathSection.appendChild(pathGrid);
      dataDiv.appendChild(pathSection);
    }
  }

  function renderSearchHeader() {
    if (classFilter) dataDiv.appendChild(makeBreadcrumb());
    const definition = classDefinition(classFilter);
    const selectedPath = (PATHS_BY_CLASS[classFilter] || []).find(path => path.value === subclassFilter);
    const scope = selectedPath ? pathLabel(selectedPath) : definition?.label;
    const heading = el('div', { className: 'skills-browser-heading skills-browser-heading--compact skills-search-heading' });
    const copy = el('div');
    copy.append(el('div', { className: 'skills-eyebrow', textContent: scope ? `Searching in ${scope}` : 'Searching all classes' }), el('h2', { textContent: `Results for “${searchQuery}”` }));
    heading.appendChild(copy);
    if (classFilter) {
      const allClasses = el('button', { type: 'button', className: 'skills-scope-action', textContent: 'Search all classes' });
      allClasses.addEventListener('click', () => {
        classFilter = '';
        subclassFilter = '';
        pushFilterUrl();
        renderData();
      });
      heading.appendChild(allClasses);
    }
    dataDiv.appendChild(heading);
  }

  function renderData() {
    dataDiv.innerHTML = '';
    const exactId = parseIdFilter(searchQuery);
    const isSearching = Boolean(searchQuery.trim());

    if (!isSearching && !classFilter && !viewAll) {
      renderClassDirectory();
      return;
    }

    if (isSearching) {
      renderSearchHeader();
    } else if (viewAll) {
      dataDiv.appendChild(makeBreadcrumb());
      const heading = el('div', { className: 'skills-browser-heading skills-browser-heading--compact' });
      heading.append(el('div', { className: 'skills-eyebrow', textContent: 'Complete index' }), el('h2', { textContent: 'All skills' }), el('p', { textContent: 'Every job is listed below. Sections stay closed until you need them.' }));
      dataDiv.appendChild(heading);
    } else if (classFilter) {
      renderClassHeader();
    }

    let filteredClasses = classes;
    if (classFilter) {
      filteredClasses = classes.filter(
        (cls) => (cls.main_class || cls.class_name || '').toLowerCase() === String(classFilter).toLowerCase()
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
    if (classFilter && !subclassFilter && !isSearching) {
      const classOrder = new Map([[classFilter, 0]]);
      (PATHS_BY_CLASS[classFilter] || []).forEach((path, pathIndex) => {
        path.members.forEach((member, memberIndex) => {
          classOrder.set(member, 1 + (pathIndex * 10) + memberIndex);
        });
      });
      filteredClasses = [...filteredClasses].sort(
        (a, b) => (classOrder.get(a.class_name) ?? 999) - (classOrder.get(b.class_name) ?? 999)
      );
    } else {
      filteredClasses = [...filteredClasses].sort(
        (a, b) => (JOB_TIER_ORDER[a.job] ?? 99) - (JOB_TIER_ORDER[b.job] ?? 99)
      );
    }
    const filtered = filteredClasses
      .map((cls) => ({
        ...cls,
        skills: (cls.skills || []).filter(
          (skill) =>
            exactId != null
              ? Number(skill.id) === exactId
              : matchSearch(skill.name, searchQuery)
                || matchSearch(skill.description, searchQuery)
                || matchSearch(mechanicsText(skill), searchQuery)
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
        const detail = el('div', { className: 'skill-detail' });
        card.appendChild(detail);
        const advanced = el('div', { className: 'skill-advanced' });
        advanced.hidden = true;
        const mechanicBadges = makeMechanicBadges(skill);
        if (mechanicBadges) advanced.appendChild(mechanicBadges);

        if (skill.description) {
          const desc = skill.description.replace(/^\[Master Level\s*:\s*\d+\]\n?/i, '').trim();
          if (desc) detail.appendChild(el('p', { className: 'skill-desc', textContent: desc }));
        }

        if (skill.required_skill) {
          const req = el('div', { className: 'required' });
          req.appendChild(el('span', { className: 'label', textContent: 'Required: ' }));
          req.appendChild(el('span', { className: 'value', textContent: skill.required_skill }));
          detail.appendChild(req);
        }

        const targeting = formatTargeting(skill);
        appendDetailPill(detail, 'Targets', targeting);

        const cooldown = formatCooldown(skill.cooldown);
        appendDetailPill(detail, 'Cooldown', cooldown);

        const duration = formatCooldown(skill.duration);
        appendDetailPill(detail, 'Duration', duration);

        const range = countSpan(skill.range);
        appendDetailPill(detail, 'Range', range?.text);

        const distance = countSpan(skill.distance);
        appendDetailPill(detail, 'Distance', distance?.text);

        const consumes = formatConsumes(skill);
        appendDetailPill(detail, 'Consumes', consumes);

        const ammo = countSpan(skill.bullet_consume);
        appendDetailPill(detail, 'Ammo per use', ammo?.text);

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

          detail.appendChild(statLevels);
        }

        let rangeVisualBuilt = false;
        function setAdvancedExpanded(expanded) {
          advanced.hidden = !expanded;
          if (expanded && !rangeVisualBuilt && skill.range_visual) {
            const visual = buildSkillRangeVisual(skill);
            if (visual) advanced.appendChild(visual);
            rangeVisualBuilt = true;
          }
        }
        if (mechanicBadges || skill.range_visual) card.appendChild(advanced);

        if (skill.id != null) {
          card.addEventListener('click', (event) => {
            if (event.target.closest('button, input, a, .skill-advanced')) return;
            history.replaceState(null, '', `#skills?q=${encodeURIComponent('id:' + padSkillId(skill.id))}`);
            const levelsList = card.querySelector('.all-levels-list');
            const arrow = card.querySelector('.all-levels-arrow');
            if (levelsList) {
              levelsList.hidden = !levelsList.hidden;
              if (arrow) arrow.textContent = levelsList.hidden ? '▼' : '▲';
              setAdvancedExpanded(!levelsList.hidden);
              if (!levelsList.hidden) {
                document.querySelectorAll('.row-hotlink').forEach(row => row.classList.remove('row-hotlink'));
                card.classList.add('row-hotlink');
                scrollToDetailRow(card, card);
              } else {
                card.classList.remove('row-hotlink');
              }
            } else {
              setAdvancedExpanded(advanced.hidden);
              document.querySelectorAll('.row-hotlink').forEach(row => row.classList.remove('row-hotlink'));
              card.classList.add('row-hotlink');
              scrollToDetailRow(card, card);
            }
          });
        }

        content.appendChild(card);
      });

      const defaultOpen = isSearching
        || (!viewAll && !subclassFilter)
        || (subclassFilter && (cls.job === '2nd Job' || cls.job === 'Beginner'));
      dataDiv.appendChild(
        makeCollapsible(`${cls.class_name} (${cls.job})`, null, defaultOpen, null, content)
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

  const CLASS_ALIASES = { Mage: 'Magician', Bowman: 'Archer', Thief: 'Rogue' };

  // Shared by the initial deep link and by back/forward traversal. Applies
  // URL params to UI state without touching history (the URL is already
  // correct when this runs).
  function applyParams(params) {
    if (!params) return;
    const get = typeof params.get === 'function'
      ? (k) => params.get(k)
      : (k) => params[k];
    const rawClass = get('class');
    const cls = CLASS_ALIASES[rawClass] || rawClass;
    const sub = get('subclass');
    classFilter = cls || '';
    if (sub) {
      subclassFilter = CLASS_TO_LINE[sub] || sub;
      if (!classFilter) classFilter = CLASS_TO_MAIN[sub] || '';
    } else {
      subclassFilter = '';
    }
    viewAll = get('view') === 'all' && !classFilter;
    const q = get('q') || '';
    const exactId = parseIdFilter(q);
    autoExpandAfterId = exactId != null ? exactId : null;
    searchQuery = q;
    if (searchBox) {
      searchBox._input.value = q;
      searchBox._sync();
    }
    renderData();
    window.scrollTo(0, 0);
  }

  if (options.setNavigate) {
    options.setNavigate((route) => {
      // String routes are `q` search queries (deep links, cross-tab jumps);
      // URLSearchParams carry full filter state (back/forward traversal).
      applyParams(typeof route === 'string'
        ? new URLSearchParams(route ? { q: route } : {})
        : route);
    });
  }

  if (options.initialParams) {
    applyParams(options.initialParams);
  } else {
    renderData();
  }
  return container;
}
