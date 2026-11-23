// The anonymized test set: nothing identifying is left, and it still behaves like the real files.
// Usage: node test/anonymized-data.test.js <real-data.json> <real-export.csv>     (the real files are read, never written or copied)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const Csv = require('../csv.js'), M = require('../model.js'), Season = require('../season.js'), V = require('../validate.js');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
}
if (process.argv.length < 4) { console.log('SKIP: needs real files (a data JSON and an export; see Usage above)'); process.exit(0); }
const [dataPath, exportPath] = process.argv.slice(2).map(p => path.resolve(p));
const tool = path.join(__dirname, '..', '..', 'tools', 'make-test-data.js'), testData = path.join(__dirname, '..', '..', 'test-data');
const run = dir => cp.execFileSync('node', [tool, dataPath, exportPath, dir]);
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'awana-anon-'));
const log = run(outDir).toString();
const files = fs.readdirSync(outDir), dataFile = files.find(f => f.endsWith('.json')), csvFile = files.find(f => f.endsWith('.csv'));
const dataText = fs.readFileSync(path.join(outDir, dataFile), 'utf8'), csvText = fs.readFileSync(path.join(outDir, csvFile), 'utf8');
const realData = Season.fromJson(fs.readFileSync(dataPath, 'utf8')), anon = Season.fromJson(dataText), realCsv = fs.readFileSync(exportPath, 'utf8');

// what "real" means here, worked out independently of the tool: name words, phone numbers, emails, registration IDs, street names
const rows = Csv.parse(realCsv).filter(r => r.some(c => c !== '')), head = rows[0], col = n => head.findIndex(h => h.startsWith(n));
const cell = (r, n) => r[col(n)] || '';
let english = new Set(); try { english = new Set(fs.readFileSync('/usr/share/dict/words', 'utf8').split('\n').filter(w => /^[a-z]+$/.test(w))); } catch (e) { /* optional */ }
const ROLE = new Set('and the my of mom mommy mother dad daddy father grandma grandpa grandmother grandfather granny nana papa aunt auntie uncle cousin sister brother family friend neighbor neighbors parents guardian husband wife mr mrs ms dr pastor can will not only also with for or on at to from by home work cell mobile phone number numbers text call ext none no yes unknown iii jr sr'.split(' '));
const words = s => (String(s).match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ']*/g) || []).map(w => w.toLowerCase());
const realWords = new Set(), realPhones = new Set(), realEmails = new Set(), realReg = new Set(), realStreets = new Set();
rows.slice(1).forEach(r => {
  ['First Name', 'Last Name', 'Registration Contact First Name', 'Registration Contact Last Name'].forEach(n => words(cell(r, n)).forEach(w => w.length >= 3 && !ROLE.has(w) && realWords.add(w)));
  ['Emergency Contact', 'Please list the names', 'Please provide the primary'].forEach(n => words(cell(r, n)).forEach(w => w.length >= 3 && !ROLE.has(w) && !english.has(w) && realWords.add(w)));
  r.forEach(c => { require('../../tools/anon-pc.js').phoneRuns(c).forEach(d => realPhones.add(d)); (c.match(/[\w.%+\-]+@[\w.\-]+\.[a-z]{2,}/gi) || []).forEach(e => realEmails.add(e.toLowerCase())); });
  if (cell(r, 'Registration ID')) realReg.add(cell(r, 'Registration ID')); if (cell(r, 'Home Address Street').length > 6) realStreets.add(cell(r, 'Home Address Street').toLowerCase());
});
const plain = (JSON.stringify(realData.config) + JSON.stringify(realData.calendar) + JSON.stringify(realData.rotation)).toLowerCase();
const leakIn = text => {
  const low = text.toLowerCase(), found = new Set(require('../../tools/anon-pc.js').phoneRuns(text));
  return [].concat(
    [...realWords].filter(w => !new RegExp('\\b' + w + '\\b').test(plain) && new RegExp("(^|[^a-zÀ-ÿ'])" + w + "([^a-zÀ-ÿ']|$)").test(low)).map(w => 'name word ' + w),
    [...realPhones].filter(p => found.has(p)).map(p => 'phone ' + p),
    [...realEmails].filter(e => low.includes(e)).map(e => 'email ' + e),
    [...realReg].filter(r => new RegExp('(^|[^0-9])' + r + '([^0-9]|$)').test(text)).map(r => 'registration ID ' + r),
    [...realStreets].filter(s => low.includes(s)).map(s => 'street ' + s));
};

test('the tool\'s own checks pass: no real name word survives, the export matches the data file, both files validate', () => {
  assert(/still present anywhere in the output: 0/.test(log) && /field changes 0/.test(log) && /no problems.*\| export errors: 0/.test(log), log.slice(0, 400));
});
test('no real name, phone number, email, registration ID or street is left in either file', () => {
  const leaks = leakIn(dataText).concat(leakIn(csvText)), kinds = {}; leaks.forEach(l => { const k = (/^(name word|phone|email|registration ID|street)/.exec(l) || ['other'])[0]; kinds[k] = (kinds[k] || 0) + 1; });
  assert.strictEqual(leaks.length, 0, leaks.length + ' left (the values are not printed): ' + JSON.stringify(kinds));
});
test('every phone is an invented 555-01xx number and every email is example.com or example.org', () => {
  const t = dataText + '\n' + csvText;
  const phones = (t.match(/\(?\d{3}\)?[\s.\-]*\d{3}[\s.\-]*\d{4}/g) || []).map(p => p.replace(/\D/g, '')).filter(d => d.length === 10);
  assert(phones.length > 100 && phones.every(d => /^\d{3}5550[1]\d\d$/.test(d) || /^\d{3}55501\d\d$/.test(d)), 'phones: ' + phones.filter(d => !/^\d{3}55501\d\d$/.test(d)).slice(0, 5));
  const mails = t.match(/[\w.%+\-]+@[\w.\-]+\.[a-z]{2,}/gi) || [];
  assert(mails.length > 50 && mails.every(e => /@example\.(com|org)$/i.test(e)), mails.filter(e => !/@example\./i.test(e)).slice(0, 3).join(','));
});
test('the same people, families and records: counts, teams, handbooks, attendance, awards and games all carry over', () => {
  const cnt = (s, k) => Object.values(s[k]).reduce((n, x) => n + (typeof x === 'object' ? Object.keys(x).length : 1), 0);
  ['attendance', 'awards', 'games', 'handbooks', 'progress', 'teamMoves', 'adults'].forEach(k => assert.strictEqual(cnt(anon, k), cnt(realData, k), k));
  // History: the tool leaves out the lines about notes and flags and about volunteer absences (free text about people), Google Drive folders and the team plan, and an entry left with no lines at all; nothing else.
  const dropped = c => c.p[0] === 'flags' || c.p[0] === 'absences' || (c.p[0] === 'config' && (c.p[1] === 'driveDirs' || c.p[1] === 'teamPlan')), keep = e => (e.changes || []).some(c => !dropped(c)), kept = realData.history.filter(keep);
  assert.strictEqual(anon.history.length, kept.length, 'history entries'); assert.strictEqual(anon.history.reduce((n, e) => n + e.changes.length, 0), kept.reduce((n, e) => n + e.changes.filter(c => !dropped(c)).length, 0), 'history changes');
  const teams = s => Object.values(s.roster.people).map(e => ['Q1', 'Q2', 'Q3', 'Q4'].map(q => e.v['team:' + q] || '-').join('')).sort().join();
  assert.strictEqual(teams(anon), teams(realData));
  const distinct = (s, c) => new Set(Object.values(s.roster.people).map(e => e.pc[c])).size;
  assert.strictEqual(distinct(anon, 'Last Name'), distinct(realData, 'Last Name')); assert.strictEqual(distinct(anon, 'Registration ID'), distinct(realData, 'Registration ID'));
  assert.deepStrictEqual(Object.values(anon.handbooks).map(x => x.replace(/\d{6}/, 'd')).sort(), Object.values(realData.handbooks).map(x => x.replace(/\d{6}/, 'd')).sort());
  assert.strictEqual(Object.keys(anon.roster.people).length, Object.keys(realData.roster.people).length);
});
test('brothers and sisters still share a last name and a registration, and a parent in the contact fields shares it too', () => {
  const byReg = {}; Object.values(anon.roster.people).forEach(e => (byReg[e.pc['Registration ID']] = byReg[e.pc['Registration ID']] || []).push(e.pc));
  const realReg = {}; Object.values(realData.roster.people).forEach(e => (realReg[e.pc['Registration ID']] = realReg[e.pc['Registration ID']] || []).push(e.pc));
  const shape = by => Object.values(by).map(l => l.length + ':' + new Set(l.map(p => p['Last Name'])).size).sort().join(',');
  assert.strictEqual(shape(byReg), shape(realReg), 'families have the same sizes and the same number of last names as the real ones');
  assert(Object.values(byReg).filter(l => l.length > 1).length > 10);
  assert(Object.values(anon.roster.people).filter(e => /\w+ \w+ - /.test(e.pc['Emergency Contact'])).some(e => e.pc['Emergency Contact'].startsWith('') && new RegExp(e.pc['Last Name'].split(/[ \-]/)[0]).test(e.pc['Emergency Contact'])), 'a parent with the family name in the emergency contact');
});
test('ids are rebuilt from the invented names, so every section agrees', () => {
  const ids = new Set(Object.keys(anon.roster.people));
  Object.keys(anon.roster.people).forEach(id => { const v = anon.roster.people[id].v.x_ClubberID; assert(v === undefined || v === id, id); });
  ['handbooks', 'progress', 'teamMoves'].forEach(k => Object.keys(anon[k]).forEach(id => assert(ids.has(id), k + ' ' + id)));
  ['attendance', 'awards'].forEach(k => Object.keys(anon[k]).forEach(d => Object.keys(anon[k][d]).forEach(id => assert(ids.has(id), k + ' ' + id))));
  const norm = f => f.msg.replace(/[0-9]+/g, '#').replace(/\(.*$/, '').slice(0, 50), had = new Set(V.validate(fs.readFileSync(dataPath, 'utf8'), path.basename(dataPath)).findings.map(norm));
  assert.deepStrictEqual(V.validate(dataText, dataFile).findings.filter(f => f.level !== 'info' && !had.has(norm(f))).map(f => f.level), [], 'no file-check finding the real file did not already have');
});
test('every birthdate moved two to eight weeks and kept its age; medical text is generic and the "none" and "no photos" cases remain', () => {
  const Intake = require('../intake.js'), ref = /^(\d{4})(\d{2})(\d{2})(-\d+)? /.exec(path.basename(exportPath)).slice(1).join('-');
  const ar = Csv.parse(csvText).filter(r => r.some(c => c !== '')), hd = ar[0], ci = n => hd.findIndex(h => h.startsWith(n));
  assert.strictEqual(ar.length, rows.length);
  const day = b => Date.UTC(b.y, b.m - 1, b.d) / 864e5;
  rows.slice(1).forEach((r, i) => {
    const o = Intake.parseBirthdate(r[col('Birthdate')]), n = Intake.parseBirthdate(ar[i + 1][ci('Birthdate')]);
    if (!o) return;
    assert(n, 'row ' + (i + 2) + ' lost its birthdate');
    const moved = Math.abs(day(n) - day(o));
    assert(moved >= 14 && moved <= 56, 'row ' + (i + 2) + ' moved ' + moved + ' days');
    assert.strictEqual(Intake.ageOn(n, ref), Intake.ageOn(o, ref), 'row ' + (i + 2) + ' changed age');
  });
  const medCols = ['Medical Notes', 'Does your child have any allergies'], sensitive = /nephrectom|pacemaker|feeding|\bng\b|autis|\belope|epileps|crohn|diabet|adhd|speech|language delay|potty|pull-?ups|morphine|augmentin|ciprofloxacin|amoxil|kidney|seizure|medicine at night/i;
  const triv = /^(no|n|na|n\/a|none|nka|nope|nothing|nil|-+|no allergies|no medical.*|yes|y|already on my profile|no food allergies)\.?$/i;
  rows.slice(1).forEach((r, i) => medCols.forEach(c => {
    const o = String(r[col(c)] || '').trim(), n = String(ar[i + 1][ci(c)] || '').trim();
    if (!o) return assert.strictEqual(n, '');
    if (triv.test(o) || (M.photoRequest(o) && o.length < 24 && !sensitive.test(o))) return assert.strictEqual(n, o, 'row ' + (i + 2) + ' "' + o + '" should stay');
    assert.notStrictEqual(n, o, 'row ' + (i + 2) + ' medical text unchanged: ' + o);
    assert.strictEqual(M.photoRequest(n), M.photoRequest(o), 'row ' + (i + 2) + ' photo request lost or added');
    assert(!sensitive.test(n), 'row ' + (i + 2) + ' still sensitive: ' + n);
  }));
  const text = dataText + '\n' + csvText, hit = text.match(new RegExp(sensitive.source, 'gi'));
  assert(!hit, 'sensitive medical terms in the output: ' + hit);
});
test('importing the anonymized export into the anonymized data file changes nothing', () => {
  const m = M.fromRoster(anon.roster), plan = M.planImport(m, Csv.toRecords(Csv.parse(csvText)));
  assert.deepStrictEqual([plan.matched.length, plan.added.length, plan.missing.length, plan.renames.length, plan.matched.filter(x => x.changes.length).length], [rows.length - 1, 0, 0, 0, 0]);
});
test('the file names carry TEST so the app treats them as test data, and the data file name keeps its date tag', () => {
  assert(/^awana-.*-TEST-\d{8}-\d{6}\.json$/.test(dataFile), dataFile); assert(/(^|[^a-z])test([^a-z]|$)/i.test(csvFile), csvFile);
});
test('the tool is deterministic: running it twice gives the same files', () => {
  const again = fs.mkdtempSync(path.join(os.tmpdir(), 'awana-anon-')); run(again);
  assert.strictEqual(fs.readFileSync(path.join(again, dataFile), 'utf8'), dataText); assert.strictEqual(fs.readFileSync(path.join(again, csvFile), 'utf8'), csvText);
});
test('notes and flags, holds, received dates and Given entries (all keyed by real IDs, flags with free text) never leak into the anonymized set', () => {
  const real = JSON.parse(fs.readFileSync(dataPath, 'utf8')), ids = Object.keys(real.roster.people), id = ids[0], real0 = real.roster.people[id].pc || {};
  const secret = 'SECRETNOTE about ' + String((Array.isArray(real0) ? '' : real0['First Name']) || 'someone');
  real.flags = { f1: { kid: id, level: 'box', book: 'HG', block: 'RJ1', key: 'RJ1.2', note: secret, at: '2026-11-05' } };
  real.progressNoDate = { [id]: { AoG: ['1.1'] } }; real.extraSheets = { [id]: ['WR'] }; real.announcedNoDate = { [id]: ['HG Red Jewel 1'] }; real.blueDrops = { [id]: ['1|2026-10-07'] }; real.blueWings = { [id]: [{ book: 'HG', slot: 1, n: 1 }] };
  real.blueOverrides = { [id]: [{ book: 'HG', n: 2, date: '2026-10-07', note: secret }] };      // a leader's note about the child
  real.held = { [id]: { 'HG Red Jewel 1': 1 } }; real.received = { [id]: { HG: '2026-09-16' } }; real.doneBooks = { [id]: ['HG'] }; real.doneReviews = { [id]: ['HG'] }; real.givenNoDate = { [id]: ['HG Red Jewel 1'] }; real.given = Object.assign({}, real.given, { [id]: { 'HG Red Jewel 1': '2026-10-21' } });
  real.history = (real.history || []).concat([{ t: '2026-11-05T12:00:00', label: 'flagged: ' + secret, changes: [{ p: ['flags', 'f1'], n: real.flags.f1 }] }]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'awana-anon-')), src = path.join(tmp, path.basename(dataPath)); fs.writeFileSync(src, JSON.stringify(real));
  const out = path.join(tmp, 'out'); cp.execFileSync('node', [tool, src, exportPath, out]);
  const text = fs.readFileSync(path.join(out, fs.readdirSync(out).find(f => f.endsWith('.json'))), 'utf8'), a = JSON.parse(text), anonIds = new Set(Object.keys(a.roster.people));
  assert(!('flags' in a), 'no flags section'); assert(!/SECRETNOTE/.test(text), 'no flag note anywhere, history included'); assert(!text.includes(id), 'the real ID does not appear');
  ['given', 'givenNoDate', 'held', 'received', 'doneBooks', 'doneReviews', 'progressNoDate', 'extraSheets', 'announcedNoDate', 'blueWings', 'blueOverrides', 'blueDrops'].forEach(k => assert(Object.keys(a[k] || {}).every(x => anonIds.has(x)), k + ' is keyed by invented IDs only'));
  ['progressNoDate', 'extraSheets', 'announcedNoDate', 'blueWings', 'blueOverrides', 'blueDrops', 'doneReviews'].forEach(k => assert(Object.keys(a[k] || {}).length === 1, k + ' is kept, renamed'));
  assert(Object.keys(a.held || {}).length === 1 && Object.keys(a.received || {}).length === 1, 'the holds and received dates are kept, renamed');
  const bad = path.join(tmp, 'bad.json'); fs.writeFileSync(bad, JSON.stringify(Object.assign({}, real, { surprise: { [id]: 'x' } })));
  assert.throws(() => cp.execFileSync('node', [tool, bad, exportPath, path.join(tmp, 'out2')], { stdio: 'pipe' }), /does not know the data key/, 'an unknown section stops the run');
});
test('the committed test-data folder holds no real name, phone, email, registration ID or street either', () => {
  if (!fs.existsSync(testData)) return;
  const n = rows.length - 1;
  fs.readdirSync(testData).filter(f => /\.(json|csv)$/.test(f)).forEach(f => {
    let text = fs.readFileSync(path.join(testData, f), 'utf8');
    if (/20261103/.test(f)) text = Csv.serialize(Csv.parse(text).filter(r => r.some(c => c !== '')).slice(0, n + 1));        // only the base people: the 15 added rows are invented on purpose
    // (an invented name that is also an ordinary English word can equal a real person's name by chance, which the tool does not count as a leak either)
    const l = leakIn(text).filter(x => !(/^name word /.test(x) && english.has(x.slice(10)))), kinds = {}; l.forEach(x => { const k = (/^(name word|phone|email|registration ID|street)/.exec(x) || ['other'])[0]; kinds[k] = (kinds[k] || 0) + 1; });
    assert.strictEqual(l.length, 0, f + ': ' + l.length + ' left (the values are not printed): ' + JSON.stringify(kinds));
  });
});
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
