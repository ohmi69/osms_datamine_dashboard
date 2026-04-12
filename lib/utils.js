import { ICONS } from './config.js';

export function el(tag, attrs, ...children) {
  const element = document.createElement(tag);

  if (attrs) {
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'className') {
        element.className = value;
      } else if (key === 'innerHTML') {
        element.innerHTML = value;
      } else if (key === 'textContent') {
        element.textContent = value;
      } else if (key.startsWith('on')) {
        element.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(element.style, value);
      } else if (key === 'title') {
        element.title = value;
      } else {
        element.setAttribute(key, value);
      }
    });
  }

  children.forEach((child) => {
    if (child == null) return;
    if (typeof child === 'string' || typeof child === 'number') {
      element.appendChild(document.createTextNode(child));
    } else if (Array.isArray(child)) {
      child.forEach((nestedChild) => {
        if (nestedChild) element.appendChild(nestedChild);
      });
    } else {
      element.appendChild(child);
    }
  });

  return element;
}

export function $(selector, context) {
  return (context || document).querySelector(selector);
}

export function $$(selector, context) {
  return [...(context || document).querySelectorAll(selector)];
}

export function fmt(value) {
  return typeof value === 'number' ? value.toLocaleString() : value;
}

export function matchSearch(text, query) {
  if (!query) return true;
  if (!text) return false;
  return text.toLowerCase().includes(query.toLowerCase());
}

export function makeSVG(svgString) {
  const template = document.createElement('template');
  template.innerHTML = svgString.trim();
  return template.content.firstChild || document.createTextNode('');
}

export function makeSearchBox(placeholder, onInput) {
  const box = el('div', { className: 'search-box' });
  const iconSpan = el('span', { className: 'search-icon' });
  iconSpan.appendChild(makeSVG(ICONS.search));
  box.appendChild(iconSpan);

  const input = el('input', { type: 'text', placeholder });
  input.addEventListener('input', () => onInput(input.value));
  box.appendChild(input);
  box._input = input;

  return box;
}

function normalizeAssetPath(path) {
  if (!path || typeof path !== 'string') return '';
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  if (path.startsWith('./data/') || path.startsWith('data/')) return path;
  if (path.startsWith('./images/')) return `./data/${path.slice(2)}`;
  if (path.startsWith('images/')) return `./data/${path}`;
  return path;
}

export function makeThumbnail(src, alt, options = {}) {
  const {
    className = '',
    fallbackText = 'N/A',
    title,
  } = options;

  const wrapper = el('span', {
    className: `thumb ${className}`.trim(),
    title: title || alt || 'Image unavailable',
    style: { cursor: 'pointer' },
  });
  const img = el('img', {
    alt: alt || '',
    loading: 'lazy',
    decoding: 'async',
  });
  const fallback = el('span', {
    className: 'thumb-fallback',
    textContent: fallbackText,
    'aria-hidden': 'true',
  });

  const showPlaceholder = () => {
    wrapper.classList.add('is-placeholder');
    img.removeAttribute('src');
  };

  const imagePath = normalizeAssetPath(src);
  if (imagePath) {
    img.addEventListener('error', showPlaceholder, { once: true });
    img.setAttribute('src', imagePath);
  } else {
    wrapper.classList.add('is-placeholder');
  }

  wrapper.appendChild(img);
  wrapper.appendChild(fallback);

  // Modal/lightbox logic
  wrapper.addEventListener('click', (e) => {
    if (wrapper.classList.contains('is-placeholder')) return;
    showImageModal(imagePath, alt);
    e.stopPropagation();
  });

  return wrapper;
}

// Simple modal/lightbox for enlarged images
function showImageModal(src, alt) {
  let modal = document.getElementById('image-modal');
  if (!modal) {
    modal = el('div', { id: 'image-modal', className: 'image-modal' });
    const overlay = el('div', { className: 'image-modal-overlay' });
    const content = el('div', { className: 'image-modal-content' });
    const closeBtn = el('button', { className: 'image-modal-close', title: 'Close' }, '\u00D7');
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', closeModal);
    content.appendChild(closeBtn);
    modal.appendChild(overlay);
    modal.appendChild(content);
    document.body.appendChild(modal);
  }
  const content = modal.querySelector('.image-modal-content');
  // Remove previous image if any
  const oldImg = content.querySelector('img');
  if (oldImg) oldImg.remove();
  // Add new image
  const img = el('img', { src, alt, style: { maxWidth: '90vw', maxHeight: '80vh', display: 'block', margin: '0 auto' } });
  content.appendChild(img);
  modal.classList.add('open');
  function closeModal() {
    modal.classList.remove('open');
  }
  // ESC key closes modal
  function escListener(e) {
    if (e.key === 'Escape') closeModal();
  }
  document.addEventListener('keydown', escListener, { once: true });
}

export function makeCollapsible(title, count, defaultOpen, badgeText, content) {
  const section = el('div', { className: `collapsible${defaultOpen ? ' open' : ''}` });
  const header = el('button', { className: 'collapsible-header' });

  const left = el('span', { className: 'left' });
  left.appendChild(el('span', { className: 'title', textContent: title }));
  if (badgeText) {
    left.appendChild(el('span', { className: 'badge-label', textContent: badgeText }));
  }

  const right = el('span', { className: 'right' });
  if (count !== undefined && count !== null) {
    right.appendChild(el('span', { className: 'count', textContent: count }));
  }
  right.innerHTML += `<span class="chevron">${ICONS.chevronRight}</span>`;

  header.appendChild(left);
  header.appendChild(right);
  header.addEventListener('click', () => section.classList.toggle('open'));
  section.appendChild(header);

  const body = el('div', { className: 'collapsible-body' });
  if (typeof content === 'function') {
    let rendered = false;
    const observer = new MutationObserver(() => {
      if (section.classList.contains('open') && !rendered) {
        rendered = true;
        body.appendChild(content());
      }
    });
    observer.observe(section, { attributes: true, attributeFilter: ['class'] });
    if (defaultOpen) {
      rendered = true;
      body.appendChild(content());
    }
  } else {
    body.appendChild(content);
  }

  section.appendChild(body);
  return section;
}
