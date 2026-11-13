/* Sends saved work to the shared Google Sheet (backend/Code.gs).
 * Everything is saved on the phone first; this only copies it out.
 * If no sheet is configured, sync is off and the app still works. */
(function () {
  'use strict';
  var WA = window.WA = window.WA || {};
  var cfg = window.WA_CONFIG || {};
  var busy = false, again = false, timer = null, listeners = [];
  var status = { state: 'off', error: '' };   // off | idle | sending | sent | waiting | error

  function isLocal() { return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname); }
  function qp(name) { try { return new URLSearchParams(location.search).get(name) || ''; } catch (e) { return ''; } }
  /* The ?s= override is honored on localhost only, for testing. A shared link
   * must not be able to redirect residents' data to another server. */
  function url() { return (isLocal() && qp('s')) || cfg.syncUrl || ''; }
  function key() { return (isLocal() && qp('k')) || cfg.key || ''; }
  function on() { return !!url(); }

  function set(state, error) {
    status = { state: state, error: error || '' };
    listeners.forEach(function (fn) { try { fn(status); } catch (e) {} });
  }

  /* No headers on purpose: a plain-text POST needs no CORS preflight, which
   * Google Apps Script cannot answer. */
  function post(payload) {
    payload.key = key();
    return fetch(url(), { method: 'POST', body: JSON.stringify(payload), redirect: 'follow' })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var j;
        try { j = JSON.parse(t); } catch (e) { throw new Error('The shared sheet gave an unexpected reply.'); }
        if (!j.ok) throw new Error(j.error || 'The shared sheet refused the data.');
        return j;
      });
  }

  function ask(action, code) {
    var u = url() + (url().indexOf('?') < 0 ? '?' : '&') + 'action=' + action + '&code=' + encodeURIComponent(code) + '&key=' + encodeURIComponent(key());
    return fetch(u, { redirect: 'follow' }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) throw new Error(j.error || 'failed');
      return j;
    });
  }

  function b64(buf) {
    var u = new Uint8Array(buf), s = '', i, step = 0x8000;
    for (i = 0; i < u.length; i += step) s += String.fromCharCode.apply(null, u.subarray(i, i + step));
    return btoa(s);
  }

  function pushObs(o) {
    var rev = o.rev || 0;
    var payload = { action: 'obs', row: WA.obsRow(o), labels: WA.labels() };
    if (o.photo && !o.photo_sent && !o.deleted) payload.photo_b64 = b64(o.photo.buf);
    return post(payload).then(function () {
      return WA.db.get('obs', o.id).then(function (cur) {
        if (!cur) return;
        if (cur.deleted && (cur.rev || 0) === rev) return WA.db.del('obs', o.id);
        cur.sent_once = true;
        if (payload.photo_b64) cur.photo_sent = true;
        if ((cur.rev || 0) === rev) cur.synced = true;
        return WA.db.put('obs', cur).then(function () { if (WA.sync.onObsSynced) WA.sync.onObsSynced(cur); });
      });
    });
  }

  function pushSession(s, nObs) {
    var rev = s.rev;
    return post({ action: 'session', row: WA.sessionRow(s, nObs), labels: WA.labels() }).then(function () {
      var live = WA.sync.active && WA.sync.active();
      if (live && live.id === s.id) { live.synced_rev = rev; return WA.db.put('sessions', live); }
      return WA.db.get('sessions', s.id).then(function (cur) { if (cur) { cur.synced_rev = rev; return WA.db.put('sessions', cur); } });
    });
  }

  function flush() {
    if (!on()) return Promise.resolve();
    if (busy) { again = true; return Promise.resolve(); }
    if (navigator.onLine === false) { set('waiting'); return Promise.resolve(); }
    busy = true;
    return Promise.all([WA.db.all('sessions'), WA.db.all('obs')]).then(function (res) {
      var live = WA.sync.active && WA.sync.active();
      var sessions = res[0].map(function (s) { return live && live.id === s.id ? live : s; });
      var obs = res[1], counts = {};
      obs.forEach(function (o) { if (!o.deleted) counts[o.session_id] = (counts[o.session_id] || 0) + 1; });
      var todoObs = obs.filter(function (o) { return !o.synced; });
      var todoSes = sessions.filter(function (s) { return s.rev !== s.synced_rev; });
      if (!todoObs.length && !todoSes.length) { if (status.state !== 'sent') set('idle'); return; }
      set('sending');
      var chain = Promise.resolve();
      todoObs.forEach(function (o) { chain = chain.then(function () { return pushObs(o); }); });
      todoSes.forEach(function (s) { chain = chain.then(function () { return pushSession(s, counts[s.id] || 0); }); });
      return chain.then(function () { set('sent'); });
    }).catch(function (e) {
      set(navigator.onLine === false ? 'waiting' : 'error', e && e.message);
    }).then(function () {
      busy = false;
      if (again) { again = false; return flush(); }
    });
  }

  WA.sync = {
    on: on,
    status: function () { return status; },
    listen: function (fn) { listeners.push(fn); },
    flush: flush,
    /* Wait a little after the last change so a burst of taps is one upload. */
    soon: function (ms) {
      if (!on()) return;
      clearTimeout(timer);
      timer = setTimeout(flush, ms == null ? 8000 : ms);
    },
    /* Other auditors' map notes for the same audit code. */
    group: function (code) { return ask('obs', code).then(function (j) { return j.obs || []; }); },
    /* Everyone's worksheet answers for the audit code, without names or notes. */
    team: function (code) { return ask('team', code).then(function (j) { return j.rows || []; }); }
  };

  if (on()) set('idle');
  window.addEventListener('online', function () { flush(); });
})();
