/* Storage on the phone (IndexedDB). Falls back to memory if the browser
 * blocks storage, e.g. some private-browsing modes. */
(function () {
  'use strict';
  var WA = window.WA = window.WA || {};
  var DB = null, useMem = false, mem = { sessions: {}, obs: {} };

  function open() {
    return new Promise(function (res) {
      if (!window.indexedDB) { useMem = true; return res(); }
      var rq;
      try { rq = indexedDB.open('walkaudit', 1); } catch (e) { useMem = true; return res(); }
      rq.onupgradeneeded = function () {
        var d = rq.result;
        if (!d.objectStoreNames.contains('sessions')) d.createObjectStore('sessions', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('obs')) d.createObjectStore('obs', { keyPath: 'id' });
      };
      rq.onsuccess = function () { DB = rq.result; res(); };
      rq.onerror = function () { useMem = true; res(); };
    });
  }

  function run(store, mode, fn) {
    return new Promise(function (res, rej) {
      var t = DB.transaction(store, mode), rq = fn(t.objectStore(store)), out;
      if (rq) rq.onsuccess = function () { out = rq.result; };
      t.oncomplete = function () { res(out); };
      t.onerror = t.onabort = function () { rej(t.error || new Error('storage error')); };
    });
  }

  WA.db = {
    open: open,
    memoryOnly: function () { return useMem; },
    put: function (store, obj) {
      if (useMem) { mem[store][obj.id] = obj; return Promise.resolve(); }
      return run(store, 'readwrite', function (s) { s.put(obj); });
    },
    get: function (store, id) {
      if (useMem) return Promise.resolve(mem[store][id]);
      return run(store, 'readonly', function (s) { return s.get(id); });
    },
    del: function (store, id) {
      if (useMem) { delete mem[store][id]; return Promise.resolve(); }
      return run(store, 'readwrite', function (s) { s.delete(id); });
    },
    all: function (store) {
      if (useMem) return Promise.resolve(Object.keys(mem[store]).map(function (k) { return mem[store][k]; }));
      return run(store, 'readonly', function (s) { return s.getAll(); });
    }
  };
})();
