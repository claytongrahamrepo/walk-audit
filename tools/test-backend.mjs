// Checks the logic of backend/Code.gs on an imitation of Google Sheets.
// Run: node tools/test-backend.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBackend } from './fake-google.mjs';

const code = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'backend', 'Code.gs');
let failed = 0;
function check(name, ok, detail) { if (!ok) failed++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok || detail === undefined ? '' : '  -> ' + JSON.stringify(detail))); }

// 1. The script's own self-test
{
  const b = loadBackend(code);
  const msg = b.ctx.selfTest();
  check('selfTest passes', /passed/.test(msg), msg);
  check('selfTest leaves no test row', b.dump().Audits.length === 0, b.dump().Audits);
}

// 2. Key check and bad input
{
  const b = loadBackend(code);
  check('wrong key is refused', b.post({ key: 'nope', action: 'session', row: { session_id: 'a' } }).ok === false);
  check('bad JSON is refused', b.post('{not json').ok === false);
  check('missing id is refused', b.post({ key: 'test', action: 'session', row: { audit_code: 'x' } }).ok === false);
  check('odd field name is refused', b.post({ key: 'test', action: 'session', row: { session_id: 'a', 'Bad Name!': 1 } }).ok === false);
  check('unknown action is refused', b.post({ key: 'test', action: 'drop', row: {} }).ok === false);
  check('team request needs the key', b.get({ action: 'team', code: 'x', key: 'nope' }).ok === false);
  check('ping needs no key', b.get({ action: 'ping' }).ok === true);
  check('nothing was written', !b.dump().Audits);
}

// 3. Insert, update in place, new columns, text kept as text
{
  const b = loadBackend(code);
  const P = (row, labels) => b.post({ key: 'test', action: 'session', row, labels });
  check('first row accepted', P({ session_id: 's1', audit_code: '11-13', auditor: 'Pat', sw1: 'yes', speed_limit: 25, overall_notes: '=1+1', sw1_note: '-2 inch lip' }, { sw1: 'label for sw1' }).ok);
  check('second person accepted', P({ session_id: 's2', audit_code: '11-13', auditor: 'Sam', sw1: 'no', sw2: 'other', bb2: 1 }).ok);
  check('first person updates', P({ session_id: 's1', sw1: 'no', count_adults: 4 }).ok);
  const A = b.dump().Audits, s1 = A.find((r) => r.session_id === 's1'), s2 = A.find((r) => r.session_id === 's2');
  check('two rows, not three', A.length === 2, A.length);
  check('update replaced the answer', s1.sw1 === 'no', s1.sw1);
  check('update kept the other cells', s1.auditor === 'Pat' && s1.speed_limit === 25, s1);
  check('code "11-13" stayed text', s1.audit_code === '11-13', s1.audit_code);
  check('"=1+1" stayed text', s1.overall_notes === '=1+1', s1.overall_notes);
  check('"-2 inch lip" kept', s1.sw1_note === '-2 inch lip', s1.sw1_note);
  check('number stayed a number', s1.speed_limit === 25 && s1.count_adults === 4);
  check('column added later is blank for the earlier row', s2.count_adults === '', s2.count_adults);
  check('still text after a second update', (P({ session_id: 's1', sw2: 'yes' }), b.dump().Audits.find((r) => r.session_id === 's1').overall_notes === '=1+1'));
  const cb = b.dump().Codebook;
  check('codebook lists each column once', cb.filter((r) => r.column === 'sw1').length === 1 && cb.find((r) => r.column === 'sw1').meaning === 'label for sw1', cb.filter((r) => r.column === 'sw1'));

  // 4. Team rows: answers come back, names and notes do not
  const t = b.get({ action: 'team', code: '11-13', key: 'test' });
  check('team returns both people', t.ok && t.rows.length === 2, t);
  const keys = new Set(t.rows.flatMap((r) => Object.keys(r)));
  check('team rows carry answers', t.rows.some((r) => r.sw1 === 'no') && t.rows.some((r) => r.bb2 === 1));
  check('team rows carry no names, ids or notes', !['auditor', 'device_id', 'session_id', 'overall_notes', 'sw1_note', 'received_at'].some((k) => keys.has(k)), [...keys]);
  check('team for another code is empty', b.get({ action: 'team', code: 'other', key: 'test' }).rows.length === 0);
}

// 5. Map notes: photo saved, delete flag hides it from the group list
{
  const b = loadBackend(code);
  const O = (row, photo) => b.post({ key: 'test', action: 'obs', row, photo_b64: photo });
  check('note with photo accepted', O({ obs_id: 'o1', session_id: 's1', audit_code: 'walk', lat: 41.8, lon: -71.3, kind: 'problem', topic: 'sidewalk', note: 'lip' }, Buffer.from('jpegbytes').toString('base64')).ok);
  check('second note accepted', O({ obs_id: 'o2', session_id: 's2', audit_code: 'walk', lat: 41.81, lon: -71.31, kind: 'good', topic: 'comfort', note: 'bench' }).ok);
  const row = b.dump().Observations.find((r) => r.obs_id === 'o1');
  check('photo link stored', /walk_o1\.jpg$/.test(row.photo_url), row.photo_url);
  check('edit without photo keeps the link', (O({ obs_id: 'o1', note: 'lip, 2 in' }), b.dump().Observations.find((r) => r.obs_id === 'o1').photo_url === row.photo_url));
  check('negative longitude stayed a number', b.dump().Observations.find((r) => r.obs_id === 'o1').lon === -71.3);
  check('group list has both', b.get({ action: 'obs', code: 'walk', key: 'test' }).obs.length === 2);
  O({ obs_id: 'o2', deleted: 1 });
  const g = b.get({ action: 'obs', code: 'walk', key: 'test' }).obs;
  check('deleted note is hidden from the group', g.length === 1 && g[0].obs_id === 'o1', g);
  check('group list carries no photo link', !('photo_url' in g[0]));
  check('oversized photo refused', O({ obs_id: 'o3', audit_code: 'walk' }, 'A'.repeat(8000001)).ok === false);
}

// 6. Growth past the sheet's size: more columns than 26, more rows than the sheet has
{
  const b = loadBackend(code, { maxRows: 4 });
  const wide = { session_id: 'w0' }; for (let i = 0; i < 260; i++) wide['c' + i] = i;
  check('260 columns accepted', b.post({ key: 'test', action: 'session', row: wide }).ok);
  let ok = true; for (let i = 1; i <= 12; i++) ok = ok && b.post({ key: 'test', action: 'session', row: { session_id: 'w' + i, c0: i } }).ok;
  check('13 rows fit a sheet that started with 4', ok && b.dump().Audits.length === 13, b.dump().Audits.length);
  check('codebook grew past 4 rows', b.dump().Codebook.length >= 261, b.dump().Codebook.length);
}

console.log(failed ? '\n' + failed + ' check(s) FAILED' : '\nall checks passed');
process.exit(failed ? 1 : 0);
