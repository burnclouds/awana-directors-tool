// Team balance from attendance history, and the one-time carry of progress and awards at a new season (Mike, 2026-11-13).
//  1. Earlier years' attendance counts: written once by newSeason, carried by later ones, added from an older file ("Add an earlier year"), never twice.
//  2. The expected turnout blends history with this season (formula in teamplan.js), the balance panel, the suggested move and the warnings.
//  3. newSeason brings progress and awards forward and NONE of it counts as this season's work: no re-announcing, store points, sections, the Given check and the History replay stay clean.
// Invented people only. Usage: node test/team-history.test.js
const assert = require('assert');
const M = require('../model.js'), S = require('../season.js'), Teams = require('../teams.js'), TP = require('../teamplan.js'), Store = require('../store.js');
const { C, X } = M;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const night = (d, q) => ({ Date: d, Type: 'Club', Quarter: q, 'No Club': '' });
const OLD = ['2025-09-10', '2025-09-17', '2025-09-24', '2025-10-01', '2025-10-08', '2025-10-15', '2025-10-22', '2025-10-29'];      // last year's nights
const NEW = ['2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30', '2026-10-07', '2026-10-14'];
const calOf = list => list.map(d => night(d, 'Q1'));
const kid = (id, first, over) => Object.assign({ [X.ID]: id, [C.FIRST]: first, [C.LAST]: 'Test', [C.ROOM]: 'Sparks A', [C.SELECTION]: 'Clubber (Cubbies, Sparks & TnT only)', [X.ACTIVE]: '1' }, over || {});
const here = (s, id, dates) => dates.forEach(d => S.setMark(s, d, id, 'a', 1, 'Sparks'));
const base = year => { const s = S.blank(year); s.roster = { cols: [], people: { a1: { pc: {}, v: {} }, b2: { pc: {}, v: {} }, c3: { pc: {}, v: {} } } }; return s; };

// ---------- 1. counts across years ----------
test('turnoutCounts counts from the first attended night, and a child who never came has none', () => {
  const s = base('2025-26'); s.calendar = calOf(OLD); here(s, 'a1', OLD.slice(1)); here(s, 'b2', OLD.filter((_, i) => i !== 3)); here(s, 'c3', []);
  const t = S.turnoutCounts(s, s.calendar, '');
  assert.deepStrictEqual(t.a1, { nights: 7, came: 7 }); assert.deepStrictEqual(t.b2, { nights: 8, came: 7 }); assert.strictEqual(t.c3, undefined);
  assert.deepStrictEqual(S.turnoutCounts(s, s.calendar, '2025-09-24').b2, { nights: 3, came: 3 }, 'a "today" cuts it off');
});
test('newSeason writes the closed year once, later seasons keep it, and the same year is never added twice', () => {
  const s = base('2025-26'); s.calendar = calOf(OLD); here(s, 'a1', OLD); here(s, 'b2', OLD.filter((_, i) => i !== 3));      // a1 makes all eight nights count as held
  const n = S.newSeason(s, '2026-27'); assert.deepStrictEqual(n.pastTurnout, { a1: [{ year: '2025-26', nights: 8, came: 8 }], b2: [{ year: '2025-26', nights: 8, came: 7 }] });
  here(n, 'b2', ['2026-09-09']); n.calendar = calOf(NEW); const n2 = S.newSeason(n, '2027-28');
  assert.deepStrictEqual(n2.pastTurnout.b2.map(x => x.year), ['2025-26', '2026-27'], 'oldest first, both kept');
  assert.deepStrictEqual(S.addPastYear(n2, '2026-27', { b2: { nights: 99, came: 1 } }), { added: 0, kept: 1 }, 'a recorded year is not changed');
  assert.deepStrictEqual(n2.pastTurnout.b2[1], { year: '2026-27', nights: 1, came: 1 });
});
test('the section round-trips and is left out of the file while empty', () => {
  const s = base('2026-27'); assert(!('pastTurnout' in JSON.parse(S.toJson(s))));
  S.addPastYear(s, '2025-26', { a1: { nights: 20, came: 15 } }); const text = S.toJson(s); assert.strictEqual(S.toJson(S.fromJson(text)), text);
});
test('Add an earlier year: counts only, for children on this roster, never twice, and says so in numbers', () => {
  const old = base('2024-25'); old.calendar = calOf(OLD); here(old, 'a1', OLD); here(old, 'zz9', OLD); old.roster.people.zz9 = { pc: {}, v: {} };
  const cur = base('2026-27'); const r = S.addEarlierYear(cur, S.toJson(old));
  assert.deepStrictEqual(r, { year: '2024-25', children: 2, added: 1, alreadyThere: 0, notOnRoster: 1 });
  assert.deepStrictEqual(cur.pastTurnout, { a1: [{ year: '2024-25', nights: 8, came: 8 }] });
  const again = S.addEarlierYear(cur, S.toJson(old)); assert.strictEqual(again.added, 0); assert.strictEqual(again.alreadyThere, 1);
  assert.throws(() => S.addEarlierYear(cur, S.toJson(base('2026-27'))), /this season/); assert.throws(() => S.addEarlierYear(cur, '{"format":"x"}'), /./);
  Object.keys(r).forEach(k => assert(typeof r[k] !== 'string' || k === 'year'), 'no names in the message');
});

// ---------- 2. the blend, the balance panel, the suggested move ----------
// Four Sparks children per team would be many; use 8 kids so every color has two: ids k0..k7 (regulars k0..k3, rarely k4..k7).
function world(nights, opts) {
  opts = opts || {}; const s = base('2026-27'); const people = []; s.roster.people = {};
  for (let i = 0; i < 8; i++) { const id = 'k' + i; people.push(kid(id, 'Kid' + i)); s.roster.people[id] = { pc: {}, v: {} }; }
  s.calendar = calOf(NEW); const days = NEW.slice(0, nights);
  for (let i = 0; i < 8; i++) { const rate = i < 4 ? days : days.filter((_, j) => j === 0 && i === 4); if (rate.length) here(s, 'k' + i, rate); }
  return { s, master: { people, cols: [] }, ctx: null };
}
function ctxOf(w, today) { return { master: w.master, season: w.s, calendar: w.s.calendar, today: today || '2026-12-31', history: () => undefined }; }
test('no history: this season alone, and fewer than MIN_NIGHTS gives the group average (as before)', () => {
  const w = world(2); const r = TP.ratesOf(ctxOf(w), 'Sparks'); const k0 = r.find(x => String(x.person[X.ID]) === 'k0');
  assert.strictEqual(k0.usedAverage, true, '2 counted nights is under MIN_NIGHTS and there is no history'); assert.strictEqual(k0.usedHistory, false);
  const w5 = world(5), k = TP.ratesOf(ctxOf(w5), 'Sparks'), k4 = k.find(x => String(x.person[X.ID]) === 'k4'), k1 = k.find(x => String(x.person[X.ID]) === 'k1');
  assert.strictEqual(k1.rate, 1); assert.strictEqual(k4.rate, 1 / 5, 'k4 came once of 5 counted from the first night');
});
test('history alone below MIN_NIGHTS, then a linear blend to this season at the blend nights, never jumping', () => {
  const w = world(2); S.addPastYear(w.s, '2025-26', { k0: { nights: 20, came: 4 } });       // history rate 0.2
  const at = n => { const x = world(n); S.addPastYear(x.s, '2025-26', { k0: { nights: 20, came: 4 } }); return TP.ratesOf(ctxOf(x), 'Sparks').find(r => String(r.person[X.ID]) === 'k0'); };
  const a = at(2); assert.strictEqual(a.usedHistory, true); assert.strictEqual(a.usedAverage, false); assert.strictEqual(a.rate, 0.2, 'history alone');
  assert(Math.abs(at(3).rate - 0.2) < 1e-9, 'at MIN_NIGHTS the weight on this season is 0: no jump');
  // this season rate is 1 (came to every night); n = 3 + (20-3)/2 would be halfway; test the formula directly with the default FULL 20 using 6 counted nights: w = 3/17
  const six = at(6); assert(Math.abs(six.rate - (3 / 17 * 1 + 14 / 17 * 0.2)) < 1e-9, 'blend at 6 nights: ' + six.rate); assert(Math.abs(six.weight - 3 / 17) < 1e-9);
  assert(six.rate > 0.2 && six.rate < 1, 'between the two');
});
test('the blend knob: set, read, stored only when not the default, checked by the validator', () => {
  const s = base('2026-27'); assert.strictEqual(TP.fullNights(s), 20); TP.setBlendNights(s, 10); assert.strictEqual(TP.fullNights(s), 10); assert.strictEqual(s.config.teamPlan.blendNights, 10);
  TP.setBlendNights(s, 20); assert(!s.config.teamPlan, 'the default is not stored'); TP.setBlendNights(s, 2); assert.strictEqual(TP.fullNights(s), 20, 'too small is ignored');
  s.config.teamPlan = { blendNights: 'x' }; assert.strictEqual(TP.fullNights(s), 20, 'junk reads as the default');
});
test('history stops regulars piling on one team: the balance panel says so, and a suggested move evens it', () => {
  const w = world(6); S.addPastYear(w.s, '2025-26', { k4: { nights: 20, came: 2 }, k5: { nights: 20, came: 2 }, k6: { nights: 20, came: 2 }, k7: { nights: 20, came: 2 } });
  const col = { k0: 'Red', k1: 'Red', k2: 'Red', k3: 'Blue', k4: 'Blue', k5: 'Green', k6: 'Yellow', k7: 'Yellow' };
  w.master.people.forEach(p => { p['team:Q1'] = col[p[X.ID]]; });
  const ctx = ctxOf(w), b = TP.balance(ctx, 'Sparks', p => Teams.endIn(p, 'Q1', undefined));
  assert.deepStrictEqual(b.rows.map(r => r.kids), [3, 2, 1, 2].map((_, i) => ['Red', 'Blue', 'Green', 'Yellow'].map(c => Object.values(col).filter(x => x === c).length)[i]));
  const red = b.rows.find(r => r.color === 'Red'), green = b.rows.find(r => r.color === 'Green');
  assert(red.expected > green.expected + 1 && red.regulars === 3, 'Red holds the regulars'); assert.strictEqual(b.lopsided, true); assert(/Red has the regulars/.test(b.note), b.note);
  const sug = TP.suggestMove(ctx, w.master.people.find(p => p[X.ID] === 'k0'), 'Q1'); assert(sug.to && sug.to !== 'Red', 'suggests another color: ' + JSON.stringify(sug)); assert(/has not been/.test(sug.why));
});
test('the suggestion never repeats a color, and a hand pick only warns (repeat, uneven, lopsided)', () => {
  const w = world(6), ppl = w.master.people; ppl.forEach((p, i) => { p['team:Q1'] = ['Red', 'Blue', 'Green', 'Yellow'][i % 4]; p['team:Q2'] = ['Blue', 'Green', 'Yellow', 'Red'][i % 4]; });
  const ctx = ctxOf(w), k0 = ppl[0];      // k0: Q1 Red, Q2 Blue
  const use = TP.colorUse(ctx, k0, 'Q3'); assert.deepStrictEqual(use, { Red: ['Q1'], Blue: ['Q2'] });
  const sug = TP.suggestMove(ctx, k0, 'Q3'); assert(['Green', 'Yellow'].includes(sug.to), 'only unused colors: ' + sug.to);
  const chk = TP.checkChoice(ctx, k0, 'Q3', 'Red'); assert(chk.warnings.some(x => /already been Red in Q1/.test(x)), chk.warnings.join(' | '));
  assert.strictEqual(TP.checkChoice(ctx, k0, 'Q3', sug.to).warnings.some(x => /repeats/.test(x)), false);
  k0['team:Q3'] = 'Green'; k0['team:Q4'] = '';      // Red, Blue and Green are used: only Yellow is left, and it is suggested for Q4
  assert.strictEqual(TP.suggestMove(ctx, k0, 'Q4').to, 'Yellow');
  k0['team:Q4'] = 'Yellow'; k0['team:Q1'] = 'Red';
  const none = TP.suggestMove(ctx, k0, 'Q3'); assert.strictEqual(none.to, '', 'Red, Blue and Yellow are used and Green is this quarter\'s own color: nothing new to move to'); assert(/has had/.test(none.why));
});

// ---------- 3. one-time carry at a new season ----------
function closedYear() {
  const s = base('2025-26'); s.calendar = calOf(OLD); here(s, 'a1', OLD); here(s, 'b2', OLD.slice(0, 4));
  ['1', '2', '3', '4'].forEach((i, n) => S.setProgress(s, 'a1', 'HG', 'RJ1.' + i, OLD[n]));      // a finished jewel (an award) ...
  S.setProgress(s, 'b2', 'HG', 'RJ1.1', OLD[1]); S.setProgress(s, 'b2', 'HG', 'RJ1.2', OLD[2]);      // ... and an unfinished one
  S.setHandbook(s, 'a1', { code: 'HG' });
  S.announce(s, OLD[7], [['a1', 'HG Red Jewel 1']]); S.setGiven(s, 'a1', 'HG Red Jewel 1', OLD[7]);
  return s;
}
test('what a new season carries and what it leaves', () => {
  const s = closedYear(); const n = S.newSeason(s, '2026-27');
  ['progress', 'handbooks', 'awards', 'given'].forEach(k => assert.deepStrictEqual(n[k], s[k], k + ' carried whole'));
  assert.deepStrictEqual(n.attendance, {}); assert.deepStrictEqual(n.games, {}); assert.deepStrictEqual(n.history, []);
  assert.strictEqual(n.config.carriedThrough, OLD[7]); assert.strictEqual(Object.keys(n.progress.b2.HG).length, 2, 'unfinished sign-offs come too');
  assert.notStrictEqual(n.progress, s.progress, 'a copy, not the same object');
});
test('carried work is not new-year work: nothing re-announced, no store credit, no sections, the calendar not yet replaced', () => {
  const s = closedYear(), n = S.newSeason(s, '2026-27');      // the calendar is still last year's
  assert.strictEqual(S.seasonStart(n), '2025-10-30', 'held back to the day after the closed year');
  ['a1', 'b2'].forEach(id => assert.deepStrictEqual(S.pendingAwards(n, id, 'Sparks', n.calendar), [], id + ' has nothing to announce'));
  assert.deepStrictEqual(S.suggestedAwards(n, 'a1', 'Sparks'), []);
  const row = S.awardLedger(n, 'a1', 'Sparks', n.calendar).find(r => r.award === 'HG Red Jewel 1'); assert(row && row.carried && row.given, 'still listed, as carried and given');
  assert.deepStrictEqual(S.earnedAwards(n, 'a1', 'Sparks', n.calendar), [], 'not this season\'s earning');
  assert.strictEqual(S.sectionsThisSeason(n, 'a1'), 0); assert.deepStrictEqual(S.assumedGiven(n), [], 'no Given date looks assumed');
  // now the new year: the calendar is replaced, and one new sign-off and one new award
  n.calendar = calOf(NEW); S.setProgress(n, 'b2', 'HG', 'RJ1.3', NEW[1]); S.setProgress(n, 'b2', 'HG', 'RJ1.4', NEW[2]);
  assert.strictEqual(S.seasonStart(n), NEW[0]); assert.strictEqual(S.sectionsThisSeason(n, 'b2'), 2, 'only the two new sections count');
  const p = S.pendingAwards(n, 'b2', 'Sparks', n.calendar); assert.deepStrictEqual(p.map(x => x.award).sort(), ['HG Pilot Wing', 'HG Red Jewel 1'], 'finished this year (the sections carried plus the two new ones), so it is offered');
  assert.deepStrictEqual(S.pendingAwards(n, 'a1', 'Sparks', n.calendar), [], 'last year\'s awards are still not offered again');
  assert.strictEqual(S.earnedAwards(n, 'b2', 'Sparks', n.calendar).length, 2);
});
test('an award announced last year but not yet handed out still shows for hand-out, and is not counted as earned this season', () => {
  const s = closedYear(); delete s.given.a1; const n = S.newSeason(s, '2026-27');
  const row = S.awardLedger(n, 'a1', 'Sparks', n.calendar).find(r => r.award === 'HG Red Jewel 1'); assert(row && !row.given && row.carried && row.announced === OLD[7]);
  assert.deepStrictEqual(S.earnedAwards(n, 'a1', 'Sparks', n.calendar), []);
});
test('store points: carried awards and sections add nothing to the new year', () => {
  const s = closedYear(), n = S.newSeason(s, '2026-27'); n.config.store = { weights: { awards: 1, sections: 1 } };
  const master = { people: [kid('a1', 'A'), kid('b2', 'B')], cols: [] };
  const r = Store.compute({ master, season: n, calendar: n.calendar, today: '2026-09-01' });
  r.kids.forEach(k => { assert.strictEqual(k.counts.awards, 0, k.id + ' awards'); assert.strictEqual(k.counts.sections, 0, k.id + ' sections'); });
});
test('the History replay stays clean after the carry and an edit', () => {
  const n = S.newSeason(closedYear(), '2026-27'); assert.deepStrictEqual(S.replayDiff(n), []);
  n.calendar = calOf(NEW); const snap = S.snapshot(n); S.setProgress(n, 'b2', 'HG', 'RJ1.3', NEW[1]); S.record(n, snap, { now: '2026-09-16T20:00:00.000Z' });
  assert.deepStrictEqual(S.replayDiff(n), [], 'replay agrees with the data'); const t = S.toJson(n); assert.strictEqual(S.toJson(S.fromJson(t)), t, 'the carried file round-trips');
});
test('blue jewels come out the same with or without the carried progress', () => {
  const s = closedYear(), n = S.newSeason(s, '2026-27'), bare = S.newSeason(s, '2026-27'); ['progress', 'awards', 'given', 'handbooks'].forEach(k => { bare[k] = {}; });
  ['a1', 'b2'].forEach(id => assert.deepStrictEqual(S.sparkJewels(n, id, n.calendar), S.sparkJewels(bare, id, bare.calendar), id));
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
