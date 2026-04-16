// ThemeManager.js
// Centralizes theme management logic for the app

const THEME_KEY = 'theme';

export const ThemeManager = {
  setTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem(THEME_KEY, themeName);
  },
  getTheme() {
    // Default to 'mapletip' (light theme)
    return localStorage.getItem(THEME_KEY) || 'mapletip';
  },
  toggleTheme() {
    const current = this.getTheme();
    const next = current === 'dark' ? 'mapletip' : 'dark';
    this.setTheme(next);
  },
  applyTheme() {
    this.setTheme(this.getTheme());
  }
};

// On load, apply saved theme
ThemeManager.applyTheme();
