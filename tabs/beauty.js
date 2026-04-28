import { el, normalizeAssetPath, makeCopyableId, padItemId } from '../lib/utils.js';

export function renderBeautyStyles(data) {
  const beauty = data.beauty_coupons;
  if (!beauty || (!beauty.hair?.length && !beauty.face?.length)) {
    return el('div', { textContent: 'No hair/face style data found.' });
  }

  const container = el('div', { className: 'beauty-container' });

  // --- Filter bar ---
  let activeType = 'all';
  let activeGender = 'all';

  const filterBar = el('div', { className: 'beauty-filter-bar' });

  function makeGroup(options, getValue, setValue) {
    const group = el('div', { className: 'pill-group' });
    const buttons = options.map(([value, label]) => {
      const btn = el('button', { className: 'pill', textContent: label });
      if (value === getValue()) btn.classList.add('active');
      btn.addEventListener('click', () => {
        setValue(value);
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyFilters();
      });
      return btn;
    });
    buttons.forEach(b => group.appendChild(b));
    return group;
  }

  filterBar.appendChild(makeGroup(
    [['all', 'All'], ['hair', 'Hair'], ['face', 'Face']],
    () => activeType,
    v => { activeType = v; }
  ));
  filterBar.appendChild(makeGroup(
    [['all', 'All'], ['male', 'Male'], ['female', 'Female']],
    () => activeGender,
    v => { activeGender = v; }
  ));

  container.appendChild(filterBar);

  // --- Sections ---
  const bodyDiv = el('div', { className: 'beauty-body' });
  container.appendChild(bodyDiv);

  const typeSections = [];

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
        card.appendChild(makeCopyableId(padItemId(style.id), 'beauty-style-id'));
        grid.appendChild(card);
      }
      block.appendChild(grid);
      typeSection.appendChild(block);
      genderBlocks.push(block);
    }

    bodyDiv.appendChild(typeSection);
    typeSections.push({ el: typeSection, genderBlocks });
  }

  function applyFilters() {
    for (const { el: section, genderBlocks } of typeSections) {
      const typeMatch = activeType === 'all' || section.dataset.type === activeType;
      let anyGenderVisible = false;
      for (const block of genderBlocks) {
        const genderMatch = activeGender === 'all' || block.dataset.gender === activeGender;
        block.classList.toggle('beauty-hidden', !genderMatch);
        if (genderMatch) anyGenderVisible = true;
      }
      section.classList.toggle('beauty-hidden', !typeMatch || !anyGenderVisible);
    }
  }

  return container;
}
