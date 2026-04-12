import { el, makeCollapsible, makeThumbnail, makeSearchBox } from '../lib/utils.js';

export function renderMaps(data) {
  const { maps } = data;
  const container = el('div');
  container.appendChild(
    el('div', {
      className: 'count-text',
      textContent: `${maps.total} maps across ${maps.regions.length} regions`,
    })
  );

  let searchQuery = '';
  container.appendChild(
    makeSearchBox('Search maps...', (value) => {
      searchQuery = value;
      renderData();
    })
  );

  // Pills (quest-style toggles)
  const pillRow = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '16px 0 8px 0', alignItems: 'center' } });
  const allTab = el('button', { className: 'pill active', textContent: 'All' });
  pillRow.appendChild(allTab);
  const regionTabs = maps.regions.map((region) => {
    const btn = el('button', { className: 'pill', textContent: region.region });
    pillRow.appendChild(btn);
    return btn;
  });
  container.appendChild(pillRow);

  const dataDiv = el('div');
  container.appendChild(dataDiv);

  let selectedRegion = null; // null = all

  function renderMapEntry(mapEntry) {
    const row = el('div', {
      className: 'item-row',
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
    });
    const left = el('div', {
      style: { display: 'flex', alignItems: 'center', gap: '10px', minWidth: '0' },
    });
    left.appendChild(
      makeThumbnail(mapEntry.thumbnail || mapEntry.minimap, `${mapEntry.name} thumbnail`, {
        className: 'map-thumb',
        fallbackText: 'MAP',
      })
    );
    const textWrap = el('div');
    textWrap.appendChild(
      el('span', { style: { fontSize: '15px' }, textContent: mapEntry.name || '(unnamed)' })
    );
    if (mapEntry.street_name) {
      textWrap.appendChild(
        el('span', {
          style: { fontSize: '13px', color: 'var(--dim)', marginLeft: '8px' },
          textContent: `— ${mapEntry.street_name}`,
        })
      );
    }
    left.appendChild(textWrap);
    row.appendChild(left);
    row.appendChild(
      el('span', {
        className: 'id',
        style: { flexShrink: '0', marginLeft: '8px' },
        textContent: mapEntry.id,
      })
    );
    return row;
  }

  function renderData() {
    dataDiv.innerHTML = '';
    const sq = searchQuery.toLowerCase();
    let regions = selectedRegion
      ? maps.regions.filter((r) => r.region === selectedRegion)
      : maps.regions;
    regions.forEach((region) => {
      const filtered = sq
        ? region.maps.filter(
            (m) =>
              (m.name || '').toLowerCase().includes(sq) ||
              (m.street_name || '').toLowerCase().includes(sq)
          )
        : region.maps;
      if (!filtered.length) return;
      const content = el('div');
      filtered.forEach((mapEntry) => content.appendChild(renderMapEntry(mapEntry)));
      dataDiv.appendChild(makeCollapsible(region.region, filtered.length, true, null, content));
    });
  }

  // Tab event listeners
  allTab.addEventListener('click', () => {
    selectedRegion = null;
    allTab.classList.add('active');
    regionTabs.forEach((btn) => btn.classList.remove('active'));
    renderData();
  });
  regionTabs.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      selectedRegion = maps.regions[idx].region;
      allTab.classList.remove('active');
      regionTabs.forEach((b, i) => b.classList.toggle('active', i === idx));
      btn.classList.add('active');
      regionTabs.forEach((b, i) => { if (i !== idx) b.classList.remove('active'); });
      renderData();
    });
  });

  renderData();
  return container;
}
