import { el, matchSearch, makeSearchBox, makeCollapsible, makeThumbnail } from '../lib/utils.js';

export function renderCashShop(data) {
  const { cashShop } = data;
  let searchQuery = '';
  const container = el('div');
  container.appendChild(
    makeSearchBox('Search cash shop...', (value) => {
      searchQuery = value;
      renderData();
    })
  );

  // Pills (quest-style toggles)
  const pillRow = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '16px 0 8px 0', alignItems: 'center' } });
  const allTab = el('button', { className: 'pill active', textContent: 'All' });
  pillRow.appendChild(allTab);
  const categoryTabs = cashShop.categories.map((cat) => {
    const btn = el('button', { className: 'pill', textContent: cat.category });
    pillRow.appendChild(btn);
    return btn;
  });
  container.appendChild(pillRow);
  const dataDiv = el('div');
  container.appendChild(dataDiv);

  let selectedCategory = null; // null = all
  function renderData() {
    dataDiv.innerHTML = '';
    let filtered;
    if (!selectedCategory) {
      filtered = cashShop.categories
        .map((category) => ({
          ...category,
          items: category.items.filter(
            (item) =>
              matchSearch(item.name, searchQuery) || matchSearch(item.description, searchQuery)
          ),
        }))
        .filter((category) => category.items.length > 0);
    } else {
      filtered = cashShop.categories
        .filter((cat) => cat.category === selectedCategory)
        .map((category) => ({
          ...category,
          items: category.items.filter(
            (item) =>
              matchSearch(item.name, searchQuery) || matchSearch(item.description, searchQuery)
          ),
        }))
        .filter((category) => category.items.length > 0);
    }

    const total = filtered.reduce((sum, category) => sum + category.items.length, 0);
    dataDiv.appendChild(el('div', { className: 'count-text', textContent: `${total} items` }));

    filtered.forEach((category) => {
      const content = el('div');
      category.items.forEach((item) => {
        const row = el('div', { className: 'item-row' });
        const topLine = el('div', { className: 'top-line' });
        const nameWrap = el('span', {
          style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
        });
        nameWrap.appendChild(
          makeThumbnail(item.thumbnail || `images/items/${String(item.id).padStart(8, '0')}.png`, `${item.name} thumbnail`, {
            className: 'item-thumb',
            fallbackText: 'ITEM',
          })
        );
        nameWrap.appendChild(el('span', { className: 'name', textContent: item.name }));
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
              textContent: 'Off Sale',
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
        topLine.appendChild(el('span', { className: 'id', textContent: item.id }));
        row.appendChild(topLine);
        if (item.description) {
          row.appendChild(
            el('p', { className: 'desc', textContent: item.description.replace(/\n/g, '\n') })
          );
        }
        content.appendChild(row);
      });

      dataDiv.appendChild(
        makeCollapsible(category.category, category.items.length, true, null, content)
      );
    });
  }

  // Pill event listeners
  allTab.addEventListener('click', () => {
    selectedCategory = null;
    allTab.classList.add('active');
    categoryTabs.forEach((btn) => btn.classList.remove('active'));
    renderData();
  });
  categoryTabs.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      selectedCategory = cashShop.categories[idx].category;
      allTab.classList.remove('active');
      categoryTabs.forEach((b, i) => b.classList.toggle('active', i === idx));
      btn.classList.add('active');
      categoryTabs.forEach((b, i) => { if (i !== idx) b.classList.remove('active'); });
      renderData();
    });
  });
  renderData();
  return container;
}
