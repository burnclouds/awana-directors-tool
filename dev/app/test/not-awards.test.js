// N23 (1.51.16): Flight 3:16, Start Zone (and the older Start Zone 1 / 2) and Apple Acres are booklets and entrance blocks, not awards. Nothing about them is announced, listed to give, put on a slide or counted;
// the sign-off boxes still count; a record of one in a file is deleted when the file is opened (one File upgrade entry); Validate says how many a file still holds. Invented data only.
// Usage: node test/not-awards.test.js
const assert = require('assert');
const S = require('../season.js'), Catalog = require('../catalog.js'), Validate = require('../validate.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const NAMES = ['Flight 3:16', 'Start Zone', 'Start Zone 1', 'Start Zone 2', 'Apple Acres'];
const fresh = () => S.fromJson(S.toJson(S.blank('2026-27')));
const withLegacy = () => {      // a file as an older copy could have left it: an announce night, given dates, hold, no-date marks, config lists and the old template
  const s = fresh(); s.calendar = [{ Date: '2026-09-16', Type: 'Club night', Quarter: 'Q1' }];
  s.awards = { '2026-09-16': { k1: ['Flight 3:16', 'HG Pilot Wing'], t1: ['Start Zone 1', 'Start Zone 2'], c1: ['Apple Acres'] } };
  s.given = { k1: { 'Flight 3:16': '2026-09-23', 'HG Pilot Wing': '2026-09-30' }, t1: { 'Start Zone': '2026-09-23' } };
  s.givenNoDate = { k1: ['Flight 3:16'], t1: ['Start Zone 1'] }; s.announcedNoDate = { c1: ['Apple Acres'], k1: ['Flight 3:16'] }; s.held = { k1: { 'Flight 3:16': 1 } };
  s.config.awardLists.Sparks = ['Flight 3:16'].concat(s.config.awardLists.Sparks); s.config.exclude = { Sparks: ['Flight 3:16'] }; s.config.endOfYear.Cubbies = (s.config.endOfYear.Cubbies || []).concat(['Apple Acres']);
  s.config.progress.Sparks.common.forEach(b => { if (b.key === 'FLT') b.awards = ['Flight 3:16']; });
  return s;
};

test('the new files: Flight 3:16 is in no award list and its block has no award; nothing is left off by default', () => {
  const c = Catalog.defaultConfig(); assert(!c.awardLists.Sparks.includes('Flight 3:16')); assert.deepStrictEqual(c.exclude, {});
  const flt = c.progress.Sparks.common.find(b => b.key === 'FLT'); assert.deepStrictEqual(flt.awards, []); assert.strictEqual(flt.items.length, 6, 'the six boxes stay');
  assert.deepStrictEqual(S.NOT_AWARDS, NAMES); NAMES.forEach(n => assert.strictEqual(S.notAnAward(n), true, n)); ['HG Pilot Wing', 'Blue Emblem 1', 'Start Zone Medal'].forEach(n => assert.strictEqual(S.notAnAward(n), false, n));
});
test('the ledger and every list built on it leave the three out, even when a record of one is in the data', () => {
  const s = withLegacy();      // direct data, no upgrade: the choke point alone must hold
  ['k1', 't1', 'c1'].forEach(id => { const g = id === 'k1' ? 'Sparks' : id === 't1' ? 'T&T' : 'Cubbies';
    const names = rows => rows.map(r => r.award); NAMES.forEach(n => { assert(!names(S.awardLedger(s, id, g, s.calendar)).includes(n), 'ledger ' + id + ' ' + n); assert(!names(S.toHandOut(s, id, g, s.calendar)).includes(n), 'hand out ' + id + ' ' + n); assert(!names(S.pendingAwards(s, id, g, s.calendar)).includes(n), 'pending ' + id + ' ' + n); assert(!names(S.earnedAwards(s, id, g, s.calendar)).includes(n), 'earned ' + id + ' ' + n); }); });
  assert(S.awardLedger(s, 'k1', 'Sparks', s.calendar).some(r => r.award === 'HG Pilot Wing'), 'a real award on the same child is still there');
  assert.deepStrictEqual(S.slidePending(s, 'Sparks', ['k1'], s.calendar), [], 'slides: nothing for this child (the Pilot Wing is announced already)');
});
test('finishing the Flight 3:16 booklet still counts: the block is complete, it earns nothing, and the Sparks book is not blocked', () => {
  const s = fresh(); s.progress = { k1: { common: {} } }; ['1', '2', '3', '4', '5', '6'].forEach(i => S.setProgress(s, 'k1', 'common', 'FLT.' + i, '2026-10-01'));
  const b = S.completedBlocks(s, 'k1', 'Sparks').find(x => x.key === 'FLT'); assert(b, 'the block is complete'); assert.deepStrictEqual(b.awards, []);
  assert(!S.suggestedAwards(s, 'k1', 'Sparks').some(a => a.award === 'Flight 3:16'), 'nothing to announce');
});
test('opening an older file deletes every record of the three, keeps everything else, and logs ONE File upgrade entry; a current file gets none', () => {
  const s = withLegacy(); s.history = [{ t: '2026-10-01T00:00:00.000Z', label: 'start', changes: [] }];
  const back = S.fromJson(S.toJson(s));
  assert.deepStrictEqual(back.awards['2026-09-16'], { k1: ['HG Pilot Wing'] }, 'the night keeps the real award; empty children and nights go'); assert.deepStrictEqual(back.given, { k1: { 'HG Pilot Wing': '2026-09-30' } });
  const raw = JSON.parse(S.toJson(back)); assert(!raw.givenNoDate && !raw.announcedNoDate && !raw.held, 'empty sections are left out of the file'); assert(!back.config.awardLists.Sparks.includes('Flight 3:16')); assert.deepStrictEqual(back.config.exclude.Sparks, []); assert(!back.config.endOfYear.Cubbies.includes('Apple Acres'));
  assert.deepStrictEqual(back.config.progress.Sparks.common.find(b => b.key === 'FLT').awards, []);
  assert.strictEqual(back.history.length, 2); assert.strictEqual(back.history[1].label, 'File upgrade');
  const again = S.fromJson(S.toJson(back)); assert.strictEqual(again.history.length, 2, 'opening it again changes nothing');
  const cur = fresh(); cur.history = [{ t: '2026-10-01T00:00:00.000Z', label: 'start', changes: [] }]; assert.strictEqual(S.fromJson(S.toJson(cur)).history.length, 1, 'a current file gets no entry');
});
test('Validate says how many records of the three a file still holds (a warning, never an error); the same file opened is clean', () => {
  const s = withLegacy(); s.calendar = []; const run = x => Validate.validate(S.toJson(x), 'awana-2026-27-20261116-000000.json').findings;
  const w = run(s).filter(f => f.level === 'warn' && /Flight 3:16, Start Zone or Apple Acres/.test(f.msg)); assert.strictEqual(w.length, 1); assert(/^11 records/.test(w[0].msg), w[0].msg); assert(!run(s).some(f => f.level === 'error'));
  const opened = S.fromJson(S.toJson(s)); opened.calendar = []; assert(!run(opened).some(f => /Flight 3:16, Start Zone or Apple Acres/.test(f.msg)));
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
