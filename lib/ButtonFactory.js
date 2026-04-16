// ButtonFactory.js
// Utility for creating buttons and binding events

export function createToggleButton({label, onClick, active = false, className = ''}) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.className = `toggle-btn ${active ? 'active' : ''} ${className}`.trim();
  btn.type = 'button';
  btn.addEventListener('click', onClick);
  return btn;
}

export function createNavButton({tabId, label, onClick, className = ''}) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.className = `nav-btn ${className}`.trim();
  btn.type = 'button';
  btn.dataset.tab = tabId;
  btn.addEventListener('click', onClick);
  return btn;
}
