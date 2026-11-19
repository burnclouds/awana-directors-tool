// Awards slide model: who lands in which column, award wording, Adult Memorization, ZIP.
// Usage: node test/slides.test.js
const assert = require('assert');
const M = require('../model.js'), Season = require('../season.js'), Slides = require('../slides.js');
const { C, X } = M;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
}
const kid = (id, first, last, room) => { const p = {}; p[X.ID] = id; p[C.FIRST] = first; p[C.LAST] = last; p[C.ROOM] = room; p[C.SELECTION] = 'Clubber (Cubbies, Sparks & TnT only)'; return p; };
const master = { people: [
  kid('k1', 'Ava', 'Taylor', 'Sparks - Green'), kid('k2', 'Ben', 'Reed', 'Sparks - Green'), kid('k3', 'Cal', 'Moss', 'Sparks - Green'), kid('k4', 'Dee', 'Fox', 'Sparks - Green'),
  kid('k5', 'Eli', 'Park', 'TnT'), kid('k6', 'Fay', 'Lane', 'Cubbies'), kid('k7', 'Gus', 'Hill', 'Puggles'),
] };
const D = '2026-10-21';
function season() {
  const s = Season.blank('2026-27');
  s.handbooks = { k1: 'HG 260916', k2: 'WR 260916', k3: 'SS 260916' };        // k4 has no handbook
  Season.addAward(s, D, 'k1', 'HG Pilot Wing'); Season.addAward(s, D, 'k1', 'Red Jewel 1'); Season.addAward(s, D, 'k1', 'Flight 3:16');
  Season.addAward(s, D, 'k2', 'WR Blue Emblem'); Season.addAward(s, D, 'k3', 'Blue Jewel 1');
  Season.addAward(s, D, 'k4', 'Green Jewel 2');
  Season.addAward(s, D, 'k5', 'Blue Emblem 1');
  Season.addAward(s, D, 'k6', 'Appleseed Trail Emblem'); Season.addAward(s, D, 'k7', 'Participation Certificate');
  return s;
}
// The slides draw from "earned and not announced". This fixture lists awards under one night in season.awards, so a stand-in for Season.pendingAwards reads them from there
// (applying the same left-off-the-slide list). Real earning from Progress is covered by the last slide test and by pending.test.js.
const realBuild = Slides.buildSlides;
const standIn = (s, id, g) => ((s.awards[D] || {})[id] || []).filter(a => !((s.config.exclude || {})[g] || []).includes(a) && !Season.notAnAward(a)).map(a => ({ award: a, earned: D, held: Season.isHeld(s, id, a) }));
Slides.buildSlides = (s, m, d, o) => realBuild(s, m, d, Object.assign({ pending: standIn }, o));
const bySlide = (r, id) => r.slides.find(x => x.id === id);
const flat = list => list.map(e => e.n + ' | ' + e.a);

test('four slides, in order, with names as First L.', () => {
  const r = Slides.buildSlides(season(), master, D);
  assert.deepStrictEqual(r.slides.map(x => x.id), ['cubbies', 'sparks', 'tt', 'adult']);
  assert.deepStrictEqual(flat(bySlide(r, 'cubbies').entries.cubbies), ['Fay L. | Appleseed Trail Emblem']);
});
test('Sparks split into columns by handbook code', () => {
  const sp = bySlide(Slides.buildSlides(season(), master, D), 'sparks').entries;
  assert(flat(sp.HG).includes('Ava T. | Green Wings & Red Jewel 1'), flat(sp.HG).join('; '));
  assert.deepStrictEqual(flat(sp.WR), ['Ben R. | Blue Rank']);
  assert.deepStrictEqual(flat(sp.SS), ['Cal M. | Blue Jewel 1']);
});
test('the slide exclusions apply (Flight 3:16 is not an award, so it is left off: N23)', () => {
  const r = Slides.buildSlides(season(), master, D);
  assert(!flat(bySlide(r, 'sparks').entries.HG).some(l => /Flight/.test(l)));
  assert.deepStrictEqual(flat(bySlide(r, 'tt').entries.tt), ['Eli P. | Blue Emblem 1']);
});
test('a Sparks child with no handbook goes in the Hang Glider column and a warning says so', () => {
  const r = Slides.buildSlides(season(), master, D);
  assert(flat(bySlide(r, 'sparks').entries.HG).includes('Dee F. | Green Jewel 2'));
  assert.strictEqual(r.warnings.length, 1); assert(/Dee F\./.test(r.warnings[0]));
});
test('with no handbook, an award that names the book picks the column and no warning is raised', () => {
  const s = season(); delete s.handbooks.k2;
  const r = Slides.buildSlides(s, master, D);
  assert.deepStrictEqual(flat(bySlide(r, 'sparks').entries.WR), ['Ben R. | Blue Rank']);
  assert.strictEqual(r.warnings.length, 1);          // still only Dee
});
test('Puggles have no slide', () => {
  const r = Slides.buildSlides(season(), master, D);
  assert(!JSON.stringify(r).includes('Participation Certificate'));
});
test('Adult Memorization comes from season.adults for that night only', () => {
  const s = season(); s.adults = { [D]: [{ n: 'Pat Q.', a: 'Psalm 23' }, { n: 'Al B.', a: 'Psalm 1' }], '2026-10-28': [{ n: 'Zed Z.', a: 'James 1' }] };
  const a = bySlide(Slides.buildSlides(s, master, D), 'adult');
  assert.deepStrictEqual(flat(a.entries.adult), ['Al B. | Psalm 1', 'Pat Q. | Psalm 23']); assert.strictEqual(a.count, 2);
});
test('config.slideNames overrides the wording', () => {
  const s = season(); s.config.slideNames = { 'Blue Jewel 1': 'First Blue Jewel' };
  assert.deepStrictEqual(flat(bySlide(Slides.buildSlides(s, master, D), 'sparks').entries.SS), ['Cal M. | First Blue Jewel']);
});
test('Pilot Wing alone reads as Wings; unknown names pass through', () => {
  const s = { config: { books: { WR: { emblem: 'Blue' } } } };
  assert.deepStrictEqual(Slides.slideWording(s, ['WR Pilot Wing', 'Gold 2']), ['Blue Wings', 'Gold 2']);
});
test('the book code is left off a jewel or a T&T emblem on a slide; Wings still join Red Jewel 1; an override by either name works', () => {
  const s = { config: { books: { WR: { emblem: 'Blue' }, AoG: { emblem: '' } }, slideNames: { 'AoG Silver 2': 'Silver Two' } } };
  assert.deepStrictEqual(Slides.slideWording(s, ['WR Pilot Wing', 'WR Red Jewel 1', 'WR Blue Jewel 2', 'AoG Blue Emblem 1']), ['Blue Wings & Red Jewel 1', 'Blue Jewel 2', 'Blue Emblem 1']);
  assert.deepStrictEqual(Slides.slideWording(s, ['AoG Silver 2', 'AoG Gold 1']), ['Silver Two', 'Gold 1']);
});
test('an older file with no adults section still builds', () => {
  const s = season(); delete s.adults;
  assert.strictEqual(bySlide(Slides.buildSlides(s, master, D), 'adult').count, 0);
});
test('the season file round-trips the adults list and logs changes to it', () => {
  const s = Season.blank('2026-27'), before = Season.snapshot(s);
  s.adults[D] = [{ n: 'Pat Q.', a: 'Psalm 23' }];
  assert.deepStrictEqual(Season.fromJson(Season.toJson(s)).adults, s.adults);
  const e = Season.record(s, before); assert(e && /Adult awards/.test(e.label), e && e.label);
});
test('real earning: a finished Progress block is on the slide until announced, and a held award stays off it', () => {
  const s = Season.blank('2026-27'); s.calendar = [{ Date: '2026-09-09', Quarter: 'Q1', Type: 'Club night' }]; s.handbooks = { k1: 'HG 260916' };
  ['1', '2', '3', '4'].forEach((i, n) => Season.setProgress(s, 'k1', 'HG', 'RJ1.' + i, '2026-10-0' + (n + 1)));
  const sparks = r => flat(bySlide(r, 'sparks').entries.HG), real = () => realBuild(s, master, D);
  assert.deepStrictEqual(sparks(real()), ['Ava T. | Green Wings & Red Jewel 1'], 'earned, not announced: on the slide');
  assert.deepStrictEqual(sparks(real()), ['Ava T. | Green Wings & Red Jewel 1'], 'drawing it again changes nothing');
  Season.setHold(s, 'k1', 'HG Pilot Wing', true); Season.setHold(s, 'k1', 'HG Red Jewel 1', true);
  assert.deepStrictEqual(sparks(real()), [], 'held awards stay off');
  Season.setHold(s, 'k1', 'HG Pilot Wing', false); Season.setHold(s, 'k1', 'HG Red Jewel 1', false);
  Season.announce(s, D, [['k1', 'HG Pilot Wing'], ['k1', 'HG Red Jewel 1']]);
  assert.deepStrictEqual(sparks(real()), [], 'announced: gone for good');
});
test('the club year reads 2026 – 2027 on the slide', () => {
  assert.strictEqual(Slides.yearLabel('2026-27'), '2026 – 2027'); assert.strictEqual(Slides.yearLabel('2026-2027'), '2026 – 2027'); assert.strictEqual(Slides.yearLabel(''), '');
});
test('the ZIP has the right signature, entry count and CRC', () => {
  const data = new Uint8Array([1, 2, 3, 4]), z = Slides.makeZip([{ name: 'a.png', data }]);
  assert.strictEqual(Slides.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
  return z.arrayBuffer().then(b => { const v = new DataView(b); assert.strictEqual(v.getUint32(0, true), 0x04034b50); assert.strictEqual(v.getUint16(b.byteLength - 14, true), 1); });
});

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
