// Checks the "Send a copy" file: it can be written and read back without loss,
// and text typed by a person cannot break out of it or run as code.
// Run: node tools/test-report.mjs [file-to-write]
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { Blob, TextEncoder, URL, document: {}, setTimeout, console, crypto: globalThis.crypto, btoa, atob, Uint8Array, RegExp, JSON };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['js/forms.js', 'js/data.js', 'js/export.js', 'js/report.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const WA = ctx.WA;
let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok || detail === undefined ? '' : '  -> ' + JSON.stringify(detail).slice(0, 300))); };

const nasty = '</script><script>window.HACKED=1</script><img src=x onerror="window.HACKED=1"> & "quotes"   é 木';
const s = WA.newSession({ code: 'main-st', community: 'Springfield, IL', type: 'route', start_loc: 'City Hall', end_loc: 'Library', route: 'Main St ' + nasty, auditor: 'Pat <b>P</b>', device_id: 'd1' });
s.answers = { sw1: { a: 'yes' }, sw3: { a: 'no', note: nasty }, sg5: { a: 'no', d: '14' }, tr5: { a: 'yes', d: 'rain;wind' }, sa3: { a: 'yes', d: 'no' } };
s.fields = { speed_limit: '25, 35', median_island: { median: 1 }, sidewalk_presence: 'partial', winter_responsible: { owner: 1, unknown: 1 } };
s.ratings = { sidewalks: 'poor', overall: 'mixed' }; s.notes = { sidewalks: 'Sheet note', overall: nasty };
s.counts = { count_adults: 5, count_vehicles: 40 }; s.count_first = s.started_at; s.count_last = s.started_at;
s.better = { bb2: 1, bb9: 1 }; s.texts = { bb_other: 'A bench', not_walking: 'No children' };
s.ended_at = s.started_at; s.submitted = true; s.rev = 7;
const photo = new Uint8Array(70000).map((_, i) => (i * 131 + 7) % 256);
const obs = [
  { id: 'aaaa-1111', session_id: s.id, code: 'main-st', created_at: '2026-11-18T15:00:00.000Z', lat: 39.801234, lon: -89.654321, acc: 6.4, src: 'gps', kind: 'problem', topic: 'sidewalk', item: 'sw3', note: nasty, photo: { buf: photo.buffer, type: 'image/jpeg' } },
  { id: 'bbbb-2222', session_id: s.id, code: 'main-st', created_at: '2026-11-18T15:05:00.000Z', lat: 39.8021, lon: -89.6551, acc: null, src: 'pin', kind: 'good', topic: 'comfort', item: '', note: 'Bench' },
  { id: 'cccc-3333', session_id: s.id, code: 'main-st', created_at: '2026-11-18T15:06:00.000Z', lat: 1, lon: 1, kind: 'idea', deleted: true }
];
const html = WA.reportHTML(s, obs);
if (process.argv[2]) fs.writeFileSync(process.argv[2], html);

// 1. nothing typed by a person survives as live markup
const outsideData = html.replace(/<script type="application\/json"[\s\S]*?<\/script>/, '');
check('no script tag from typed text', !/<script>window\.HACKED/.test(html));
check('no live onerror attribute', !/<img src=x onerror/.test(outsideData));
check('exactly one script element, the data block', (html.match(/<script/g) || []).length === 1 && (html.match(/<\/script>/g) || []).length === 1, [(html.match(/<script/g) || []).length, (html.match(/<\/script>/g) || []).length]);
check('typed text is shown escaped', outsideData.includes('&lt;/script&gt;&lt;script&gt;window.HACKED=1'));
check('has the readable parts', ['Walk audit: Main St', 'Springfield, IL', 'Map notes (2)', 'Sidewalk in some places', 'Crossing time given (seconds) 14 seconds', 'Shelter from… Rain, Wind', 'Build a Better Block', 'Curb extensions'].every((t) => html.includes(t)),
  ['Walk audit: Main St', 'Springfield, IL', 'Map notes (2)', 'Sidewalk in some places', 'Crossing time given (seconds) 14 seconds', 'Shelter from… Rain, Wind', 'Build a Better Block', 'Curb extensions'].filter((t) => !html.includes(t)));
check('deleted note left out', !html.includes('cccc-3333'));
check('photo stored once', (html.match(/data:image\/jpeg;base64,/g) || []).length === 1);

// 2. read it back
const back = WA.readReport(html), bs = back.sessions[0];
check('one person, two notes', back.sessions.length === 1 && back.obs.length === 2, [back.sessions.length, back.obs.length]);
check('ids kept', bs.id === s.id && back.obs[0].id === 'aaaa-1111' && back.obs[0].session_id === s.id);
check('answers, fields, ratings, counts kept', JSON.stringify([bs.answers, bs.fields, bs.ratings, bs.notes, bs.counts, bs.better, bs.texts]) === JSON.stringify([s.answers, s.fields, s.ratings, s.notes, s.counts, s.better, s.texts]));
check('header kept', bs.route === s.route && bs.auditor === s.auditor && bs.community === s.community && bs.code === 'main-st' && bs.submitted === true && bs.rev === 7);
check('note text kept exactly', back.obs[0].note === nasty);
check('place kept', back.obs[0].lat === 39.801234 && back.obs[0].lon === -89.654321 && back.obs[0].acc === 6.4 && back.obs[0].src === 'gps' && back.obs[1].acc === null);
const pb = back.obs[0].photo && new Uint8Array(back.obs[0].photo.buf);
check('photo bytes identical', !!pb && pb.length === photo.length && pb.every((v, i) => v === photo[i]));
check('same spreadsheet row before and after', JSON.stringify(WA.sessionRow(bs, 2)) === JSON.stringify(WA.sessionRow(s, 2)));

// 3. a tampered or foreign file
const bad = (t) => { try { WA.readReport(t); return false; } catch (e) { return true; } };
check('plain web page is refused', bad('<html><body>hello</body></html>'));
check('broken data is refused', bad('<script type="application/json" id="walk-audit-data">{oops</script>'));
check('wrong format is refused', bad('<script type="application/json" id="walk-audit-data">{"format":"other","sessions":[{}]}</script>'));
const evil = html.replace('"id":"aaaa-1111"', '"id":"../../etc/passwd"').replace('"type":"route"', '"type":{"x":1}');
const eb = WA.readReport(evil);
check('odd ids are replaced, never used as file names', eb.obs.every((o) => /^[A-Za-z0-9_-]{1,64}$/.test(o.id)));
check('odd field types fall back to defaults', eb.sessions[0].type === 'route');

// 4. team totals from copies, and the combined zip
const s2 = WA.readReport(WA.reportHTML(Object.assign(WA.newSession({ code: 'main-st', type: 'route', route: 'Main St' }), { answers: { sw1: { a: 'no' }, sw3: { a: 'no' } }, ratings: { sidewalks: 'mixed' }, better: { bb2: 1 } }), [])).sessions[0];
const T = WA.teamTotals([bs, s2].map((x) => WA.sessionRow(x, 0)), back.obs);
const sw = T.sheets.find((x) => x.id === 'sidewalks');
check('totals from two copies', T.people === 2 && sw.yes === 1 && sw.no === 3 && T.better[0].code === 'bb2' && T.better[0].picked === 2 && T.obs.total === 2, [T.people, sw.yes, sw.no, T.better[0]]);
const z = WA.exportZip([bs, s2], back.obs, { name: 'combined.zip', extra: WA.teamFiles('main-st', T).map((f) => ({ name: 'team/' + f.name, data: f.data })) });
check('combined zip made', z.name === 'combined.zip' && z.blob.size > 70000, [z.name, z.blob.size]);
if (process.argv[3]) fs.writeFileSync(process.argv[3], Buffer.from(await z.blob.arrayBuffer()));
check('email text is short and plain', WA.reportText(s, obs.slice(0, 2)).length < 900 && WA.reportText(s, obs.slice(0, 2)).includes('Map notes: 2 (1 problem, 1 good, 0 idea).'), WA.reportText(s, obs.slice(0, 2)));
console.log(failed ? '\n' + failed + ' check(s) FAILED' : '\nall checks passed'); process.exit(failed ? 1 : 0);
