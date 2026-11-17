// Acceptance gate for the one-file move: the new data JSON, opened with the Planning Center export, must hold everything
// the old master CSV, calendar CSV, rotation CSV and season JSON held. Real data, so the files are arguments.
// Usage: node test/migrate-db.test.js <export.csv> <old-master.csv> <calendar.csv> <rotation.csv> <season.json> [colors.csv]
const fs = require('fs'), assert = require('assert');
const M = require('../../app/model.js'), Season = require('../../app/season.js'), Calendar = require('../../app/calendar.js'), Rotation = require('../../app/rotation.js'), Csv = require('../../app/csv.js'), Teams = require('../../app/teams.js');
const { build } = require('../../tools/make-database.js');
const path = require('path');
const { C, X } = M;
const [exportP, masterP, calP, rotP, seasonP, colorsP] = process.argv.slice(2);
const rd = p => fs.readFileSync(p, 'utf8'), today = '2026-10-29';
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }

const oldMaster = M.loadMaster(rd(masterP), today), oldSeason = Season.fromJson(rd(seasonP));
const { season: db, report } = build({ exportName: path.basename(exportP), exportText: rd(exportP), masterText: rd(masterP), calendarText: rd(calP), rotationText: rd(rotP), seasonText: rd(seasonP), today });
const text = Season.toJson(db);                                        // what would be written to disk
const reopened = Season.fromJson(text);
const master = M.fromRoster(reopened.roster);
const plan = M.planImport(master, Csv.toRecords(Csv.parse(rd(exportP))));
M.applyPlan(master, plan, { rename: new Set(), add: new Set(), deactivate: new Set() }, today);   // what opening the export does
const byId = m => new Map(m.people.map(p => [p[X.ID], p]));

test('the file is a valid data file and opens again unchanged', () => {
  assert.strictEqual(Season.toJson(reopened), text);
  assert.strictEqual(reopened.version, Season.VERSION);
});

test('every person and frozen ID from the old master is there, and opening this week\'s export needs no review', () => {
  const a = byId(oldMaster), b = byId(master);
  assert.strictEqual(b.size, a.size);
  a.forEach((p, id) => assert(b.has(id), 'missing ' + id));
  assert.strictEqual(M.needsReview(plan), false);
  assert.deepStrictEqual([plan.added.length, plan.missing.length, plan.renames.length], [0, 0, 0]);
});

test('every field you own matches the old master: colors, uniforms, notes, active flags, first and last seen, extra columns', () => {
  const b = byId(master);
  oldMaster.people.forEach(p => {
    const q = b.get(p[X.ID]);
    Object.keys(p).filter(M.isUserCol).forEach(c => assert.strictEqual(q[c] || '', p[c] || '', p[X.ID] + ' ' + c));
  });
});

test('all the color assignments came across (' + (colorsP ? 'checked against the colors file' : 'counted from the old master') + ')', () => {
  const count = m => m.people.reduce((n, p) => n + ['Q1', 'Q2', 'Q3', 'Q4'].filter(q => p['team:' + q]).length, 0);
  assert.strictEqual(count(master), count(oldMaster));
  assert(count(master) >= 300, 'colors: ' + count(master));
  if (colorsP) { const t = M.loadMaster(rd(exportP), today); Teams.importList(t, null, rd(colorsP)); assert.strictEqual(count(master), count(t)); }
});

test('Planning Center fields are the export\'s (read fresh), identical to the old master\'s', () => {
  const a = byId(oldMaster), b = byId(master);
  master.pcCols.forEach(c => a.forEach((p, id) => assert.strictEqual(b.get(id)[c] || '', p[c] || '', id + ' ' + c)));
});

test('calendar and rotation rows are identical to the old CSVs', () => {
  assert.deepStrictEqual(reopened.calendar, Calendar.load(rd(calP)));
  assert.deepStrictEqual(reopened.rotation, Rotation.load(rd(rotP)));
});

test('all season data is identical to the old season file', () => {
  ['config', 'handbooks', 'attendance', 'awards', 'games', 'progress'].forEach(k => assert.deepStrictEqual(reopened[k], oldSeason[k], k));
  assert.strictEqual(reopened.year, oldSeason.year);
  assert.deepStrictEqual(reopened.history, []);
});

test('the file holds the full export, so the file alone can run the medical and contact reports; it says which export and what date', () => {
  const full = M.loadMaster(rd(exportP), today), alone = M.fromRoster(reopened.roster), a = byId(full), b = byId(alone);
  let checked = 0;
  full.pcCols.forEach(c => a.forEach((p, id) => { checked += p[c] ? 1 : 0; assert.strictEqual(b.get(id)[c] || '', p[c] || '', id + ' ' + c); }));
  assert(checked > 1000, 'fields compared: ' + checked);
  assert.deepStrictEqual(alone.pcCols, full.pcCols);
  assert.strictEqual(reopened.roster.pcSource, path.basename(exportP));
  assert.strictEqual(reopened.roster.pcAsOf, M.exportDate(path.basename(exportP), today));
});

test('the report says what went in', () => {
  assert.strictEqual(report.people, oldMaster.people.length);
  assert(report.colors >= 300);
});

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
