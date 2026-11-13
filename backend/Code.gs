/**
 * Walk Audit: shared-sheet backend.
 *
 * This script lives inside a Google Sheet (Extensions > Apps Script). The walk
 * audit web page posts each person's worksheets and map notes here, and this
 * script writes them into the sheet. Setup steps are in SETUP.md.
 *
 * Tabs it creates:
 *   Audits        one row per person per audit (all worksheet answers)
 *   Observations  one row per map note (lat, lon, note, photo link)
 *   Codebook      what every column means
 * The Team totals screen reads the Audits tab back, without names or notes.
 * Photos go to a Google Drive folder named by PHOTO_FOLDER.
 */

var KEY = 'CHANGE-ME';                    // must match "key" in the web page's config.js
var PHOTO_FOLDER = 'Walk Audit Photos';
var MAX_PHOTO_B64 = 8 * 1000 * 1000;      // about 6 MB of image
var MAX_FIELDS = 500;

/* Columns never sent back out by the team-totals request: who the person is,
 * and free text. Columns ending in _note or _notes are also held back. */
var PRIVATE_COLS = { auditor: 1, device_id: 1, session_id: 1, received_at: 1, not_walking: 1, bb_other: 1 };

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'ping') return json_({ ok: true, service: 'walk-audit', v: 1 });
  if (p.key !== KEY) return json_({ ok: false, error: 'bad key' });
  if (p.action === 'obs') return json_({ ok: true, obs: listObs_(String(p.code || '')) });
  if (p.action === 'team') return json_({ ok: true, rows: teamRows_(String(p.code || '')) });
  return json_({ ok: false, error: 'unknown action' });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  if (!body || body.key !== KEY) return json_({ ok: false, error: 'bad key' });
  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (err) { return json_({ ok: false, error: 'busy, try again' }); }
  try {
    if (body.action === 'session') {
      upsert_('Audits', 'session_id', body.row, body.labels);
      return json_({ ok: true });
    }
    if (body.action === 'obs') {
      var row = body.row || {};
      if (body.photo_b64) row.photo_url = savePhoto_(row, String(body.photo_b64));
      upsert_('Observations', 'obs_id', row, body.labels);
      return json_({ ok: true });
    }
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/** Insert the row, or replace the row that has the same id. New columns are added as they appear. */
function upsert_(sheetName, keyCol, row, labels) {
  if (!row || typeof row !== 'object') throw new Error('missing row');
  var keys = Object.keys(row);
  if (keys.indexOf(keyCol) < 0 || !row[keyCol]) throw new Error('missing ' + keyCol);
  if (keys.length > MAX_FIELDS) throw new Error('too many fields');
  keys.forEach(function (k) { if (!/^[a-z][a-z0-9_]{0,40}$/.test(k)) throw new Error('bad field name'); });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  var lastCol = sh.getLastColumn();
  var headers = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
  var added = [];
  if (!headers.length) { headers = [keyCol, 'received_at']; added = headers.slice(); }
  keys.forEach(function (k) { if (headers.indexOf(k) < 0) { headers.push(k); added.push(k); } });
  if (added.length) {
    if (sh.getMaxColumns() < headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
    sh.getRange(1, 1, 1, headers.length).setNumberFormat('@').setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    codebook_(ss, sheetName, added, labels || {});
  }

  var id = String(row[keyCol]);
  var lastRow = sh.getLastRow();
  var r = 0;
  if (lastRow > 1) {
    var ids = sh.getRange(2, headers.indexOf(keyCol) + 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) { r = i + 2; break; }
  }
  var existing = r ? sh.getRange(r, 1, 1, headers.length).getValues()[0] : [];
  var out = headers.map(function (h, i) {
    if (h === 'received_at') return new Date();
    if (Object.prototype.hasOwnProperty.call(row, h)) return clean_(row[h]);
    return r ? clean_(existing[i]) : '';
  });
  /* Text cells are set to plain text first so Sheets does not turn a code like
   * "11-13" into a date or run a note that starts with "=" as a formula. */
  var formats = out.map(function (v) { return v instanceof Date ? 'yyyy-mm-dd hh:mm:ss' : typeof v === 'number' ? 'General' : '@'; });
  var at = r || Math.max(lastRow, 1) + 1;
  grow_(sh, at);
  var target = sh.getRange(at, 1, 1, headers.length);
  target.setNumberFormats([formats]);
  target.setValues([out]);
}

/** A new sheet has 1,000 rows. Add more before writing past the end. */
function grow_(sh, lastNeeded) {
  var max = sh.getMaxRows();
  if (lastNeeded > max) sh.insertRowsAfter(max, Math.max(200, lastNeeded - max));
}

function clean_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return isFinite(v) ? v : '';
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v;
  var s = String(v).slice(0, 5000);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function codebook_(ss, sheetName, cols, labels) {
  var cb = ss.getSheetByName('Codebook');
  if (!cb) {
    cb = ss.insertSheet('Codebook');
    cb.getRange(1, 1, 1, 3).setValues([['tab', 'column', 'meaning']]).setFontWeight('bold');
    cb.setFrozenRows(1);
  }
  var rows = cols.map(function (c) { return [sheetName, c, clean_(labels[c] || '')]; });
  grow_(cb, cb.getLastRow() + rows.length);
  cb.getRange(cb.getLastRow() + 1, 1, rows.length, 3).setNumberFormat('@').setValues(rows);
}

function savePhoto_(row, b64) {
  if (b64.length > MAX_PHOTO_B64) throw new Error('photo too large');
  var name = (String(row.audit_code || 'audit') + '_' + String(row.obs_id)).replace(/[^A-Za-z0-9_-]/g, '') + '.jpg';
  var folder = folder_();
  var old = folder.getFilesByName(name);
  while (old.hasNext()) old.next().setTrashed(true);
  var file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', name));
  return file.getUrl();
}

function folder_() {
  var it = DriveApp.getFoldersByName(PHOTO_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(PHOTO_FOLDER);
}

/** Map notes for one audit code, for the "Group's notes" button. No names, no photos. */
function listObs_(code) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Observations');
  if (!sh || sh.getLastRow() < 2 || !code) return [];
  var v = sh.getDataRange().getValues(), h = v[0].map(String), out = [];
  function col(n) { return h.indexOf(n); }
  var cCode = col('audit_code'), cDel = col('deleted'), want = ['obs_id', 'session_id', 'lat', 'lon', 'kind', 'topic', 'note'];
  for (var i = 1; i < v.length && out.length < 2000; i++) {
    if (String(v[i][cCode]) !== code) continue;
    if (cDel >= 0 && String(v[i][cDel]) === '1') continue;
    var o = {};
    want.forEach(function (n) { o[n] = col(n) >= 0 ? v[i][col(n)] : ''; });
    out.push(o);
  }
  return out;
}

/**
 * Everyone's worksheet answers for one audit code, for the Team totals screen.
 * Names, phone ids and free-text notes are left out.
 */
function teamRows_(code) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Audits');
  if (!sh || sh.getLastRow() < 2 || !code) return [];
  var v = sh.getDataRange().getValues(), h = v[0].map(String), cCode = h.indexOf('audit_code'), out = [];
  var keep = h.map(function (c) { return !PRIVATE_COLS[c] && (c === 'map_notes' || !/_notes?$/.test(c)); });
  for (var i = 1; i < v.length && out.length < 500; i++) {
    if (String(v[i][cCode]) !== code) continue;
    var o = {};
    for (var j = 0; j < h.length; j++) {
      var x = v[i][j];
      if (keep[j] && x !== '' && x !== null && !(x instanceof Date)) o[h[j]] = x;
    }
    out.push(o);
  }
  return out;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run this once from the script editor (Run > selfTest) after pasting the code.
 * It asks for permission, writes a test row, checks it, and removes it.
 */
function selfTest() {
  var id = 'selftest-' + new Date().getTime();
  upsert_('Audits', 'session_id', { session_id: id, audit_code: '11-13', overall_notes: '=1+1', sw1: 'yes', speed_limit: 25 }, { sw1: 'test label' });
  upsert_('Audits', 'session_id', { session_id: id, sw1: 'no' }, {});
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Audits');
  var v = sh.getDataRange().getValues(), h = v[0].map(String), row = null, n = 0;
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === id) { row = v[i]; n++; }
  var problems = [];
  if (n !== 1) problems.push('expected 1 row, found ' + n);
  if (row && String(row[h.indexOf('sw1')]) !== 'no') problems.push('update did not replace the answer');
  if (row && String(row[h.indexOf('audit_code')]) !== '11-13') problems.push('audit_code was changed to ' + row[h.indexOf('audit_code')]);
  if (row && row[h.indexOf('overall_notes')] === 2) problems.push('a note was run as a formula');
  else if (row && String(row[h.indexOf('overall_notes')]) !== '=1+1') problems.push('a note that starts with = was stored as ' + row[h.indexOf('overall_notes')]);
  if (row && row[h.indexOf('speed_limit')] !== 25) problems.push('number not kept as a number');
  for (var j = v.length - 1; j >= 1; j--) if (String(v[j][0]) === id) sh.deleteRow(j + 1);
  folder_();
  var msg = problems.length ? 'PROBLEMS: ' + problems.join('; ') : 'Self-test passed. Sheet and Drive access work.';
  Logger.log(msg);
  return msg;
}
