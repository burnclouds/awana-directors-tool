// docs/DATA-FORMAT.md must keep up with the code: every tracked section, top-level key, config key, owned roster column and flag level the code knows is documented there,
// and the worked example in section 14 opens and passes the file check. Invented data only.
// Usage: node test/data-format-doc.test.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const Season = require('../season.js'), Catalog = require('../catalog.js'), Model = require('../model.js'), V = require('../validate.js');
const doc = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'docs', 'DATA-FORMAT.md'), 'utf8');
const src = fs.readFileSync(path.join(__dirname, '..', 'season.js'), 'utf8');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const row = k => new RegExp('^\\|\\s*`' + esc(k) + '`', 'm');            // a table row that starts with the key
const heading = k => new RegExp('^###\\s+[\\d.]+\\s+`' + esc(k) + '`', 'm');   // "### 5.9 `flags`"

test('every tracked section has its own heading in section 5, and a row in the section 3 table', () => {
  Season.SECTIONS.filter(k => k !== 'config').forEach(k => { assert(heading(k).test(doc), 'no "### 5.n `' + k + '`" heading'); });
  Season.SECTIONS.forEach(k => assert(row(k).test(doc), 'no table row for ' + k));
  assert(/`Season\.SECTIONS` \(25 entries/.test(doc) && Season.SECTIONS.length === 25,'the document says 24 sections; the code has ' + Season.SECTIONS.length);
});
test('every key a populated file can hold is in the top-level table', () => {
  const s = Season.blank('2026-27'); ['givenNoDate', 'held', 'flags', 'doneBooks', 'received', 'progressNoDate', 'extraSheets', 'announcedNoDate', 'blueWings', 'blueOverrides', 'blueDrops', 'pastTurnout'].forEach(k => { s[k] = { x: 1 }; }); s.fake = true;
  Object.keys(JSON.parse(Season.toJson(s))).forEach(k => assert(row(k).test(doc), 'no row for top-level key ' + k));
});
test('every config key (defaults and the ones set elsewhere) has a row in the config table', () => {
  const keys = Object.keys(Catalog.defaultConfig()).concat(['driveKeepName', 'bookOrder', 'cubbiesDetail', 'clubTitle', 'slideNames', 'bundles', 'medRead', 'medPrinted', 'teamPlan', 'tntBook']);
  const used = new Set(); (fs.readdirSync(path.join(__dirname, '..')).filter(f => /\.js$/.test(f))).forEach(f => { (fs.readFileSync(path.join(__dirname, '..', f), 'utf8').match(/config\.([A-Za-z]+)/g) || []).forEach(m => used.add(m.slice(7))); });
  used.delete('js');      // "config.js" in a comment
  [...new Set(keys.concat([...used]))].forEach(k => assert(row(k).test(doc), 'no config row for ' + k));
});
test('every base owned roster column, uniform column and quarter team column is documented', () => {
  Model.BASE_USER_COLS = Model.BASE_USER_COLS || null;
  ['x_Active', 'x_InactiveBy', 'x_NoPhotos', 'x_Notes', 'x_FirstSeen', 'x_LastSeen', 'x_Uni_SizeVerified', 'x_Uni_OrderedDate', 'x_Uni_SizeOrdered', 'x_Uni_ReceivedDate', 'x_Uni_GivenDate', 'x_Uni_GivenFlag', 'x_Uni_SizeGiven', 'x_Uni_Notes', 'x_noteam:Q1'].forEach(c => assert(doc.includes('`' + c + '`'), c + ' is not documented'));
  Object.keys(Model.X).forEach(k => assert(doc.includes('`' + Model.X[k] + '`'), Model.X[k] + ' is not documented'));
  ['team:Q1', 'team:<year>:Qn', 'ov:<Planning Center column>'].forEach(c => assert(doc.includes('`' + c), c + ' is not documented'));
});
test('every flag level in the code is in the flag table', () => {
  const m = /const FLAG_LEVELS = \[([^\]]*)\]/.exec(src); assert(m, 'FLAG_LEVELS not found in season.js');
  const levels = m[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean); assert(levels.length >= 9);
  levels.forEach(l => assert(row(l).test(doc), 'no flag-level row for ' + l));
});
test('every award-state and mark the code names is documented (marks a h p x g t, MERGE_MINUTES, version)', () => {
  Season.MARKS.forEach(k => assert(new RegExp('`' + k + '`').test(doc), 'mark ' + k + ' is not documented'));
  assert(doc.includes('`MERGE_MINUTES`') && /\*\*5 minutes\*\*/.test(doc) && Season.MERGE_MINUTES === 5, 'the 5-minute History window');
  assert(new RegExp('currently `' + Season.VERSION + '`').test(doc), 'version ' + Season.VERSION);
});
test('the worked example (section 14) opens, round-trips, and passes the file check with no errors', () => {
  const m = /```jsonc\n([\s\S]*?)\n```/.exec(doc); assert(m, 'no jsonc example');
  const text = m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s\/\/[^\n]*/g, '');      // comments are not JSON
  const parsed = JSON.parse(text); assert.strictEqual(parsed.format, 'awana-season');
  const opened = Season.fromJson(text);
  assert.strictEqual(opened.roster.people['7000001_Test_Kid'].pc['First Name'], 'Test', 'the packed Planning Center record unpacks by pcCols');
  assert.strictEqual(opened.roster.people['7000001_Test_Kid'].pc['Medical Notes'], undefined, 'a null value is no field');
  assert.strictEqual(Season.toJson(Season.fromJson(Season.toJson(opened))), Season.toJson(opened), 'it round-trips');
  const errors = V.validate(Season.toJson(opened), 'awana-2026-27-20261029-122918.json').findings.filter(f => f.level === 'error'); assert.deepStrictEqual(errors, [], 'no file-check errors');
});
test('every key of the export record is documented under 5.2 (R17)', () => {
  const at = doc.indexOf('### 5.2 `roster`'), end = doc.indexOf('### 5.3', at), sec = doc.slice(at, end); assert(at > 0 && end > at, 'section 5.2 found');
  Model.CAPTURE_KEYS.forEach(k => assert(sec.includes('`' + k + '`'), 'pcExport key `' + k + '` is not documented in 5.2'));
  assert(sec.includes('`pcExport`') && sec.includes('Stored names') && sec.includes('Column kinds'), '5.2 describes the record, the stored-name rules and the column kinds');
});
test('the season.js header points at docs/DATA-FORMAT.md and keeps no list of sections', () => {
  const i = src.indexOf('(function (root)'); assert(i > 0, 'the header ends where the module starts'); const header = src.slice(0, i);
  assert(header.includes('docs/DATA-FORMAT.md'), 'the header does not point at docs/DATA-FORMAT.md');
  const shape = header.split('\n').find(l => /^\/\/\s+[A-Za-z]+(\[|\s*=\s)/.test(l)); assert(!shape, 'a shape line crept back into the header: ' + shape);
  Season.SECTIONS.filter(k => k !== 'config').forEach(k => assert(!new RegExp('\\b' + k + '\\[').test(header), 'the header lists the section ' + k + ' again'));
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
