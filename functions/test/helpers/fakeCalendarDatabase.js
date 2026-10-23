import assert from 'node:assert/strict';

export function fakeDatabase() {
  const documents = new Map(), versions = new Map();
  const clone = value => value === undefined ? undefined : structuredClone(value);
  const write = (path, value, options) => {
    documents.set(path, options?.merge ? { ...documents.get(path), ...clone(value) } : clone(value));
    versions.set(path, (versions.get(path) || 0) + 1);
    const parent = path.slice(0, path.lastIndexOf('/'));
    versions.set(parent, (versions.get(parent) || 0) + 1);
  };
  const snapshot = path => ({ exists: documents.has(path), data: () => clone(documents.get(path)) });
  const db = {
    documents, write, beforeCommit: null,
    doc(path) { return { path, get: async () => snapshot(path), set: async (value, options) => write(path, value, options) }; },
    collection(path) { return {
      where(field, operator, value) {
        assert.ok(['==', '>'].includes(operator));
        let limit = Infinity;
        const query = { path, isQuery: true, limit(count) { limit = count; return query; }, async get() {
          const docs = [...documents].filter(([key, data]) => key.startsWith(path + '/')
            && !key.slice(path.length + 1).includes('/') && (operator === '==' ? data[field] === value : data[field] > value)).slice(0, limit)
            .map(([key]) => ({ ...snapshot(key), id: key.split('/').at(-1) }));
          return { docs, empty: !docs.length };
        } };
        return query;
      },
    }; },
    async runTransaction(callback) {
      for (let retry = 0; retry < 30; retry++) {
        const readVersions = new Map(), staged = [];
        const result = await callback({
          async get(ref) {
            assert.equal(staged.length, 0, '全読取は書込より前');
            readVersions.set(ref.path, versions.get(ref.path) || 0);
            return ref.isQuery ? ref.get() : snapshot(ref.path);
          },
          set(ref, data, options) { staged.push([ref.path, data, options]); },
        });
        if (db.beforeCommit) { const callback = db.beforeCommit; db.beforeCommit = null; callback(); }
        if ([...readVersions].some(([path, version]) => (versions.get(path) || 0) !== version)) continue;
        staged.forEach(args => write(...args));
        return result;
      }
      throw new Error('fixture-transaction-contention');
    },
    batch() {
      const staged = [];
      return { update: (ref, value) => staged.push([ref.path, value, { merge: true }]), commit: async () => staged.forEach(args => write(...args)) };
    },
  };
  return db;
}
