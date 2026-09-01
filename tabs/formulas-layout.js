import { el, tabHref } from '../lib/utils.js';

const PAGE_KEYS = new Set(['accuracy', 'dealing-damage', 'damage-taken', 'progression']);

function routeTarget(page, section = null) {
  const target = page ? { page } : {};
  if (section) target.section = section;
  return tabHref('formulas', target);
}

function pageLink(page, className = '') {
  const link = el('a', {
    className: `formulas-page-link tab-link${className ? ` ${className}` : ''}`,
    href: routeTarget(page.key),
  });
  link.dataset.formulaPage = page.key;
  link.appendChild(el('span', { className: 'formulas-page-link-title', textContent: page.label }));
  return link;
}

function buildIndex(pages, archived) {
  const index = el('div', { className: 'formulas-index' });
  const intro = el('div', { className: 'formulas-index-intro' });
  intro.appendChild(el('h2', { textContent: 'Formula Index' }));
  intro.appendChild(el('p', {
    textContent: archived
      ? 'Choose a topic to browse the formulas and tables preserved from Closed Online Test 1.'
      : 'Browse the client formulas by mechanic.',
  }));
  index.appendChild(intro);

  const directory = el('div', { className: 'formulas-index-directory' });
  [
    { label: 'Combat', pages: pages.filter(page => page.key !== 'progression') },
    { label: 'Reference', pages: pages.filter(page => page.key === 'progression') },
  ].forEach((group) => {
    const block = el('div', { className: 'formulas-index-group' });
    block.appendChild(el('div', { className: 'formulas-index-group-label', textContent: group.label }));
    const rows = el('div', { className: 'formulas-index-rows' });
    group.pages.forEach((page) => {
      const row = el('a', { className: 'formulas-index-row tab-link', href: routeTarget(page.key) });
      row.appendChild(el('strong', { textContent: page.label }));
      row.appendChild(el('span', { textContent: page.description }));
      row.appendChild(el('span', { className: 'formulas-index-row-action', textContent: 'View' }));
      rows.appendChild(row);
    });
    block.appendChild(rows);
    directory.appendChild(block);
  });
  index.appendChild(directory);
  return index;
}

function buildJumpNav(page) {
  if (!page.sections?.length) return null;
  const nav = el('nav', { className: 'formulas-jump-nav', 'aria-label': `${page.label} sections` });
  nav.appendChild(el('span', { className: 'formulas-jump-label', textContent: 'On this page' }));
  const links = el('div', { className: 'formulas-jump-links' });
  page.sections.forEach((section) => {
    const link = el('a', {
      className: 'formulas-jump-link tab-link',
      href: routeTarget(page.key, section.key),
      textContent: section.label,
    });
    link.dataset.formulaSection = section.key;
    links.appendChild(link);
  });
  nav.appendChild(links);
  return nav;
}

function scrollToSection(outlet, sectionKey) {
  if (!sectionKey) return false;
  const target = outlet.querySelector(`[data-formula-section-id="${sectionKey}"]`);
  if (!target) return false;
  // The tab panel is assembled in a fragment. Wait until both it and any lazy
  // table/chart layout are in the document before measuring the destination.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const header = document.querySelector('.site-header');
    const jump = outlet.querySelector('.formulas-jump-nav');
    const offset = (header?.offsetHeight || 0) + (jump?.offsetHeight || 0) + 16;
    target.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -offset);
  }));
  return true;
}

function observeSections(outlet, jumpNav) {
  if (!jumpNav || !('IntersectionObserver' in window)) return null;
  const links = [...jumpNav.querySelectorAll('[data-formula-section]')];
  const sections = [...outlet.querySelectorAll('[data-formula-section-id]')];
  if (!links.length || !sections.length) return null;

  const setActive = (key) => {
    links.forEach(link => link.classList.toggle('active', link.dataset.formulaSection === key));
  };
  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter(entry => entry.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible[0]) setActive(visible[0].target.dataset.formulaSectionId);
  }, { rootMargin: '-140px 0px -65% 0px', threshold: [0, 0.01] });
  sections.forEach(section => observer.observe(section));
  return observer;
}

export function markFormulaSection(node, key) {
  node.dataset.formulaSectionId = key;
  node.id = `formula-${key}`;
  return node;
}

export function buildDamageFlow() {
  const flow = el('div', { className: 'formulas-flow', 'aria-label': 'Outgoing damage calculation order' });
  ['Accuracy', 'Base roll', 'Defense & elements', 'Hit effects', 'Final damage'].forEach((label, i, items) => {
    flow.appendChild(el('span', { className: 'formulas-flow-step', textContent: label }));
    if (i < items.length - 1) flow.appendChild(el('span', { className: 'formulas-flow-arrow', textContent: '→', 'aria-hidden': 'true' }));
  });
  return flow;
}

export function createFormulaBrowser({ pages, initialParams, setNavigate, notice, archived = false }) {
  const frag = document.createDocumentFragment();
  const wrapper = el('div', { className: 'formulas-page' });
  wrapper.appendChild(el('div', { className: 'section-heading', textContent: 'Formulas & Tables' }));

  const nav = el('nav', { className: 'formulas-subnav', 'aria-label': 'Formula pages' });
  const indexLink = el('a', {
    className: 'formulas-page-link tab-link',
    href: routeTarget(null),
  });
  indexLink.dataset.formulaPage = '';
  indexLink.appendChild(el('span', { className: 'formulas-page-link-title', textContent: 'Index' }));
  nav.appendChild(indexLink);
  pages.forEach(page => nav.appendChild(pageLink(page)));
  wrapper.appendChild(nav);
  wrapper.appendChild(notice);

  const outlet = el('div', { className: 'formulas-page-outlet' });
  wrapper.appendChild(outlet);

  const pageMap = new Map(pages.map(page => [page.key, page]));
  const pageCache = new Map();
  let activePage = null;
  let sectionObserver = null;

  const renderRoute = (route = null) => {
    const params = route instanceof URLSearchParams
      ? route
      : new URLSearchParams(route && typeof route === 'object' ? route : undefined);
    const requestedPage = params.get('page') || '';
    const pageKey = PAGE_KEYS.has(requestedPage) && pageMap.has(requestedPage) ? requestedPage : '';
    const page = pageMap.get(pageKey);
    const sectionKey = params.get('section') || '';

    nav.classList.toggle('hidden', !page);

    nav.querySelectorAll('[data-formula-page]').forEach(link => {
      const selected = link.dataset.formulaPage === pageKey;
      link.classList.toggle('active', selected);
      if (selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    if (activePage !== pageKey) {
      sectionObserver?.disconnect();
      outlet.textContent = '';
      if (!page) {
        outlet.appendChild(buildIndex(pages, archived));
      } else {
        const pageWrap = el('div', { className: 'formulas-subpage' });
        const head = el('header', { className: 'formulas-subpage-head' });
        head.appendChild(el('div', { className: 'formulas-subpage-kicker', textContent: page.kicker }));
        head.appendChild(el('h1', { textContent: page.label }));
        head.appendChild(el('p', { textContent: page.description }));
        pageWrap.appendChild(head);
        if (page.flow) pageWrap.appendChild(page.flow());
        const jumpNav = buildJumpNav(page);
        if (jumpNav) pageWrap.appendChild(jumpNav);
        if (!pageCache.has(pageKey)) pageCache.set(pageKey, page.render());
        pageWrap.appendChild(pageCache.get(pageKey));
        outlet.appendChild(pageWrap);
        sectionObserver = observeSections(outlet, jumpNav);
      }
      activePage = pageKey;
      if (!sectionKey) window.scrollTo(0, 0);
    }

    outlet.querySelectorAll('[data-formula-section]').forEach(link => {
      link.classList.toggle('active', link.dataset.formulaSection === sectionKey);
    });
    const foundSection = scrollToSection(outlet, sectionKey);
    if (sectionKey && !foundSection) window.scrollTo(0, 0);
  };

  if (setNavigate) setNavigate(renderRoute);
  renderRoute(initialParams);
  frag.appendChild(wrapper);
  return frag;
}
