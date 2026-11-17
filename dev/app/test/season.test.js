// Season store tests: attendance, games, awards, progress, handbooks, totals, jewels, standings.
// Usage: node test/season.test.js
const assert = require('assert');
const S = require('../season.js'), Catalog = require('../catalog.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
}
const night = (Date, Quarter, extra) => Object.assign({ Date, Type: 'Club night', Quarter, 'No Club': '' }, extra || {});
const cal = [night('2026-09-09', 'Q1'), night('2026-09-16', 'Q1'), night('2026-09-23', 'Q1'), night('2026-10-28', 'Q2'),
  night('2026-11-04', 'Q2'), night('2026-11-25', 'Q2', { 'No Club': '1' }), night('2026-12-02', 'Q2')];

// ---------- file format ----------
test('a new season has the defaults and round-trips through JSON unchanged', () => {
  const s = S.blank('2026-27');
  const back = S.fromJson(S.toJson(s));
  assert.deepStrictEqual(back, s);
  assert.strictEqual(s.format, 'awana-season');
  assert.strictEqual(s.version, 6);
});
test('the format is version 6; a version 5 file opens and is written as 6; a version 7 file is refused as newer', () => {
  assert.strictEqual(S.VERSION, 6);
  const v5 = JSON.parse(S.toJson(S.blank('2026-27'))); v5.version = 5; const s = S.fromJson(JSON.stringify(v5)); assert.strictEqual(JSON.parse(S.toJson(s)).version, 6);
  assert.deepStrictEqual(S.replayDiff(s), [], 'migrating drops nothing and logs nothing'); assert.strictEqual(s.history.length, 0);
  v5.version = 7; assert.throws(() => S.fromJson(JSON.stringify(v5)), /from a newer version of the app \(version 7\)/);
});

test('the JSON is stable: the same data written in a different order gives identical text', () => {
  const a = S.blank('2026-27'), b = S.blank('2026-27');
  S.setMark(a, '2026-09-09', 'id2', 'a', 1); S.setMark(a, '2026-09-09', 'id1', 'a', 1); S.setMark(a, '2026-09-02', 'id1', 'a', 1);
  S.setMark(b, '2026-09-02', 'id1', 'a', 1); S.setMark(b, '2026-09-09', 'id1', 'a', 1); S.setMark(b, '2026-09-09', 'id2', 'a', 1);
  assert.strictEqual(S.toJson(a), S.toJson(b));
});

test('opening something that is not a season file says so', () => {
  assert.throws(() => S.fromJson('{"hello":1}'), /not a season file/i);
  assert.throws(() => S.fromJson('not json'), /not a season file|JSON/i);
  assert.throws(() => S.fromJson(JSON.stringify({ format: 'awana-season', version: 99 })), /newer|version/i);
});

test('the default award lists match the workbook: Puggles 1, Cubbies 5, Sparks 53, T&T 97 (the 24 names for each of 4 books; Start Zone has no award)', () => {
  const c = Catalog.defaultConfig();
  assert.deepStrictEqual(['Puggles', 'Cubbies', 'Sparks', 'T&T'].map(g => c.awardLists[g].length), [1, 5, 53, 97]);
  assert.deepStrictEqual(c.exclude, { Sparks: ['Flight 3:16'] });
  assert.deepStrictEqual(c.books.HG, { name: 'Hangglider', emblem: 'Green', group: 'Sparks' });
  assert.deepStrictEqual(c.blueJewelWeeks, [6, 12, 19, 27]);
});

// ---------- attendance ----------
test('marks set and clear, and a night with nobody left on it is no longer a night', () => {
  const s = S.blank('2026-27');
  S.setMark(s, '2026-09-09', 'k1', 'a', 1);
  S.setMark(s, '2026-09-09', 'k1', 'h', 1);
  assert.deepStrictEqual(s.attendance['2026-09-09'].k1, { a: 1, h: 1 });
  S.setMark(s, '2026-09-09', 'k1', 'a', 0);
  S.setMark(s, '2026-09-09', 'k1', 'h', 0);
  assert.strictEqual(s.attendance['2026-09-09'], undefined);        // an empty night would count as a night held on some screens
  assert(!S.hasNight(s, '2026-09-09'));
  assert(!S.hasNight(s, '2026-09-16'));
  S.setMark(s, '2026-09-16', 'k1', 'a', 1); assert(S.hasNight(s, '2026-09-16'));
});

test('only the four known marks are allowed', () => {
  assert.throws(() => S.setMark(S.blank('y'), '2026-09-09', 'k1', 'zzz', 1), /unknown mark/i);
});

test('totals per quarter and year, last date attended, and no-club nights are ignored', () => {
  const s = S.blank('2026-27');
  ['2026-09-09', '2026-09-16', '2026-09-23', '2026-10-28'].forEach(d => S.setMark(s, d, 'k1', 'a', 1));
  S.setMark(s, '2026-09-16', 'k1', 'p', 1); S.setMark(s, '2026-10-28', 'k1', 'x', 1); S.setMark(s, '2026-09-09', 'k1', 'h', 1);
  S.setMark(s, '2026-11-25', 'k1', 'a', 1);                                  // a mark on a no-club date is kept but not counted
  const t = S.totals(s, 'k1', cal);
  assert.deepStrictEqual(t.Q3, { a: 0, h: 0, p: 0, x: 0 });
  assert.deepStrictEqual(t.Q1, { a: 3, h: 1, p: 1, x: 0 });
  assert.deepStrictEqual(t.Q2, { a: 1, h: 0, p: 0, x: 1 });
  assert.deepStrictEqual(t.year, { a: 4, h: 1, p: 1, x: 1 });
  assert.strictEqual(t.last, '2026-10-28');
  assert.strictEqual(S.totals(s, 'nobody', cal).last, '');
});

// ---------- blue jewels ----------
test('Blue Jewel is earned on the night attendance reaches each threshold', () => {
  const s = S.blank('2026-27');
  s.config.blueJewelWeeks = [2, 4, 6, 8];
  const dates = ['01', '02', '03', '04', '05', '06', '07', '08', '09'].map(d => '2026-09-' + d);
  dates.forEach((d, i) => { if (i !== 2) S.setMark(s, d, 'k1', 'a', 1); });   // misses the 3rd night
  const j = S.blueJewels(s, 'k1', dates.map(d => night(d, 'Q1')));
  assert.deepStrictEqual(j.map(x => [x.n, x.threshold, x.date]), [[1, 2, '2026-09-02'], [2, 4, '2026-09-05'], [3, 6, '2026-09-07'], [4, 8, '2026-09-09']]);
  assert.deepStrictEqual(S.blueJewels(s, 'someone-else', dates.map(d => night(d, 'Q1'))), []);
});

test('the Blue Jewel thresholds are a season setting, not code', () => {
  const s = S.blank('2026-27');
  assert.deepStrictEqual(s.config.blueJewelWeeks, [6, 12, 19, 27]);
  s.config.blueJewelWeeks = [6, 12, 19, 31];
  assert.deepStrictEqual(S.fromJson(S.toJson(s)).config.blueJewelWeeks, [6, 12, 19, 31]);
});

// ---------- games ----------
test('team points: place 1,2,3,4 is 3,2,1,0 and spirit counts as entered', () => {
  const s = S.blank('2026-27');
  S.setGame(s, '2026-09-09', 'Sparks', 'Red', { place: 3, spirit: 3 });
  S.setGame(s, '2026-09-09', 'Sparks', 'Blue', { place: 1, spirit: 2 });
  assert.deepStrictEqual(S.teamPoints(s, '2026-09-09', 'Sparks', 'Red'), { place: 1, spirit: 3 });
  assert.deepStrictEqual(S.teamPoints(s, '2026-09-09', 'Sparks', 'Blue'), { place: 3, spirit: 2 });
  assert.strictEqual(S.teamPoints(s, '2026-09-09', 'Sparks', 'Green'), null);
  assert.strictEqual(S.teamPoints(s, '2026-09-09', 'T&T', 'Red'), null);        // groups play separately
});

test('a child gets their team points only for nights they attended', () => {
  const s = S.blank('2026-27');
  S.setGame(s, '2026-09-09', 'Sparks', 'Red', { place: 1, spirit: 3 });
  S.setGame(s, '2026-09-16', 'Sparks', 'Red', { place: 2, spirit: 2 });
  S.setMark(s, '2026-09-09', 'k1', 'a', 1);
  assert.deepStrictEqual(S.kidGamePoints(s, 'k1', 'Sparks', () => 'Red', cal), { Q1: { place: 3, spirit: 3 }, Q2: { place: 0, spirit: 0 }, Q3: { place: 0, spirit: 0 }, Q4: { place: 0, spirit: 0 }, year: { place: 3, spirit: 3 } });
});

test('standings: average place, total spirit, rank (1 = best), ties share a rank', () => {
  const s = S.blank('2026-27');
  const set = (d, r, b, g, y) => ['Red', 'Blue', 'Green', 'Yellow'].forEach((t, i) => S.setGame(s, d, 'Sparks', t, { place: [r, b, g, y][i], spirit: [3, 3, 2, 1][i] }));
  set('2026-09-09', 1, 2, 3, 4);
  set('2026-09-16', 2, 1, 3, 4);
  const st = S.standings(s, 'Sparks', 'Q1', cal);
  const by = Object.fromEntries(st.map(x => [x.team, x]));
  assert.deepStrictEqual([by.Red.avgPlace, by.Blue.avgPlace, by.Green.avgPlace, by.Yellow.avgPlace], [1.5, 1.5, 3, 4]);
  assert.deepStrictEqual([by.Red.rank, by.Blue.rank, by.Green.rank, by.Yellow.rank], [1, 1, 3, 4]);
  assert.strictEqual(by.Red.spirit, 6);
  assert.strictEqual(by.Red.nights, 2);
  assert.strictEqual(by.Yellow.points, 0 * 2 + 2);                               // place pts 0+0, spirit 1+1
});

// ---------- awards ----------
test('awards add once per child per night, remove, and list newest first', () => {
  const s = S.blank('2026-27');
  S.addAward(s, '2026-09-16', 'k1', 'Start Zone 1');
  S.addAward(s, '2026-09-16', 'k1', 'Start Zone 1');
  S.addAward(s, '2026-09-16', 'k1', 'Flight 3:16');
  S.addAward(s, '2026-09-23', 'k1', 'Blue Jewel 1');
  assert.deepStrictEqual(s.awards['2026-09-16'].k1, ['Flight 3:16', 'Start Zone 1']);
  assert.deepStrictEqual(S.awardsOf(s, 'k1').map(a => a.award), ['Blue Jewel 1', 'Flight 3:16', 'Start Zone 1']);
  S.removeAward(s, '2026-09-16', 'k1', 'Flight 3:16');
  S.removeAward(s, '2026-09-16', 'k1', 'Start Zone 1');
  assert.strictEqual(s.awards['2026-09-16'], undefined);                         // empty nights are tidied away
});

test('the slide list drops the excluded awards and children left with nothing', () => {
  const s = S.blank('2026-27'); s.config.exclude = { Sparks: ['Flight 3:16'], 'T&T': ['Start Zone 1', 'Start Zone 2'] };      // the mechanism: whatever is on the list is left off
  const pend = { k1: ['Flight 3:16', 'Blue Jewel 1'], k2: ['Flight 3:16'], t1: ['Start Zone 1', 'Start Zone 2'], t2: ['Blue Emblem 1'] };
  const resolve = (se, id, g) => pend[id].filter(a => !((se.config.exclude || {})[g] || []).includes(a)).map(a => ({ award: a, earned: '2026-09-16', held: false }));
  assert.deepStrictEqual(S.slidePending(s, 'Sparks', ['k1', 'k2'], [], resolve), [{ id: 'k1', results: ['Blue Jewel 1'] }]);
  assert.deepStrictEqual(S.slidePending(s, 'T&T', ['t1', 't2'], [], resolve), [{ id: 't2', results: ['Blue Emblem 1'] }]);
});

// ---------- handbooks ----------
test('handbook parts: the three boxes round-trip through the one stored string, including the old Sheet\'s odd entries', () => {
  ['HG 260916', 'AoG 260916', 'HG', '260916', "HG '25-26 / WR", "WR '25-26 / SS 260916", 'HG 260916 lost it, replaced'].forEach(text => {
    const parts = S.handbookParts(text);
    assert.strictEqual(S.formatHandbook(parts), text, text);
  });
  assert.strictEqual(S.formatHandbook({ code: 'AoG', date: '2026-09-16', note: '' }), 'AoG 260916');
  assert.strictEqual(S.formatHandbook({ code: 'WR', date: '', note: ' reissued ' }), 'WR reissued');
  assert.strictEqual(S.formatHandbook({ code: '', date: '', note: 'orphan note' }), '');
  assert.throws(() => S.formatHandbook({ code: 'HG', date: '9/16/26' }), /date/i);
});
test('a date that is not a real date stays in the note instead of being lost', () => {
  assert.deepStrictEqual(S.handbookParts('HG 261399'), { code: 'HG', date: '', note: '261399' });
  assert.strictEqual(S.formatHandbook(S.handbookParts('HG 261399')), 'HG 261399');
});
test('a T&T book like Agents of Grace (AoG) is counted by name, not as "No Book Yet"', () => {
  const s = S.blank('2026-27'); s.handbooks = { t1: 'AoG 260916', t2: 'AoG', k1: 'HG 260916' };
  assert.deepStrictEqual(S.handbookCounts(s, ['t1', 't2', 'k1']), { 'Agents of Grace': 2, Hangglider: 1 });
  assert.strictEqual(s.config.books.AoG.group, 'T&T');
});
test('setHandbook stores the string the rest of the app reads, and clears it when empty', () => {
  const s = S.blank('2026-27');
  S.setHandbook(s, 'k1', { code: 'WR', date: '2026-09-16', note: '' });
  assert.strictEqual(s.handbooks.k1, 'WR 260916'); assert.deepStrictEqual(S.parseHandbook(s.handbooks.k1), { code: 'WR', date: '2026-09-16', note: '' });
  assert.deepStrictEqual(S.handbookCounts(s, ['k1']), { Wingrunner: 1 });
  S.setHandbook(s, 'k1', { code: '', date: '', note: '' }); assert.strictEqual(s.handbooks.k1, undefined);
});
test('handbook text splits into a book code and a date', () => {
  assert.deepStrictEqual(S.parseHandbook('HG 260916'), { code: 'HG', date: '2026-09-16', note: '' });
  assert.deepStrictEqual(S.parseHandbook("HG '25-26"), { code: 'HG', date: '', note: "'25-26" });
  assert.deepStrictEqual(S.parseHandbook('HG'), { code: 'HG', date: '', note: '' });
  assert.deepStrictEqual(S.parseHandbook('260916'), { code: '', date: '2026-09-16', note: '' });
  assert.deepStrictEqual(S.parseHandbook(''), { code: '', date: '', note: '' });
});

test('handbook counts per book, with "No Book Yet" for children without one', () => {
  const s = S.blank('2026-27');
  s.handbooks = { a: 'HG 260916', b: 'HG', c: 'WR 260923', d: '', e: '260916' };
  assert.deepStrictEqual(S.handbookCounts(s, ['a', 'b', 'c', 'd', 'e', 'f']), { Hangglider: 2, Wingrunner: 1, 'No Book Yet': 3 });
});

// ---------- progress ----------
test('progress stores a date per section and clears it again', () => {
  const s = S.blank('2026-27');
  S.setProgress(s, 'k1', 'HG', 'RJ1.1', '2026-10-14');
  S.setProgress(s, 'k1', 'HG', 'RJ1.2', '2026-10-21');
  assert.deepStrictEqual(s.progress.k1.HG, { 'RJ1.1': '2026-10-14', 'RJ1.2': '2026-10-21' });
  S.setProgress(s, 'k1', 'HG', 'RJ1.1', '');
  S.setProgress(s, 'k1', 'HG', 'RJ1.2', '');
  assert.strictEqual(s.progress.k1, undefined);
  assert.throws(() => S.setProgress(s, 'k1', 'HG', 'RJ1.1', '10/14'), /date/i);
});

test('the Sparks template has the sections on the paper record', () => {
  const t = Catalog.defaultConfig().progress.Sparks;
  assert.deepStrictEqual(t.common.map(b => b.key), ['FLT']);
  assert.strictEqual(t.common[0].items.length, 6);
  const keys = t.perBook.map(b => b.key);
  assert.deepStrictEqual(keys, ['R', 'RJ1', 'GJ1', 'RJ2', 'GJ2', 'RJ3', 'GJ3', 'RJ4', 'GJ4']);
  assert.strictEqual(t.perBook[0].items.length, 8);
  assert.deepStrictEqual(t.perBook[1].items, ['1', '2', '3', '4']);
  assert.deepStrictEqual(t.perBook[1].review, ['5', '6', '7', '8']);
  assert.strictEqual(t.perBook[0].review, undefined, 'Rank has no reviews');
  assert.deepStrictEqual(t.bookReview.awards, ['{book} Review Emblem - {emblem}']);
  assert(Catalog.defaultConfig().awardLists.Sparks.includes('SS Review Emblem - Red'));
});

test('the T&T template: Start Zone once; per book the 8 emblems and 4 Silver and 4 Gold units', () => {
  const t = Catalog.defaultConfig().progress['T&T'];
  assert.deepStrictEqual(t.common, [{ key: 'SZ', label: 'Start Zone', items: ['1', '2'], awards: [] }], 'Start Zone: one block of two sections, no award');
  assert.deepStrictEqual(t.perBook.map(b => b.key), ['BE1', 'RE1', 'GE1', 'YE1', 'BE2', 'RE2', 'GE2', 'YE2', 'SV1', 'SV2', 'SV3', 'SV4', 'GD1', 'GD2', 'GD3', 'GD4']);
  assert.deepStrictEqual(t.perBook.find(b => b.key === 'GE1').items, ['2.1', '2.2', '2.3', '2.4']);
  assert.deepStrictEqual(t.perBook.find(b => b.key === 'SV2').items.length, 7);
  assert.deepStrictEqual(t.perBook.find(b => b.key === 'GD1').items.length, 5);
  assert.deepStrictEqual(t.perBook.find(b => b.key === 'BE1').awards, ['{book} Blue Emblem 1']);
});
test('a finished block earns its awards (book-aware); only the unrecorded ones are suggested', () => {
  const s = S.blank('2026-27');
  s.handbooks.k1 = 'HG 260916';
  ['1', '2', '3', '4'].forEach((i, n) => S.setProgress(s, 'k1', 'HG', 'RJ1.' + i, '2026-10-0' + (n + 1)));
  S.setProgress(s, 'k1', 'HG', 'RJ1.5', '2026-11-30');                      // a review date does not move the earned date
  ['1', '2'].forEach(i => S.setProgress(s, 'k1', 'HG', 'GJ1.' + i, '2026-10-20'));
  let done = S.completedBlocks(s, 'k1', 'Sparks');
  assert.deepStrictEqual(done.map(b => [b.key, b.date, b.awards]), [['RJ1', '2026-10-04', ['HG Pilot Wing', 'HG Red Jewel 1']]]);
  assert.deepStrictEqual(S.suggestedAwards(s, 'k1', 'Sparks').map(x => x.award), ['HG Pilot Wing', 'HG Red Jewel 1']);
  S.addAward(s, '2026-10-14', 'k1', 'HG Red Jewel 1');
  assert.deepStrictEqual(S.suggestedAwards(s, 'k1', 'Sparks').map(x => x.award), ['HG Pilot Wing']);
});

test('a jewel is earned by sections 1-4 alone; the reviews 5-8 only count toward the book\'s Review Emblem, earned on the last date of all of them', () => {
  const s = S.blank('2026-27'), jewels = Catalog.defaultConfig().progress.Sparks.perBook.filter(b => b.review);
  assert.strictEqual(jewels.length, 8);
  ['1', '2', '3', '4'].forEach(i => S.setProgress(s, 'k1', 'SS', 'GJ2.' + i, '2026-10-14'));
  assert.deepStrictEqual(S.completedBlocks(s, 'k1', 'Sparks').map(b => [b.key, b.date]), [['GJ2', '2026-10-14']], 'no review needed');
  jewels.forEach(b => b.items.concat(b.review).forEach(i => { if (!(b.key === 'GJ2' && b.items.includes(i))) S.setProgress(s, 'k1', 'SS', b.key + '.' + i, '2026-11-02'); }));
  const all = S.completedBlocks(s, 'k1', 'Sparks'), rev = all.find(b => b.key === 'BOOKREVIEW');
  assert.deepStrictEqual([rev.book, rev.date, rev.awards], ['SS', '2026-11-02', ['SS Review Emblem - Red']]);
  S.setProgress(s, 'k1', 'SS', 'RJ3.8', '');
  assert(!S.completedBlocks(s, 'k1', 'Sparks').some(b => b.key === 'BOOKREVIEW'), 'one review missing: no Review Emblem');
  assert(S.completedBlocks(s, 'k1', 'Sparks').some(b => b.key === 'RJ3'), 'but the jewel is still earned');
});

test('T&T progress is per book and finishes blocks with the book code in the award name', () => {
  const s = S.blank('2026-27');
  ['1.1', '1.2', '1.3'].forEach(i => S.setProgress(s, 't1', 'AoG', 'BE1.' + i, '2026-10-14'));
  assert.deepStrictEqual(S.completedBlocks(s, 't1', 'T&T').map(b => b.awards), [['AoG Blue Emblem 1']]);
  ['1.1', '1.2', '1.3'].forEach(i => S.setProgress(s, 't1', 'DoG', 'BE1.' + i, '2027-10-13'));
  assert.deepStrictEqual(S.completedBlocks(s, 't1', 'T&T').map(b => b.awards[0]).sort(), ['AoG Blue Emblem 1', 'DoG Blue Emblem 1'], 'a second book earns it again');
  assert.deepStrictEqual(S.completedBlocks(s, 'nobody', 'T&T'), []);
});

// ---------- new season ----------
test('a new season keeps the config and the award lists but empties every record', () => {
  const s = S.blank('2026-27');
  s.config.exclude.Sparks.push('Something');
  S.setMark(s, '2026-09-09', 'k1', 'a', 1); S.addAward(s, '2026-09-16', 'k1', 'Start Zone 1');
  S.setGame(s, '2026-09-09', 'Sparks', 'Red', { place: 1, spirit: 3 }); S.setProgress(s, 'k1', 'common', 'SZ1.1', '2026-09-16');
  s.handbooks.k1 = 'HG';
  const n = S.newSeason(s, '2027-28');
  assert.strictEqual(n.year, '2027-28');
  assert.deepStrictEqual(n.config, Object.assign({}, s.config, { carriedThrough: '2026-09-09' }), 'the config carries, plus the closed year\'s last night');
  ['attendance', 'games'].forEach(k => assert.deepStrictEqual(n[k], {}));
  ['awards', 'progress', 'handbooks'].forEach(k => assert.deepStrictEqual(n[k], s[k], k + ' is carried forward once (2026-11-13), as earlier-year work'));
  assert.strictEqual(Object.keys(s.attendance).length, 1);                        // the old season object is untouched
});

// ---------- history: change log inside the season file, view any version, compare any two ----------
const clone = o => JSON.parse(JSON.stringify(o));
const T0 = Date.parse('2026-10-28T19:00:00Z'), min = n => new Date(T0 + n * 60000).toISOString();
// edit(s, fn, minutesLater) runs fn on the season and records it the way the app does
function recorder(s) {
  let snap = S.snapshot(s);
  return (fn, at) => { fn(s); const e = S.record(s, snap, { now: min(at) }); snap = S.snapshot(s); return e; };
}
function scripted() {      // a season with a mixed bag of edits, 30 minutes apart so none merge
  const s = S.blank('2026-27'), edit = recorder(s), states = [clone(S.snapshot(s))];
  const steps = [
    t => S.setMark(t, '2026-10-28', 'k1', 'a', 1),
    t => S.setMark(t, '2026-10-28', 'k2', 'a', 1),
    t => S.setMark(t, '2026-10-28', 'k1', 'a', 0),                 // k1 back off: the vanishing id
    t => S.addAward(t, '2026-10-28', 'k2', 'Sparky Award Sculpture'),
    t => S.setGame(t, '2026-10-28', 'Sparks', 'Red', { place: 2, spirit: 1 }),
    t => S.setProgress(t, 'k2', 'common', 'FLT.1', '2026-10-28'),
    t => { t.handbooks.k2 = 'HG 260916'; },
    t => { t.config.blueJewelWeeks = [6, 12, 19, 31]; },
    t => S.removeAward(t, '2026-10-28', 'k2', 'Sparky Award Sculpture'),
    t => S.setMark(t, '2026-10-28', 'k2', 'a', 0)                  // last mark gone: the whole night disappears
  ];
  steps.forEach((fn, i) => { edit(fn, i * 30); states.push(clone(S.snapshot(s))); });
  return { s, states };
}

test('a new season starts with an empty history and it survives a JSON round trip', () => {
  const s = S.blank('2026-27');
  assert.deepStrictEqual(s.history, []);
  const { s: w } = scripted();
  const back = S.fromJson(S.toJson(w));
  assert.deepStrictEqual(back.history, w.history);
  assert.strictEqual(S.toJson(back), S.toJson(w));
});

test('a season file from before history existed opens with an empty history', () => {
  const o = S.blank('2026-27'); delete o.history;
  assert.deepStrictEqual(S.fromJson(JSON.stringify(o)).history, []);
});

test('recording an edit stores when, what area, and exactly what changed (old and new)', () => {
  const s = S.blank('2026-27'), edit = recorder(s);
  const e = edit(t => S.setMark(t, '2026-10-28', 'k1', 'a', 1), 0);
  assert.strictEqual(s.history.length, 1);
  assert.strictEqual(e.t, min(0));
  assert(/Attendance/.test(e.label) && /10\/28/.test(e.label), e.label);
  assert.deepStrictEqual(e.changes, [{ p: ['attendance', '2026-10-28'], n: { k1: { a: 1 } } }]);
});

test('an edit that changes nothing records nothing', () => {
  const s = S.blank('2026-27'), edit = recorder(s);
  edit(t => S.setMark(t, '2026-10-28', 'k1', 'a', 1), 0);
  const again = edit(t => S.setMark(t, '2026-10-28', 'k1', 'a', 1), 40);
  assert.strictEqual(again, null);
  assert.strictEqual(s.history.length, 1);
});

test('every version can be rebuilt exactly: at(i) equals the state after the i-th edit, for all i', () => {
  const { s, states } = scripted();
  assert.strictEqual(s.history.length, 10);
  states.forEach((st, i) => assert.deepStrictEqual(S.snapshot(S.at(s, i)), st, 'version ' + i));
});

test('viewing an old version does not touch the live season', () => {
  const { s } = scripted(), before = S.toJson(s);
  const old = S.at(s, 2); S.setMark(old, '2026-10-28', 'zz', 'a', 1); old.handbooks.zz = 'x';
  assert.strictEqual(S.toJson(s), before);
});

test('at() clamps out-of-range versions to the first and the latest', () => {
  const { s, states } = scripted();
  assert.deepStrictEqual(S.snapshot(S.at(s, -5)), states[0]);
  assert.deepStrictEqual(S.snapshot(S.at(s, 99)), states[10]);
});

test('edits to the same thing within five minutes merge into one entry; a toggle on then off still rewinds to the start', () => {
  const s = S.blank('2026-27'), edit = recorder(s);
  edit(t => S.setMark(t, '2026-10-28', 'k1', 'a', 1), 0);
  edit(t => S.setMark(t, '2026-10-28', 'k2', 'a', 1), 2);
  edit(t => S.setMark(t, '2026-10-28', 'k2', 'a', 0), 4);
  edit(t => S.setMark(t, '2026-10-28', 'k1', 'h', 1), 8);          // 4 minutes after the last edit: still merges
  assert.strictEqual(s.history.length, 1);
  assert.strictEqual(s.history[0].t, min(8));
  assert.deepStrictEqual(S.snapshot(S.at(s, 0)), S.snapshot(S.blank('2026-27')));
  assert.deepStrictEqual(S.snapshot(S.at(s, 1)), S.snapshot(s));
});

test('a pause of more than five minutes, or an edit to a different night or area, starts a new entry', () => {
  const s = S.blank('2026-27'), edit = recorder(s);
  edit(t => S.setMark(t, '2026-10-28', 'k1', 'a', 1), 0);
  edit(t => S.setMark(t, '2026-10-28', 'k2', 'a', 1), 6);          // too long a gap
  edit(t => S.setMark(t, '2026-11-04', 'k2', 'a', 1), 7);          // different night
  edit(t => S.addAward(t, '2026-11-04', 'k2', 'Sparky Award Sculpture'), 8);   // different area
  assert.strictEqual(s.history.length, 4);
});

test('the history itself is never part of what gets compared or snapshotted', () => {
  const { s } = scripted();
  assert(!('history' in S.snapshot(s)));
  assert.deepStrictEqual(S.diff(S.snapshot(s), S.snapshot(s)), []);
});

test('compare(a, b) between any two versions lists only the net change, whichever order they are given', () => {
  const { s } = scripted();
  const c = S.compare(s, 1, 3);
  assert.deepStrictEqual([c.from, c.to], [1, 3]);
  assert.deepStrictEqual(S.compare(s, 3, 1).changes, c.changes);
  assert.deepStrictEqual(S.compare(s, 3, 1).from, 1);
  const forward = S.at(s, 1); S.applyChanges(forward, c.changes);
  assert.deepStrictEqual(S.snapshot(forward), S.snapshot(S.at(s, 3)));
});

test('compare() leaves out edits that cancelled each other between the two versions', () => {
  const { s } = scripted();
  // k1 was marked in version 1 and unmarked again in version 3, so against version 0 only k2 is left
  const c = S.compare(s, 0, 3);
  assert.deepStrictEqual(c.changes, [{ p: ['attendance', '2026-10-28'], n: { k2: { a: 1 } } }]);
  assert.strictEqual(S.compare(s, 5, 5).changes.length, 0);
});

test('comparing a version with the latest works for every version', () => {
  const { s, states } = scripted(), last = s.history.length;
  for (let i = 0; i <= last; i++) {
    const c = S.compare(s, i, last), f = S.at(s, i); S.applyChanges(f, c.changes);
    assert.deepStrictEqual(S.snapshot(f), states[last], 'from ' + i);
  }
});

test('each change is classed added, removed or changed so the page can colour it', () => {
  assert.strictEqual(S.kindOf({ p: ['x'], n: 1 }), 'add');
  assert.strictEqual(S.kindOf({ p: ['x'], o: 1 }), 'del');
  assert.strictEqual(S.kindOf({ p: ['x'], o: 1, n: 2 }), 'chg');
});

test('changes are described in plain words with the child\'s name', () => {
  const name = id => ({ k1: 'Ann Lee', k2: 'Bo Ray' }[id] || id), d = c => S.describe(c, name);
  assert.strictEqual(d({ p: ['attendance', '2026-10-28', 'k1', 'h'], n: 1 }), 'Ann Lee · Handbook: marked');
  assert.strictEqual(d({ p: ['attendance', '2026-10-28', 'k1', 'a'], o: 1 }), 'Ann Lee · Present: cleared');
  assert.strictEqual(d({ p: ['attendance', '2026-10-28'], n: { k1: { a: 1 }, k2: { a: 1 } } }), 'Night entered, 2 children marked');
  assert.strictEqual(d({ p: ['awards', '2026-10-28', 'k2'], o: ['A', 'B'], n: ['B', 'C'] }), 'Bo Ray · awards: added C, removed A');
  assert.strictEqual(d({ p: ['games', '2026-10-28', 'Sparks', 'Red'], n: { place: 2, spirit: 1 } }), 'Sparks Red: place 2, spirit 1');
  assert.strictEqual(d({ p: ['games', '2026-10-28', 'Sparks', 'Red'], o: { place: 2 } }), 'Sparks Red: result cleared');
  assert.strictEqual(d({ p: ['progress', 'k2', 'common', 'FLT.1'], n: '2026-10-28' }), 'Bo Ray · common FLT.1: 2026-10-28');
  assert.strictEqual(d({ p: ['handbooks', 'k2'], o: 'HG', n: 'HG 260916' }), 'Bo Ray · handbook: HG → HG 260916');
  assert.strictEqual(d({ p: ['config', 'blueJewelWeeks'], o: [6, 12, 19, 27], n: [6, 12, 19, 31] }), 'Setting blueJewelWeeks: 6,12,19,27 → 6,12,19,31');
});

test('starting a new season starts a new, empty history (the old file keeps its own)', () => {
  const { s } = scripted(), n = S.newSeason(s, '2027-28');
  assert.deepStrictEqual(n.history, []);
  assert.strictEqual(s.history.length, 10);
});

// ---------- history: version names and gross-restore ----------
test('a version can be given a name, renamed, and cleared; the name is saved in the file', () => {
  const { s } = scripted();
  S.tag(s, 3, '  before games  ');
  assert.strictEqual(s.history[2].tag, 'before games');
  S.tag(s, 3, 'before the games');
  assert.strictEqual(S.fromJson(S.toJson(s)).history[2].tag, 'before the games');
  S.tag(s, 3, '');
  assert(!('tag' in s.history[2]));
});

test('version 0 and versions that do not exist cannot be named', () => {
  const { s } = scripted();
  assert.throws(() => S.tag(s, 0, 'x'), /no such version/i);
  assert.throws(() => S.tag(s, 99, 'x'), /no such version/i);
});

test('naming a version does not change the data, and names survive viewing older versions', () => {
  const { s, states } = scripted();
  S.tag(s, 2, 'night one'); S.tag(s, 6, 'after progress');
  assert.deepStrictEqual(S.snapshot(s), states[10]);
  assert.strictEqual(S.at(s, 4).history[1].tag, 'night one');
  assert.strictEqual(S.at(s, 4).history.length, 4);
  assert(!S.at(s, 4).history.some(e => e.tag === 'after progress'));
});

test('a named version is never added to by later edits, even within five minutes', () => {
  const s = S.blank('2026-27'), edit = recorder(s);
  edit(t => S.setMark(t, '2026-10-28', 'k1', 'a', 1), 0);
  S.tag(s, 1, 'doors open');
  edit(t => S.setMark(t, '2026-10-28', 'k2', 'a', 1), 1);
  assert.strictEqual(s.history.length, 2);
  assert.deepStrictEqual(S.snapshot(S.at(s, 1)).attendance['2026-10-28'], { k1: { a: 1 } });
});

test('restoreTo() returns the old version with everything after it deleted, and says what was dropped', () => {
  const { s, states } = scripted(), before = S.toJson(s);
  const r = S.restoreTo(s, 4);
  assert.deepStrictEqual(S.snapshot(r.season), states[4]);
  assert.strictEqual(r.season.history.length, 4);
  assert.strictEqual(r.dropped.entries, 6);
  assert.strictEqual(r.dropped.changes, s.history.slice(4).reduce((n, e) => n + e.changes.length, 0));
  assert.strictEqual(S.toJson(s), before, 'the live season is untouched until the caller swaps it in');
});

test('restoring to the file as opened leaves an empty history; restoring to the latest drops nothing', () => {
  const { s, states } = scripted();
  const zero = S.restoreTo(s, 0);
  assert.deepStrictEqual(zero.season.history, []);
  assert.deepStrictEqual(S.snapshot(zero.season), states[0]);
  const last = S.restoreTo(s, 10);
  assert.deepStrictEqual(last.dropped, { entries: 0, changes: 0 });
  assert.strictEqual(S.toJson(last.season), S.toJson(s));
});

test('after a restore, new edits are logged on top of the restored history and every version still rebuilds', () => {
  const { s, states } = scripted(), r = S.restoreTo(s, 4).season, edit = recorder(r);
  edit(t => S.addAward(t, '2026-11-04', 'k9', 'Start Zone 1'), 500);
  assert.strictEqual(r.history.length, 5);
  for (let i = 0; i <= 4; i++) assert.deepStrictEqual(S.snapshot(S.at(r, i)), states[i], 'version ' + i);
  assert.deepStrictEqual(S.snapshot(S.at(r, 5)), S.snapshot(r));
  assert.strictEqual(S.toJson(S.fromJson(S.toJson(r))), S.toJson(r));
});

// ---------- one data file: roster extras, calendar and rotation live beside the season records ----------
const Mdl = require('../model.js'), Teams = require('../teams.js'), Calendar = require('../calendar.js');
test('a new data file has empty roster, calendar and rotation sections', () => {
  const s = S.blank('2026-27');
  assert.deepStrictEqual([s.roster, s.calendar, s.rotation], [{ cols: [], people: {} }, [], []]);
});

test('a version 1 season file (no roster, calendar or rotation) still opens, with those sections empty', () => {
  const o = S.blank('2026-27'); delete o.roster; delete o.calendar; delete o.rotation; o.version = 1;
  const s = S.fromJson(JSON.stringify(o));
  assert.deepStrictEqual([s.roster, s.calendar, s.rotation], [{ cols: [], people: {} }, [], []]);
});

test('roster, calendar and rotation survive a JSON round trip unchanged', () => {
  const s = S.blank('2026-27');
  s.roster = { cols: ['award:x'], people: { 'r1_Ann_Lee': { pc: { 'First Name': 'Ann' }, v: { 'team:Q1': 'Red' } } } };
  s.calendar = cal.map(clone); s.rotation = [['Time', 'Sparks'], ['6:30', 'Game']];
  const back = S.fromJson(S.toJson(s));
  assert.deepStrictEqual([back.roster, back.calendar, back.rotation], [s.roster, s.calendar, s.rotation]);
});

test('New season keeps the roster extras, calendar and rotation and empties only the records and the history', () => {
  const { s } = scripted(); s.roster = { cols: [], people: { a: { pc: {}, v: { 'team:Q1': 'Red' } } } }; s.calendar = cal.map(clone); s.rotation = [['Time', 'x']];
  const n = S.newSeason(s, '2027-28');
  assert.deepStrictEqual([n.roster, n.calendar, n.rotation], [s.roster, s.calendar, s.rotation]);
  assert.deepStrictEqual(n.history, []); assert.deepStrictEqual(n.attendance, {});
  n.roster.people.a.v['team:Q1'] = 'Blue'; assert.strictEqual(s.roster.people.a.v['team:Q1'], 'Red', 'a copy, not a shared object');
});

test('history covers the roster: restoring past a color assignment and a calendar shift puts both back', () => {
  const m = Mdl.emptyMaster(); m.pcCols = Mdl.TRACKED.slice();
  ['Ann', 'Bo', 'Cy', 'Di', 'Ed', 'Flo'].forEach(f => Mdl.addManualPerson(m, { 'First Name': f, 'Last Name': 'T', 'Assignment Area: Classes': 'Sparks A', 'Selection': 'Clubber' }, '2026-10-01'));
  const s = S.blank('2026-27'); s.roster = Mdl.toRoster(m); s.calendar = cal.map(clone);
  const edit = recorder(s);
  const sync = () => { s.roster = Mdl.toRoster(m); };
  edit(t => { S.setMark(t, '2026-10-28', 'x', 'a', 1); }, 0);                       // version 1: before colors
  edit(t => { Teams.assign(m, 'Q1', { rng: Teams.mulberry32(3) }); sync(); }, 30);   // version 2: colors assigned
  edit(t => { Calendar.shiftWeeks(t.calendar, 1); }, 60);                            // version 3: calendar moved a week
  assert.strictEqual(s.history.length, 3);
  assert(m.people.every(p => p['team:Q1']), 'colors were assigned');
  const r = S.restoreTo(s, 1).season;
  assert.strictEqual(r.calendar[0].Date, '2026-09-09');                              // calendar back where it was
  const back = Mdl.fromRoster(r.roster);
  assert(back.people.every(p => !p['team:Q1']), 'colors are gone again');
  assert.strictEqual(S.restoreTo(s, 2).season.calendar[0].Date, '2026-09-09');
  assert(Object.values(S.restoreTo(s, 2).season.roster.people).every(e => e.v['team:Q1']), 'version 2 still has the colors');
});

test('roster, calendar and rotation edits are described in plain words', () => {
  const name = id => ({ k1: 'Ann Lee' }[id] || id), d = c => S.describe(c, name);
  assert.strictEqual(d({ p: ['roster', 'people', 'k1', 'v', 'team:Q2'], n: 'Blue' }), 'Ann Lee · team:Q2: (none) → Blue');
  assert.strictEqual(d({ p: ['roster', 'people', 'k1', 'v', 'ov:Assignment Area: Classes'], o: 'Sparks A', n: 'Sparks B' }), 'Ann Lee · pending Planning Center change to Assignment Area: Classes: Sparks A → Sparks B');
  assert.strictEqual(d({ p: ['roster', 'people', 'k1', 'pc', 'Assignment Area: Classes'], o: 'Sparks A', n: 'Sparks B' }), 'Ann Lee · Assignment Area: Classes (from Planning Center): Sparks A → Sparks B');
  assert.strictEqual(d({ p: ['roster', 'people', 'k1'], n: { pc: {}, v: {} } }), 'Ann Lee added to the roster');
  assert.strictEqual(d({ p: ['roster', 'people', 'k1'], o: { pc: {}, v: {} } }), 'Ann Lee removed from the roster');
  assert.strictEqual(d({ p: ['calendar'], o: [{ Date: '2026-09-09' }, { Date: '2026-09-16' }], n: [{ Date: '2026-09-16' }, { Date: '2026-09-23' }] }), 'Calendar edited: 1 row added or changed, 1 removed or changed (2 rows now)');
  assert.strictEqual(d({ p: ['rotation'], o: [['Time']], n: [['Time', 'x']] }), 'Rotation edited');
});

test('all roster edits within five minutes share one history entry labelled Roster', () => {
  const s = S.blank('2026-27'), edit = recorder(s);
  edit(t => { t.roster.people.a = { pc: {}, v: { 'team:Q1': 'Red' } }; }, 0);
  edit(t => { t.roster.people.b = { pc: {}, v: { 'team:Q1': 'Blue' } }; }, 2);
  assert.strictEqual(s.history.length, 1); assert.strictEqual(s.history[0].label, 'Roster');
  edit(t => { t.calendar.push({ Date: '2026-09-09' }); }, 3);
  assert.strictEqual(s.history.length, 2); assert.strictEqual(s.history[1].label, 'Calendar');
});

test('the last-seen date stamp that every export refresh rewrites is not versioned', () => {
  const s = S.blank('2026-27'); s.roster.people.a = { pc: {}, v: { x_LastSeen: '2026-10-28', 'team:Q1': 'Red' } };
  const snap = S.snapshot(s); s.roster.people.a.v.x_LastSeen = '2026-11-04';
  assert.strictEqual(S.record(s, snap), null);
  s.roster.people.a.v['team:Q1'] = 'Blue';
  assert.strictEqual(S.record(s, snap).changes.length, 1);
});

test('the export date and source are kept in the roster section and described in plain words', () => {
  const s = S.blank('2026-27'); s.roster.pcAsOf = '2026-10-28'; s.roster.pcSource = 'x.csv';
  assert.strictEqual(S.fromJson(S.toJson(s)).roster.pcAsOf, '2026-10-28');
  assert.strictEqual(S.describe({ p: ['roster', 'pcAsOf'], o: '2026-10-28', n: '2026-11-04' }, x => x), 'Planning Center data now as of 2026-11-04 (was 2026-10-28)');
});

test('every data file name carries a yyyymmdd-hhmmss tag from the local clock', () => {
  const d = new Date(2026, 9, 29, 7, 5, 9);
  assert.strictEqual(S.fileName('2026-27', d), 'awana-2026-27-20261029-070509.json');
  assert.strictEqual(S.fileName('2026-27', d, 'before-restore'), 'awana-2026-27-before-restore-20261029-070509.json');
  assert.strictEqual(S.fileName('', d), 'awana-file-20261029-070509.json');
  assert(/^awana-x-\d{8}-\d{6}\.json$/.test(S.fileName('x')), 'defaults to now');
});

// ---------- club day of the week ----------
test('the club day defaults to Wednesday, an older file without it opens as Wednesday, and the setting round-trips', () => {
  assert.strictEqual(S.blank('2026-27').config.clubDay, 3);
  const old = JSON.parse(S.toJson(S.blank('2026-27'))); delete old.config.clubDay;
  assert.strictEqual(S.fromJson(JSON.stringify(old)).config.clubDay, 3);
  const s = S.blank('2026-27'); s.config.clubDay = 4;
  assert.strictEqual(S.fromJson(S.toJson(s)).config.clubDay, 4);
});
test('Calendar flags club nights that are not on the club day, but not events or cancelled nights', () => {
  const C = require('../calendar.js'), row = (Date, extra) => Object.assign(C.blank(), { Date }, extra || {});
  assert.strictEqual(C.weekday('2026-10-28'), 3);
  assert.strictEqual(C.dayName(C.weekday('2026-10-31')), 'Sat');
  const rows = [row('2026-10-28'), row('2026-11-05'), row('2026-11-07', { Type: 'Event' }), row('2026-11-12', { 'No Club': '1' }), row('2026-11-11')];
  assert.deepStrictEqual(C.offDays(rows, 3).map(r => r.Date), ['2026-11-05']);
  assert.deepStrictEqual(C.offDays(rows, 4).map(r => r.Date), ['2026-10-28', '2026-11-11']);
  assert.strictEqual(C.offDay(row('2026-10-28'), 3), false);
});
test('changing the club day is logged in History in plain words', () => {
  const a = S.blank('2026-27'), b = JSON.parse(JSON.stringify(a)); b.config.clubDay = 4;
  const d = S.diff(S.snapshot(a), S.snapshot(b));
  assert.strictEqual(d.length, 1);
  assert.strictEqual(S.describe(d[0], x => x), 'Club day changed from Wednesday to Thursday');
});


// ---------- color team moves and one-night teams ----------
test('team on a night: quarter default, then a move from its own night, then a one-night exception', () => {
  const s = S.blank('2026-27'); S.setMark(s, '2026-11-04', 'k1', 'a', 1); S.setMark(s, '2026-11-11', 'k1', 'a', 1); S.setMark(s, '2026-11-18', 'k1', 'a', 1);
  S.setTeamMove(s, 'k1', 'Q2', '2026-11-11', 'Blue');
  const on = d => S.teamOn(s, 'k1', d, 'Q2', 'Red');
  assert.strictEqual(on('2026-11-04'), 'Red'); assert.strictEqual(on('2026-11-11'), 'Blue'); assert.strictEqual(on('2026-11-18'), 'Blue');
  S.setNightTeam(s, '2026-11-18', 'k1', 'Green'); assert.strictEqual(on('2026-11-18'), 'Green'); assert.strictEqual(on('2026-11-11'), 'Blue');
  S.setNightTeam(s, '2026-11-18', 'k1', ''); assert.strictEqual(on('2026-11-18'), 'Blue');
});
test('a move ends with its quarter: the next quarter uses that quarter\'s own default', () => {
  const s = S.blank('2026-27'); S.setTeamMove(s, 'k1', 'Q2', '2026-11-11', 'Blue');
  assert.strictEqual(S.teamOn(s, 'k1', '2027-01-06', 'Q3', 'Yellow'), 'Yellow');
});
test('several moves in a quarter: the latest one on or before the night wins, whatever order they were entered', () => {
  const s = S.blank('2026-27'); S.setTeamMove(s, 'k1', 'Q2', '2026-12-02', 'Green'); S.setTeamMove(s, 'k1', 'Q2', '2026-11-11', 'Blue');
  assert.deepStrictEqual(S.movesOf(s, 'k1').map(m => m.from), ['2026-11-11', '2026-12-02']);
  const on = d => S.teamOn(s, 'k1', d, 'Q2', 'Red');
  assert.deepStrictEqual(['2026-11-04', '2026-11-18', '2026-12-09'].map(on), ['Red', 'Blue', 'Green']);
  S.removeTeamMove(s, 'k1', 'Q2', '2026-12-02'); assert.strictEqual(on('2026-12-09'), 'Blue');
  S.removeTeamMove(s, 'k1', 'Q2', '2026-11-11'); assert.strictEqual(s.teamMoves.k1, undefined);
});
test('a child who moves keeps the points earned on the old team (points follow the team on the night)', () => {
  const s = S.blank('2026-27'), dates = ['2026-10-28', '2026-11-04', '2026-11-11', '2026-12-02'];
  dates.forEach(d => S.setMark(s, d, 'k1', 'a', 1));
  // Red wins the first two nights (place 1 = 3 pts, spirit 1), Blue wins the last two (place 1 = 3 pts, spirit 2); Red is last on those
  [['2026-10-28', 1, 4], ['2026-11-04', 1, 4], ['2026-11-11', 4, 1], ['2026-12-02', 4, 1]].forEach(([d, redPlace]) => {
    S.setGame(s, d, 'Sparks', 'Red', { place: redPlace, spirit: redPlace === 1 ? 1 : 0 }); S.setGame(s, d, 'Sparks', 'Blue', { place: redPlace === 1 ? 4 : 1, spirit: redPlace === 1 ? 0 : 2 });
  });
  const cal2 = dates.map(d => night(d, 'Q2')), q = () => 'Q2', pts = () => S.kidGamePoints(s, 'k1', 'Sparks', S.teamResolver(s, 'k1', () => 'Red', q), cal2).year;
  const before = pts();
  assert.deepStrictEqual(before, { place: 3 + 3 + 0 + 0, spirit: 1 + 1 + 0 + 0 });          // all Red: Red's results every night
  S.setTeamMove(s, 'k1', 'Q2', '2026-11-11', 'Blue');
  assert.deepStrictEqual(pts(), { place: 3 + 3 + 3 + 3, spirit: 1 + 1 + 2 + 2 });             // Red points up to 11/4, Blue points from 11/11
});
test('a one-night team needs the child present, and clearing every mark drops it', () => {
  const s = S.blank('2026-27');
  assert.throws(() => S.setNightTeam(s, '2026-11-04', 'k1', 'Blue'), /present/);
  S.setMark(s, '2026-11-04', 'k1', 'a', 1); S.setMark(s, '2026-11-04', 'k1', 'h', 1); S.setNightTeam(s, '2026-11-04', 'k1', 'Blue');
  assert.strictEqual(s.attendance['2026-11-04'].k1.t, 'Blue');
  S.setMark(s, '2026-11-04', 'k1', 'a', 0); assert.strictEqual(s.attendance['2026-11-04'].k1.t, 'Blue');   // still has Handbook
  S.setMark(s, '2026-11-04', 'k1', 'h', 0); assert.strictEqual(s.attendance['2026-11-04'], undefined);
});
test('bad moves are refused', () => {
  const s = S.blank('2026-27');
  assert.throws(() => S.setTeamMove(s, 'k1', 'Q9', '2026-11-11', 'Blue'), /quarter/i);
  assert.throws(() => S.setTeamMove(s, 'k1', 'Q2', '11/11', 'Blue'), /date/i);
  assert.throws(() => S.setTeamMove(s, 'k1', 'Q2', '2026-11-11', 'Purple'), /team/i);
});
test('moves round-trip through the file, are logged by name in History, and do not carry into a new season', () => {
  const s = S.blank('2026-27'), before = S.snapshot(s);
  S.setTeamMove(s, 'k1', 'Q2', '2026-11-11', 'Blue');
  assert.deepStrictEqual(S.fromJson(S.toJson(s)).teamMoves, s.teamMoves);
  const e = S.record(s, before); assert(e && /Team moves/.test(e.label), e && e.label);
  assert(/Pat · team: moved to Blue from 11\/11 \(Q2\)/.test(S.describe(e.changes[0], id => 'Pat')), S.describe(e.changes[0], id => 'Pat'));
  assert.deepStrictEqual(S.newSeason(s, '2027-28').teamMoves, {});
});

// ---------- R17: keys this app does not know are kept ----------
test('a top-level key this app does not know survives open and save, and does not touch History', () => {
  const base = JSON.parse(S.toJson(S.blank('2026-27'))); base.futureThing = { a: 1, b: [2] }; base.futureNote = 'x'; const text = JSON.stringify(base);
  const s = S.fromJson(text), back = JSON.parse(S.toJson(s));
  assert.deepStrictEqual(back.futureThing, { a: 1, b: [2] }); assert.strictEqual(back.futureNote, 'x'); assert.strictEqual(back.unknownKeys, undefined, 'the holding object is never written');
  assert.deepStrictEqual(S.diff(S.snapshot(s), S.snapshot(S.fromJson(S.toJson(s)))), []); assert.deepStrictEqual(Object.keys(s.unknownKeys).sort(), ['futureNote', 'futureThing']);
  assert.strictEqual(S.fromJson(S.toJson(S.blank('x'))).unknownKeys, undefined, 'absent when there are none');
});
test('a __proto__ key is still dropped, a known key wins, and a key named unknownKeys is kept as itself', () => {
  const base = JSON.parse(S.toJson(S.blank('2026-27'))); const text = JSON.stringify(base).replace(/^\{/, '{"__proto__":{"evil":1},"unknownKeys":{"keep":2},');
  const s = S.fromJson(text); assert.strictEqual({}.evil, undefined); assert.deepStrictEqual(JSON.parse(S.toJson(s)).unknownKeys, { keep: 2 });
  s.unknownKeys.year = 'not this'; assert.strictEqual(JSON.parse(S.toJson(s)).year, '2026-27', 'a known key always wins');
});
test('a new season carries the export record with the roster, and exportBack still rebuilds the export (R17)', () => {
  const M = require('../model.js'), s = S.blank('2026-27'); s.roster.people = { '7000001_Test_Kid': { pc: { 'First Name': 'Test', 'Last Name': 'Kid' }, v: {} } }; s.roster.pcCols = ['First Name', 'Last Name'];
  s.roster.pcExport = { at: '2026-11-03T19:00:00.000Z', hash: 'abc12345-9', header: ['First Name', 'Last Name'], names: ['First Name', 'Last Name'], rows: 2, blankRows: 0, ids: { '7000001_Test_Kid': 1 }, loose: [['Other', 'Family']] };
  const n = S.newSeason(s, '2027-28'); assert.deepStrictEqual(n.roster.pcExport, s.roster.pcExport); assert.deepStrictEqual(M.exportBack(n.roster).rows, [['Test', 'Kid'], ['Other', 'Family']]);
});
test('a new season does not carry unknown keys', () => {
  const base = JSON.parse(S.toJson(S.blank('2026-27'))); base.futureThing = 1; const n = S.newSeason(S.fromJson(JSON.stringify(base)), '2027-28'); assert.strictEqual(n.unknownKeys, undefined);
});

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
