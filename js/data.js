/* Data model: sessions (one auditor's worksheets for one audit) and
 * observations (map notes). Also turns them into flat rows for the shared
 * sheet and for CSV export. */
(function () {
  'use strict';
  var WA = window.WA = window.WA || {};
  WA.VERSION = '0.3.0';

  WA.uid = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  WA.localDate = function (iso) { if (!iso) return ''; var d = new Date(iso); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  WA.localTime = function (iso) { if (!iso) return ''; var d = new Date(iso); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };

  WA.newSession = function (f) {
    return {
      id: WA.uid(), code: f.code || '', community: f.community || '', type: f.type || 'route',
      location: f.location || '', start_loc: f.start_loc || '', end_loc: f.end_loc || '', route: f.route || '',
      auditor: f.auditor || '', started_at: new Date().toISOString(), ended_at: '', submitted: false,
      device_id: f.device_id || '', app_version: WA.VERSION,
      fields: {}, answers: {}, ratings: {}, notes: {}, counts: {}, better: {}, texts: {},
      rev: 1, synced_rev: 0
    };
  };

  WA.sessionName = function (s) {
    if (s.type === 'single') return s.location || 'Single location';
    if (s.route) return s.route;
    if (s.start_loc || s.end_loc) return (s.start_loc || '?') + ' to ' + (s.end_loc || '?');
    return 'Walking route';
  };

  /* Yes / No / Other tallies for one checklist worksheet (the AARP Summary sheet). */
  WA.stats = function (s, sheet) {
    var y = 0, n = 0, o = 0, total = 0;
    WA.itemsOf(sheet).forEach(function (it) {
      total++;
      var a = s.answers[it.c];
      if (a && a.a === 'yes') y++; else if (a && a.a === 'no') n++; else if (a && a.a === 'other') o++;
    });
    return { yes: y, no: n, other: o, answered: y + n + o, total: total };
  };

  WA.countTotal = function (s) {
    var sheet = WA.sheet('count'), t = 0;
    sheet.groups[0].items.forEach(function (it) { t += s.counts[it.c] || 0; });
    return t;
  };
  WA.betterTotal = function (s) {
    var t = 0;
    WA.sheet('better').items.forEach(function (it) { if (s.better[it.c]) t++; });
    return t;
  };

  function fieldVal(f, v) {
    if (v == null || v === '') return '';
    if (f.k === 'num' || f.k === 'numtext') { var n = Number(v); return isFinite(n) && String(v).trim() !== '' ? n : String(v); }
    if (f.k === 'multi') return Object.keys(v).filter(function (k) { return v[k]; }).join(';');
    return v;
  }

  /* One wide row per auditor per audit. Column order is the order set here. */
  WA.sessionRow = function (s, nObs) {
    var r = {};
    r.session_id = s.id; r.audit_code = s.code; r.community = s.community; r.audit_type = s.type;
    r.location = s.location; r.start_location = s.start_loc; r.end_location = s.end_loc; r.route = s.route;
    r.auditor = s.auditor;
    r.audit_date = WA.localDate(s.started_at); r.start_time = WA.localTime(s.started_at); r.end_time = WA.localTime(s.ended_at);
    r.started_at_utc = s.started_at; r.ended_at_utc = s.ended_at || '';
    r.submitted = s.submitted ? 1 : 0;
    r.map_notes = nObs || 0;
    r.overall_rating = s.ratings.overall || ''; r.overall_notes = s.notes.overall || '';
    WA.SHEETS.forEach(function (sh) {
      if (sh.kind !== 'check') return;
      var st = WA.stats(s, sh);
      r[sh.id + '_yes'] = st.yes; r[sh.id + '_no'] = st.no; r[sh.id + '_other'] = st.other;
      r[sh.id + '_rating'] = s.ratings[sh.id] || ''; r[sh.id + '_notes'] = s.notes[sh.id] || '';
    });
    WA.SHEETS.forEach(function (sh) {
      (sh.pre || []).forEach(function (f) { r[f.c] = fieldVal(f, s.fields[f.c]); });
      if (sh.kind === 'check') WA.itemsOf(sh).forEach(function (it) {
        var a = s.answers[it.c] || {};
        r[it.c] = a.a || '';
        if (it.d) r[it.c + '_detail'] = a.d == null ? '' : (it.d.k === 'secs' && a.d !== '' && isFinite(Number(a.d)) ? Number(a.d) : a.d);
        r[it.c + '_note'] = a.note || '';
      });
      (sh.post || []).forEach(function (f) { r[f.c] = fieldVal(f, s.fields[f.c]); });
      if (sh.kind === 'tally') {
        sh.groups.forEach(function (g) { g.items.forEach(function (it) { r[it.c] = s.counts[it.c] || 0; }); });
        r.count_start_time = WA.localTime(s.count_first); r.count_end_time = WA.localTime(s.count_last);
        r.count_minutes = s.count_first && s.count_last ? Math.round((new Date(s.count_last) - new Date(s.count_first)) / 6000) / 10 : '';
        r[sh.text.c] = s.texts[sh.text.c] || '';
      }
      if (sh.kind === 'pick') {
        sh.items.forEach(function (it) { r[it.c] = s.better[it.c] ? 1 : ''; });
        r[sh.text.c] = s.texts[sh.text.c] || '';
      }
    });
    r.device_id = s.device_id; r.app_version = s.app_version;
    return r;
  };

  /* One row per map note. */
  WA.obsRow = function (o) {
    return {
      obs_id: o.id, session_id: o.session_id, audit_code: o.code || '',
      created_at_utc: o.created_at, local_date: WA.localDate(o.created_at), local_time: WA.localTime(o.created_at),
      lat: o.lat == null ? '' : Math.round(o.lat * 1e6) / 1e6, lon: o.lon == null ? '' : Math.round(o.lon * 1e6) / 1e6,
      accuracy_m: o.acc == null ? '' : Math.round(o.acc), location_source: o.src || '',
      kind: o.kind, topic: o.topic || '', worksheet_item: o.item || '', note: o.note || '',
      has_photo: o.photo ? 1 : 0, deleted: o.deleted ? 1 : ''
    };
  };

  /* Long format: one row per checklist answer. Easier to chart than the wide row. */
  WA.responsesLong = function (s) {
    var rows = [];
    WA.checkSheets().forEach(function (sh) {
      sh.sections.forEach(function (sec) {
        sec.items.forEach(function (it, i) {
          var a = s.answers[it.c];
          if (!a || (!a.a && !a.note)) return;
          rows.push({ session_id: s.id, audit_code: s.code, worksheet: sh.title, section: sec.title, item_no: i + 1,
            item_code: it.c, item_text: it.t, answer: a.a || '', detail: a.d == null ? '' : a.d, note: a.note || '' });
        });
      });
    });
    return rows;
  };

  /* Add up everyone's rows for one audit code (the tool kit's "gather and tally
   * the collective results"). rows: Audits rows without names or notes.
   * obs: the audit's map notes. Pure arithmetic; no judgment is applied. */
  WA.teamTotals = function (rows, obs) {
    var RV = ['great', 'acceptable', 'mixed', 'poor'];
    var T = { people: rows.length, finished: 0, ratings: [], sheets: [], flagged: [], timing: [], counts: [], better: [], betterBy: 0,
      obs: { total: 0, kinds: {}, topics: {} } };
    rows.forEach(function (r) { if (Number(r.submitted) === 1) T.finished++; });
    function rating(id, title) {
      var d = { id: id, title: title, n: 0 };
      RV.forEach(function (v) { d[v] = 0; });
      rows.forEach(function (r) { var v = r[id + '_rating']; if (RV.indexOf(v) >= 0) { d[v]++; d.n++; } });
      T.ratings.push(d);
    }
    WA.checkSheets().forEach(function (sh) {
      rating(sh.id, sh.title);
      var tot = { id: sh.id, title: sh.title, yes: 0, no: 0, other: 0, people: 0, sections: [] };
      var codes = WA.itemsOf(sh).map(function (it) { return it.c; });
      rows.forEach(function (r) { if (codes.some(function (c) { return r[c] === 'yes' || r[c] === 'no' || r[c] === 'other'; })) tot.people++; });
      sh.sections.forEach(function (sec) {
        var items = sec.items.map(function (it, i) {
          var c = { code: it.c, n: i + 1, text: it.t, sheet: sh.title, section: sec.title, neg: !!it.neg, yes: 0, no: 0, other: 0 };
          rows.forEach(function (r) { var a = r[it.c]; if (a === 'yes') c.yes++; else if (a === 'no') c.no++; else if (a === 'other') c.other++; });
          c.answered = c.yes + c.no + c.other;
          c.concern = c.neg ? c.yes : c.no;      // for two Winter items, Yes is the problem
          tot.yes += c.yes; tot.no += c.no; tot.other += c.other;
          if (c.concern > 0) T.flagged.push(c);
          return c;
        });
        tot.sections.push({ title: sec.title, items: items });
      });
      T.sheets.push(tot);
    });
    rating('overall', 'Overall');
    T.flagged.sort(function (a, b) { return b.concern - a.concern || (b.concern / b.answered) - (a.concern / a.answered); });
    [['sg5_detail', 'Crossing time given'], ['sg6_detail', 'Wait for the walk signal']].forEach(function (p) {
      var v = rows.map(function (r) { return r[p[0]]; }).filter(function (x) { return x !== '' && x != null && isFinite(Number(x)); })
        .map(Number).sort(function (a, b) { return a - b; });
      if (v.length) T.timing.push({ code: p[0], label: p[1], n: v.length, min: v[0], max: v[v.length - 1],
        median: v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2 });
    });
    WA.sheet('count').groups.forEach(function (g) {
      g.items.forEach(function (it) {
        var total = 0, by = 0;
        rows.forEach(function (r) { var n = Number(r[it.c]) || 0; if (n > 0) { total += n; by++; } });
        T.counts.push({ code: it.c, group: g.title, text: it.t, total: total, by: by });
      });
    });
    var bb = WA.sheet('better').items;
    rows.forEach(function (r) { if (bb.some(function (it) { return Number(r[it.c]) === 1; })) T.betterBy++; });
    bb.forEach(function (it) {
      var n = 0;
      rows.forEach(function (r) { if (Number(r[it.c]) === 1) n++; });
      if (n) T.better.push({ code: it.c, text: it.t, picked: n });
    });
    T.better.sort(function (a, b) { return b.picked - a.picked; });
    (obs || []).forEach(function (o) {
      T.obs.total++;
      T.obs.kinds[o.kind] = (T.obs.kinds[o.kind] || 0) + 1;
      if (o.topic) T.obs.topics[o.topic] = (T.obs.topics[o.topic] || 0) + 1;
    });
    return T;
  };

  /* Plain-language label for every column: the codebook. */
  WA.labels = function () {
    var L = {
      session_id: 'Random ID for one person’s worksheets in one audit', audit_code: 'Audit code from the shared link',
      community: 'Community name', audit_type: 'route = walking audit, single = single-location audit',
      location: 'Location or street name(s) (single-location audit)', start_location: 'Starting location (walking audit)',
      end_location: 'Ending location (walking audit)', route: 'Route walked', auditor: 'Name or initials (optional)',
      audit_date: 'Audit date, phone local time', start_time: 'Start time, phone local time', end_time: 'End time, phone local time',
      started_at_utc: 'Start, UTC', ended_at_utc: 'End, UTC', submitted: '1 = the auditor tapped Finish',
      map_notes: 'Number of map notes by this auditor', overall_rating: 'Overall walkability rating', overall_notes: 'Overall notes',
      device_id: 'Random ID for the phone or browser', app_version: 'App version',
      obs_id: 'Random ID for the map note', created_at_utc: 'When the note was made, UTC', local_date: 'Date, phone local time',
      local_time: 'Time, phone local time', lat: 'Latitude (WGS84)', lon: 'Longitude (WGS84)',
      accuracy_m: 'GPS accuracy radius in meters as reported by the phone; blank if the pin was placed by hand',
      location_source: 'gps = phone location, pin = auditor placed or moved the pin',
      kind: 'problem, good (good feature) or idea', topic: 'Topic of the map note',
      worksheet_item: 'Worksheet item this note is about, if any', note: 'Auditor’s note', has_photo: '1 = a photo was taken',
      photo_file: 'Photo file in the export', photo_url: 'Photo file in Google Drive', deleted: '1 = the auditor deleted this note',
      received_at: 'When the shared sheet last received this row'
    };
    WA.SHEETS.forEach(function (sh) {
      (sh.pre || []).concat(sh.post || []).forEach(function (f) { L[f.c] = sh.title + ': ' + f.l; });
      if (sh.kind === 'check') {
        L[sh.id + '_yes'] = sh.title + ': number of Yes answers'; L[sh.id + '_no'] = sh.title + ': number of No answers';
        L[sh.id + '_other'] = sh.title + ': number of Other answers';
        L[sh.id + '_rating'] = sh.title + ': walkability rating (great, acceptable, mixed, poor)'; L[sh.id + '_notes'] = sh.title + ': notes';
        sh.sections.forEach(function (sec) {
          sec.items.forEach(function (it, i) {
            L[it.c] = sh.title + ' / ' + sec.title + ' ' + (i + 1) + '. ' + it.t + ' (yes, no, other; blank = skipped)';
            if (it.d) L[it.c + '_detail'] = it.c + ' follow-up: ' + it.d.l;
            L[it.c + '_note'] = it.c + ' note';
          });
        });
      }
      if (sh.kind === 'tally') {
        sh.groups.forEach(function (g) { g.items.forEach(function (it) { L[it.c] = 'Count. ' + g.title + ': ' + it.t; }); });
        L.count_start_time = 'Time of the first tap on a counter, phone local time';
        L.count_end_time = 'Time of the last tap on a counter, phone local time';
        L.count_minutes = 'Minutes between the first and last tap; divide a count by this for a rate';
        L[sh.text.c] = sh.text.l;
      }
      if (sh.kind === 'pick') {
        sh.items.forEach(function (it) { L[it.c] = sh.title + ': ' + it.t + ' (1 = picked)'; });
        L[sh.text.c] = sh.title + ': ' + sh.text.l;
      }
    });
    return L;
  };
})();
