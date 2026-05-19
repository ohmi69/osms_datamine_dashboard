import { el, matchSearch, makeCollapsible, makeThumbnail, makeDeepLinkButton, parseIdFilter, makePillGroup, wireSearch, makeHideToggle, makeCopyableId, padItemId, scrollToDetailRow, autoExpandById } from '../lib/utils.js';
import state from '../lib/data.js';

export function renderCashShop(data, options = {}) {
  const { cashShop } = data;
  let searchQuery = '';
  let autoExpandAfterId = null;
  let selectedCategory = null; // null = all, '__unnamed__' = unnamed section
  let selectedSubCategory = null;
  const container = el('div');
  wireSearch(container, 'Search by name or description...', options, (query) => {
    searchQuery = query;
    renderData();
  }, (id) => {
    autoExpandAfterId = id;
    renderData();
  });

  // Separate out items that have an image but no name into their own virtual category
  const unnamedItems = [];
  const namedCategories = cashShop.categories.map((cat) => ({
    ...cat,
    items: cat.items.filter((item) => {
      if (!item.name && item.thumbnail) {
        unnamedItems.push(item);
        return false;
      }
      return true;
    }),
  })).filter((cat) => cat.items.length > 0);

  // Pills (quest-style toggles)
  // Pills for category filtering using reusable utility
  const CATEGORY_PILLS = [
    { label: 'All', value: null },
    ...namedCategories.map((cat) => ({ label: cat.category, value: cat.category })),
    ...(unnamedItems.length > 0 ? [{ label: 'Unnamed Unavailable Items', value: '__unnamed__' }] : [])
  ];
  const pillGroup = makePillGroup(CATEGORY_PILLS, selectedCategory, (value) => {
    selectedCategory = value;
    renderData();
  });
  container.appendChild(pillGroup);

  // Sub-category filter row (shown only when Equipment is selected)
  const subPillRow = el('div', { className: 'sub-pill-row hidden' });
  container.appendChild(subPillRow);

  // Hide unavailable toggle
  // Use StateManager for hideUnavailable
  let hideUnavailable = state.get('cashshop_hide_unavailable', false);

  const SHOW_PRICE = true;
  const toggleRow = el('div', { className: 'cashshop-toggle-row' });
  toggleRow.appendChild(makeHideToggle('Hide Unavailable', hideUnavailable, (active) => {
    hideUnavailable = active;
    state.set('cashshop_hide_unavailable', hideUnavailable);
    renderData();
  }));
  container.appendChild(toggleRow);

  const dataDiv = el('div');
  container.appendChild(dataDiv);

  function buildSubCategoryPills() {
    subPillRow.innerHTML = '';
    if (selectedCategory !== 'Equipment') {
      subPillRow.classList.add('hidden');
      selectedSubCategory = null;
      return;
    }
    const eqpCat = namedCategories.find((c) => c.category === 'Equipment');
    if (!eqpCat) return;
    const subCats = [...new Set(eqpCat.items.map((i) => i.sub_category).filter(Boolean))].sort();
    if (subCats.length === 0) return;

    subPillRow.classList.remove('hidden');
    const allSub = el('button', { className: 'pill pill--sub active', textContent: 'All' });
    allSub.addEventListener('click', () => {
      selectedSubCategory = null;
      allSub.classList.add('active');
      subPillRow.querySelectorAll('button:not(:first-child)').forEach((b) => b.classList.remove('active'));
      renderData();
    });
    subPillRow.appendChild(allSub);

    subCats.forEach((sub) => {
      const btn = el('button', { className: 'pill pill--sub', textContent: sub });
      btn.addEventListener('click', () => {
        selectedSubCategory = sub;
        subPillRow.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        renderData();
      });
      subPillRow.appendChild(btn);
    });
  }

  function renderItemRow(item, fallbackLabel) {
    const row = el('div', { className: 'item-row' });
    const topLine = el('div', { className: 'top-line' });
    const nameWrap = el('span', { className: 'cashshop-name-wrap' });
    nameWrap.appendChild(
      makeThumbnail(item.thumbnail || `images/items/${padItemId(item.id)}.png`, `${fallbackLabel || item.name} thumbnail`, {
        className: 'item-thumb',
        fallbackText: 'ITEM',
      })
    );
    nameWrap.appendChild(el('span', { className: 'name', textContent: item.name || fallbackLabel || '' }));
    if (item.on_sale === false) {
      nameWrap.appendChild(el('span', { className: 'cashshop-badge--unavailable', textContent: 'Unavailable' }));
    }
    if (item.period && item.period > 0) {
      nameWrap.appendChild(el('span', { className: 'cashshop-badge--period', textContent: `${item.period}d` }));
    }
    // Show price only if available and internal flag is true
    if (SHOW_PRICE && item.price != null && item.on_sale !== false) {
      const priceLabel = el('span', { className: 'cashshop-badge--price', textContent: `${item.price} NX` });
      nameWrap.appendChild(priceLabel);
    }
    if (item.limited_life != null) {
      const lifeHours = Math.round(item.limited_life / 3600);
      nameWrap.appendChild(el('span', { className: 'cashshop-badge--pet', title: 'Only counts down while the pet is actively being used', textContent: `${lifeHours}h Active Life` }));
    }
    if (item.life != null) {
      nameWrap.appendChild(el('span', { className: 'cashshop-badge--pet', title: 'Time until the pet needs to be revived', textContent: `${item.life}d Lifespan` }));
    }
    topLine.appendChild(nameWrap);
    const csRightWrap = el('span', { className: 'item-id-wrap' });
    csRightWrap.appendChild(makeDeepLinkButton('cashshop', padItemId(item.id)));
    csRightWrap.appendChild(makeCopyableId(`#${padItemId(item.id)}`));
    topLine.appendChild(csRightWrap);
    row.appendChild(topLine);
    row.addEventListener('click', (e) => {
      if (e.target.closest('button, input')) return;
      history.replaceState(null, '', `#cashshop?q=${encodeURIComponent('id:' + padItemId(item.id))}`);
      scrollToDetailRow(row, row);
    });
    if (item.description) {
      row.appendChild(
        el('p', { className: 'desc', textContent: item.description.replace(/\n/g, '\n') })
      );
    }
    return row;
  }

  function renderUnnamedSection(items) {
    const content = el('div');

    const disclaimer = el('p', {
      className: 'cashshop-disclaimer',
      textContent: 'These items were found in the game files but have no name or description (not intended for use). They might never be made available in the cash shop, but they are provided here for speculation',
    });
    content.appendChild(disclaimer);

    items.forEach((item) => {
      content.appendChild(renderItemRow(item, `Item #${item.id}`));
    });

    dataDiv.appendChild(
      makeCollapsible('Unnamed Unavailable Items', items.length, true, null, content)
    );
  }

  function renderData() {
    dataDiv.innerHTML = '';
    pillGroup.setActive(selectedCategory);

    if (selectedCategory === '__unnamed__') {
      dataDiv.appendChild(el('div', { className: 'count-text', textContent: `${unnamedItems.length} items` }));
      renderUnnamedSection(unnamedItems);
      return;
    }

    const exactId = parseIdFilter(searchQuery);
    let filtered;
    if (!selectedCategory) {
      filtered = namedCategories
        .map((category) => ({
          ...category,
          items: category.items.filter((item) => {
            if (hideUnavailable && item.on_sale === false) return false;
            if (exactId != null) return Number(item.id) === exactId;
            return matchSearch(item.name, searchQuery) || matchSearch(item.description, searchQuery);
          }),
        }))
        .filter((category) => category.items.length > 0);
    } else {
      filtered = namedCategories
        .filter((cat) => cat.category === selectedCategory)
        .map((category) => ({
          ...category,
          items: category.items.filter((item) => {
            if (hideUnavailable && item.on_sale === false) return false;
            if (exactId != null) return Number(item.id) === exactId;
            if (!matchSearch(item.name, searchQuery) && !matchSearch(item.description, searchQuery)) return false;
            if (selectedSubCategory && item.sub_category !== selectedSubCategory) return false;
            return true;
          }),
        }))
        .filter((category) => category.items.length > 0);
    }

    const total = filtered.reduce((sum, category) => sum + category.items.length, 0);
    dataDiv.appendChild(el('div', { className: 'count-text', textContent: `${total} items` }));

    filtered.forEach((category) => {
      const content = el('div');
      category.items.forEach((item) => {
        content.appendChild(renderItemRow(item));
      });

      dataDiv.appendChild(
        makeCollapsible(category.category, category.items.length, true, null, content)
      );
    });

    if (total === 0) {
      dataDiv.appendChild(
        el('p', { className: 'empty-state', textContent: 'No cash shop items match your filters.' })
      );
    }

    // Always append unnamed section at the bottom when "All" is selected and search matches
    const filteredUnnamed = !selectedCategory && unnamedItems.length > 0
      ? unnamedItems.filter((item) => {
          if (exactId != null) return Number(item.id) === exactId;
          return !searchQuery;
        })
      : [];
    if (filteredUnnamed.length > 0) {
      renderUnnamedSection(filteredUnnamed);
    }

    if (autoExpandAfterId != null) {
      autoExpandById(dataDiv, autoExpandAfterId, '.item-row');
      autoExpandAfterId = null;
    }
  }

  renderData();
  return container;
}
