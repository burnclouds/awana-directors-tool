// R20: one test per way the data in a file can drift from what its History replays to. Each cause test builds a file the way an OLDER release saved it, with the edit logged,
// opens it with the current code, and asserts the History still explains the data. A cause test is RED until its fix lands (see KNOWN_RED); the guards are green today.
// Usage: node test/replay-causes.test.js     (invented ids only; the real file's differences were all causes 1a below: 34 T&T children's progress keys, 2026-11-13)
const assert = require('assert');
const Season = require('../season.js'), Catalog = require('../catalog.js');
let passed = 0, failed = 0, red = 0;
const KNOWN_RED = new Set([]);   // names of cause tests whose fix has not landed yet
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { if (KNOWN_RED.has(name)) { red++; console.log('  RED  ' + name + '   (known, fix pending)\n       ' + String(e.message).split('\n')[0].slice(0, 200)); } else { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
}
const KID = '7000001_Test_Kid', clone = x => JSON.parse(JSON.stringify(x));
const shape = d => d.map(x => x.p.map((q, i) => i === 1 ? '<id>' : q).join(' > ')).join(' | ');

// The T&T config as releases before 1.50.13 wrote it: every block in `common`, nothing in `perBook`.
function oldTnt() { const t = clone(Catalog.tntTemplate()); t.common = t.perBook.concat(t.common); t.perBook = []; return t; }
// An old-form season with one logged edit (`edit` is the change an older app would have made), saved the way an older release saved it.
function savedByOlderRelease(config, edit) {
  const s = Season.blank('2026-27'); config(s);
  const before = Season.snapshot(s); edit(s); Season.record(s, before, { now: '2026-10-29T23:00:00.000Z' });
  return Season.toJson(s);
}
const explains = text => { const d = Season.replayDiff(Season.fromJson(text)); assert.deepStrictEqual(d, [], d.length + ' differences: ' + shape(d)); };

test('cause 1a: T&T sign-offs logged under common, moved to AoG by upgradeTnt', () => {
  explains(savedByOlderRelease(s => { s.config.progress['T&T'] = oldTnt(); }, s => { s.progress[KID] = { common: { 'BE1.1': '2026-10-07' } }; }));
});
test('cause 1a: Start Zone keys logged as SZ1.1, renamed SZ.1 by upgradeStartZone', () => {
  explains(savedByOlderRelease(s => { const t = Catalog.tntTemplate(); t.common = [{ key: 'SZ1', items: ['1'] }].concat(t.common.filter(b => !/^SZ/.test(b.key))); s.config.progress['T&T'] = t; }, s => { s.progress[KID] = { common: { 'SZ1.1': '2026-10-07' } }; }));
});

const OLD_TNT = () => savedByOlderRelease(s => { s.config.progress['T&T'] = oldTnt(); }, s => { s.progress[KID] = { common: { 'BE1.1': '2026-10-07' } }; });
test('fromJson logs its upgrades once, as one named version that repeats the last entry\'s time', () => {
  const text = OLD_TNT(), raw = JSON.parse(text), s = Season.fromJson(text), last = s.history[s.history.length - 1];
  assert.strictEqual(s.history.length, raw.history.length + 1); assert.strictEqual(last.label, 'File upgrade'); assert.strictEqual(last.tag, 'File upgrade'); assert.strictEqual(last.t, raw.history[raw.history.length - 1].t);
  const saved = Season.toJson(s); assert.strictEqual(Season.toJson(Season.fromJson(saved)), saved, 'opening the saved file again changes nothing and adds no second entry');
  assert.strictEqual(Season.fromJson(text).history.length, s.history.length, 'two copies opening the same file get the same entry');
});
test('a file written by the current release gains no entry, and neither does an old file with no history', () => {
  const cur = savedByOlderRelease(() => {}, s => { s.progress[KID] = { HG: { 'AoG.1': '2026-10-07' } }; }); assert.strictEqual(Season.fromJson(cur).history.length, JSON.parse(cur).history.length);
  const s = Season.blank('2026-27'); s.config.progress['T&T'] = oldTnt(); s.progress[KID] = { common: { 'BE1.1': '2026-10-07' } };
  const t = Season.toJson(s); assert.strictEqual(Season.fromJson(t).history.length, 0);
});
test('restore to the version before a File upgrade, save and reopen: current form, replay clean', () => {
  const s = Season.fromJson(OLD_TNT()), n = s.history.length, back = Season.restoreTo(s, n - 1).season, again = Season.fromJson(Season.toJson(back));
  assert(!(again.progress[KID] || {}).common, 'the old layout was upgraded again on open'); assert.deepStrictEqual(Season.replayDiff(again), []);
});

// ---- cause 1b: a file that an older release already upgraded and saved (the real file's state) ----
const ALREADY_UPGRADED = () => { const s = Season.fromJson(OLD_TNT()); s.history.pop(); return Season.toJson(s); };   // the upgrade happened silently, then the file was saved
test('cause 1b: reconcile records the drift as one entry; the replay is then clean and stays clean', () => {
  const s = Season.fromJson(ALREADY_UPGRADED()), d = Season.replayDiff(s).length; assert(d > 0, 'this is the drifted state no change to fromJson can fix');
  const n = s.history.length, data = Season.snapshot(s);
  assert.strictEqual(Season.reconcile(s, '2026-11-13T12:00:00.000Z'), d); assert.strictEqual(s.history.length, n + 1);
  assert.deepStrictEqual(Season.snapshot(s), Object.assign({}, data), 'only history changes'); assert.deepStrictEqual(Season.replayDiff(s), []);
  const again = Season.fromJson(Season.toJson(s)); assert.deepStrictEqual(Season.replayDiff(again), []); assert.strictEqual(Season.reconcile(again, '2026-11-13T12:05:00.000Z'), 0); assert.strictEqual(again.history.length, n + 1);
  assert(/Reconciled/.test(s.history[n].label));
});
test('reconcile on a clean file adds nothing', () => { const s = Season.fromJson(savedByOlderRelease(() => {}, s => { s.progress[KID] = { HG: { 'AoG.1': '2026-10-07' } }; })); const n = s.history.length; assert.strictEqual(Season.reconcile(s, '2026-11-13T12:00:00.000Z'), 0); assert.strictEqual(s.history.length, n); });

// ---- guards, green today ----
test('guard: a file written by the current release with a logged sign-off replays clean', () => {
  explains(savedByOlderRelease(() => {}, s => { s.progress[KID] = { HG: { 'AoG.1': '2026-10-07' } }; }));
});
test('guard: a file with no history has nothing to replay', () => { assert.deepStrictEqual(Season.replayDiff(Season.fromJson(Season.toJson(Season.blank('2026-27')))), []); });

console.log(passed + ' passed, ' + failed + ' failed' + (red ? ', ' + red + ' red (known, fix pending)' : ''));
process.exit(failed ? 1 : 0);
