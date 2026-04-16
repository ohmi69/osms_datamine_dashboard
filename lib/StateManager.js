// StateManager.js
// Simple state management with pub/sub and localStorage persistence for OSMS Data Explorer

export class StateManager {
  constructor(storageKey = 'mscw-datamine-state') {
    this._storageKey = storageKey;
    this._state = this._load() || {};
    this._listeners = {};
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
    const oldValue = this._state[key];
    this._state[key] = value;
    this._save();
    this._emit(key, value, oldValue);
  }

  subscribe(key, callback) {
    if (!this._listeners[key]) this._listeners[key] = [];
    this._listeners[key].push(callback);
    // Return unsubscribe function
    return () => {
      this._listeners[key] = this._listeners[key].filter(fn => fn !== callback);
    };
  }

  _emit(key, value, oldValue) {
    (this._listeners[key] || []).forEach(fn => fn(value, oldValue));
  }

  getAll() {
    return { ...this._state };
  }
}
