// The store persists through zustand's `persist` middleware, which reaches for
// localStorage at module load. Tests run in Node, so stand up a minimal
// in-memory implementation before anything imports the store.

const store = new Map<string, string>();

const memoryLocalStorage: Storage = {
  get length() {
    return store.size;
  },
  key: (index) => [...store.keys()][index] ?? null,
  getItem: (key) => (store.has(key) ? store.get(key)! : null),
  setItem: (key, value) => void store.set(key, String(value)),
  removeItem: (key) => void store.delete(key),
  clear: () => store.clear(),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: memoryLocalStorage,
  writable: true,
});
