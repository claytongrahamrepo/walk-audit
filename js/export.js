/* Export one auditor's work as a zip: CSV tables, a GeoJSON layer and the photos.
 * This works with no shared sheet and no connection. */
(function () {
  'use strict';
  var WA = window.WA = window.WA || {};

  function cell(v) {
    if (v == null) return '';
    if (typeof v === 'number') return String(v);
    var s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;          // keep spreadsheets from running it as a formula
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  WA.csv = function (rows, cols) {
    if (!cols) { cols = []; rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (cols.indexOf(k) < 0) cols.push(k); }); }); }
    var out = [cols.map(cell).join(',')];
    rows.forEach(function (r) { out.push(cols.map(function (c) { return cell(r[c]); }).join(',')); });
    return '﻿' + out.join('\r\n') + '\r\n';
  };

  WA.geojson = function (obsRows) {
    return JSON.stringify({
      type: 'FeatureCollection',
      features: obsRows.filter(function (r) { return r.lat !== '' && r.lon !== ''; }).map(function (r) {
        var p = {}; Object.keys(r).forEach(function (k) { if (k !== 'lat' && k !== 'lon') p[k] = r[k]; });
        return { type: 'Feature', geometry: { type: 'Point', coordinates: [r.lon, r.lat] }, properties: p };
      })
    }, null, 1);
  };

  /* Minimal zip writer (stored, no compression; JPEGs do not compress anyway). */
  var T = null;
  function crc32(u) {
    var i, j, c;
    if (!T) { T = []; for (i = 0; i < 256; i++) { c = i; for (j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[i] = c >>> 0; } }
    c = 0xFFFFFFFF;
    for (i = 0; i < u.length; i++) c = T[(c ^ u[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(s) { return new TextEncoder().encode(s); }
  WA.zip = function (files) {
    var parts = [], central = [], offset = 0, csize = 0, d = new Date();
    var time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(function (f) {
      var name = utf8(f.name), data = f.data, crc = crc32(data), size = data.length;
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
      lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(12, time, true); ch.setUint16(14, date, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      csize += 46 + name.length;
      offset += 30 + name.length + size;
    });
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  };

  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }

  /* sessions: array; obs: all observations for those sessions. */
  WA.exportZip = function (sessions, obs) {
    var live = obs.filter(function (o) { return !o.deleted; });
    var counts = {}; live.forEach(function (o) { counts[o.session_id] = (counts[o.session_id] || 0) + 1; });
    var files = [], long = [];
    var audits = sessions.map(function (s) { long = long.concat(WA.responsesLong(s)); return WA.sessionRow(s, counts[s.id] || 0); });
    var obsRows = live.map(function (o) {
      var r = WA.obsRow(o); delete r.deleted;
      r.photo_file = o.photo ? 'photos/' + o.id + '.jpg' : '';
      if (o.photo) files.push({ name: 'photos/' + o.id + '.jpg', data: new Uint8Array(o.photo.buf) });
      return r;
    });
    var L = WA.labels();
    var codebook = Object.keys(L).map(function (k) { return { column: k, meaning: L[k] }; });
    files.unshift(
      { name: 'audits.csv', data: utf8(WA.csv(audits)) },
      { name: 'responses_long.csv', data: utf8(WA.csv(long, ['session_id', 'audit_code', 'worksheet', 'section', 'item_no', 'item_code', 'item_text', 'answer', 'detail', 'note'])) },
      { name: 'map_notes.csv', data: utf8(WA.csv(obsRows, obsRows.length ? null : Object.keys(WA.obsRow({})).concat(['photo_file']))) },
      { name: 'map_notes.geojson', data: utf8(WA.geojson(obsRows)) },
      { name: 'codebook.csv', data: utf8(WA.csv(codebook, ['column', 'meaning'])) }
    );
    var s0 = sessions[0];
    var name = 'walk-audit_' + (slug(s0.code) || slug(WA.sessionName(s0)) || 'export') + '_' + WA.localDate(s0.started_at) + '.zip';
    return { blob: WA.zip(files), name: name };
  };

  /* Team totals as a zip of small CSV tables, for the report. */
  WA.teamZip = function (code, T) {
    var items = [], sheets = [];
    T.sheets.forEach(function (sh) {
      sheets.push({ worksheet: sh.title, yes: sh.yes, no: sh.no, other: sh.other, people_who_answered: sh.people });
      sh.sections.forEach(function (sec) {
        sec.items.forEach(function (c) {
          items.push({ worksheet: sh.title, section: sec.title, item_no: c.n, item_code: c.code, item_text: c.text, yes: c.yes, no: c.no, other: c.other, answered: c.answered });
        });
      });
    });
    var ratings = T.ratings.map(function (d) { return { worksheet: d.title, great: d.great, acceptable: d.acceptable, mixed: d.mixed, poor: d.poor, rated_by: d.n }; });
    var counts = T.counts.map(function (c) { return { group: c.group, counter: c.text, total: c.total, counted_by: c.by }; });
    var better = T.better.map(function (b) { return { item_code: b.code, improvement: b.text, picked_by: b.picked, out_of: T.betterBy }; });
    var notes = [];
    Object.keys(T.obs.kinds).forEach(function (k) { notes.push({ by: 'kind', value: k, count: T.obs.kinds[k] }); });
    Object.keys(T.obs.topics).forEach(function (k) { notes.push({ by: 'topic', value: k, count: T.obs.topics[k] }); });
    var timing = T.timing.map(function (t) { return { measure: t.label, median_seconds: t.median, min_seconds: t.min, max_seconds: t.max, readings: t.n }; });
    var info = [{ audit_code: code, people: T.people, finished: T.finished, map_notes: T.obs.total, made: new Date().toISOString(), app_version: WA.VERSION }];
    var files = [
      { name: 'team_info.csv', data: utf8(WA.csv(info)) },
      { name: 'team_ratings.csv', data: utf8(WA.csv(ratings, ['worksheet', 'great', 'acceptable', 'mixed', 'poor', 'rated_by'])) },
      { name: 'team_worksheets.csv', data: utf8(WA.csv(sheets, ['worksheet', 'yes', 'no', 'other', 'people_who_answered'])) },
      { name: 'team_items.csv', data: utf8(WA.csv(items, ['worksheet', 'section', 'item_no', 'item_code', 'item_text', 'yes', 'no', 'other', 'answered'])) },
      { name: 'team_counts.csv', data: utf8(WA.csv(counts, ['group', 'counter', 'total', 'counted_by'])) },
      { name: 'team_improvements.csv', data: utf8(WA.csv(better, ['item_code', 'improvement', 'picked_by', 'out_of'])) },
      { name: 'team_signal_timing.csv', data: utf8(WA.csv(timing, ['measure', 'median_seconds', 'min_seconds', 'max_seconds', 'readings'])) },
      { name: 'team_map_notes.csv', data: utf8(WA.csv(notes, ['by', 'value', 'count'])) }
    ];
    return { blob: WA.zip(files), name: 'walk-audit_team_' + (slug(code) || 'audit') + '_' + WA.localDate(new Date().toISOString()) + '.zip' };
  };

  WA.download = function (blob, name) {
    var a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 4000);
  };
})();
