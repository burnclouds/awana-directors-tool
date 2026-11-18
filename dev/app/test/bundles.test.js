// Report bundles: the standard "Quarterly Printables", running a bundle for a chosen quarter, the next-quarter default, and the two medical reports. Invented test club only.
// Usage: node test/bundles.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const R = require('../reports.js'); require('../reports-season.js');
const Model = require('../model.js'), Calendar = require('../calendar.js'), Season = require('../season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const td = path.join(__dirname, '..', '..', 'test-data'), csv = fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort().pop(), json = fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f));
const season = Season.fromJson(fs.readFileSync(path.join(td, json), 'utf8'));
const master = Model.fromRoster(season.roster);
const calendar = season.calendar, settings = { quarter: 'Q1', club: 'Test club', motto: '', dates: '' };
test('the standard bundles are Quarterly Printables (attendance, medical by class, color teams, medical for everyone) and a starting Coaches binder', () => {
  const b = R.bundlesOf(null); assert.strictEqual(b.length, 3); assert.strictEqual(b[0].name, 'Quarterly Printables'); assert.strictEqual(b[1].name, 'Coaches binder'); assert.strictEqual(b[2].name, 'Class binder');
  assert(b[1].items.every(i => i.report === 'statistics' || R.LIST.some(r => r.id === i.report)), 'Coaches binder items are real reports (Statistics is registered by the Statistics tab, in the browser)');
  assert.deepStrictEqual(b[0].items.map(i => i.report), ['attendance', 'binderClass', 'teams', 'binderAll']);
  assert(b[0].items.every(i => R.LIST.some(r => r.id === i.report)), 'every item is a real report');
});
test('a club\'s own bundles replace the standard one; an empty list falls back to it', () => {
  const s = { config: { bundles: [{ name: 'Coaches binder', items: [{ report: 'binderAll' }] }] } }; assert.strictEqual(R.bundlesOf(s)[0].name, 'Coaches binder');
  // a bundle saved before 1.50.35 still works: the folded reports map to the binders, the dropped ones are skipped, and nothing is listed twice
  const old = { config: { bundles: [{ name: 'Old', items: [{ report: 'ecClass' }, { report: 'medicalClass' }, { report: 'schedule' }, { report: 'medicalAll' }, { report: 'rotation' }, { report: 'attendanceSummary' }, { report: 'teams' }] }] } };
  assert.deepStrictEqual(R.bundlesOf(old)[0].items.map(i => i.report), ['binderClass', 'binderAll', 'teams'], 'old ids mapped, dropped ones skipped, duplicates merged');
  assert.strictEqual(R.bundlesOf({ config: { bundles: [] } })[0].name, 'Quarterly Printables');
});
test('the default quarter is the next one: in Q2 it is Q3; in Q4 it stays Q4; before the first night it is Q1', () => {
  const cal = [{ Date: '2026-09-09', Quarter: 'Q1' }, { Date: '2026-11-11', Quarter: 'Q2' }, { Date: '2027-01-20', Quarter: 'Q3' }, { Date: '2027-03-31', Quarter: 'Q4' }];
  assert.strictEqual(R.nextQuarter(cal, '2026-08-01', 'Q1'), 'Q1'); assert.strictEqual(R.nextQuarter(cal, '2026-09-30', 'Q1'), 'Q2'); assert.strictEqual(R.nextQuarter(cal, '2026-11-18', 'Q1'), 'Q3');
  assert.strictEqual(R.nextQuarter(cal, '2027-04-07', 'Q1'), 'Q4');
});
test('a quarter\'s sheets are as of its first club night', () => {
  const cal = [{ Date: '2026-11-18', Quarter: 'Q2' }, { Date: '2026-11-11', Quarter: 'Q2' }, { Date: '2026-12-02', Quarter: 'Q2', Type: 'Event' }]; assert.strictEqual(R.firstNightOf(cal, 'Q2'), '2026-11-11'); assert.strictEqual(R.firstNightOf(cal, 'Q3'), '');
});
if (master) {
  const ctx = { master, settings, calendar, rotation: [], season, opts: { order: 'color', group: 'Sparks' } };
  test('running the standard bundle makes one document with all four reports, using the chosen quarter', () => {
    const html = R.runBundle(ctx, R.bundlesOf(season)[0], 'Q2');
    assert(/Emergency, Medical and Photos (—|&mdash;) /.test(html), 'class binder pages');
    assert(/Q2 Color Team/.test(html), 'attendance sheets use the chosen quarter: ' + (html.match(/Q\d Color Team/) || ['none'])[0]);
    assert(/Emergency, Medical and Photos (—|&mdash;) everyone by name/.test(html), 'the coaches binder list');
  });
  test('the class binder has one page per class with every child (emergency contact, medical, No photos); the coaches binder is one list of everyone, with the counts', () => {
    const classes = new Set(R.kids(master).map(p => Model.room(p))), html = R.LIST.find(r => r.id === 'binderClass').render(ctx);
    assert.strictEqual((html.match(/<section class="sheet/g) || []).length, classes.size, 'one page per class'); assert(/Emergency contact/.test(html) && /Medical \/ allergy notes/.test(html), 'the name, contact and medical columns (No photos sits under the medical notes, not in a column of its own)');
    const all = R.LIST.find(r => r.id === 'binderAll').render(ctx); assert(!/children have medical or allergy notes/.test(all), 'the counts note is no longer printed on the page (it moved to the (i) notes)'); assert.strictEqual((all.match(/<section class="sheet/g) || []).length, 1, 'one list');
    const room = [...classes][0], one = R.LIST.find(r => r.id === 'binderClass').render(Object.assign({}, ctx, { opts: { room } })); assert.strictEqual((one.match(/<section class="sheet/g) || []).length, 1);
  });
  test('an unknown report in a bundle is skipped, not an error', () => { assert.doesNotThrow(() => R.runBundle(ctx, { name: 'x', items: [{ report: 'nope' }, { report: 'binderAll' }] }, 'Q1')); });
}
test('a Class binder bundle saved before 1.51.15c (no perClass) is still a class binder; one that names a class, or is another kind of bundle, is not', () => {
  const old = R.bundlesOf({ config: { bundles: [{ name: 'Class binder', items: [{ report: 'attendance' }, { report: 'binderClass' }, { report: 'volunteers' }, { report: 'progressSheets' }] }, { name: 'One class', items: [{ report: 'binderClass', room: 'Sparks A' }, { report: 'progressSheets', room: 'Sparks A' }] }, { name: 'Teams', items: [{ report: 'teams' }] }, { name: 'Kept', perClass: false, items: [{ report: 'binderClass' }, { report: 'progressSheets' }] }] } });
  assert.deepStrictEqual(old.map(b => b.perClass), [true, false, false, false]);
  assert.strictEqual(R.bundlesOf(null).find(b => b.name === 'Class binder').perClass, true, 'the standard Class binder');
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
