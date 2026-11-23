// Every part of a data file that can hold records must be one of the tracked sections, or undo, History, Discard, restore and Drive merge silently skip it (review item R1).
// Usage: node test/season-sections.test.js     (invented ids only)
const assert = require('assert');
const Season = require('../season.js'), DataMerge = require('../datamerge.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const METADATA = new Set(['format', 'version', 'year', 'fake', 'history']);      // in the file, but not records that are logged
const KID = '7000001_Test_Kid';

// one change per newly tracked section, through the same functions the screens use
const edits = {
  progressNoDate: s => Season.markSignsNoDate(s, KID, 'AoG', ['1.1'], '2026-10-07'),
  doneReviews: s => Season.setReviewsDone(s, KID, 'HG', true),
  extraSheets: s => Season.addExtraSheet(s, KID, 'WR'),
  announcedNoDate: s => Season.setAnnNoDate(s, KID, 'HG Red Jewel 1', true),
  blueWings: s => { (s.blueWings = s.blueWings || {})[KID] = [{ book: 'HG', slot: 1, n: 1, threshold: 2, earned: '2025-10-01', date: '2025-11-05', year: '2025-26' }]; },
  blueOverrides: s => Season.grantBlue(s, KID, 'HG', 2, '2026-10-07', 'granted by a leader'),
  blueDrops: s => Season.dropBlue(s, KID, { kind: 'earned', book: 'HG', slot: 1, gem: 1, date: '2026-10-07', n: 1 }),
  pastTurnout: s => Season.addPastYear(s, '2025-26', { [KID]: { nights: 20, came: 15 } })
};
const fresh = () => Season.blank('2026-27');

test('every top-level section a populated file writes is a tracked section (or file metadata)', () => {
  const s = fresh(); Object.keys(edits).forEach(k => edits[k](s)); s.unknownKeys = { futureThing: { a: 1 } };      // (R17) a key the app does not know is kept and written back; it is not a section and is not tracked
  const all = Object.keys(JSON.parse(Season.toJson(s))); assert(all.includes('futureThing'), 'the unknown key is written'); assert(!all.includes('unknownKeys'), 'its holder is not');
  const written = all.filter(k => !METADATA.has(k) && !(k in s.unknownKeys));
  assert(Season.SECTIONS, 'Season.SECTIONS is exported');
  const missing = written.filter(k => !Season.SECTIONS.includes(k)); assert.deepStrictEqual(missing, [], 'written but not tracked: ' + missing.join(', '));
  Object.keys(edits).forEach(k => assert(written.includes(k), k + ' was written by its edit'));
});
test('Drive merge works from the same list as undo and History', () => { assert(Array.isArray(Season.SECTIONS) && Season.SECTIONS.length > 17, 'Season.SECTIONS is exported'); assert.deepStrictEqual(DataMerge.SECTIONS, Season.SECTIONS); });

Object.keys(edits).forEach(k => {
  test(k + ': a change is seen by History, labelled in words, undone by restore, and carried by a merge', () => {
    const s = fresh(), before = Season.snapshot(s); edits[k](s);
    const changes = Season.diff(before, s); assert(changes.length > 0, 'diff sees the change');
    assert(changes.some(c => c.p[0] === k), 'the change is at the ' + k + ' section');
    const e = Season.record(s, before, { now: '2026-10-07T20:00:00.000Z' }); assert(e, 'record logs it');
    assert(!/undefined/.test(e.label), 'label: ' + e.label);
    changes.forEach(c => assert(!/undefined|\[object/.test(Season.describe(c, id => id)), 'describe: ' + Season.describe(c, id => id)));
    // restore to before: the section is as it was
    const back = Season.at(s, 0); assert.strictEqual(JSON.stringify(Season.snapshot(back)[k] || {}), JSON.stringify(before[k] || {}), 'restore brings back the old ' + k);
    // merge: a copy that made the change, merged onto a copy that did not, keeps it
    const theirs = JSON.parse(JSON.stringify(back)), merged = Season.merge3(before, s, theirs, { now: '2026-10-07T21:00:00.000Z' }).season;
    assert.strictEqual(JSON.stringify(merged[k] || {}), JSON.stringify(s[k] || {}), 'the merged file holds ' + k);
  });
});
test('a file written with these sections opens again unchanged, and history labels name an area for each', () => {
  const s = fresh(); Object.keys(edits).forEach(k => edits[k](s));
  const text = Season.toJson(s); assert.strictEqual(Season.toJson(Season.fromJson(text)), text);
  const hist = Season.diff(Season.snapshot(fresh()), s); assert(hist.length > 0); assert(!/undefined/.test(Season.labelOf(hist)), Season.labelOf(hist));
});
test('a season with none of the new sections can still be snapshotted, diffed and merged', () => {
  const s = fresh(); delete s.blueDrops; delete s.extraSheets;
  assert.doesNotThrow(() => Season.snapshot(s)); assert.deepStrictEqual(Season.diff(Season.snapshot(s), s), []);
});
test('merging the FIRST entry in a section the file leaves out while empty is not a conflict (CR-03)', () => {
  ['absences', 'extraSheets', 'blueOverrides', 'progressNoDate', 'announcedNoDate', 'blueWings', 'blueDrops', 'pastTurnout', 'doneReviews'].forEach(k => {
    const open = () => Season.fromJson(Season.toJson(Season.blank('2026-27')));      // a real opened file: the section is not there
    const base = open(), theirs = open(), ours = open(); ours[k] = { entry: { value: 1 } };
    const r = Season.merge3(base, ours, theirs, {});
    assert.strictEqual(r.conflicts.length, 0, k + ': no conflict'); assert(r.applied > 0, k + ': applied');
    assert(r.season[k] && r.season[k].entry, k + ': the entry is in the merged season');
  });
  const e = Season.fromJson(Season.toJson(Season.blank('2026-27')));
  assert(!/"extraSheets"|"blueWings"|"doneReviews"/.test(Season.toJson(Season.merge3(e, e, e, {}).season)), 'an empty section is still left out of the file');
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
