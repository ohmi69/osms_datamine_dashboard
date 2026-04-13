import { el, makeSearchBox, makeCollapsible, makeThumbnail, makeDeepLinkButton } from '../lib/utils.js';

function parseIdFilter(query) {
  const match = /^id\s*:\s*(\d+)\s*$/i.exec((query || '').trim());
  if (!match) return null;
  return Number(match[1]);
}

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

  const rightWrap = el('span', { style: { display: 'flex', alignItems: 'center', gap: '4px', flexShrink: '0' } });
  rightWrap.appendChild(makeDeepLinkButton('items', item.id));
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

export function renderItems(data, options = {}) {
  const { items } = data;
  let searchQuery = '';
  const container = el('div');
  const scrollIdSet = new Set(items.scrolls.map((scroll) => String(scroll.id)));

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

  // Scroll slot subfilters
  const allScrollSlots = [...new Set(items.scrolls.map((s) => s.equip_slot).filter(Boolean))].sort();
  const scrollSubRow = el('div', { style: { display: 'none', flexWrap: 'wrap', gap: '6px', margin: '0 0 8px 0', alignItems: 'center' } });
  const scrollSubLabel = el('span', { textContent: 'Slot:', style: { fontSize: '0.78rem', color: 'var(--text-muted, #888)', marginRight: '2px' } });
  scrollSubRow.appendChild(scrollSubLabel);
  const scrollAllSlotBtn = el('button', { className: 'pill pill--sub active', textContent: 'All' });
  scrollSubRow.appendChild(scrollAllSlotBtn);
  const scrollSlotBtns = allScrollSlots.map((slot) => {
    const btn = el('button', { className: 'pill pill--sub', textContent: slot });
    scrollSubRow.appendChild(btn);
    return btn;
  });
  container.appendChild(scrollSubRow);

  const dataDiv = el('div');
  container.appendChild(dataDiv);

  let selectedCategory = null; // null = all
  let selectedScrollSlot = null; // null = all slots

  function updateScrollSubRowVisibility() {
    scrollSubRow.style.display = selectedCategory === 'Scrolls' ? 'flex' : 'none';
  }

  function renderData() {
    dataDiv.innerHTML = '';
    const sq = searchQuery.toLowerCase();
    const exactId = parseIdFilter(searchQuery);
    const allItems = items.items.filter(
      (item) =>
        item.category !== 'Equipment' &&
        (exactId != null
          ? Number(item.id) === exactId
          : !sq ||
            item.name.toLowerCase().includes(sq) ||
            (item.description || '').toLowerCase().includes(sq))
    );
    const allScrolls = items.scrolls.filter(
      (scroll) =>
        (selectedScrollSlot == null || scroll.equip_slot === selectedScrollSlot) &&
        (exactId != null
          ? Number(scroll.id) === exactId
          : !sq ||
            scroll.name.toLowerCase().includes(sq) ||
            (scroll.description || '').toLowerCase().includes(sq))
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

    if (dataDiv.children.length === 0) {
      dataDiv.appendChild(
        el('p', {
          style: { color: 'var(--dim)', padding: '20px', textAlign: 'center' },
          textContent: 'No items match your filters.',
        })
      );
    }
  }

  // Scroll slot subfilter listeners
  scrollAllSlotBtn.addEventListener('click', () => {
    selectedScrollSlot = null;
    scrollAllSlotBtn.classList.add('active');
    scrollSlotBtns.forEach((b) => b.classList.remove('active'));
    renderData();
  });
  scrollSlotBtns.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      selectedScrollSlot = allScrollSlots[idx];
      scrollAllSlotBtn.classList.remove('active');
      scrollSlotBtns.forEach((b, i) => b.classList.toggle('active', i === idx));
      renderData();
    });
  });

  // Tab event listeners
  allTab.addEventListener('click', () => {
    selectedCategory = null;
    allTab.classList.add('active');
    categoryTabs.forEach((btn) => btn.classList.remove('active'));
    updateScrollSubRowVisibility();
    renderData();
  });
  categoryTabs.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      selectedCategory = categories[idx];
      allTab.classList.remove('active');
      categoryTabs.forEach((b, i) => b.classList.toggle('active', i === idx));
      btn.classList.add('active');
      categoryTabs.forEach((b, i) => { if (i !== idx) b.classList.remove('active'); });
      updateScrollSubRowVisibility();
      renderData();
    });
  });

  updateScrollSubRowVisibility();
  renderData();
  return container;
}
