// The manual's examples and templates for every file the app imports: each one is pulled out of index.html and given to the real loader, so the manual cannot show a file the app would refuse.
// Usage: node test/doc-examples.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const Cal = require('../calendar.js'), M = require('../model.js'), Teams = require('../teams.js'), Season = require('../season.js'), V = require('../validate.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const ex = {}; [...html.matchAll(/<pre data-example="([a-z]+)" data-file="([^"]+)">([\s\S]*?)<\/pre>/g)].forEach(m => { ex[m[1]] = { file: m[2], text: unesc(m[3]) + '\n' }; });

test('there is an example for every kind of file Import takes: data file, Planning Center export, calendar and colors (the older master CSV is not documented; the nightly rotation is no longer a file the app takes)', () => {
  assert.deepStrictEqual(Object.keys(ex).sort(), ['calendar', 'colors', 'pc', 'season']);
  assert(!/master roster CSV|master-example/i.test(html), 'the master roster CSV is no longer in the manual');
  Object.keys(ex).forEach(k => assert(html.includes('id="m-ex-' + k + '"'), k + ' has no section to link to'));
  ['m-f-examples', 'm-ex-calendar', 'm-ex-colors'].forEach(id => assert(html.includes('href="#' + id + '"'), 'nothing links to ' + id));
});
test('the app recognizes each example as the kind of file it is shown as', () => {
  assert.deepStrictEqual(['season', 'pc', 'calendar', 'colors'].map(k => V.detect(ex[k].text)), ['data', 'pc', 'calendar', 'colors']);
});
test('the data file example opens, and the file check finds no error in it', () => {
  const s = Season.fromJson(ex.season.text); assert.strictEqual(s.year, '2026-27'); assert.strictEqual(Object.keys(s.roster.people).length, 1); assert.strictEqual(s.attendance['2026-10-28']['75534545_Josie_Andre'].h, 1);
  const r = V.validate(ex.season.text, ex.season.file); assert(!r.findings.some(f => f.level === 'error'), JSON.stringify(r.findings)); assert(/^awana-\d{4}-\d{2}-\d{8}-\d{6}\.json$/.test(ex.season.file), 'the example file name follows the rule');
});
test('the Planning Center example loads (three children with their ids), is read as a roster with no errors, and its file name carries the as-of date', () => {
  const m = M.loadMaster(ex.pc.text, '2026-10-28'); assert.deepStrictEqual(m.people.map(p => p[M.X.ID]), ['75534545_Josie_Andre', '75534545_Lola_Andre', '75600112_Theo_Baker']);
  assert.deepStrictEqual(m.people.map(p => M.uniformItems(p)), [['T&T shirt'], ['Sparks vest'], []], 'the Uniform column says who ordered; what they wear comes from the class'); assert.deepStrictEqual(M.columnReport(Object.keys(m.people[0]).filter(k => !k.startsWith('x_'))), [], 'every column the app reads is in the example'); assert.deepStrictEqual(m.people.map(p => M.groupOf(M.room(p))), ['T&T', 'Sparks', 'Cubbies']);
  const r = V.validate(ex.pc.text, ex.pc.file); assert(!r.findings.some(f => f.level === 'error' || f.level === 'warn'), JSON.stringify(r.findings)); assert.strictEqual(M.exportDate(ex.pc.file, '2026-11-01'), '2026-10-28');
});
test('the calendar example loads in date order with its types, quarters and the no-club night; the rules in the text hold (a bad date is refused)', () => {
  const rows = Cal.load(ex.calendar.text); assert.deepStrictEqual(rows.map(r => r.Date), ['2026-09-09', '2026-10-28', '2026-11-25', '2027-02-06']); assert.deepStrictEqual(rows.map(r => r.Type), ['Club night', 'Club night', 'Club night', 'Event']);
  assert.deepStrictEqual(Cal.nights(rows).map(r => r.Date), ['2026-09-09', '2026-10-28'], 'the no-club night and the event do not count as club nights'); assert.strictEqual(Cal.offDays(rows, 3).length, 0, 'every club night is a Wednesday');
  assert.throws(() => Cal.load(ex.calendar.text.replace('2026-09-09', '9/9/2026')), /Bad date/); assert.throws(() => Cal.load('Date,Theme\n2026-09-09,x\n'), /Quarter/);
});
test('the colors example fills the four cells that have a color, matched on the Unique ID the PC example produces; a wrong color is listed, not applied', () => {
  const m = M.loadMaster(ex.pc.text, '2026-10-28'), r = Teams.importList(m, null, ex.colors.text); assert.deepStrictEqual([r.set, r.unmatched.length, r.invalid.length], [4, 0, 0]);
  const by = id => m.people.find(p => p[M.X.ID] === id); assert.deepStrictEqual([by('75534545_Josie_Andre')['team:Q1'], by('75534545_Josie_Andre')['team:Q2'], by('75534545_Lola_Andre')['team:Q1']], ['Red', 'Blue', 'Green']); assert(!by('75534545_Josie_Andre')['team:Q3'], 'blank cells are left alone');
  const m2 = M.loadMaster(ex.pc.text, '2026-10-28'), bad = Teams.importList(m2, null, ex.colors.text.replace('Red', 'Purple')); assert.strictEqual(bad.invalid.length, 1);
  const names = M.loadMaster(ex.pc.text, '2026-10-28'), byName = Teams.importList(names, null, ex.colors.text.replace(/75534545_[A-Za-z_]+/g, '')); assert.strictEqual(byName.set, 4, 'matched on Name when there is no Unique ID');
  const one = M.loadMaster(ex.pc.text, '2026-10-28'), single = Teams.importList(one, 'Q3', 'Name,Color\nLola Andre,Yellow\n'); assert.strictEqual(single.set, 1); assert.strictEqual(one.people[1]['team:Q3'], 'Yellow', 'a single Color column fills the chosen quarter');
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
