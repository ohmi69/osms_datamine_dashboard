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
