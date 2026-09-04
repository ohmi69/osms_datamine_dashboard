import { el, normalizeAssetPath, makeCopyableId, padItemId, makeSearchBox, parseIdFilter } from '../lib/utils.js';

export function renderBeautyStyles(data, options = {}) {
  const beauty = data.beauty_coupons;
  if (!beauty || (!beauty.hair?.length && !beauty.face?.length)) {
    return el('div', { textContent: 'No hair/face style data found.' });
  }

  const container = el('div', { className: 'beauty-container' });

  // --- Filter bar ---
  let activeType = 'all';
  let activeGender = 'all';
  let searchQuery = '';
  let pendingFocusId = null;

  // sticky-toolbar keeps the filters in reach while the style grids scroll past.
  const filterBar = el('div', { className: 'beauty-filter-bar sticky-toolbar' });

  function makeGroup(options, getValue, setValue) {
    const group = el('div', { className: 'pill-group' });
    const buttons = options.map(([value, label]) => {
      const btn = el('button', { className: 'pill', textContent: label });
      if (value === getValue()) btn.classList.add('active');
      btn.addEventListener('click', () => {
        setValue(value);
        group.setActive(value);
        applyFilters();
      });
      return btn;
    });
    buttons.forEach(b => group.appendChild(b));
    group.setActive = (value) => buttons.forEach((button, index) => {
      button.classList.toggle('active', options[index][0] === value);
    });
    return group;
  }

  const searchBox = makeSearchBox('Search styles by name or ID...', (value) => {
    searchQuery = value;
    pendingFocusId = null;
    applyFilters();
  });
  searchBox.classList.add('beauty-search');
  filterBar.appendChild(searchBox);

  const typeGroup = makeGroup(
    [['all', 'All'], ['hair', 'Hair'], ['face', 'Face']],
    () => activeType,
    v => { activeType = v; }
  );
  const genderGroup = makeGroup(
    [['all', 'All'], ['male', 'Male'], ['female', 'Female']],
    () => activeGender,
    v => { activeGender = v; }
  );
  filterBar.appendChild(typeGroup);
  filterBar.appendChild(genderGroup);

  container.appendChild(filterBar);

  // --- Sections ---
  const bodyDiv = el('div', { className: 'beauty-body' });
  container.appendChild(bodyDiv);

  const typeSections = [];
  const styleCards = [];

  for (const [type, label] of [['hair', 'Hair Styles'], ['face', 'Face Styles']]) {
    const styles = beauty[type];
    if (!styles || !styles.length) continue;

    const typeSection = el('div', { className: 'beauty-type-section' });
    typeSection.dataset.type = type;
    typeSection.appendChild(el('h2', { className: 'beauty-type-heading', textContent: label }));

    const byGender = { male: [], female: [] };
    for (const style of styles) {
      byGender[style.gender === 'female' ? 'female' : 'male'].push(style);
    }

    const genderBlocks = [];

    for (const [gender, genderLabel] of [['male', 'Male'], ['female', 'Female']]) {
      const gStyles = byGender[gender];
      if (!gStyles.length) continue;

      const block = el('div', { className: 'beauty-gender-block' });
      block.dataset.gender = gender;
      block.appendChild(el('div', { className: 'beauty-gender-label', textContent: genderLabel }));

      const grid = el('div', { className: 'beauty-style-grid' });
      for (const style of gStyles) {
        const card = el('div', { className: 'beauty-style-card' });
        card.dataset.styleId = String(style.id);
        if (style.thumbnail) {
          card.appendChild(el('img', {
            className: 'beauty-style-thumb',
            src: normalizeAssetPath(style.thumbnail),
            alt: style.name,
          }));
        } else {
          card.appendChild(el('div', { className: 'beauty-style-placeholder' }));
        }
        card.appendChild(el('div', { className: 'beauty-style-name', textContent: style.name }));
        card.appendChild(makeCopyableId(`#${padItemId(style.id)}`, 'beauty-style-id'));
        grid.appendChild(card);
        styleCards.push({ card, style, type, gender });
      }
      block.appendChild(grid);
      typeSection.appendChild(block);
      genderBlocks.push(block);
    }

    bodyDiv.appendChild(typeSection);
    typeSections.push({ el: typeSection, genderBlocks });
  }

  const emptyState = el('p', {
    className: 'empty-state beauty-empty beauty-hidden',
    textContent: 'No beauty styles match your filters.',
  });
  bodyDiv.appendChild(emptyState);

  function applyFilters() {
    const exactId = parseIdFilter(searchQuery);
    const query = searchQuery.trim().toLowerCase();
    let visibleCount = 0;

    for (const { card, style, type, gender } of styleCards) {
      const typeMatch = activeType === 'all' || type === activeType;
      const genderMatch = activeGender === 'all' || gender === activeGender;
      const textMatch = exactId != null
        ? Number(style.id) === exactId
        : !query
          || style.name?.toLowerCase().includes(query)
          || String(style.id).includes(query)
          || padItemId(style.id).includes(query.replace(/^#/, ''));
      const visible = typeMatch && genderMatch && textMatch;
      card.classList.toggle('beauty-hidden', !visible);
      card.classList.remove('row-hotlink');
      if (visible) visibleCount += 1;
    }

    for (const { el: section, genderBlocks } of typeSections) {
      let anyGenderVisible = false;
      for (const block of genderBlocks) {
        const hasVisibleCards = [...block.querySelectorAll('.beauty-style-card')]
          .some((card) => !card.classList.contains('beauty-hidden'));
        block.classList.toggle('beauty-hidden', !hasVisibleCards);
        if (hasVisibleCards) anyGenderVisible = true;
      }
      section.classList.toggle('beauty-hidden', !anyGenderVisible);
    }
    emptyState.classList.toggle('beauty-hidden', visibleCount !== 0);

    if (pendingFocusId != null) {
      const targetId = pendingFocusId;
      pendingFocusId = null;
      requestAnimationFrame(() => {
        const match = styleCards.find(({ style }) => Number(style.id) === Number(targetId));
        if (!match || match.card.classList.contains('beauty-hidden')) return;
        match.card.classList.add('row-hotlink');
        match.card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }

  if (options.setNavigate) {
    options.setNavigate((route) => {
      const query = route instanceof URLSearchParams
        ? (route.get('q') || '')
        : String(route || '');
      const exactId = parseIdFilter(query);
      activeType = 'all';
      activeGender = 'all';
      typeGroup.setActive(activeType);
      genderGroup.setActive(activeGender);
      searchQuery = query;
      pendingFocusId = exactId;
      searchBox._input.value = query;
      searchBox._sync();
      applyFilters();
      window.scrollTo(0, 0);
    });
  }

  applyFilters();

  return container;
}
