// B7 (print notes): binder pages carry "Printed MM/DD/YY" in their subtitle (class binder, everyone-by-name list, coaches color lists), nothing is added when the caller gives no day,
// and the sheets that do not need a date (attendance, volunteers) are unchanged. Long attendance names get a smaller font class instead of an ellipsis. Invented children only.
// The 12px emergency pages, the left-aligned names and the PDF fit are in print-pdf-n1-browser.test.js.
// Usage: node test/print-b7.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const M = require('../model.js'), S = require('../season.js'), R = require('../reports.js');
const { C, X } = M;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const kid = (id, first, last, room) => { const p = {}; p[X.ID] = id; p[C.FIRST] = first; p[C.LAST] = last; p[C.ROOM] = room; p[C.SELECTION] = 'Clubber (Cubbies, Sparks & TnT only)'; p['team:Q2'] = 'Red'; return p; };
const master = { people: [kid('a', 'Ada', 'Moss', 'Sparks A'), kid('b', 'Ben', 'Pike', 'T&T Boys (Group A)'), kid('c', 'Maximilian Bartholomew', 'Featherstonehaugh-Montgomery', 'Sparks A')] };
const season = S.blank('2026-27');
const run = (id, today, opts) => R.LIST.find(r => r.id === id).render({ master, season, calendar: [], settings: { quarter: 'Q2' }, today, opts: opts || {} });
const subs = h => [...h.matchAll(/<p class="sub">([^<]*)<\/p>/g)].map(m => m[1]), sheets = h => (h.match(/<section class="sheet/g) || []).length;

for (const id of ['binderClass', 'binderAll', 'binderTeams']) {
  test(id + ': every page says "Printed 11/14/26" when the day is given, once, and nothing when it is not', () => {
    const h = run(id, '2026-11-14'), n = sheets(h); assert(n >= 1, 'has pages');
    assert.strictEqual(subs(h).filter(s => /^Printed 11\/14\/26$/.test(s)).length, n, id + ': one Printed line per page: ' + subs(h).join(' | '));
    assert(!/Printed/.test(run(id, undefined)), 'no day, no Printed line'); assert(!/Printed/.test(run(id, 'yesterday')), 'a bad day prints nothing');
  });
}
test('the Printed line comes after the Planning Center "as of" line in a binder, and sheets that need no date are unchanged', () => {
  const pc = Object.assign({}, master, { pcAsOf: '2026-10-28' }), ctx = { master: pc, season, calendar: [], settings: { quarter: 'Q2' }, today: '2026-11-14', opts: {} };
  const h = R.runBundle(ctx, { items: [{ report: 'binderClass', room: 'Sparks A' }, { report: 'volunteers' }] }, 'Q2');
  assert(/Planning Center data as of 2026-10-28<\/p><p class="sub">Printed 11\/14\/26<\/p>/.test(h), 'as-of line, then Printed');
  assert.strictEqual((h.match(/Printed 11\/14\/26/g) || []).length, 1, 'only the class page carries it, not the volunteer list');
  assert(!/Printed/.test(run('volunteers', '2026-11-14')) && !/Printed/.test(run('attendance', '2026-11-14', { room: 'Sparks A' })), 'volunteers and attendance carry no Printed line');
});
test('attendance names: a short name has no size class, 25+ characters "long", 35+ "xlong"; the name is never cut in the markup', () => {
  const h = run('attendance', '2026-11-14', { room: 'Sparks A' }), cls = n => new RegExp('<td class="name([^"]*)">' + n + '</td>').exec(h);
  assert.strictEqual(cls('Ada Moss')[1], ''); assert.strictEqual(cls('Maximilian Bartholomew Featherstonehaugh-Montgomery')[1], ' xlong');
  const mid = { people: [kid('d', 'Cornelius Wellington', 'Hartwell', 'Sparks A')] }, h2 = R.LIST.find(r => r.id === 'attendance').render({ master: mid, season, calendar: [], settings: { quarter: 'Q2' }, opts: { room: 'Sparks A' } });
  assert(/<td class="name long">Cornelius Wellington Hartwell<\/td>/.test(h2), 'a 31-character name is "long"');
  assert(!/text-overflow/.test(fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8').split('\n').find(l => /^table\.att \.name/.test(l))), 'the name column no longer uses an ellipsis');
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
