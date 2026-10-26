import { el, makeCollapsible } from '../lib/utils.js';

// Everything on this page is read from data/api/v1/meta.json, which the pipeline
// writes alongside the dataset, so it can never describe files that aren't there.
const API_BASE = 'https://osmsdataexplorer.com/data/api/v1/';
const LOCAL_BASE = './data/api/v1/';
const SITE_URL = 'https://osmsdataexplorer.com';

function link(href, text) {
  return el('a', { className: 'api-link', href, target: '_blank', rel: 'noopener', textContent: text });
}

// makeCopyableId's `.id` spans hide with the "Show IDs" toggle; these values must always show.
function copyable(text, className = '') {
  const code = el('code', { className: `api-copy ${className}`.trim(), textContent: text, title: 'Click to copy' });
  code.addEventListener('click', () => {
    navigator.clipboard?.writeText(text).then(() => {
      code.classList.add('api-copy--copied');
      setTimeout(() => code.classList.remove('api-copy--copied'), 1000);
    }).catch(() => {});
  });
  return code;
}

function formatBytes(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatTime(iso) {
  return iso ? iso.replace('T', ' ').replace('Z', ' UTC') : '-';
}

function row(label, ...value) {
  return el('div', { className: 'api-row' },
    el('span', { className: 'api-row-label', textContent: label }),
    el('span', { className: 'api-row-value' }, ...value));
}

function buildOverview(meta) {
  return el('div', { className: 'api-card' },
    row('Base URL', copyable(API_BASE)),
    row('Docs', link(`${API_BASE}README.md`, 'README.md'), ' · ', link(`${API_BASE}meta.json`, 'meta.json')),
    row('Client build', copyable(meta.client_build || '-')),
    row('Last modified', el('span', { textContent: formatTime(meta.data_updated_at) })),
    row('Schema', el('span', { textContent: `v${meta.schema_version}` })),
    row('License', link(`${API_BASE}LICENSE`, 'CC BY 4.0')),
    el('p', { className: 'api-note' },
      'Would appreciate a credit to @ohmi, with a link to ', link(SITE_URL, SITE_URL),
      ' wherever this data is used. Game content is © Nexon. Unofficial; not affiliated with Nexon.'),
  );
}

function buildHowToUse() {
  return el('div', { className: 'api-card' },
    el('div', { className: 'api-callout' },
      el('strong', { textContent: 'Start with the README. ' }),
      link(`${API_BASE}README.md`, `${API_BASE}README.md`),
      el('div', { className: 'api-callout-sub', textContent: 'It describes every file, field, unit and ID convention. Developers and AI agents should read it before using the data.' })));
}

function buildFiles(meta) {
  const tbody = el('tbody');
  Object.entries(meta.files || {}).forEach(([name, info]) => {
    tbody.appendChild(el('tr', {},
      el('td', {}, link(`${API_BASE}${name}`, name)),
      el('td', { className: 'num', textContent: info.records != null ? info.records.toLocaleString() : '-' }),
      el('td', { className: 'num', textContent: formatBytes(info.bytes) }),
      el('td', { textContent: formatTime(info.updated_at) }),
      el('td', {}, copyable(info.sha256, 'api-hash'))));
  });
  return el('div', { className: 'table-scroll' },
    el('table', { className: 'data-table api-table' },
      el('thead', {}, el('tr', {},
        ...['File', 'Records', 'Size', 'Updated', 'SHA-256'].map((h) => el('th', { textContent: h })))),
      tbody));
}

export function renderApi() {
  const container = el('div', { className: 'api-page' });
  container.appendChild(makeCollapsible('How to Use', null, true, null, buildHowToUse()));
  const status = el('p', { className: 'empty-state', textContent: 'Loading…' });
  container.appendChild(status);

  fetch(`${LOCAL_BASE}meta.json`, { cache: 'no-cache' })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((meta) => {
      status.remove();
      container.appendChild(makeCollapsible('Data API', null, true, null, buildOverview(meta)));
      container.appendChild(makeCollapsible('Files', Object.keys(meta.files || {}).length, true, null, buildFiles(meta)));
    })
    .catch((err) => { status.textContent = `Could not load meta.json (${err.message}).`; });
  return container;
}
