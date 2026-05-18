
import { el, padMapId } from '../../lib/utils.js';
import { getDataBase, getMapUrl } from '../../lib/data.js';

export function getAllMapsFlat(data) {
  return data.maps.regions.flatMap(r => r.maps);
}

function findMapInData(data, query) {
  if (!query) return null;
  const all = getAllMapsFlat(data);
  if (/^\d+$/.test(query)) return all.find(m => String(m.id) === String(query));
  return all.find(m => (m.name || '').toLowerCase() === query.toLowerCase());
}

function buildMapGraph(data) {
  const graph = {};
  for (const m of getAllMapsFlat(data)) {
    graph[m.id] = Array.isArray(m.exits) ? m.exits.slice() : [];
  }
  return graph;
}

function findShortestPath(graph, fromId, toId) {
  const queue = [[fromId]];
  const visited = new Set([fromId]);
  while (queue.length) {
    const path = queue.shift();
    const last = path[path.length - 1];
    if (last === toId) return path;
    for (const n of graph[last] || []) {
      if (!visited.has(n)) {
        visited.add(n);
        queue.push([...path, n]);
      }
    }
  }
  return null;
}

function makeMapAutocomplete(input, allMaps, mapNames) {
  let listDiv = null;
  let activeIdx = -1;
  input.setAttribute('autocomplete', 'off');
  input.addEventListener('input', showList);
  input.addEventListener('keydown', onKey);
  input.addEventListener('blur', () => setTimeout(hideList, 120));
  input.addEventListener('focus', showList);

  function showList() {
    const val = input.value.trim();
    const valLower = val.toLowerCase();
    let matches = !valLower
      ? mapNames.slice(0, 20)
      : mapNames.filter(n => n.toLowerCase().includes(valLower)).slice(0, 20);
    if (/^\d+$/.test(val)) {
      const map = allMaps.find(m => m.id === Number(val));
      if (map && !matches.includes(map.name)) {
        matches = [map.name, ...matches.filter(n => n !== map.name)];
      }
    }
    if (!listDiv) {
      listDiv = el('div', { className: 'mapnav-autocomplete-list' });
      input.parentNode.insertBefore(listDiv, input.nextSibling);
    }
    listDiv.innerHTML = '';
    activeIdx = -1;
    matches.forEach((name) => {
      const item = el('div', { className: 'mapnav-autocomplete-item', textContent: name });
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        input.value = name;
        hideList();
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      listDiv.appendChild(item);
    });
    listDiv.classList.toggle('hidden', !matches.length);
  }
  function hideList() {
    if (listDiv) listDiv.classList.add('hidden');
  }
  function onKey(e) {
    if (!listDiv || listDiv.classList.contains('hidden')) return;
    const items = listDiv.querySelectorAll('.mapnav-autocomplete-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      activeIdx = (activeIdx + 1) % items.length;
      updateActive();
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      activeIdx = (activeIdx - 1 + items.length) % items.length;
      updateActive();
      e.preventDefault();
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      items[activeIdx].dispatchEvent(new MouseEvent('mousedown'));
      e.preventDefault();
    }
  }
  function updateActive() {
    const items = listDiv.querySelectorAll('.mapnav-autocomplete-item');
    items.forEach((item, i) => item.classList.toggle('active', i === activeIdx));
    if (activeIdx >= 0 && items[activeIdx]) {
      items[activeIdx].scrollIntoView({ block: 'nearest' });
    }
  }
}

export function showNavigateModal(data, defaultToId) {
  const allMaps = getAllMapsFlat(data);
  const mapNames = allMaps.map(m => m.name);

  const modal = el('div', { className: 'mapnav-modal-overlay' });
  modal.addEventListener('mousedown', (e) => { if (e.target === modal) modal.remove(); });

  const box = el('div', { className: 'mapnav-modal-box' });
  const xBtn = el('button', { textContent: '×', title: 'Close', className: 'mapnav-modal-close' });
  xBtn.onclick = () => modal.remove();
  box.appendChild(xBtn);
  box.appendChild(el('h2', { textContent: 'Navigate Maps', className: 'mapnav-modal-title' }));

  const fromWrap = el('div', { className: 'mapnav-input-wrap' });
  const toWrap = el('div', { className: 'mapnav-input-wrap' });
  const fromInput = el('input', { type: 'text', placeholder: 'From map name or ID', className: 'mapnav-modal-input' });
  const toInput = el('input', { type: 'text', placeholder: 'To map name or ID', className: 'mapnav-modal-input' });
  fromWrap.appendChild(fromInput);
  toWrap.appendChild(toInput);
  box.appendChild(fromWrap);
  box.appendChild(toWrap);
  makeMapAutocomplete(fromInput, allMaps, mapNames);
  makeMapAutocomplete(toInput, allMaps, mapNames);
  if (defaultToId) {
    const m = allMaps.find(m => m.id === defaultToId);
    if (m) toInput.value = m.name;
  }

  const btnRow = el('div', { className: 'mapnav-modal-btnrow' });
  const goBtn = el('button', { textContent: 'Find Route', className: 'mapnav-modal-find' });
  const closeBtn = el('button', { textContent: 'Close', className: 'mapnav-modal-closebtn' });
  btnRow.appendChild(goBtn);
  btnRow.appendChild(closeBtn);
  box.appendChild(btnRow);

  const resultDiv = el('div', { className: 'mapnav-modal-result' });
  box.appendChild(resultDiv);
  modal.appendChild(box);
  document.body.appendChild(modal);

  closeBtn.onclick = () => modal.remove();
  fromInput.addEventListener('keydown', e => { if (e.key === 'Enter') goBtn.click(); });
  toInput.addEventListener('keydown', e => { if (e.key === 'Enter') goBtn.click(); });

  goBtn.onclick = async () => {
    const from = findMapInData(data, fromInput.value.trim());
    const to = findMapInData(data, toInput.value.trim());
    if (!from || !to) {
      resultDiv.textContent = 'Please enter valid map names or IDs.';
      return;
    }
    const graph = buildMapGraph(data);
    const path = findShortestPath(graph, from.id, to.id);
    if (!path) {
      resultDiv.textContent = 'No route found.';
      return;
    }
    if (!window._allPortalsCache) {
      try {
        const res = await fetch(`${getDataBase()}/portals.json`);
        window._allPortalsCache = res.ok ? await res.json() : {};
      } catch {
        window._allPortalsCache = {};
      }
    }
    const allPortals = window._allPortalsCache || {};
    resultDiv.innerHTML = '';

    for (let i = 0; i < path.length; ++i) {
      const map = allMaps.find(m => m.id === path[i]);
      if (!map) continue;

      const stepDiv = el('div', { className: 'navigate-step' });
      stepDiv.appendChild(el('div', { className: 'navigate-step-header', textContent: `Step ${i + 1}: ${map.name}` }));

      const imgPath = getMapUrl(map.id);
      const img = el('img', { src: imgPath, alt: map.name, className: 'navigate-step-img' });
      img.addEventListener('load', () => {
        stepDiv.querySelectorAll('.portal-highlight').forEach(o => o.remove());
        if (i < path.length - 1) {
          const portals = allPortals[padMapId(map.id)] || [];
          const portal = portals.find(p => String(p.dest_map) === String(path[i + 1]));
          if (portal) {
            const scaleX = img.width / img.naturalWidth;
            const scaleY = img.height / img.naturalHeight;
            const navR = Math.max(7, Math.min(16, Math.round(8 + 14 * Math.min(scaleX, scaleY))));
            const overlay = el('div', { className: 'portal-highlight' });
            overlay.style.left = `${img.offsetLeft + portal.x * scaleX - navR}px`;
            overlay.style.top = `${img.offsetTop + portal.y * scaleY - navR}px`;
            overlay.style.width = `${navR * 2}px`;
            overlay.style.height = `${navR * 2}px`;
            overlay.style.border = `${Math.max(1, Math.round(3 * Math.min(scaleX, scaleY)))}px solid #00e0ff`;
            img.parentElement.appendChild(overlay);
          }
        }
      });

      const imgWrap = el('div', { className: 'navigate-step-img-wrap' });
      imgWrap.appendChild(img);
      stepDiv.appendChild(imgWrap);

      if (i === path.length - 1) {
        stepDiv.appendChild(el('div', { className: 'navigate-step-destination', textContent: 'Destination reached.' }));
      }
      resultDiv.appendChild(stepDiv);
    }
  };
}
