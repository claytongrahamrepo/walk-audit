// Checks the team-totals arithmetic against a small case worked out by hand.
// Run: node tools/test-totals.mjs
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { Blob, TextEncoder, URL, document: {}, setTimeout, console, crypto: globalThis.crypto }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['js/forms.js', 'js/data.js', 'js/export.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const WA = ctx.WA;
let failed = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) failed++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + '  want ' + JSON.stringify(want))); };

// Four people. Worked by hand:
const rows = [
  { submitted: 1, sidewalks_rating: 'poor',  overall_rating: 'poor',  sw1: 'yes', sw3: 'no', sw9: 'no',    st3: 'no', sg5: 'no', sg5_detail: 12, count_adults: 5, count_older: 2, bb2: 1, bb6: 1, ww2: 'yes' },
  { submitted: 1, sidewalks_rating: 'mixed', overall_rating: 'mixed', sw1: 'yes', sw3: 'no', sw9: 'other',            sg5: 'no', sg5_detail: 16, count_adults: 3,                 bb2: 1,          ww2: 'yes', ww3: 'no' },
  { submitted: 0, sidewalks_rating: 'poor',                           sw1: 'no',  sw3: 'no',                                     sg5_detail: 15,                                  bb2: 1, bb11: 1 },
  { submitted: 1, streets_rating: 'great',                                                   st3: 'yes', sg5: 'yes', sg5_detail: 30 }
];
const obs = [{ kind: 'problem', topic: 'sidewalk' }, { kind: 'problem', topic: 'crosswalk' }, { kind: 'good', topic: 'sidewalk' }, { kind: 'idea', topic: '' }];
const T = WA.teamTotals(rows, obs);
const sheet = (id) => T.sheets.find((s) => s.id === id), rate = (id) => T.ratings.find((r) => r.id === id);
const item = (c) => T.sheets.flatMap((s) => s.sections.flatMap((x) => x.items)).find((i) => i.code === c);
const pick = (o, ks) => ks.map((k) => o[k]);

eq('people and finished', [T.people, T.finished], [4, 3]);
eq('sidewalk ratings great/acceptable/mixed/poor', pick(rate('sidewalks'), ['great', 'acceptable', 'mixed', 'poor', 'n']), [0, 0, 1, 2, 3]);
eq('streets ratings', pick(rate('streets'), ['great', 'acceptable', 'mixed', 'poor', 'n']), [1, 0, 0, 0, 1]);
eq('overall ratings', pick(rate('overall'), ['great', 'acceptable', 'mixed', 'poor', 'n']), [0, 0, 1, 1, 2]);
eq('sidewalks yes/no/other/people', pick(sheet('sidewalks'), ['yes', 'no', 'other', 'people']), [2, 5, 1, 3]);
eq('streets yes/no/other/people', pick(sheet('streets'), ['yes', 'no', 'other', 'people']), [2, 3, 0, 3]);
eq('winter yes/no/other/people', pick(sheet('winter'), ['yes', 'no', 'other', 'people']), [2, 1, 0, 2]);
eq('transit unused', pick(sheet('transit'), ['yes', 'no', 'other', 'people']), [0, 0, 0, 0]);
eq('sw3 item', pick(item('sw3'), ['yes', 'no', 'other', 'answered']), [0, 3, 0, 3]);
eq('sw9 item', pick(item('sw9'), ['yes', 'no', 'other', 'answered']), [0, 1, 1, 2]);
// most flags first; ties go to the larger share (2 of 2 before 2 of 3), then worksheet order
eq('flag order (count, then share)', T.flagged.map((c) => [c.code, c.concern, c.answered]), [['sw3', 3, 3], ['ww2', 2, 2], ['sg5', 2, 3], ['sw9', 1, 2], ['st3', 1, 2], ['sw1', 1, 3]]);
eq('ww2 counts Yes as the problem; ww3 "no" is not flagged', [item('ww2').neg, T.flagged.some((c) => c.code === 'ww3')], [true, false]);
eq('crossing time: median, min, max, n of 12,15,16,30', pick(T.timing[0], ['median', 'min', 'max', 'n']), [15.5, 12, 30, 4]);
eq('no wait-time readings', T.timing.length, 1);
eq('adults counted: total, by', pick(T.counts.find((c) => c.code === 'count_adults'), ['total', 'by']), [8, 2]);
eq('older adults: total, by', pick(T.counts.find((c) => c.code === 'count_older'), ['total', 'by']), [2, 1]);
eq('improvements, most picked first', T.better.map((b) => [b.code, b.picked]), [['bb2', 3], ['bb6', 1], ['bb11', 1]]);
eq('people who used Better Block', T.betterBy, 3);
eq('map notes', [T.obs.total, T.obs.kinds, T.obs.topics], [4, { problem: 2, good: 1, idea: 1 }, { sidewalk: 2, crosswalk: 1 }]);
eq('empty audit', (() => { const E = WA.teamTotals([], []); return [E.people, E.flagged.length, E.better.length, E.timing.length]; })(), [0, 0, 0, 0]);

if (process.argv[2]) { const z = WA.teamZip('team-test', T); fs.writeFileSync(process.argv[2], Buffer.from(await z.blob.arrayBuffer())); console.log('wrote', z.name); }
console.log(failed ? '\n' + failed + ' check(s) FAILED' : '\nall checks passed'); process.exit(failed ? 1 : 0);
