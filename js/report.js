/* One person's audit as a single file: a page anyone can open and read in a
 * browser, which also carries the data so a walk leader can combine several
 * people's files. Plain HTML with no scripts; photos are embedded.
 *
 * HTML is used rather than a zip because phones will share an HTML file
 * through their share menu and will not always share a zip. */
(function () {
  'use strict';
  var WA = window.WA = window.WA || {};
  var MARK = 'walk-audit-data';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function b64(buf) {
    var u = new Uint8Array(buf), s = '', i, step = 0x8000;
    for (i = 0; i < u.length; i += step) s += String.fromCharCode.apply(null, u.subarray(i, i + step));
    return btoa(s);
  }
  function unb64(s) {
    var bin = atob(s), u = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }
  function label(list, v) { for (var i = 0; i < list.length; i++) if (list[i][0] === v) return list[i][1]; return String(v); }
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }
  function fieldText(f, v) {
    if (v == null || v === '') return '';
    if (f.k === 'choice') return label(f.opts, v);
    if (f.k === 'multi') return Object.keys(v).filter(function (k) { return v[k]; }).map(function (k) { return label(f.opts, k); }).join(', ');
    return String(v);
  }
  function detailText(d, v) {
    if (v == null || v === '') return '';
    if (d.k === 'secs') return v + ' seconds';
    if (d.k === 'yn') return cap(v);
    if (d.k === 'multi') return String(v).split(';').filter(Boolean).map(function (k) { return label(d.opts, k); }).join(', ');
    return String(v);
  }
  function when(s) { return WA.localDate(s.started_at) + ', ' + WA.localTime(s.started_at) + (s.ended_at ? ' to ' + WA.localTime(s.ended_at) : ''); }
  function typeText(s) { return s.type === 'single' ? 'Single-location audit' : 'Walking audit'; }
  function kindLabel(k) { var m = WA.KINDS.filter(function (x) { return x.v === k; })[0]; return m ? m.l : cap(k); }
  function usedSheets(s) {
    return WA.checkSheets().filter(function (sh) {
      var st = WA.stats(s, sh);
      return st.answered || s.ratings[sh.id] || s.notes[sh.id] || (sh.pre || []).concat(sh.post || []).some(function (f) { return fieldText(f, s.fields[f.c]); });
    });
  }

  WA.reportName = function (s) { return 'walk-audit_' + (slug(WA.sessionName(s)) || 'copy') + '_' + WA.localDate(s.started_at) + '.html'; };

  /* A few plain lines for the body of the email or text message. */
  WA.reportText = function (s, obs) {
    var L = ['Walk audit: ' + WA.sessionName(s) + (s.community ? ' (' + s.community + ')' : ''), typeText(s) + ', ' + when(s) + '.'];
    var used = usedSheets(s);
    var rated = used.filter(function (sh) { return s.ratings[sh.id]; }).map(function (sh) { return sh.title + ' ' + cap(s.ratings[sh.id]); });
    if (s.ratings.overall) rated.push('Overall ' + cap(s.ratings.overall));
    if (rated.length) L.push('Ratings: ' + rated.join('; ') + '.');
    var ans = used.map(function (sh) { var st = WA.stats(s, sh); return st.answered ? sh.title + ' ' + st.yes + ' yes, ' + st.no + ' no' + (st.other ? ', ' + st.other + ' other' : '') : ''; }).filter(Boolean);
    if (ans.length) L.push('Answers: ' + ans.join('; ') + '.');
    var k = { problem: 0, good: 0, idea: 0 };
    obs.forEach(function (o) { k[o.kind] = (k[o.kind] || 0) + 1; });
    L.push('Map notes: ' + obs.length + ' (' + k.problem + ' problem, ' + k.good + ' good, ' + k.idea + ' idea).');
    L.push('');
    L.push('The attached file has every answer, note and photo. It opens in any web browser.');
    return L.join('\n');
  };

  WA.reportHTML = function (s, obs) {
    var h = [], used = usedSheets(s), unused = WA.checkSheets().filter(function (sh) { return used.indexOf(sh) < 0; });
    var notes = obs.filter(function (o) { return !o.deleted; }).slice().sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; });
    function p(x) { h.push(x); }

    p('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">');
    p('<title>Walk audit: ' + esc(WA.sessionName(s)) + '</title><style>' +
      'body{font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#17201b;max-width:760px;margin:0 auto;padding:20px 16px 60px}' +
      'h1{font-size:1.5rem;margin:0 0 4px}h2{font-size:1.2rem;margin:30px 0 10px;padding-bottom:4px;border-bottom:2px solid #14532d}h3{font-size:1.02rem;margin:20px 0 6px}' +
      'table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #cfd6d1;padding:6px 8px;text-align:left;vertical-align:top}th{background:#eef1ee}' +
      'td.n{width:2em;color:#56615b}td.a{white-space:nowrap;font-weight:600}.yes{color:#166534}.no{color:#b42318}.other{color:#8a5a00}' +
      '.muted{color:#56615b;font-size:.92rem}.obs{border:1px solid #cfd6d1;border-radius:10px;padding:12px;margin:0 0 12px;break-inside:avoid}.obs p{margin:0 0 6px}' +
      'img{display:block;max-width:100%;height:auto;border-radius:8px;margin-top:8px}tr.sec td{background:#f6f7f4;font-weight:600}@media print{a{color:inherit}}' +
      '</style></head><body>');

    p('<h1>Walk audit: ' + esc(WA.sessionName(s)) + '</h1>');
    p('<p class="muted">' + [s.community, typeText(s), when(s), s.auditor ? 'by ' + s.auditor : '', s.code ? 'audit code ' + s.code : ''].filter(Boolean).map(esc).join(' &middot; ') + '</p>');
    if (s.type !== 'single' && (s.start_loc || s.end_loc)) p('<p class="muted">From ' + esc(s.start_loc || '?') + ' to ' + esc(s.end_loc || '?') + (s.route ? ', by ' + esc(s.route) : '') + '</p>');

    p('<h2>Summary</h2>');
    if (used.length) {
      p('<table><tr><th>Worksheet</th><th>Yes</th><th>No</th><th>Other</th><th>Rating</th></tr>');
      used.forEach(function (sh) { var st = WA.stats(s, sh); p('<tr><td>' + esc(sh.title) + '</td><td>' + st.yes + '</td><td>' + st.no + '</td><td>' + st.other + '</td><td>' + esc(cap(s.ratings[sh.id] || '')) + '</td></tr>'); });
      p('</table>');
    } else p('<p class="muted">No checklist worksheet was filled in.</p>');
    if (s.ratings.overall) p('<p><b>Overall walkability:</b> ' + esc(cap(s.ratings.overall)) + '</p>');
    if (s.notes.overall) p('<p><b>Overall notes:</b> ' + esc(s.notes.overall) + '</p>');
    p('<p class="muted">The Yes and No numbers count answers. They are not a score.</p>');

    p('<h2>Map notes (' + notes.length + ')</h2>');
    if (!notes.length) p('<p class="muted">None.</p>');
    notes.forEach(function (o, i) {
      var info = o.item ? WA.findItem(o.item) : null, topic = o.topic ? label(WA.TOPICS, o.topic) : '';
      p('<div class="obs"><p><b>' + (i + 1) + '. ' + esc(kindLabel(o.kind)) + '</b>' + (topic ? ' &middot; ' + esc(topic) : '') + ' &middot; ' + esc(WA.localTime(o.created_at)) + '</p>');
      if (o.note) p('<p>' + esc(o.note) + '</p>');
      if (info) p('<p class="muted">About: ' + esc(info.sheet.title) + ' &mdash; ' + esc(info.item.t) + '</p>');
      if (o.lat != null && o.lon != null) {
        var la = Number(o.lat).toFixed(6), lo = Number(o.lon).toFixed(6);
        p('<p class="muted">' + la + ', ' + lo + (o.src === 'gps' ? ' (phone location' + (o.acc != null ? ', within about ' + Math.round(o.acc) + ' m' : '') + ')' : ' (pin placed by hand)') +
          ' &middot; <a href="https://www.openstreetmap.org/?mlat=' + la + '&amp;mlon=' + lo + '#map=19/' + la + '/' + lo + '">Open in a map</a></p>');
      }
      if (o.photo && /^[A-Za-z0-9_-]{1,64}$/.test(String(o.id))) p('<img data-obs="' + o.id + '" src="data:image/jpeg;base64,' + b64(o.photo.buf) + '" alt="Photo for map note ' + (i + 1) + '">');
      p('</div>');
    });

    if (used.length) p('<h2>Worksheets</h2>');
    used.forEach(function (sh) {
      p('<h3>' + esc(sh.title) + '</h3>');
      (sh.pre || []).forEach(function (f) { var v = fieldText(f, s.fields[f.c]); if (v) p('<p><b>' + esc(f.l) + '</b> ' + esc(v) + '</p>'); });
      p('<table><tr><th></th><th>Item</th><th>Answer</th><th>Note</th></tr>');
      sh.sections.forEach(function (sec) {
        p('<tr class="sec"><td colspan="4">' + esc(sec.title) + '</td></tr>');
        sec.items.forEach(function (it, i) {
          var a = s.answers[it.c] || {}, extra = [];
          if (it.d && detailText(it.d, a.d)) extra.push(it.d.l + ' ' + detailText(it.d, a.d));
          if (a.note) extra.push(a.note);
          p('<tr><td class="n">' + (i + 1) + '</td><td>' + esc(it.t) + '</td><td class="a ' + esc(a.a || '') + '">' + (a.a ? esc(cap(a.a)) : '&mdash;') + '</td><td>' + extra.map(esc).join('<br>') + '</td></tr>');
        });
      });
      p('</table>');
      (sh.post || []).forEach(function (f) { var v = fieldText(f, s.fields[f.c]); if (v) p('<p><b>' + esc(f.l) + '</b> ' + esc(v) + '</p>'); });
      if (s.notes[sh.id]) p('<p><b>Notes:</b> ' + esc(s.notes[sh.id]) + '</p>');
      if (s.ratings[sh.id]) p('<p><b>Walkability here:</b> ' + esc(cap(s.ratings[sh.id])) + '</p>');
    });
    if (unused.length && used.length) p('<p class="muted">Not used: ' + unused.map(function (sh) { return esc(sh.title); }).join(', ') + '.</p>');

    var tally = WA.sheet('count'), counted = [];
    tally.groups.forEach(function (g) { g.items.forEach(function (it) { if (s.counts[it.c]) counted.push([g.title, it.t, s.counts[it.c]]); }); });
    if (counted.length || s.texts[tally.text.c]) {
      p('<h2>' + esc(tally.title) + '</h2>');
      if (counted.length) {
        p('<table><tr><th>Group</th><th>Counter</th><th>Count</th></tr>' + counted.map(function (c) { return '<tr><td>' + esc(c[0]) + '</td><td>' + esc(c[1]) + '</td><td>' + c[2] + '</td></tr>'; }).join('') + '</table>');
        if (s.count_first) p('<p class="muted">Counted from ' + esc(WA.localTime(s.count_first)) + ' to ' + esc(WA.localTime(s.count_last)) + '.</p>');
      }
      if (s.texts[tally.text.c]) p('<p><b>' + esc(tally.text.l) + '</b> ' + esc(s.texts[tally.text.c]) + '</p>');
    }

    var bb = WA.sheet('better'), picks = bb.items.filter(function (it) { return s.better[it.c]; });
    if (picks.length || s.texts[bb.text.c]) {
      p('<h2>' + esc(bb.title) + '</h2>');
      if (picks.length) p('<ul>' + picks.map(function (it) { return '<li>' + esc(it.t) + '</li>'; }).join('') + '</ul>');
      if (s.texts[bb.text.c]) p('<p><b>' + esc(bb.text.l) + ':</b> ' + esc(s.texts[bb.text.c]) + '</p>');
    }

    p('<p class="muted" style="margin-top:36px">Made with the Walk Audit tool, which follows the worksheets in the AARP Walk Audit Tool Kit (AARP.org/WalkAudit). ' +
      'It is an independent tool; AARP did not make or endorse it. This file also holds the answers in a form the tool can read, so a walk leader can add up several people’s files.</p>');

    /* The data, for "Combine files". "<" is escaped so a note cannot close the script tag. Photos are read back from the <img> tags above. */
    var data = { format: 'walk-audit', v: 1, app_version: WA.VERSION, exported_at: new Date().toISOString(), sessions: [JSON.parse(JSON.stringify(s))],
      obs: notes.map(function (o) { var c = {}; ['id', 'session_id', 'code', 'created_at', 'lat', 'lon', 'acc', 'src', 'kind', 'topic', 'item', 'note'].forEach(function (k) { c[k] = o[k] == null ? null : o[k]; }); return c; }) };
    p('<script type="application/json" id="' + MARK + '">' + JSON.stringify(data).replace(/</g, '\\u003c') + '</script>');
    p('</body></html>');
    return h.join('\n');
  };

  function okId(x) { return typeof x === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(x); }
  function num(x) { return x === null || x === '' || x === undefined || !isFinite(Number(x)) ? null : Number(x); }

  /* Read a copy back. The file is treated as data only: nothing in it is run,
   * and every field is checked or cut to size before use. */
  WA.readReport = function (text) {
    var m = new RegExp('<script type="application/json" id="' + MARK + '">([\\s\\S]*?)</script>').exec(String(text));
    if (!m) throw new Error('not a walk audit copy');
    var d;
    try { d = JSON.parse(m[1]); } catch (e) { throw new Error('damaged file'); }
    if (!d || d.format !== 'walk-audit' || !Array.isArray(d.sessions) || !d.sessions.length) throw new Error('not a walk audit copy');
    var ids = {}, photos = {}, re = /<img data-obs="([A-Za-z0-9_-]{1,64})" src="data:image\/jpeg;base64,([A-Za-z0-9+\/=]+)"/g, pm;
    while ((pm = re.exec(text))) photos[pm[1]] = pm[2];
    var sessions = d.sessions.slice(0, 20).filter(function (s) { return s && typeof s === 'object'; }).map(function (s) {
      var n = WA.newSession({});
      ['code', 'community', 'type', 'location', 'start_loc', 'end_loc', 'route', 'auditor', 'started_at', 'ended_at', 'device_id', 'app_version', 'count_first', 'count_last']
        .forEach(function (k) { if (typeof s[k] === 'string') n[k] = s[k].slice(0, 300); });
      ['fields', 'answers', 'ratings', 'notes', 'counts', 'better', 'texts'].forEach(function (k) { if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) n[k] = s[k]; });
      n.id = okId(s.id) ? s.id : WA.uid(); ids[s.id] = n.id;
      n.type = n.type === 'single' ? 'single' : 'route';
      n.submitted = !!s.submitted; n.rev = Number(s.rev) || 1;
      return n;
    });
    var obs = (Array.isArray(d.obs) ? d.obs : []).slice(0, 2000).filter(function (o) { return o && typeof o === 'object' && ids[o.session_id]; }).map(function (o) {
      var c = { id: okId(o.id) ? o.id : WA.uid(), session_id: ids[o.session_id], code: String(o.code || '').slice(0, 60), created_at: String(o.created_at || '').slice(0, 40),
        lat: num(o.lat), lon: num(o.lon), acc: num(o.acc), src: o.src === 'gps' ? 'gps' : o.src === 'pin' ? 'pin' : '',
        kind: ['problem', 'good', 'idea'].indexOf(o.kind) >= 0 ? o.kind : 'problem', topic: String(o.topic || '').slice(0, 30), item: String(o.item || '').slice(0, 20), note: String(o.note || '').slice(0, 2000) };
      if (photos[o.id]) { try { c.photo = { buf: unb64(photos[o.id]), type: 'image/jpeg' }; } catch (e) {} }
      return c;
    });
    return { sessions: sessions, obs: obs, exported_at: String(d.exported_at || '') };
  };
})();
