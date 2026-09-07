// StateManager.js
// localStorage-backed state for OSMS Data Explorer

export class StateManager {
  constructor(storageKey = 'mscw-datamine-state') {
    this._storageKey = storageKey;
    this._state = this._load() || {};
  }

  _load() {
    try {
      return JSON.parse(localStorage.getItem(this._storageKey) || '{}');
    } catch {
      return {};
    }
  }

  _save() {
    try {
      localStorage.setItem(this._storageKey, JSON.stringify(this._state));
    } catch {}
  }

  get(key, fallback = undefined) {
    return key in this._state ? this._state[key] : fallback;
  }

  set(key, value) {
    this._state[key] = value;
    this._save();
  }
}
