/* Screens and interaction. No framework: the page is small and must load
 * fast on an old phone with a weak signal. */
(function () {
  'use strict';
  var WA = window.WA, cfg = window.WA_CONFIG || {};
  var S = null;        // the audit in progress (one person's worksheets)
  var OBS = [];        // this audit's map notes
  var view, modal, saveTimer = null, retryTimer = null;
  var map = null, markers = {}, meDot = null, meRing = null, groupLayer = null, centered = false;
  var gps = null, gpsErr = '', watchId = null, gpsReasons = {};
  var draft = null;    // map note being edited
  var urls = {};       // photo object URLs

  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function toast(msg, ms) {
    var t = $('#toast'); t.textContent = msg; t.className = 'show';
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.className = ''; }, ms || 3000);
  }

  function deviceId() { var d = ls('wa_device'); if (!d) { d = WA.uid(); ls('wa_device', d); } return d; }

  function linkParams() {
    var q; try { q = new URLSearchParams(location.search); } catch (e) { return {}; }
    function g(k) { return (q.get(k) || '').trim().slice(0, 120); }
    return { code: g('code'), type: g('type'), place: g('place'), from: g('from'), to: g('to'), route: g('route'), community: g('community'), at: parseAt(g('at')) };
  }
  /* "lat,lon,zoom" from a link: where the map should open. */
  function parseAt(str) {
    var p = String(str || '').split(',').map(Number);
    if (p.length < 2 || !isFinite(p[0]) || !isFinite(p[1]) || Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180 || (!p[0] && !p[1])) return null;
    return [p[0], p[1], isFinite(p[2]) && p[2] >= 3 && p[2] <= 19 ? Math.round(p[2]) : 16];
  }
  /* Where a map opens before the phone has found itself: the spot in the
   * link, else the last place this phone was, else the whole country. */
  function startView() {
    if (S && S.map_at) return S.map_at;
    try { var a = JSON.parse(ls('wa_lastpos') || 'null'); if (a && isFinite(a[0]) && isFinite(a[1])) return [a[0], a[1], 16]; } catch (e) {}
    if (cfg.center) return [cfg.center[0], cfg.center[1], cfg.zoom || 14];
    return [39.5, -98.35, 4];
  }

  /* ---------- saving ---------- */

  function saveNow() { clearTimeout(saveTimer); saveTimer = null; return S ? WA.db.put('sessions', S).catch(function () { toast('Could not save on this phone. Check free space.', 6000); }) : Promise.resolve(); }
  function touch() {
    if (!S) return;
    S.rev++; S.updated_at = new Date().toISOString();
    clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250);
    WA.sync.soon();
  }

  function loadObs() {
    return WA.db.all('obs').then(function (all) {
      OBS = all.filter(function (o) { return o.session_id === S.id && !o.deleted; })
        .sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; });
    });
  }

  function setActive(s) {
    S = s; ls('wa_active', s ? s.id : null);
    Object.keys(urls).forEach(function (k) { URL.revokeObjectURL(urls[k]); }); urls = {};
    centered = false;
    return s ? loadObs() : Promise.resolve();
  }

  /* ---------- routing ---------- */

  function route() {
    var h = location.hash.replace(/^#\/?/, '');
    var p = h.split('/');
    return { name: p[0] || 'home', arg: p[1] || '' };
  }
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

  function render() {
    stopTimer(false);
    var r = route();
    if (!S && r.name !== 'setup' && r.name !== 'team') { r = { name: 'setup', arg: '' }; }
    var isMap = r.name === 'map', inAudit = !!S && r.name !== 'setup' && r.name !== 'details';
    $('#mapWrap').hidden = !isMap; view.hidden = isMap;
    $('#tabs').hidden = !inAudit;
    document.body.className = 'r-' + r.name;
    syncUI(WA.sync.status());
    $$('#tabs a').forEach(function (a) {
      var on = a.getAttribute('data-tab') === (r.name === 'sheet' ? 'home' : r.name === 'team' ? 'summary' : r.name);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    wantGPS('map', isMap);
    wantGPS('audit', inAudit);     // keep the phone's location warm so a note lands where the person stands
    if (isMap) return showMap();
    var sh = r.name === 'sheet' ? WA.sheet(r.arg) : null;
    if (r.name === 'setup') view.innerHTML = viewSetup(false);
    else if (r.name === 'details') view.innerHTML = viewSetup(true);
    else if (r.name === 'summary') view.innerHTML = viewSummary();
    else if (r.name === 'team') view.innerHTML = viewTeam(r);
    else if (sh && sh.kind === 'check') view.innerHTML = viewCheck(sh);
    else if (sh && sh.kind === 'tally') view.innerHTML = viewTally(sh);
    else if (sh && sh.kind === 'pick') view.innerHTML = viewPick(sh);
    else view.innerHTML = viewHome();
    window.scrollTo(0, 0);
  }

  /* ---------- setup ---------- */

  function viewSetup(edit) {
    var L = linkParams();
    var f = edit ? S : {
      code: L.code, type: L.type === 'single' ? 'single' : 'route', community: L.community || ls('wa_community') || cfg.community || '',
      location: L.place, start_loc: L.from, end_loc: L.to, route: L.route, auditor: ls('wa_auditor') || ''
    };
    function inp(name, label, val, hint, ph) {
      return '<label class="fld"><span>' + label + '</span>' + (hint ? '<small>' + hint + '</small>' : '') +
        '<input type="text" name="' + name + '" value="' + esc(val || '') + '" autocomplete="off"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '></label>';
    }
    var h = '<form id="setup" class="' + (f.type === 'single' ? 't-single' : 't-route') + '" novalidate>';
    if (edit) h += '<a class="back" href="#/">&lsaquo; Back</a><h1>Audit details</h1>';
    else {
      h += '<h1>Walk audit</h1><p class="lead">Use this instead of paper worksheets. You look at the street, answer short questions, and mark problem spots on a map.</p>';
      if (S) h += '<p class="note">You have an audit in progress: <b>' + esc(WA.sessionName(S)) + '</b>. <a href="#/">Go back to it</a>, or start a new one below. The old one stays on this phone.</p>';
      /* A link from a walk leader fills in the route. Say so, because a filled-in form can look like someone else's audit. */
      if (L.code || L.place || L.from || L.to || L.route || L.community) h += '<p class="note">The details below came from the link you opened. This is a new, empty audit of your own. ' +
        (WA.sync.on() ? 'Your answers are saved on this device and sent to the organizers’ shared sheet.' : 'Your answers are saved on this device only. No one else sees them unless you send them a copy.') + '</p>';
    }
    h += '<fieldset class="fld"><legend>What kind of audit?</legend><div class="choice2">' +
      '<label><input type="radio" name="type" value="route"' + (f.type !== 'single' ? ' checked' : '') + '><span><b>Walking route</b><small>Walk from one place to another</small></span></label>' +
      '<label><input type="radio" name="type" value="single"' + (f.type === 'single' ? ' checked' : '') + '><span><b>Single location</b><small>Watch one corner or block</small></span></label>' +
      '</div></fieldset>';
    h += inp('community', 'Community', f.community, '', 'City or town, and state');
    h += '<div class="only-route">' + inp('start_loc', 'Starting location', f.start_loc, '', 'e.g. City Hall') +
      inp('end_loc', 'Ending location', f.end_loc, '', 'e.g. Main Street library') +
      inp('route', 'Route', f.route, 'Streets you will walk.', 'e.g. Main St from 1st Ave to 5th Ave') + '</div>';
    h += '<div class="only-single">' + inp('location', 'Location or street name(s)', f.location, '', 'e.g. Main St at 3rd Ave') + '</div>';
    h += inp('auditor', 'Your name or initials (optional)', f.auditor, 'Shown on your copy, so a walk leader knows whose it is.');
    h += inp('code', 'Audit code (optional)', f.code, 'Filled in if your walk leader sent you a link.');
    h += '<p class="err" id="setupErr" hidden></p>';
    h += '<button class="btn primary big" type="submit">' + (edit ? 'Save details' : 'Start audit') + '</button>';
    if (!edit) {
      h += '<p class="fine">The date and time are recorded for you. Your answers save on this phone as you go, so a lost signal will not lose your work. ' +
        (WA.sync.on() ? 'They are also sent to the organizers’ shared sheet. ' : 'Nothing is sent anywhere unless you send it. ') +
        'If you allow it, the page uses your location so map notes land where you stand. A location is saved only when you add a map note.</p>' +
        '<p class="fine"><a href="#" data-act="m-ready">Before you go: how to plan and what to bring</a></p>' + aboutText();
    }
    return h + '</form>';
  }

  function aboutText() {
    return '<p class="fine">This tool follows the worksheets in the AARP Walk Audit Tool Kit ' +
      '(<a href="https://www.aarp.org/walkaudit" target="_blank" rel="noopener">AARP.org/WalkAudit</a>). ' +
      'It is an independent community tool. AARP did not make or endorse it, and the question wording is our own.</p>';
  }

  function submitSetup(form) {
    var edit = route().name === 'details' && !!S;
    function v(n) { var el = form.elements[n]; return el ? String(el.value || '').trim().slice(0, 200) : ''; }
    var f = { type: v('type') === 'single' ? 'single' : 'route', community: v('community'), start_loc: v('start_loc'), end_loc: v('end_loc'),
      route: v('route'), location: v('location'), auditor: v('auditor'), code: v('code').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 60) };
    var err = $('#setupErr');
    var ok = f.type === 'single' ? !!f.location : !!(f.route || (f.start_loc && f.end_loc));
    if (!ok) {
      err.textContent = f.type === 'single' ? 'Enter the location or street name.' : 'Enter the route, or both a starting and an ending location.';
      err.hidden = false; err.scrollIntoView({ block: 'center' }); return;
    }
    ls('wa_auditor', f.auditor); ls('wa_community', f.community);
    if (edit) {
      ['type', 'community', 'start_loc', 'end_loc', 'route', 'location', 'auditor', 'code'].forEach(function (k) { S[k] = f[k]; });
      OBS.forEach(function (o) { if (o.code !== S.code) { o.code = S.code; o.rev = (o.rev || 0) + 1; o.synced = false; WA.db.put('obs', o); } });
      touch(); saveNow(); go('#/'); return;
    }
    f.device_id = deviceId();
    var s = WA.newSession(f), at = linkParams().at;
    if (at) s.map_at = at;
    saveNow().then(function () { return setActive(s); }).then(function () { return saveNow(); }).then(function () {
      refreshMarkers(); WA.sync.soon(2000); go('#/');
    });
  }

  /* ---------- home ---------- */

  function progress(sh) {
    if (sh.kind === 'check') {
      var st = WA.stats(S, sh), r = S.ratings[sh.id];
      return (st.answered ? st.answered + ' of ' + st.total + ' answered' : 'Not started') + (r ? ' · ' + cap(r) : '');
    }
    if (sh.kind === 'tally') { var n = WA.countTotal(S); return n ? plural(n, 'person', 'people') + ' counted' : 'Not started'; }
    if (sh.kind === 'pick') { var b = WA.betterTotal(S); return b ? b + ' picked' : 'Not started'; }
    if (sh.kind === 'map') return OBS.length ? plural(OBS.length, 'note', 'notes') : 'No notes yet';
    return S.submitted ? 'Finished' : 'Not finished';
  }
  function started(sh) {
    if (sh.kind === 'check') return WA.stats(S, sh).answered > 0 || !!S.ratings[sh.id];
    if (sh.kind === 'tally') return WA.countTotal(S) > 0;
    if (sh.kind === 'pick') return WA.betterTotal(S) > 0;
    if (sh.kind === 'map') return OBS.length > 0;
    return S.submitted;
  }

  function viewHome() {
    var h = '<section class="head"><h1>' + esc(WA.sessionName(S)) + '</h1><p class="muted">' +
      (S.type === 'single' ? 'Single-location audit' : 'Walking audit') + (S.community ? ' · ' + esc(S.community) : '') +
      ' · started ' + WA.localTime(S.started_at) + ' <a href="#/details">Edit</a></p></section>';
    h += '<p class="hint">Use the worksheets that fit this walk and skip the rest. Your work saves as you go.</p><ul class="sheets">';
    WA.SHEETS.forEach(function (sh, i) {
      var href = sh.kind === 'map' ? '#/map' : sh.kind === 'summary' ? '#/summary' : '#/sheet/' + sh.id;
      h += '<li><a href="' + href + '" class="' + (started(sh) ? 'on' : '') + '"><span class="num">' + (i + 1) + '</span><span class="tx"><b>' + esc(sh.title) +
        '</b><small>' + esc(sh.blurb) + '</small><em>' + esc(progress(sh)) + '</em></span><span class="chev" aria-hidden="true">&rsaquo;</span></a></li>';
    });
    return h + '</ul>';
  }

  /* ---------- checklist worksheets ---------- */

  function chips(attr, opts, isOn) {
    return '<div class="chips" ' + attr + '>' + opts.map(function (o) {
      return '<button type="button" data-v="' + o[0] + '" aria-pressed="' + (isOn(o[0]) ? 'true' : 'false') + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }

  function fieldHTML(f) {
    var v = S.fields[f.c];
    var h = '<div class="fld"><span>' + esc(f.l) + '</span>' + (f.h ? '<small>' + esc(f.h) + '</small>' : '');
    if (f.k === 'num') h += '<input type="number" inputmode="numeric" min="0" max="999" data-field="' + f.c + '" value="' + esc(v == null ? '' : v) + '" aria-label="' + esc(f.l) + '">';
    else if (f.k === 'numtext') h += '<input type="text" data-field="' + f.c + '" value="' + esc(v == null ? '' : v) + '" aria-label="' + esc(f.l) + '" autocomplete="off">';
    else if (f.k === 'choice') h += chips('data-field="' + f.c + '" data-kind="choice"', f.opts, function (o) { return v === o; });
    else if (f.k === 'multi') h += chips('data-field="' + f.c + '" data-kind="multi"', f.opts, function (o) { return !!(v && v[o]); });
    return h + '</div>';
  }

  function pinsText(code) {
    var n = OBS.filter(function (o) { return o.item === code; }).length;
    return n ? plural(n, 'map note', 'map notes') : '';
  }

  function detailHTML(it, a) {
    var d = it.d, show = d.on === 'any' || a.a === d.on, h = '<div class="detail" data-on="' + d.on + '"' + (show ? '' : ' hidden') + '><span>' + esc(d.l) + '</span>';
    if (d.k === 'text') h += '<input type="text" data-detail value="' + esc(a.d || '') + '" aria-label="' + esc(d.l) + '">';
    else if (d.k === 'secs') h += '<div class="row"><input type="number" inputmode="numeric" min="0" max="999" data-detail value="' + esc(a.d == null ? '' : a.d) + '" aria-label="' + esc(d.l) + '">' +
      '<button type="button" class="btn small" data-act="timer">Time it</button></div>';
    else if (d.k === 'yn') h += chips('data-dkind="choice"', [['yes', 'Yes'], ['no', 'No']], function (o) { return a.d === o; });
    else if (d.k === 'multi') h += chips('data-dkind="multi"', d.opts, function (o) { return (';' + (a.d || '') + ';').indexOf(';' + o + ';') >= 0; });
    return h + '</div>';
  }

  function itemHTML(sh, it, n) {
    var a = S.answers[it.c] || {};
    var noteOpen = !!a.note || a.a === 'no' || a.a === 'other';
    var h = '<div class="item" data-c="' + it.c + '" data-sheet="' + sh.id + '"><p class="q"><span class="n">' + n + '.</span> ' + esc(it.t) + '</p>';
    if (it.h) h += '<p class="qn">' + esc(it.h) + '</p>';
    if (it.n) h += '<p class="qn">' + esc(it.n) + '</p>';
    h += '<div class="yno" role="group" aria-label="Answer">' + ['yes', 'no', 'other'].map(function (v) {
      return '<button type="button" class="ans ' + v + '" data-a="' + v + '" aria-pressed="' + (a.a === v ? 'true' : 'false') + '">' + cap(v) + '</button>';
    }).join('') + '</div>';
    h += '<div class="more"' + (a.a || a.note ? '' : ' hidden') + '>';
    if (it.d) h += detailHTML(it, a);
    h += '<textarea data-note rows="2" placeholder="What did you see? (optional)" aria-label="Note"' + (noteOpen ? '' : ' hidden') + '>' + esc(a.note || '') + '</textarea>';
    h += '<div class="row"><button type="button" class="btn small" data-act="noteopen"' + (noteOpen ? ' hidden' : '') + '>+ Note</button>' +
      '<button type="button" class="btn small" data-act="pin">+ Photo or map pin</button><span class="pins" data-pins>' + pinsText(it.c) + '</span></div>';
    return h + '</div></div>';
  }

  function ratingHTML(id, label) {
    var cur = S.ratings[id];
    return '<div class="rating"><h2>' + esc(label) + '</h2><div class="rates" data-rating="' + id + '">' + WA.RATINGS.map(function (r) {
      return '<button type="button" class="rate ' + r.v + '" data-rate="' + r.v + '" aria-pressed="' + (cur === r.v ? 'true' : 'false') + '"><b>' + r.l + '</b><small>' + r.h + '</small></button>';
    }).join('') + '</div></div>';
  }

  function viewCheck(sh) {
    var h = '<a class="back" href="#/">&lsaquo; Worksheets</a><h1>' + esc(sh.title) + '</h1>' +
      '<p class="hint">Answer Yes, No or Other. Skip anything that does not apply. Tap an answer again to clear it.</p>';
    (sh.pre || []).forEach(function (f) { h += fieldHTML(f); });
    sh.sections.forEach(function (sec) {
      h += '<h2>' + esc(sec.title) + '</h2>';
      sec.items.forEach(function (it, i) { h += itemHTML(sh, it, i + 1); });
    });
    (sh.post || []).forEach(function (f) { h += fieldHTML(f); });
    h += '<label class="fld"><span>Notes or other observations</span><textarea rows="3" data-sheetnote="' + sh.id + '">' + esc(S.notes[sh.id] || '') + '</textarea></label>';
    h += ratingHTML(sh.id, 'Walkability here, based on your answers');
    if (sh.id === 'sidewalks' || sh.id === 'streets') h += '<p class="hint next">What would fix it? See <a href="#/sheet/better">Build a Better Block</a>.</p>';
    return h + '<a class="btn primary big" href="#/">Done</a>';
  }

  /* ---------- tally and pick worksheets ---------- */

  function viewTally(sh) {
    var h = '<a class="back" href="#/">&lsaquo; Worksheets</a><h1>' + esc(sh.title) + '</h1><p class="hint">' + esc(sh.intro) + '</p>' +
      '<p class="span" id="countSpan">' + esc(countSpan()) + '</p>';
    sh.groups.forEach(function (g) {
      h += '<h2>' + esc(g.title) + '</h2>' + (g.n ? '<p class="qn">' + esc(g.n) + '</p>' : '');
      g.items.forEach(function (it) {
        h += '<div class="tally"><span class="tl">' + esc(it.t) + '</span>' +
          '<button type="button" class="minus" data-dec="' + it.c + '" aria-label="One fewer: ' + esc(it.t) + '">&minus;</button>' +
          '<output data-out="' + it.c + '">' + (S.counts[it.c] || 0) + '</output>' +
          '<button type="button" class="plus" data-inc="' + it.c + '" aria-label="Add one: ' + esc(it.t) + '">+</button></div>';
      });
    });
    h += '<label class="fld"><span>' + esc(sh.text.l) + '</span><small>' + esc(sh.text.h) + '</small><textarea rows="3" data-text="' + sh.text.c + '">' + esc(S.texts[sh.text.c] || '') + '</textarea></label>';
    return h + '<a class="btn primary big" href="#/">Done</a>';
  }

  function countSpan() {
    return S.count_first ? 'Counting from ' + WA.localTime(S.count_first) + ' to ' + WA.localTime(S.count_last) + '. The times are recorded with your counts.' : 'The time of your first and last tap is recorded, so counts can be turned into a rate.';
  }

  function viewPick(sh) {
    var h = '<a class="back" href="#/">&lsaquo; Worksheets</a><h1>' + esc(sh.title) + '</h1><p class="hint">' + esc(sh.intro) + '</p><div class="picks">';
    sh.items.forEach(function (it) {
      h += '<label class="pick"><input type="checkbox" data-bb="' + it.c + '"' + (S.better[it.c] ? ' checked' : '') + '><span>' + esc(it.t) + (it.h ? '<small>' + esc(it.h) + '</small>' : '') + '</span></label>';
    });
    h += '</div><label class="fld"><span>' + esc(sh.text.l) + '</span><textarea rows="3" data-text="' + sh.text.c + '">' + esc(S.texts[sh.text.c] || '') + '</textarea></label>';
    return h + '<a class="btn primary big" href="#/">Done</a>';
  }

  /* ---------- summary ---------- */

  function syncLine() {
    if (!WA.sync.on()) return 'Your work is saved on this phone. Nothing is sent anywhere unless you send it.';
    var st = WA.sync.status().state;
    if (st === 'sent' || st === 'idle') return 'Your work has been sent to the organizers’ shared sheet.';
    if (st === 'sending') return 'Sending to the shared sheet…';
    if (st === 'waiting') return 'No connection. Your work is saved on this phone and will send when you are back online. Keep this page open, or reopen it later.';
    return 'Could not reach the shared sheet. Your work is saved on this phone and will be retried.';
  }

  function viewSummary() {
    var kinds = { problem: 0, good: 0, idea: 0 };
    OBS.forEach(function (o) { kinds[o.kind] = (kinds[o.kind] || 0) + 1; });
    var h = '<h1>Summary</h1><p class="hint">These totals fill in from your worksheets. They are counts of answers, not a score.</p>';
    h += '<table class="sum"><thead><tr><th>Worksheet</th><th>Yes</th><th>No</th><th>Other</th><th>Rating</th></tr></thead><tbody>';
    WA.checkSheets().forEach(function (sh) {
      var st = WA.stats(S, sh), r = S.ratings[sh.id];
      h += '<tr' + (st.answered || r ? '' : ' class="empty"') + '><th><a href="#/sheet/' + sh.id + '">' + esc(sh.title) + '</a></th><td>' + st.yes + '</td><td>' + st.no + '</td><td>' + st.other +
        '</td><td>' + (r ? '<span class="tag ' + r + '">' + cap(r) + '</span>' : '—') + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<ul class="facts"><li><b>' + OBS.length + '</b> map ' + (OBS.length === 1 ? 'note' : 'notes') + ': ' + kinds.problem + ' problem, ' + kinds.good + ' good, ' + kinds.idea + ' idea</li>' +
      '<li><b>' + WA.countTotal(S) + '</b> people counted</li><li><b>' + WA.betterTotal(S) + '</b> improvements picked</li></ul>';
    h += ratingHTML('overall', 'Overall walkability (optional)');
    h += '<label class="fld"><span>Overall notes</span><small>What matters most here? What should be fixed first?</small><textarea rows="4" data-sheetnote="overall">' + esc(S.notes.overall || '') + '</textarea></label>';
    if (!S.submitted) h += '<button type="button" class="btn primary big" data-act="finish">Finish audit</button>';
    else h += '<p class="done">Finished at ' + WA.localTime(S.ended_at) + '. Thank you. You can still change answers.</p>' +
      (WA.sync.on() ? '<button type="button" class="btn big" data-act="finish">Send again</button>' : '');
    h += '<p class="note" id="syncLine">' + esc(syncLine()) + '</p>';
    h += '<h2>Keep a copy</h2><p class="hint">One file with your answers, notes and photos. Email or text it to yourself. If you walked with a group, send it to your walk leader too.</p>' +
      '<button type="button" class="btn ' + (S.submitted ? 'primary ' : '') + 'big copybtn" data-act="copy">Send a copy</button>';
    h += '<div class="row"><button type="button" class="btn" data-act="export">Download data tables (zip)</button><a class="btn" href="#/team">Team totals</a></div>';
    return h;
  }

  /* ---------- team totals ---------- */

  var team = { code: '', T: null, at: 0, err: '' };
  var combo = { sessions: [], obs: [], files: 0, skipped: [], own: true, T: null };   // files a walk leader has chosen
  function cleanCode(str) { return String(str || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 60); }
  function teamCode(r) { return cleanCode(r.arg || (S && S.code) || linkParams().code); }

  function viewTeam(r) {
    var h = '<a class="back" href="' + (S ? '#/summary' : '#/setup') + '">&lsaquo; ' + (S ? 'Summary' : 'Back') + '</a><h1>Team totals</h1>';
    if (!WA.sync.on()) {
      return h + '<p class="hint">For a walk leader. Ask each person to tap <b>Send a copy</b> and send you their file. Choose those files here to add everyone up. The files stay on this device; nothing is uploaded.</p>' +
        '<input type="file" id="comboIn" accept=".html,.htm,text/html" multiple hidden>' +
        '<div class="row"><button type="button" class="btn primary" data-act="combopick">' + (combo.files ? 'Add more files' : 'Choose files') + '</button>' +
        (combo.files || combo.skipped.length ? '<button type="button" class="btn" data-act="comboreset">Start over</button>' : '') + '</div>' +
        (S ? '<label class="pick slim"><input type="checkbox" id="comboOwn"' + (combo.own ? ' checked' : '') + '><span>Include my own audit on this phone</span></label>' : '') +
        '<div id="teamBody">' + comboHTML() + '</div>';
    }
    var code = teamCode(r);
    h += '<form id="teamForm" class="codeRow"><label class="fld"><span>Audit code</span><input type="text" name="code" value="' + esc(code) + '" autocomplete="off" autocapitalize="none" spellcheck="false"></label>' +
      '<button class="btn" type="submit">Load</button></form>';
    h += '<div id="teamBody">' + (code ? '<p class="loading">Adding up everyone’s answers…</p>' : '<p class="hint">Enter the audit code from your link.</p>') + '</div>';
    if (code) setTimeout(function () { loadTeam(code); }, 0);
    return h;
  }

  function loadTeam(code) {
    team.code = code; team.T = null; team.err = '';
    /* Send this phone's own answers first so they are in the totals. */
    WA.sync.flush().then(function () { return Promise.all([WA.sync.team(code), WA.sync.group(code)]); }).then(function (res) {
      team.T = WA.teamTotals(res[0], res[1]); team.at = Date.now();
    }).catch(function () {
      team.err = 'Could not load the team’s answers. Check your connection and try again.';
    }).then(function () {
      var b = $('#teamBody'), r = route();
      if (b && r.name === 'team' && teamCode(r) === code) b.innerHTML = teamHTML();
    });
  }

  /* Totals read from the shared sheet. */
  function teamHTML() {
    var again = '<button type="button" class="btn small" data-act="teamreload">Refresh</button>';
    if (team.err) return '<p class="err">' + esc(team.err) + '</p>' + again;
    var T = team.T;
    if (!T.people) return '<p class="note">No one has sent answers for the code <b>' + esc(team.code) + '</b> yet.</p>' + again;
    return '<p class="teamhead"><b>' + plural(T.people, 'person', 'people') + '</b> ' + (T.people === 1 ? 'has' : 'have') + ' sent answers; ' + T.finished + ' tapped Finish. Loaded at ' +
      WA.localTime(new Date(team.at).toISOString()) + '. ' + again + '</p>' + totalsHTML(T) +
      '<button type="button" class="btn" data-act="teamexport">Download team totals (zip of CSVs)</button>' +
      '<p class="fine">Names and written notes are not shown here. They are in the shared sheet, which only the organizers can open.</p>';
  }

  /* Totals from files the walk leader chose, worked out on this device. */
  function comboData() {
    var sessions = combo.sessions.slice(), obs = combo.obs.slice();
    var ownIn = !!(S && combo.own && !sessions.some(function (x) { return x.id === S.id; }));
    if (ownIn) { sessions.push(S); obs = obs.concat(OBS); }
    return { sessions: sessions, obs: obs, ownIn: ownIn };
  }

  function comboHTML() {
    var skipped = combo.skipped.length ? '<p class="note">Left out, because ' + (combo.skipped.length === 1 ? 'it is not a walk audit copy' : 'they are not walk audit copies') + ': ' + combo.skipped.map(esc).join(', ') + '.</p>' : '';
    if (!combo.files) return '<p class="hint">No files chosen yet.</p>' + skipped;
    var d = comboData(), counts = {}, names = [];
    d.obs.forEach(function (o) { counts[o.session_id] = (counts[o.session_id] || 0) + 1; });
    combo.T = WA.teamTotals(d.sessions.map(function (x) { return WA.sessionRow(x, counts[x.id] || 0); }), d.obs);
    d.sessions.forEach(function (x) { var n = x.code || WA.sessionName(x); if (names.indexOf(n) < 0) names.push(n); });
    return '<p class="teamhead"><b>' + plural(d.sessions.length, 'person', 'people') + '</b> in all: ' + plural(combo.sessions.length, 'copy', 'copies') + ' from the files you chose' + (d.ownIn ? ', plus your own audit' : '') + '.</p>' + skipped +
      (names.length > 1 ? '<p class="note">These come from more than one audit, so the totals mix them: ' + names.map(esc).join('; ') + '.</p>' : '') +
      totalsHTML(combo.T) +
      '<button type="button" class="btn primary big" data-act="comboexport">Download the combined data (zip)</button>' +
      '<p class="fine">The zip holds everyone’s answers, notes, map notes and photos as tables, plus these totals.</p>';
  }

  function readFiles(list) {
    var files = Array.prototype.slice.call(list || []);
    if (!files.length) return;
    Promise.all(files.map(function (f) {
      return new Promise(function (res) {
        if (f.size > 80e6) return res({ name: f.name, err: 'too large' });
        var fr = new FileReader();
        fr.onload = function () { try { res({ name: f.name, data: WA.readReport(String(fr.result)) }); } catch (e) { res({ name: f.name, err: e.message }); } };
        fr.onerror = function () { res({ name: f.name, err: 'could not be read' }); };
        fr.readAsText(f);
      });
    })).then(function (out) {
      var added = 0, updated = 0, bad = 0;
      out.forEach(function (r) {
        if (r.err) { bad++; if (combo.skipped.indexOf(r.name) < 0) combo.skipped.push(r.name); return; }
        combo.files++;
        r.data.sessions.forEach(function (x) {
          var at = -1;
          combo.sessions.forEach(function (y, k) { if (y.id === x.id) at = k; });
          /* The same person may send a second copy after changing answers: keep the newer one. */
          if (at >= 0 && (x.rev || 0) <= (combo.sessions[at].rev || 0)) return;
          if (at >= 0) { combo.sessions[at] = x; combo.obs = combo.obs.filter(function (o) { return o.session_id !== x.id; }); updated++; }
          else { combo.sessions.push(x); added++; }
          r.data.obs.forEach(function (o) { if (o.session_id === x.id) combo.obs.push(o); });
        });
      });
      var y = window.scrollY; render(); window.scrollTo(0, y);
      toast(added ? 'Added ' + plural(added, 'person', 'people') : updated ? 'Replaced ' + plural(updated, 'older copy', 'older copies') + ' with the newer one' :
        bad === out.length ? (bad === 1 ? 'That file is not a walk audit copy' : 'Those files are not walk audit copies') : 'Already added', 4000);
    });
  }

  /* The tables, shared by both kinds of team totals. */
  function totalsHTML(T) {
    var h = '';
    function td(n) { return '<td' + (n ? '' : ' class="z"') + '>' + n + '</td>'; }
    h += '<p class="hint">These add up what people recorded. Ratings are opinions, so look at how they spread; do not boil them down to one average.</p>';

    /* Worksheets nobody used are left out, and named once below, to keep this short. */
    var rated = T.ratings.filter(function (d) { return d.n; }), answered = T.sheets.filter(function (x) { return x.people; });
    var unused = T.sheets.filter(function (x) { return !x.people && !T.ratings.some(function (d) { return d.id === x.id && d.n; }); });
    h += '<h2>Ratings</h2>' + (rated.length ? '<table class="sum"><thead><tr><th>Worksheet</th><th>Great</th><th>Accept.</th><th>Mixed</th><th>Poor</th></tr></thead><tbody>' +
      rated.map(function (d) { return '<tr><th>' + esc(d.title) + '</th>' + td(d.great) + td(d.acceptable) + td(d.mixed) + td(d.poor) + '</tr>'; }).join('') + '</tbody></table>' : '<p class="hint">No one has given a rating yet.</p>');

    h += '<h2>Answers</h2>' + (answered.length ? '<table class="sum"><thead><tr><th>Worksheet</th><th>Yes</th><th>No</th><th>Other</th><th>People</th></tr></thead><tbody>' +
      answered.map(function (x) { return '<tr><th>' + esc(x.title) + '</th>' + td(x.yes) + td(x.no) + td(x.other) + td(x.people) + '</tr>'; }).join('') + '</tbody></table>' : '<p class="hint">No one has answered a checklist yet.</p>');
    if (unused.length && unused.length < T.sheets.length) h += '<p class="fine">Not used by anyone: ' + unused.map(function (x) { return esc(x.title); }).join(', ') + '.</p>';

    if (T.flagged.length) {
      var top = T.flagged.slice(0, 10), anyNeg = top.some(function (c) { return c.neg; });
      h += '<h2>Most-flagged items</h2><p class="hint">The items most often answered No' + (anyNeg ? ' (or Yes, where Yes is the problem)' : '') + '. With few people, treat the order as rough.</p><ol class="flags">' +
        top.map(function (c) { return '<li><b>' + c.concern + ' of ' + c.answered + '</b> said ' + (c.neg ? 'Yes' : 'No') + ': ' + esc(c.sheet) + ' ' + c.n + '. ' + esc(c.text) + '</li>'; }).join('') + '</ol>';
    }

    if (answered.length) h += '<h2>Every item</h2>' + answered.map(function (x) {
      return '<details><summary>' + esc(x.title) + '</summary><table class="sum items"><thead><tr><th>Item</th><th>Yes</th><th>No</th><th>Other</th></tr></thead><tbody>' +
        x.sections.map(function (sec) {
          return '<tr class="sec"><th colspan="4">' + esc(sec.title) + '</th></tr>' + sec.items.map(function (c) {
            return '<tr><th>' + c.n + '. ' + esc(c.text) + '</th>' + td(c.yes) + td(c.no) + td(c.other) + '</tr>';
          }).join('');
        }).join('') + '</tbody></table></details>';
    }).join('');

    if (T.timing.length) h += '<h2>Signal timing</h2><ul class="facts">' + T.timing.map(function (t) {
      return '<li>' + esc(t.label) + ': median <b>' + t.median + ' s</b> (' + t.min + ' to ' + t.max + ' s, ' + plural(t.n, 'reading', 'readings') + ')</li>';
    }).join('') + '</ul>';

    var cs = T.counts.filter(function (c) { return c.total > 0; });
    if (cs.length) h += '<h2>Counts</h2><p class="hint">If several people counted the same spot at the same time, these totals count the same passers-by more than once. In that case use one person’s count.</p>' +
      '<table class="sum"><thead><tr><th>Counter</th><th>Total</th><th>Counted by</th></tr></thead><tbody>' +
      cs.map(function (c) { return '<tr><th>' + esc(c.text) + '</th>' + td(c.total) + td(c.by) + '</tr>'; }).join('') + '</tbody></table>';

    if (T.better.length) h += '<h2>Improvements picked</h2><p class="hint">Out of ' + plural(T.betterBy, 'person', 'people') + ' who used Build a Better Block.</p><ol class="flags">' +
      T.better.map(function (b) { return '<li><b>' + b.picked + '</b> ' + esc(b.text) + '</li>'; }).join('') + '</ol>';

    var topics = Object.keys(T.obs.topics).sort(function (a, b) { return T.obs.topics[b] - T.obs.topics[a]; });
    h += '<h2>Map notes</h2><p><b>' + T.obs.total + '</b> in all: ' + (T.obs.kinds.problem || 0) + ' problem, ' + (T.obs.kinds.good || 0) + ' good, ' + (T.obs.kinds.idea || 0) + ' idea.' +
      (topics.length ? ' By topic: ' + topics.map(function (k) { return esc(topicLabel(k) || k) + ' ' + T.obs.topics[k]; }).join(', ') + '.' : '') + '</p>';
    return h;
  }

  /* ---------- finishing, copies and downloads ---------- */

  var copy = null;     // the prepared file, waiting for the person to tap Share

  /* Two steps on purpose. Phones only allow sharing straight from a tap, so
   * the file is built first and the Share button is a fresh tap. */
  function openCopy() {
    if (!S) return;
    modal.innerHTML = '<div class="sheet"><div class="mhead"><h1>Send a copy</h1><button type="button" class="x" data-act="closemodal" aria-label="Close">&times;</button></div>' +
      '<div class="mbody" id="copyBody"><p class="loading">Getting your copy ready…</p></div></div>';
    modal.hidden = false; document.body.classList.add('modal-open');
    var mine = S;
    saveNow().then(function () { return WA.db.all('obs'); }).then(function (all) {
      var obs = all.filter(function (o) { return o.session_id === mine.id && !o.deleted; });
      var html = WA.reportHTML(mine, obs), name = WA.reportName(mine), file = null;
      try { file = new File([html], name, { type: 'text/html' }); } catch (e) {}
      var can = false;
      try { can = !!(file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) {}
      copy = { html: html, name: name, file: file, can: can, title: 'Walk audit: ' + WA.sessionName(mine), text: WA.reportText(mine, obs) };
      var mb = html.length / 1e6, b = $('#copyBody'); if (!b) return;
      b.innerHTML = '<p>Your copy is ready: one file with your answers, notes and ' + plural(obs.filter(function (o) { return o.photo; }).length, 'photo', 'photos') +
        ' (' + (mb < 0.1 ? 'under 0.1' : mb.toFixed(1)) + ' MB). It opens in any web browser.</p>' +
        (mb > 20 ? '<p class="note">This file is large. Many email services refuse attachments over 25 MB. A text message, AirDrop or a file-sharing app may work better.</p>' : '') +
        (can ? '<button type="button" class="btn primary big" data-act="copyshare">Share it (email, text…)</button>' +
          '<p class="fine">Pick Mail or Messages and send it to yourself. If you walked with a group, send it to your walk leader too.</p>'
          : '<p class="note">This browser cannot hand a file to your mail app. Save the file, then attach it to an email or text yourself.</p>') +
        '<button type="button" class="btn big" data-act="copysave">Save the file on this ' + (can ? 'phone' : 'device') + '</button>';
    }).catch(function () { var b = $('#copyBody'); if (b) b.innerHTML = '<p class="err">Could not make the copy. Try Download data tables instead.</p>'; });
  }

  function finish() {
    S.ended_at = new Date().toISOString(); S.submitted = true;
    touch();
    saveNow().then(function () {
      render();
      if (!WA.sync.on()) { openCopy(); return; }       // no shared sheet: offer the person their copy straight away
      WA.sync.flush().then(function () {
        var st = WA.sync.status().state;
        toast(st === 'sent' || st === 'idle' ? 'Sent. Thank you.' : 'Saved. It will send when you are online.', 4000);
        var l = $('#syncLine'); if (l) l.textContent = syncLine();
      });
    });
  }

  function exportData(sessions) {
    return WA.db.all('obs').then(function (all) {
      var ids = {}; sessions.forEach(function (s) { ids[s.id] = 1; });
      var z = WA.exportZip(sessions, all.filter(function (o) { return ids[o.session_id]; }));
      WA.download(z.blob, z.name);
      toast('Saved ' + z.name, 5000);
    }).catch(function (e) { toast('Could not make the file: ' + (e && e.message), 6000); });
  }

  /* ---------- location ---------- */

  var lastPosSaved = 0, gpsBlocked = false;
  function gpsRefresh() {
    if (!navigator.geolocation) { gpsErr = 'unsupported'; return; }
    var any = Object.keys(gpsReasons).length > 0 && !document.hidden;      // never watch while the page is in the background
    if (any && watchId == null && !gpsBlocked) {
      watchId = navigator.geolocation.watchPosition(function (p) {
        gps = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() };
        gpsErr = '';
        /* Remember roughly where this phone was (to about 100 m) so the map opens nearby next time. Kept on the phone only. */
        if (Date.now() - lastPosSaved > 30000) { lastPosSaved = Date.now(); ls('wa_lastpos', JSON.stringify([Math.round(gps.lat * 1000) / 1000, Math.round(gps.lon * 1000) / 1000])); }
        drawMe(); if (draft) draftFix(); if ($('#lkHere')) buildLink();
      }, function (e) {
        if (e.code === 1) {
          /* Refused. Stop asking until the person does something that needs it. */
          gpsErr = 'denied'; gpsBlocked = true;
          if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
        } else gpsErr = 'unavailable';
        if (draft) draftFix(); if ($('#lkHere')) buildLink();
      }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
    } else if (!any && watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  }
  function wantGPS(who, on) { if (on) gpsReasons[who] = 1; else delete gpsReasons[who]; gpsRefresh(); }
  /* Try again after a refusal: the person may have turned location on in settings since. */
  function gpsRetry() { if (gpsBlocked) { gpsBlocked = false; gpsErr = ''; gpsRefresh(); } }
  function freshGPS() { return gps && Date.now() - gps.t < 30000 ? gps : null; }

  /* ---------- map ---------- */

  function tiles() { return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' }); }
  /* Leaflet's default credit links open in the same tab, which would drop a
   * person out of the audit if tapped by accident. */
  function newMap(id, center, zoom) {
    var m = L.map(id, { zoomControl: true }).setView(center, zoom);
    m.attributionControl.setPrefix(false);
    tiles().addTo(m);
    return m;
  }
  function pinIcon(kind) {
    var k = WA.KINDS.filter(function (x) { return x.v === kind; })[0] || WA.KINDS[0];
    return L.divIcon({ className: 'pinwrap', html: '<div class="pin ' + k.v + '">' + k.g + '</div>', iconSize: [36, 36], iconAnchor: [18, 18] });
  }
  function topicLabel(t) { for (var i = 0; i < WA.TOPICS.length; i++) if (WA.TOPICS[i][0] === t) return WA.TOPICS[i][1]; return ''; }

  var follow = true;     // keep the map centered on the person as they walk, until they drag it
  function setFollow(on) { follow = on; var b = $('#followBtn'); if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false'); }

  function showMap() {
    if (!map) {
      var sv = startView();
      map = newMap('map', [sv[0], sv[1]], sv[2]);
      map.on('dragstart', function () { setFollow(false); });
      drawMe();
    }
    $('#groupBtn').hidden = !(WA.sync.on() && S && S.code);
    $('#allBtn').hidden = !OBS.length;
    setFollow(follow);
    setTimeout(function () {
      map.invalidateSize();
      refreshMarkers();
      if (!centered) {
        centered = true;
        if (freshGPS()) { setFollow(true); map.setView([gps.lat, gps.lon], 18); }
        else if (!fitNotes()) { var v = startView(); map.setView([v[0], v[1]], v[2]); setFollow(true); }
      } else if (follow && freshGPS()) map.setView([gps.lat, gps.lon], Math.max(map.getZoom(), 17));
    }, 30);
  }

  function fitNotes() {
    var pts = OBS.filter(function (o) { return o.lat != null; }).map(function (o) { return [o.lat, o.lon]; });
    if (!map || !pts.length) return false;
    setFollow(false);
    map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 18 });
    return true;
  }

  function refreshMarkers() {
    if (!map) return;
    Object.keys(markers).forEach(function (id) { map.removeLayer(markers[id]); });
    markers = {};
    OBS.forEach(function (o) {
      if (o.lat == null) return;
      var m = L.marker([o.lat, o.lon], { icon: pinIcon(o.kind), title: topicLabel(o.topic) || 'Map note' }).addTo(map);
      m.on('click', function () { openObs({ id: o.id }); });
      markers[o.id] = m;
    });
  }

  function drawMe() {
    if (!map || !gps) return;
    var ll = [gps.lat, gps.lon];
    if (!meDot) {
      meRing = L.circle(ll, { radius: gps.acc, color: '#1d4ed8', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(map);
      meDot = L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2, fillColor: '#1d4ed8', fillOpacity: 1, interactive: false }).addTo(map);
    } else { meDot.setLatLng(ll); meRing.setLatLng(ll); meRing.setRadius(gps.acc); }
    if (follow && route().name === 'map' && modal.hidden) { if (map.getZoom() < 17) map.setView(ll, 18); else map.panTo(ll); }
  }

  function locate() {
    setFollow(true); gpsRetry();
    if (freshGPS()) { map.setView([gps.lat, gps.lon], Math.max(map.getZoom(), 18)); return; }
    toast(gpsErr === 'denied' ? 'Location is turned off for this page. Allow it in your phone’s settings, then reload.' :
      gpsErr ? 'Your phone could not find its location.' : 'Finding your location…', 5000);
  }

  function toggleGroup() {
    var btn = $('#groupBtn');
    if (groupLayer) { map.removeLayer(groupLayer); groupLayer = null; btn.setAttribute('aria-pressed', 'false'); return; }
    btn.disabled = true;
    WA.sync.group(S.code).then(function (list) {
      var colors = { problem: '#b42318', good: '#166534', idea: '#1d4ed8' };
      var others = list.filter(function (o) { return o.session_id !== S.id && o.lat !== '' && o.lat != null; });
      groupLayer = L.layerGroup(others.map(function (o) {
        return L.circleMarker([Number(o.lat), Number(o.lon)], { radius: 9, color: colors[o.kind] || '#555', weight: 3, fillOpacity: 0.2 })
          .bindPopup('<b>' + esc(topicLabel(o.topic) || cap(String(o.kind || 'note'))) + '</b>' + (o.note ? '<br>' + esc(o.note) : ''));
      })).addTo(map);
      btn.setAttribute('aria-pressed', 'true');
      toast(others.length ? plural(others.length, 'note', 'notes') + ' from other people, shown as rings' : 'No notes from other people yet', 4000);
    }).catch(function () { toast('Could not load the group’s notes.'); }).then(function () { btn.disabled = false; });
  }

  /* ---------- map note (add / edit) ---------- */

  function photoURL(o) {
    if (!o.photo) return '';
    var k = o.id + ':' + (o.rev || 0);
    if (!urls[k]) urls[k] = URL.createObjectURL(new Blob([o.photo.buf], { type: o.photo.type || 'image/jpeg' }));
    return urls[k];
  }

  function openObs(opt) {
    if (!S) return;
    var ex = opt.id ? OBS.filter(function (o) { return o.id === opt.id; })[0] : null;
    draft = ex ? { ex: ex, kind: ex.kind, topic: ex.topic, note: ex.note, item: ex.item, lat: ex.lat, lon: ex.lon, acc: ex.acc, src: ex.src, photo: ex.photo, photoChanged: false, locked: true }
      : { ex: null, kind: 'problem', topic: '', note: '', item: opt.item || '', lat: null, lon: null, acc: null, src: '', photo: null, photoChanged: false, locked: false };
    if (!ex && opt.item) {
      var a = S.answers[opt.item];
      draft.kind = a && a.a === 'yes' ? 'good' : 'problem';
      draft.topic = WA.ITEM_TOPIC[opt.item] || WA.SHEET_TOPIC[opt.sheet] || '';
    }
    var info = draft.item ? WA.findItem(draft.item) : null;
    var h = '<div class="sheet"><div class="mhead"><h1>' + (ex ? 'Edit map note' : 'Note at this spot') + '</h1><button type="button" class="x" data-act="closemodal" aria-label="Close">&times;</button></div><div class="mbody">';
    if (info) h += '<p class="about">About: <b>' + esc(info.sheet.title) + '</b> — ' + esc(info.item.t) + '</p>';
    /* Where comes first and fills itself in from the phone. The person only touches the map if the pin is wrong. */
    h += '<div class="where wait" id="whereBox"><b id="locHead"></b><small id="locMsg"></small><div id="pinMap"></div>' +
      '<button type="button" class="btn small" data-act="usegps" id="useGps" hidden>Use my location now</button></div>';
    h += '<div class="fld"><span>What is it?</span>' + chips('data-draft="kind"', WA.KINDS.map(function (k) { return [k.v, k.l]; }), function (v) { return draft.kind === v; }) + '</div>';
    h += '<div class="fld"><span>Photo</span><div id="photoBox"></div>' +
      '<input type="file" accept="image/*" capture="environment" id="camIn" hidden><input type="file" accept="image/*" id="libIn" hidden></div>';
    h += '<div class="fld"><span>Topic</span>' + chips('data-draft="topic"', WA.TOPICS, function (v) { return draft.topic === v; }) + '</div>';
    h += '<label class="fld"><span>Note</span><textarea id="obsNote" rows="3" placeholder="What is here? Who does it affect?">' + esc(draft.note) + '</textarea></label>';
    h += '<p class="fine">Avoid faces and license plates in photos where you can.</p></div>';
    h += '<div class="mfoot">' + (ex ? '<button type="button" class="btn danger" data-act="delobs">Delete</button>' : '<button type="button" class="btn" data-act="closemodal">Cancel</button>') +
      '<button type="button" class="btn primary" data-act="saveobs">Save note</button></div></div>';
    modal.innerHTML = h; modal.hidden = false; document.body.classList.add('modal-open');
    drawPhoto();
    var sv = startView(), g = freshGPS();
    var start = draft.lat != null ? [draft.lat, draft.lon] : g ? [g.lat, g.lon] : map ? [map.getCenter().lat, map.getCenter().lng] : [sv[0], sv[1]];
    var pm = newMap('pinMap', start, draft.lat != null || g ? 18 : (map ? map.getZoom() : sv[2]));
    draft.pm = pm;
    pm.on('click', function (e) { placePin(e.latlng.lat, e.latlng.lng, 'pin', null, false); });
    if (draft.lat != null) placePin(draft.lat, draft.lon, draft.src, draft.acc, false);
    setTimeout(function () { if (draft && draft.pm) draft.pm.invalidateSize(); }, 60);
    if (!ex) gpsRetry();
    wantGPS('obs', true);
    draftFix();
  }

  function placePin(lat, lon, src, acc, recenter) {
    draft.lat = lat; draft.lon = lon; draft.src = src; draft.acc = acc;
    if (src === 'pin') draft.locked = false;
    if (!draft.marker) {
      draft.marker = L.marker([lat, lon], { draggable: true, autoPan: true }).addTo(draft.pm);
      draft.marker.on('dragend', function () { var p = draft.marker.getLatLng(); placePin(p.lat, p.lng, 'pin', null, false); });
    } else draft.marker.setLatLng([lat, lon]);
    if (recenter) draft.pm.setView([lat, lon], Math.max(draft.pm.getZoom(), 18));
    locMsg();
  }

  /* Take the phone's position unless the person has placed the pin by hand.
   * While the fix is rough (worse than about 15 m) take any better one. Once
   * it is good, move only for a much better fix, so the pin does not wander
   * while they type or walk on. */
  function draftFix() {
    if (!draft) return;
    var g = freshGPS();
    if (g && !draft.locked && (draft.src === '' || (draft.src === 'gps' && (g.acc < draft.acc * 0.7 || (draft.acc > 15 && g.acc < draft.acc))))) placePin(g.lat, g.lon, 'gps', g.acc, true);
    locMsg();
  }

  function locMsg() {
    var box = $('#whereBox'); if (!box || !draft) return;
    var head, msg, cls = 'ok', m = Math.round(draft.acc || 0);
    if (draft.src === 'gps' && draft.locked) { head = 'Where you stood'; msg = 'From your phone' + (draft.acc != null ? ', within about ' + m + ' m' : '') + '. Drag the pin to correct it.'; }
    else if (draft.src === 'gps' && draft.acc <= 15) { head = 'At your location'; msg = 'Within about ' + m + ' m. Drag the pin only if it is off.'; }
    else if (draft.src === 'gps') { head = 'At your location, roughly'; msg = 'Within about ' + m + ' m. Stand still a few seconds for a better fix, or drag the pin.'; cls = 'warn'; }
    else if (draft.src === 'pin') { head = 'Pin placed by hand'; msg = 'Drag it or tap the map to move it.'; }
    else if (gpsErr === 'denied') { head = 'Location is turned off'; msg = 'Tap the map to place the pin. To use your location, allow it for this page in your phone’s settings, then reload. On an iPhone: Settings > Privacy & Security > Location Services > Safari Websites.'; cls = 'warn'; }
    else if (gpsErr) { head = 'Can’t find your location'; msg = 'Tap the map to place the pin.'; cls = 'warn'; }
    else { head = 'Finding your location…'; msg = 'Stand still for a moment. Or tap the map to place the pin.'; cls = 'wait'; }
    box.className = 'where ' + cls;
    $('#locHead').textContent = head; $('#locMsg').textContent = msg;
    $('#useGps').hidden = !(draft.src === 'pin' || draft.locked) || !!gpsErr;
  }

  function drawPhoto() {
    var box = $('#photoBox'); if (!box) return;
    if (draft.photo) {
      if (draft.purl) URL.revokeObjectURL(draft.purl);
      draft.purl = URL.createObjectURL(new Blob([draft.photo.buf], { type: 'image/jpeg' }));
      box.innerHTML = '<img src="' + draft.purl + '" alt="Your photo"><div class="row"><button type="button" class="btn small" data-act="cam">Retake</button><button type="button" class="btn small" data-act="nophoto">Remove</button></div>';
    } else {
      box.innerHTML = '<div class="row"><button type="button" class="btn cam" data-act="cam">Take photo</button><button type="button" class="btn small" data-act="lib">Choose a photo</button></div>';
    }
  }

  /* Shrink to 1600 px on the long side. Re-encoding also drops the camera's
   * embedded GPS tags; the pin is the location of record. */
  function shrink(file) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u);
        c.toBlob(function (b) {
          if (!b) return rej(new Error('Could not process that photo.'));
          var fr = new FileReader();
          fr.onload = function () { res({ buf: fr.result, type: 'image/jpeg' }); };
          fr.onerror = function () { rej(new Error('Could not read that photo.')); };
          fr.readAsArrayBuffer(b);
        }, 'image/jpeg', 0.8);
      };
      img.onerror = function () { URL.revokeObjectURL(u); rej(new Error('Could not open that photo.')); };
      img.src = u;
    });
  }
  WA._shrink = shrink;

  function gotPhoto(file) {
    if (!file || !draft) return;
    shrink(file).then(function (p) { if (!draft) return; draft.photo = p; draft.photoChanged = true; drawPhoto(); })
      .catch(function (e) { toast(e.message, 5000); });
  }

  function closeModal() {
    if (draft) {
      if (draft.pm) draft.pm.remove();
      if (draft.purl) URL.revokeObjectURL(draft.purl);
      draft = null; wantGPS('obs', false);
    }
    copy = null; wantGPS('link', false);
    modal.hidden = true; modal.innerHTML = ''; document.body.classList.remove('modal-open');
  }

  function saveObs() {
    var note = ($('#obsNote').value || '').trim().slice(0, 2000);
    if (draft.lat == null) { toast(gpsErr ? 'Tap the map to place the pin first.' : 'Still finding your location. Wait a moment, or tap the map.', 4000); $('#pinMap').scrollIntoView({ block: 'center' }); return; }
    var o = draft.ex || { id: WA.uid(), session_id: S.id, code: S.code, created_at: new Date().toISOString() };
    o.kind = draft.kind; o.topic = draft.topic; o.note = note; o.item = draft.item;
    o.lat = draft.lat; o.lon = draft.lon; o.acc = draft.src === 'gps' ? draft.acc : null; o.src = draft.src;
    if (draft.photoChanged) { o.photo = draft.photo; o.photo_sent = false; }
    o.rev = (o.rev || 0) + 1; o.synced = false;
    var isNew = !draft.ex, byPhone = draft.src === 'gps';
    WA.db.put('obs', o).then(function () {
      if (isNew) OBS.push(o);
      closeModal(); refreshMarkers(); afterObsChange(o.item);
      if (map && route().name === 'map' && !map.getBounds().contains([o.lat, o.lon])) map.panTo([o.lat, o.lon]);
      touch(); WA.sync.soon(1500);
      $('#allBtn').hidden = !OBS.length;
      toast(isNew && byPhone ? 'Saved at your location' : 'Map note saved');
    }).catch(function () { toast('Could not save. Your phone may be out of space.', 6000); });
  }

  function delObs() {
    var o = draft && draft.ex; if (!o) return;
    if (!window.confirm('Delete this map note?')) return;
    OBS = OBS.filter(function (x) { return x.id !== o.id; });
    var p;
    if (WA.sync.on() && o.sent_once) { o.deleted = true; o.rev = (o.rev || 0) + 1; o.synced = false; p = WA.db.put('obs', o); }
    else p = WA.db.del('obs', o.id);
    p.then(function () { closeModal(); refreshMarkers(); afterObsChange(o.item); touch(); WA.sync.soon(1500); toast('Deleted'); });
  }

  function afterObsChange(item) {
    var r = route();
    if (r.name === 'home' || r.name === 'summary') { var y = window.scrollY; render(); window.scrollTo(0, y); }
    else if (item) { var el = $('.item[data-c="' + item + '"] [data-pins]'); if (el) el.textContent = pinsText(item); }
  }

  /* ---------- menu ---------- */

  function openMenu(panel) {
    var big = document.documentElement.classList.contains('big');
    var h = '<div class="sheet"><div class="mhead"><h1>' + (panel === 'link' ? 'Make an audit link' : panel === 'past' ? 'Audits on this phone' : panel === 'about' ? 'About' : panel === 'ready' ? 'Before you go' : 'Menu') +
      '</h1><button type="button" class="x" data-act="closemodal" aria-label="Close">&times;</button></div><div class="mbody" id="menuBody">';
    if (panel === 'about') {
      h += '<p>A paperless walk audit form for any community. Version ' + WA.VERSION + '.</p>' + aboutText() +
        '<p class="fine"><b>What is recorded:</b> your answers, your notes and photos, the place of each map note, the time, and your name only if you typed it.</p>' +
        '<p class="fine"><b>Where it goes:</b> ' + (WA.sync.on() ? 'it is saved on this phone and sent to the organizers’ shared sheet. Photos are not shown to other participants.' :
          'nowhere, unless you send it. It is saved on this phone. Nobody else has a copy until you tap Send a copy and send it to them.') + '</p>' +
        '<p class="fine"><b>Your location:</b> the page watches it while open, if you allow it, so notes land where you stand. It is saved only with a map note.</p>' +
        '<p class="fine">Map data &copy; OpenStreetMap contributors. Map pictures are fetched from OpenStreetMap as you move the map.</p>';
    } else if (panel === 'ready') {
      h += '<h2 class="first">Plan it</h2><ul class="tips">' +
        '<li><b>Where.</b> One corner or block is easier to finish and act on. A route covers more.</li>' +
        '<li><b>When.</b> Go when the people you are worried about are out: school hours, rush hour, after dark. Check the forecast.</li>' +
        '<li><b>Who.</b> Include people who walk at different speeds, who roll, or who have low vision or hearing. Invite someone who can act on the results.</li>' +
        '<li><b>Agree first.</b> Decide who does which worksheet, and what counts as a Yes or a No, so everyone records the same way.</li>' +
        '<li><b>Repeat.</b> A second visit on another day or time makes the findings firmer.</li></ul>' +
        '<h2>Bring</h2><ul class="tips"><li>This phone, charged</li><li>A tape measure (sidewalks should be about 5 feet wide)</li>' +
        '<li>Water and a snack</li><li>Clothes and shoes for the weather; hat and sunscreen</li><li>A bright shirt or safety vest</li>' +
        '<li>A flashlight if it may get dark</li><li>A folding seat if you will watch one spot</li></ul>' +
        '<h2>On the walk</h2><ul class="tips"><li>Turn on location for this page, so each note lands where you stand.</li>' +
        '<li>Photograph good features as well as problems.</li>' +
        '<li>Photos to get: crossing signals, traffic lights, turning lanes, curb ramps, sidewalks, crosswalks and stop lines, lighting.</li>' +
        '<li>Video is not saved here. Use your camera app and send clips to your walk leader.</li></ul>' +
        '<h2>After</h2><ul class="tips"><li>Tap Finish, then Send a copy. Send it to yourself and to your walk leader.</li>' +
        '<li>Walk leader: open Team totals and choose everyone’s files to add them up.</li></ul>' +
        '<p class="fine">Adapted from the steps in the AARP Walk Audit Tool Kit.</p>';
    } else if (panel === 'link') {
      var L = linkParams();
      h += '<p class="hint">For a walk leader. Fill this in once, then send everyone the same link. It fills in the details for them.</p>' +
        '<label class="fld"><span>Community</span><input type="text" id="lkCom" value="' + esc((S && S.community) || ls('wa_community') || L.community || '') + '" placeholder="City or town, and state"></label>' +
        '<label class="fld"><span>Audit code</span><small>Short, no spaces. It marks which audit a copy belongs to.</small><input type="text" id="lkCode" value="' + esc(L.code || 'walk-' + WA.localDate(new Date().toISOString())) + '"></label>' +
        '<div class="fld"><span>Kind</span>' + chips('id="lkType"', [['route', 'Walking route'], ['single', 'Single location']], function (v) { return v === 'route'; }) + '</div>' +
        '<label class="fld"><span>Start (route) or location (single)</span><input type="text" id="lkA"></label>' +
        '<label class="fld"><span>End (route only)</span><input type="text" id="lkB"></label>' +
        '<label class="fld"><span>Route (route only)</span><input type="text" id="lkR"></label>' +
        '<label class="pick slim"><input type="checkbox" id="lkHere"><span>Open everyone’s map where I am standing now<small>Tick this only when you are on the route. It puts your current location in the link.</small></span></label>' +
        '<p class="fine" id="lkAt"></p>' +
        '<label class="fld"><span>Link for participants</span><textarea id="lkOut" rows="4" readonly></textarea></label>' +
        '<div class="row"><button type="button" class="btn primary" data-act="copylink">Copy link</button><button type="button" class="btn" data-act="sharelink">Share</button></div>' +
        (WA.sync.on() ? '<label class="fld results"><span>Link to the team totals</span><small>For you. It adds up everyone’s answers for this code.</small><textarea id="lkTeam" rows="2" readonly></textarea></label>' : '');
    } else if (panel === 'past') {
      h += '<p class="loading">Loading&hellip;</p>';
    } else {
      h += '<div class="menu">' +
        (S ? '<button type="button" data-act="m-copy">Send a copy</button><button type="button" data-act="m-details">Edit audit details</button>' : '') +
        '<button type="button" data-act="m-ready">Before you go: plan and what to bring</button>' +
        '<button type="button" data-act="m-team">Team totals<small>' + (WA.sync.on() ? 'Everyone’s answers added up' : 'For a walk leader: combine everyone’s files') + '</small></button>' +
        '<button type="button" data-act="m-link">Make an audit link<small>For a walk leader</small></button>' +
        '<button type="button" data-act="m-new">Start a new audit</button>' +
        '<button type="button" data-act="m-past">Audits on this phone</button>' +
        (S ? '<button type="button" data-act="m-export">Download data tables (zip)</button>' : '') +
        '<button type="button" data-act="m-big">' + (big ? 'Normal text size' : 'Larger text') + '</button>' +
        '<button type="button" data-act="m-about">About and privacy</button></div>';
    }
    h += '</div></div>';
    modal.innerHTML = h; modal.hidden = false; document.body.classList.add('modal-open');
    if (panel === 'link') buildLink();
    if (panel === 'past') WA.db.all('sessions').then(function (all) {
      all.sort(function (a, b) { return a.started_at < b.started_at ? 1 : -1; });
      var b = $('#menuBody'); if (!b) return;
      b.innerHTML = all.length ? '<div class="menu">' + all.map(function (x) {
        return '<button type="button" data-act="m-open" data-id="' + x.id + '"><b>' + esc(WA.sessionName(x)) + '</b><small>' + WA.localDate(x.started_at) + ' ' + WA.localTime(x.started_at) +
          (x.submitted ? ' · finished' : ' · not finished') + (S && S.id === x.id ? ' · open now' : '') + '</small></button>';
      }).join('') + '</div><button type="button" class="btn" data-act="m-exportall">Download all of them (zip)</button>' : '<p>No audits yet.</p>';
    });
  }

  function buildLink() {
    var out = $('#lkOut'); if (!out) return;
    var on = $('#lkType [aria-pressed="true"]'), type = on ? on.getAttribute('data-v') : 'route';
    var q = new URLSearchParams();
    var com = $('#lkCom').value.trim(), code = cleanCode($('#lkCode').value);
    if (com) q.set('community', com);
    if (code) q.set('code', code);
    q.set('type', type);
    var a = $('#lkA').value.trim(), b = $('#lkB').value.trim(), r = $('#lkR').value.trim();
    if (type === 'single') { if (a) q.set('place', a); } else { if (a) q.set('from', a); if (b) q.set('to', b); if (r) q.set('route', r); }
    /* The leader's location goes in the link only if they tick the box. */
    var here = $('#lkHere').checked, g = freshGPS(), note = $('#lkAt');
    if (here && g) { q.set('at', g.lat.toFixed(4) + ',' + g.lon.toFixed(4) + ',17'); note.textContent = 'The map will open near ' + g.lat.toFixed(3) + ', ' + g.lon.toFixed(3) + '.'; }
    else note.textContent = here ? (gpsErr ? 'Your location is not available, so the link has no map position.' : 'Finding your location…') : 'Without it, each person’s map opens at their own location.';
    out.value = location.origin + location.pathname + '?' + q.toString();
    var tl = $('#lkTeam'); if (tl) tl.value = code ? location.origin + location.pathname + '#/team/' + code : '';
  }

  /* ---------- events ---------- */

  function setChip(group, btn, multi) {
    if (multi) btn.setAttribute('aria-pressed', btn.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    else { var was = btn.getAttribute('aria-pressed') === 'true'; $$('button', group).forEach(function (b) { b.setAttribute('aria-pressed', 'false'); }); if (!was) btn.setAttribute('aria-pressed', 'true'); }
    return $$('button[aria-pressed="true"]', group).map(function (b) { return b.getAttribute('data-v'); });
  }

  function answer(item, v) {
    var c = item.getAttribute('data-c'), a = S.answers[c] || (S.answers[c] = {});
    a.a = a.a === v ? '' : v;
    $$('.ans', item).forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-a') === a.a ? 'true' : 'false'); });
    var det = $('.detail', item); if (det) det.hidden = !(det.getAttribute('data-on') === 'any' || det.getAttribute('data-on') === a.a);
    var ta = $('[data-note]', item), nb = $('[data-act="noteopen"]', item);
    if (a.a === 'no' || a.a === 'other') { ta.hidden = false; nb.hidden = true; }
    $('.more', item).hidden = !(a.a || a.note);
    if (!a.a && !a.note && (a.d == null || a.d === '')) delete S.answers[c];
    touch();
  }

  /* Stopwatch for the signal-timing questions: tap to start, tap to stop. */
  var tm = null;
  function stopTimer(keep) {
    if (!tm) return;
    clearInterval(tm.iv);
    var secs = Math.round((Date.now() - tm.t0) / 1000), t = tm;
    tm = null;
    t.btn.textContent = 'Time it'; t.btn.classList.remove('running');
    if (keep && t.input) { t.input.value = secs; t.input.dispatchEvent(new Event('input', { bubbles: true })); }
  }

  var acts = {
    menu: function () { openMenu(); },
    teamreload: function () { var b = $('#teamBody'); if (b) b.innerHTML = '<p class="loading">Adding up everyone\u2019s answers\u2026</p>'; loadTeam(team.code); },
    teamexport: function () { if (!team.T) return; var z = WA.teamZip(team.code, team.T); WA.download(z.blob, z.name); toast('Saved ' + z.name, 5000); },
    'm-team': function () { closeModal(); go('#/team'); },
    'm-copy': function () { closeModal(); openCopy(); },
    copy: openCopy,
    copyshare: function () {
      if (!copy || !copy.can) return;
      navigator.share({ title: copy.title, text: copy.text, files: [copy.file] }).then(function () { closeModal(); toast('Shared'); })
        .catch(function (e) { if (!e || e.name !== 'AbortError') toast('Sharing did not work. Save the file instead.', 5000); });
    },
    copysave: function () {
      if (!copy) return;
      WA.download(new Blob([copy.html], { type: 'text/html' }), copy.name);
      toast('Saved ' + copy.name + '. Attach it to an email or text to send it.', 7000);
    },
    combopick: function () { $('#comboIn').click(); },
    comboreset: function () { combo = { sessions: [], obs: [], files: 0, skipped: [], own: combo.own, T: null }; render(); },
    comboexport: function () {
      var d = comboData(); if (!d.sessions.length || !combo.T) return;
      var code = d.sessions[0].code || '';
      var z = WA.exportZip(d.sessions, d.obs, { name: 'walk-audit_combined_' + (WA.slug(code) || 'team') + '_' + WA.localDate(new Date().toISOString()) + '.zip',
        extra: WA.teamFiles(code, combo.T).map(function (f) { return { name: 'team/' + f.name, data: f.data }; }) });
      WA.download(z.blob, z.name); toast('Saved ' + z.name, 5000);
    },
    allnotes: function () { if (!fitNotes()) toast('No map notes yet'); },
    timer: function (t) {
      if (tm && tm.btn === t) return stopTimer(true);
      stopTimer(true);
      tm = { btn: t, input: t.parentNode.querySelector('[data-detail]'), t0: Date.now() };
      t.classList.add('running'); t.textContent = 'Stop (0 s)';
      tm.iv = setInterval(function () { if (tm) tm.btn.textContent = 'Stop (' + Math.round((Date.now() - tm.t0) / 1000) + ' s)'; }, 250);
    },
    'm-ready': function () { openMenu('ready'); },
    closemodal: closeModal,
    add: function () { openObs({}); },
    pin: function (t) { var it = t.closest('.item'); openObs({ item: it.getAttribute('data-c'), sheet: it.getAttribute('data-sheet') }); },
    noteopen: function (t) { var it = t.closest('.item'), ta = $('[data-note]', it); ta.hidden = false; t.hidden = true; ta.focus(); },
    finish: finish,
    'export': function () { exportData([S]); },
    locate: locate,
    group: toggleGroup,
    cam: function () { $('#camIn').click(); },
    lib: function () { $('#libIn').click(); },
    nophoto: function () { draft.photo = null; draft.photoChanged = true; drawPhoto(); },
    usegps: function () {
      gpsRetry();
      var g = freshGPS();
      if (g) { draft.locked = false; placePin(g.lat, g.lon, 'gps', g.acc, true); }
      else { draft.locked = false; if (draft.src !== 'pin') draft.src = ''; locMsg(); toast(gpsErr ? 'Your location is not available. Tap the map instead.' : 'Still finding your location…'); }
    },
    saveobs: saveObs,
    delobs: delObs,
    'm-details': function () { closeModal(); go('#/details'); },
    'm-export': function () { closeModal(); exportData([S]); },
    'm-new': function () { closeModal(); go('#/setup'); },
    'm-past': function () { openMenu('past'); },
    'm-link': function () { openMenu('link'); },
    'm-about': function () { openMenu('about'); },
    'm-big': function () { var on = document.documentElement.classList.toggle('big'); ls('wa_big', on ? '1' : '0'); closeModal(); if (map) setTimeout(function () { map.invalidateSize(); }, 50); },
    'm-open': function (t) {
      var id = t.getAttribute('data-id');
      saveNow().then(function () { return WA.db.get('sessions', id); }).then(function (s) { if (!s) return; return setActive(s).then(function () { closeModal(); refreshMarkers(); go('#/'); }); });
    },
    'm-exportall': function () { WA.db.all('sessions').then(function (all) { if (all.length) exportData(all); }); },
    copylink: function () {
      var out = $('#lkOut');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(out.value).then(function () { toast('Link copied'); }, function () { out.select(); toast('Select and copy the link'); });
      else { out.select(); try { document.execCommand('copy'); toast('Link copied'); } catch (e) { toast('Select and copy the link'); } }
    },
    sharelink: function () {
      var u = $('#lkOut').value;
      if (navigator.share) navigator.share({ title: 'Walk audit', text: 'Join our walk audit. Open this on your phone:', url: u }).catch(function () {});
      else acts.copylink();
    }
  };

  function onClick(e) {
    var t = e.target.closest ? e.target.closest('button, a') : null;
    if (!t) { if (e.target === modal) closeModal(); return; }
    var act = t.getAttribute('data-act');
    if (act && acts[act]) { e.preventDefault(); acts[act](t); return; }
    if (t.tagName === 'A') return;
    var item = t.closest('.item'), grp;
    if (t.hasAttribute('data-a') && item) return answer(item, t.getAttribute('data-a'));
    if (t.hasAttribute('data-rate')) {
      grp = t.closest('[data-rating]'); var id = grp.getAttribute('data-rating'), val = t.getAttribute('data-rate');
      S.ratings[id] = S.ratings[id] === val ? '' : val;
      $$('.rate', grp).forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-rate') === S.ratings[id] ? 'true' : 'false'); });
      return touch();
    }
    if (t.hasAttribute('data-inc') || t.hasAttribute('data-dec')) {
      var code = t.getAttribute('data-inc') || t.getAttribute('data-dec');
      S.counts[code] = Math.max(0, (S.counts[code] || 0) + (t.hasAttribute('data-inc') ? 1 : -1));
      if (t.hasAttribute('data-inc')) {
        var nowIso = new Date().toISOString();
        if (!S.count_first) S.count_first = nowIso;
        S.count_last = nowIso;
        var cs = $('#countSpan'); if (cs) cs.textContent = countSpan();
      }
      $('[data-out="' + code + '"]').textContent = S.counts[code];
      if (navigator.vibrate && t.hasAttribute('data-inc')) { try { navigator.vibrate(10); } catch (x) {} }
      return touch();
    }
    if (t.hasAttribute('data-v')) {
      if ((grp = t.closest('[data-draft]'))) { var dv = setChip(grp, t, false); draft[grp.getAttribute('data-draft')] = dv[0] || (grp.getAttribute('data-draft') === 'kind' ? draft.kind : ''); if (grp.getAttribute('data-draft') === 'kind' && !dv[0]) t.setAttribute('aria-pressed', 'true'); return; }
      if ((grp = t.closest('#lkType'))) { if (t.getAttribute('aria-pressed') !== 'true') setChip(grp, t, false); return buildLink(); }
      if ((grp = t.closest('[data-field]'))) {
        var multi = grp.getAttribute('data-kind') === 'multi', vals = setChip(grp, t, multi), fc = grp.getAttribute('data-field');
        if (multi) { var o = {}; vals.forEach(function (x) { o[x] = 1; }); S.fields[fc] = o; } else S.fields[fc] = vals[0] || '';
        return touch();
      }
      if ((grp = t.closest('[data-dkind]')) && item) {
        var c = item.getAttribute('data-c'), a = S.answers[c] || (S.answers[c] = {});
        a.d = setChip(grp, t, grp.getAttribute('data-dkind') === 'multi').join(';');
        return touch();
      }
    }
  }

  function onInput(e) {
    var t = e.target, item = t.closest ? t.closest('.item') : null;
    if (t.id && t.id.indexOf('lk') === 0) return buildLink();
    if (!S) return;
    if (item && (t.hasAttribute('data-note') || t.hasAttribute('data-detail'))) {
      var c = item.getAttribute('data-c'), a = S.answers[c] || (S.answers[c] = {});
      if (t.hasAttribute('data-note')) a.note = t.value.slice(0, 2000); else a.d = t.value.slice(0, 300);
      return touch();
    }
    if (t.hasAttribute('data-field')) { S.fields[t.getAttribute('data-field')] = t.value.slice(0, 100); return touch(); }
    if (t.hasAttribute('data-sheetnote')) { S.notes[t.getAttribute('data-sheetnote')] = t.value.slice(0, 4000); return touch(); }
    if (t.hasAttribute('data-text')) { S.texts[t.getAttribute('data-text')] = t.value.slice(0, 4000); return touch(); }
  }

  function onChange(e) {
    var t = e.target;
    if (t.id === 'camIn' || t.id === 'libIn') { gotPhoto(t.files && t.files[0]); t.value = ''; return; }
    if (t.id === 'comboIn') { readFiles(t.files); t.value = ''; return; }
    if (t.id === 'comboOwn') { combo.own = t.checked; var tb = $('#teamBody'); if (tb) tb.innerHTML = comboHTML(); return; }
    if (t.id === 'lkHere') { if (t.checked) gpsRetry(); wantGPS('link', t.checked); buildLink(); return; }
    if (t.name === 'type' && t.form && t.form.id === 'setup') { t.form.className = t.value === 'single' ? 't-single' : 't-route'; return; }
    if (t.hasAttribute && t.hasAttribute('data-bb') && S) { if (t.checked) S.better[t.getAttribute('data-bb')] = 1; else delete S.better[t.getAttribute('data-bb')]; touch(); }
  }

  function syncUI(st) {
    var el = $('#syncState'); if (!el) return;
    var txt = { off: 'Saved on phone', idle: 'Saved', sending: 'Sending…', sent: 'Sent ✓', waiting: 'Offline · saved', error: 'Not sent yet' }[st.state] || '';
    el.textContent = S ? txt : ''; el.className = st.state; el.title = st.error || '';
    clearTimeout(retryTimer);
    if (st.state === 'error') retryTimer = setTimeout(WA.sync.flush, 60000);
    var l = $('#syncLine'); if (l) l.textContent = syncLine();
  }

  /* ---------- start ---------- */

  function boot() {
    view = $('#view'); modal = $('#modal');
    if (ls('wa_big') === '1') document.documentElement.classList.add('big');
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('submit', function (e) {
      if (e.target.id === 'setup') { e.preventDefault(); submitSetup(e.target); }
      if (e.target.id === 'teamForm') { e.preventDefault(); go('#/team/' + cleanCode(e.target.elements.code.value)); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
    window.addEventListener('hashchange', function () { if (!modal.hidden) closeModal(); render(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) { saveNow(); WA.sync.flush(); } gpsRefresh(); });
    window.addEventListener('pagehide', function () { saveNow(); });
    WA.sync.active = function () { return S; };
    WA.sync.onObsSynced = function (cur) {
      var o = OBS.filter(function (x) { return x.id === cur.id; })[0];
      if (o) { o.sent_once = true; if (cur.photo_sent) o.photo_sent = true; if ((o.rev || 0) === (cur.rev || 0)) o.synced = true; }
    };
    WA.sync.listen(syncUI);

    WA.db.open().then(function () {
      var id = ls('wa_active');
      return id ? WA.db.get('sessions', id) : null;
    }).then(function (s) {
      return setActive(s || null);
    }).then(function () {
      var L = linkParams();
      /* A link for a different audit than the one open: offer to start the new one. */
      if (S && L.code && L.code !== S.code && route().name === 'home') location.hash = '#/setup';
      if (WA.db.memoryOnly()) toast('This browser is not saving to the phone (private mode?). Keep this page open until you finish.', 8000);
      render(); syncUI(WA.sync.status()); WA.sync.flush();
    });

    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
