import { el, makeSearchBox, makeCollapsible, makeThumbnail } from '../lib/utils.js';

const STAT_LABELS = {
  price:      ['Sell Price',      (v) => v.toLocaleString() + ' mesos'],
  unitPrice:  ['Recharge Price', (v) => v.toLocaleString() + ' mesos per unit'],
  slotMax:    ['Stack Size', (v) => v.toLocaleString()],
  tradeBlock: ['Trade',      ()  => 'Untradeable'],
  only:       ['Limit',      ()  => 'Only 1'],
  timeLimited:['Duration',   ()  => 'Time Limited'],
  notSale:    ['Shop',       ()  => 'Not for Sale'],
  recovery:   ['Recovery',   (v) => `+${v}`],
};

function buildDetailPanel(item) {
  const stats = item.stats || {};
  const chips = [];
  console.log(item);
  for (const [key, [label, fmt]] of Object.entries(STAT_LABELS)) {
    const val = stats[key];
    if (val == null || val === 0 || val === false) continue;
    chips.push({ label, value: fmt(val) });
  }

  if (chips.length === 0) return null;

  const panel = el('div', { className: 'item-detail-panel' });
  const row = el('div', { className: 'item-detail-chips' });

  for (const { label, value } of chips) {
    const chip = el('div', { className: 'item-detail-chip' });
    chip.appendChild(el('span', { className: 'chip-label', textContent: label }));
    chip.appendChild(el('span', { className: 'chip-value', textContent: value }));
    row.appendChild(chip);
  }

  panel.appendChild(row);
  return panel;
}

function renderItemRow(item) {
  const row = el('div', { className: 'item-row' });
  const topLine = el('div', { className: 'top-line' });
  const nameWrap = el('span', {
    style: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: '0' },
  });
  nameWrap.appendChild(
    makeThumbnail(item.thumbnail, `${item.name} thumbnail`, {
      className: 'item-thumb',
      fallbackText: 'ITEM',
    })
  );
  nameWrap.appendChild(el('span', { className: 'name', textContent: item.name }));
  topLine.appendChild(nameWrap);

  const rightWrap = el('span', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: '0' } });
  rightWrap.appendChild(el('span', { className: 'id', textContent: item.id }));

  topLine.appendChild(rightWrap);
  row.appendChild(topLine);

  if (item.description) {
    row.appendChild(
      el('p', { className: 'desc', textContent: item.description.replace(/\n/g, '\n') })
    );
  }

  const panel = buildDetailPanel(item);
  if (panel) row.appendChild(panel);
  return row;
}

export function renderItems(data) {
  const { items } = data;
  let searchQuery = '';
  const container = el('div');
  const scrollIdSet = new Set(items.scrolls.map((scroll) => String(scroll.id)));

  container.appendChild(
    makeSearchBox('Search items...', (value) => {
      searchQuery = value;
      renderData();
    })
  );

  // Pills (quest-style toggles)
  const pillRow = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '16px 0 8px 0', alignItems: 'center' } });
  const allTab = el('button', { className: 'pill active', textContent: 'All' });
  pillRow.appendChild(allTab);
  const categories = ['Scrolls', 'Consumables', 'Etc', 'Setup'];
  const categoryTabs = categories.map((cat) => {
    const btn = el('button', { className: 'pill', textContent: cat });
    pillRow.appendChild(btn);
    return btn;
  });
  container.appendChild(pillRow);

  const dataDiv = el('div');
  container.appendChild(dataDiv);

  let selectedCategory = null; // null = all

  function renderData() {
    dataDiv.innerHTML = '';
    const sq = searchQuery.toLowerCase();
    const allItems = items.items.filter(
      (item) =>
        item.category !== 'Equipment' &&
        (!sq ||
          item.name.toLowerCase().includes(sq) ||
          (item.description || '').toLowerCase().includes(sq))
    );
    const allScrolls = items.scrolls.filter(
      (scroll) =>
        !sq ||
        scroll.name.toLowerCase().includes(sq) ||
        (scroll.description || '').toLowerCase().includes(sq)
    );
    const consumables = allItems.filter(
      (item) => item.category === 'Consumable' && !scrollIdSet.has(String(item.id))
    );
    const etcItems = allItems.filter((item) => item.category === 'Etc');
    const setupItems = allItems.filter((item) => item.category === 'Setup');

    if (!selectedCategory || selectedCategory === 'Scrolls') {
      if (allScrolls.length > 0) {
        const scrollContent = el('div');
        allScrolls.forEach((scroll) => {
          const item = {
            ...scroll,
            sub_category: [scroll.tier, scroll.equip_slot, scroll.stat_type]
              .filter(Boolean)
              .join(' · '),
          };
          scrollContent.appendChild(renderItemRow(item));
        });
        dataDiv.appendChild(
          makeCollapsible('Scrolls', allScrolls.length, true, null, scrollContent)
        );
      }
    }

    if (!selectedCategory || selectedCategory === 'Consumables') {
      if (consumables.length > 0) {
        const conContent = el('div');
        consumables.forEach((item) => conContent.appendChild(renderItemRow(item)));
        dataDiv.appendChild(
          makeCollapsible('Consumables', consumables.length, true, null, conContent)
        );
      }
    }

    if (!selectedCategory || selectedCategory === 'Etc') {
      if (etcItems.length > 0) {
        const etcContent = el('div');
        etcItems.forEach((item) => etcContent.appendChild(renderItemRow(item)));
        dataDiv.appendChild(makeCollapsible('Etc', etcItems.length, true, null, etcContent));
      }
    }

    if (!selectedCategory || selectedCategory === 'Setup') {
      if (setupItems.length > 0) {
        const setupContent = el('div');
        setupItems.forEach((item) => setupContent.appendChild(renderItemRow(item)));
        dataDiv.appendChild(
          makeCollapsible('Setup', setupItems.length, true, null, setupContent)
        );
      }
    }
  }

  // Tab event listeners
  allTab.addEventListener('click', () => {
    selectedCategory = null;
    allTab.classList.add('active');
    categoryTabs.forEach((btn) => btn.classList.remove('active'));
    renderData();
  });
  categoryTabs.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      selectedCategory = categories[idx];
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
