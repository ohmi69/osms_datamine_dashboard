import { el, matchSearch, makeSearchBox, makeCollapsible, makeThumbnail, makeDeepLinkButton } from '../lib/utils.js';

function parseIdFilter(query) {
  const match = /^id\s*:\s*(\d+)\s*$/i.exec((query || '').trim());
  if (!match) return null;
  return Number(match[1]);
}

export function renderCashShop(data, options = {}) {
  const { cashShop } = data;
  let searchQuery = '';
  const container = el('div');
  const csSearchBox = makeSearchBox('Search by name or description...', (value) => {
    searchQuery = value;
    renderData();
  });
  container.appendChild(csSearchBox);

  if (options.setNavigate) {
    options.setNavigate((query) => {
      searchQuery = query;
      csSearchBox._input.value = query;
      renderData();
      window.scrollTo(0, 0);
    });
  }

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
  const pillRow = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '16px 0 8px 0', alignItems: 'center' } });
  const allTab = el('button', { className: 'pill active', textContent: 'All' });
  pillRow.appendChild(allTab);
  const categoryTabs = namedCategories.map((cat) => {
    const btn = el('button', { className: 'pill', textContent: cat.category });
    pillRow.appendChild(btn);
    return btn;
  });

  // Unnamed pill goes last
  const unnamedTab = el('button', { className: 'pill', textContent: 'Unnamed Unavailable Items' });
  if (unnamedItems.length > 0) {
    pillRow.appendChild(unnamedTab);
  }

  container.appendChild(pillRow);

  // Sub-category filter row (shown only when Equipment is selected)
  const subPillRow = el('div', { style: { display: 'none', flexWrap: 'wrap', gap: '6px', margin: '0 0 8px 0', alignItems: 'center' } });
  container.appendChild(subPillRow);

  // Hide unavailable toggle
  let hideUnavailable = false;
  const toggleRow = el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 8px 0' } });

  const checkBox = el('span', {
    style: {
      display: 'inline-block',
      width: '13px',
      height: '13px',
      borderRadius: '3px',
      border: '1.5px solid currentColor',
      flexShrink: '0',
      position: 'relative',
      top: '1px',
    },
  });
  const toggleBtn = el('button', {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '3px 9px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: '500',
      cursor: 'pointer',
      border: '1px solid var(--border)',
      background: 'transparent',
      color: 'var(--dim)',
      transition: 'all .2s',
    },
  });
  toggleBtn.appendChild(checkBox);
  toggleBtn.appendChild(document.createTextNode('Hide Unavailable'));

  function updateToggleStyle() {
    if (hideUnavailable) {
      toggleBtn.style.color = '#ef4444';
      toggleBtn.style.borderColor = '#ef444466';
      toggleBtn.style.background = '#ef444411';
      checkBox.textContent = '✓';
    } else {
      toggleBtn.style.color = 'var(--dim)';
      toggleBtn.style.borderColor = 'var(--border)';
      toggleBtn.style.background = 'transparent';
      checkBox.textContent = '';
    }
  }

  toggleBtn.addEventListener('click', () => {
    hideUnavailable = !hideUnavailable;
    updateToggleStyle();
    renderData();
  });
  toggleRow.appendChild(toggleBtn);
  container.appendChild(toggleRow);

  const dataDiv = el('div');
  container.appendChild(dataDiv);

  let selectedCategory = null; // null = all, '__unnamed__' = unnamed section
  let selectedSubCategory = null;

  function buildSubCategoryPills() {
    subPillRow.innerHTML = '';
    if (selectedCategory !== 'Equipment') {
      subPillRow.style.display = 'none';
      selectedSubCategory = null;
      return;
    }
    const eqpCat = namedCategories.find((c) => c.category === 'Equipment');
    if (!eqpCat) return;
    const subCats = [...new Set(eqpCat.items.map((i) => i.sub_category).filter(Boolean))].sort();
    if (subCats.length === 0) return;

    subPillRow.style.display = 'flex';
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
    const nameWrap = el('span', {
      style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
    });
    nameWrap.appendChild(
      makeThumbnail(item.thumbnail || `images/items/${String(item.id).padStart(8, '0')}.png`, `${fallbackLabel || item.name} thumbnail`, {
        className: 'item-thumb',
        fallbackText: 'ITEM',
      })
    );
    nameWrap.appendChild(el('span', { className: 'name', textContent: item.name || fallbackLabel || '' }));
    if (item.on_sale === false) {
      nameWrap.appendChild(
        el('span', {
          style: {
            fontSize: '11px',
            padding: '1px 6px',
            borderRadius: '3px',
            background: '#ef444422',
            color: '#ef4444',
            border: '1px solid #ef444444',
            whiteSpace: 'nowrap',
          },
          textContent: 'Unavailable',
        })
      );
    }
    if (item.period && item.period > 0) {
      nameWrap.appendChild(
        el('span', {
          style: {
            fontSize: '11px',
            padding: '1px 6px',
            borderRadius: '3px',
            background: '#f59e0b22',
            color: '#f59e0b',
            border: '1px solid #f59e0b44',
            whiteSpace: 'nowrap',
          },
          textContent: `${item.period}d`,
        })
      );
    }
    topLine.appendChild(nameWrap);
    const csRightWrap = el('span', { style: { display: 'flex', alignItems: 'center', gap: '4px', flexShrink: '0' } });
    csRightWrap.appendChild(makeDeepLinkButton('cashshop', item.id));
    csRightWrap.appendChild(el('span', { className: 'id', textContent: item.id }));
    topLine.appendChild(csRightWrap);
    row.appendChild(topLine);
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
      style: {
        fontSize: '12px',
        color: '#ef4444',
        fontStyle: 'italic',
        margin: '0 0 10px 0',
        padding: '8px 12px',
        background: '#ef444411',
        borderRadius: '6px',
        border: '1px solid #ef444444',
        lineHeight: '1.5',
      },
      textContent:
        'These items were found in the game files but have no name or description (not intended for use). They might never be made available in the cash shop, but they are provided here for speculation',
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
        el('p', {
          style: { color: 'var(--dim)', padding: '20px', textAlign: 'center' },
          textContent: 'No cash shop items match your filters.',
        })
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
  }

  // Pill event listeners
  allTab.addEventListener('click', () => {
    selectedCategory = null;
    allTab.classList.add('active');
    categoryTabs.forEach((btn) => btn.classList.remove('active'));
    unnamedTab.classList.remove('active');
    buildSubCategoryPills();
    renderData();
  });
  categoryTabs.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      selectedCategory = namedCategories[idx].category;
      allTab.classList.remove('active');
      categoryTabs.forEach((b, i) => b.classList.toggle('active', i === idx));
      unnamedTab.classList.remove('active');
      buildSubCategoryPills();
      renderData();
    });
  });
  unnamedTab.addEventListener('click', () => {
    selectedCategory = '__unnamed__';
    allTab.classList.remove('active');
    categoryTabs.forEach((b) => b.classList.remove('active'));
    unnamedTab.classList.add('active');
    buildSubCategoryPills();
    renderData();
  });

  renderData();
  return container;
}
