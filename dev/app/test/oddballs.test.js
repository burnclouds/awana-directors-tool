// N39: Debug "oddballs": records that look wrong are listed, and only a fix that loses nothing is offered. Invented data only.
// Season.oddballs(s, groupOf) returns rows { check, id, text, fix }; groupOf(id) gives the child's group ('Sparks', 'T&T', ...) or '' when unknown.
// Season.fixOddball(s, row) applies the row's fix (only rows with a fix) and returns true. A row with fix '' is shown and left alone: it holds a date, a note or a choice a person made.
// Usage: node test/oddballs.test.js
const assert = require('assert'), S = require('../season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const fresh = () => { const s = S.blank('2026-27'); s.roster.people = { a: { v: {} }, b: { v: {} } }; return s; };
const GROUP = { a: 'T&T', b: 'Sparks' }, groupOf = id => GROUP[id] || '';
const rows = (s, check) => S.oddballs(s, groupOf).filter(r => !check || r.check === check);

test('a clean file has no oddballs', () => { assert.deepStrictEqual(S.oddballs(fresh(), groupOf), []); });

test('an old uniform conflict offers a correction that preserves the date', () => {
  const s = fresh(), { UNI: U } = require('../model.js');
  const date = '2026-10-07';
  s.roster.people.a.v = { [U.GIVEN]: date, [U.GIVEN_FLAG]: '1' };
  s.roster.people.b.v = { [U.GIVEN]: '2026-02-30', [U.GIVEN_FLAG]: '1' };
  const found = rows(s, 'uniform-given-conflict');
  assert.deepStrictEqual(found.map(r => r.id), ['a']);
  assert.strictEqual(S.fixOddball(s, found[0]), true);
  assert.deepStrictEqual(s.roster.people.a.v, { [U.GIVEN]: date });
  assert.strictEqual(S.fixOddball(s, found[0]), false);
});

test('a received Cubbies book can fill an empty handbook only when the choice is unambiguous', () => {
  const s = fresh(), cubbies = () => 'Cubbies';
  S.setReceived(s, 'a', 'HC', '2026-10-07');
  S.setReceived(s, 'b', 'HC', '2026-10-08');
  const list = () => S.oddballs(s, cubbies).filter(r => r.check === 'cubbies-handbook');
  const a = list()[0];
  S.setHandbook(s, 'a', { code: 'AS', note: 'Keep this note' });
  assert.strictEqual(S.fixOddball(s, a, cubbies), false);
  assert.strictEqual(list().find(r => r.id === 'a').fix, '');
  const b = list().find(r => r.id === 'b');
  S.setReceived(s, 'b', 'AS', '2026-10-01');
  assert.strictEqual(S.fixOddball(s, b, cubbies), false);
  assert.strictEqual(list().find(r => r.id === 'b').fix, '');
  S.setReceived(s, 'b', 'AS', '');
  assert.strictEqual(S.fixOddball(s, b, groupOf), false);
  assert.strictEqual(S.fixOddball(s, b, cubbies), true);
  assert.strictEqual(S.childBook(s, 'b'), 'HC');
  assert.strictEqual(S.receivedOf(s, 'b', 'HC'), '2026-10-08');
});

// 1. a handbook code with nothing behind it (the N38 case)
test('a bare handbook code with no dates is listed, fixable, and the fix clears only the code', () => {
  const s = fresh(); s.handbooks = { b: 'WR' };
  const r = rows(s, 'bare-handbook'); assert.strictEqual(r.length, 1); assert.strictEqual(r[0].id, 'b'); assert.strictEqual(r[0].fix, 'clearHandbook');
  assert.strictEqual(S.fixOddball(s, r[0]), true); assert.strictEqual(s.handbooks.b, undefined);
  assert.deepStrictEqual(rows(s, 'bare-handbook'), []);
});
test('a handbook code with a sign-off behind it is not a bare-handbook oddball', () => {
  const s = fresh(); s.handbooks = { b: 'WR' }; s.progress = { b: { WR: { 'WR1.1': '2026-11-05' } } };
  assert.deepStrictEqual(rows(s, 'bare-handbook'), []);
});

// 2. a child whose book does not match their class
test('a handbook for a book of another group is listed; with a date it has no fix', () => {
  const s = fresh(); s.handbooks = { a: 'WR 261105 note' };        // a is T&T, WR is a Sparks book
  const r = rows(s, 'handbook-group'); assert.strictEqual(r.length, 1); assert.strictEqual(r[0].fix, '', 'a dated handbook is never cleared for you');
  assert.strictEqual(s.handbooks.a, 'WR 261105 note');
});
test('a bare code for a book of another group offers the clear', () => {
  const s = fresh(); s.handbooks = { a: 'WR' }; s.progress = { a: { AoG: { 'BE1.1.1': '2026-10-07' } } };      // dated in the right book, so it is not "bare", but the code names the wrong group
  const r = rows(s, 'handbook-group'); assert.strictEqual(r.length, 1); assert.strictEqual(r[0].fix, 'clearHandbook');
  S.fixOddball(s, r[0]); assert.strictEqual(s.handbooks.a, undefined); assert.strictEqual(s.progress.a.AoG['BE1.1.1'], '2026-10-07', 'the sign-off is untouched');
});
test('a handbook for the child\'s own group is fine; an unknown group is never judged', () => {
  const s = fresh(); s.handbooks = { a: 'AoG 260916', c: 'WR 260916' };
  assert.deepStrictEqual(rows(s, 'handbook-group'), []);
});

// 3. a received date or sign-off no book accounts for
test('a received date for a book that does not exist, or is for another group, is listed and kept', () => {
  const s = fresh(); s.received = { a: { ZZ: '2026-10-07', HG: '2026-10-14', AoG: '2026-10-21' } };      // ZZ unknown, HG is Sparks (a is T&T), AoG fits
  const r = rows(s, 'received-book'); assert.deepStrictEqual(r.map(x => x.text.match(/ZZ|HG|AoG/)[0]).sort(), ['HG', 'ZZ']);
  assert(r.every(x => x.fix === ''), 'a date is data: never removed for you'); assert.strictEqual(s.received.a.ZZ, '2026-10-07');
});
test('sign-offs under a book that is not in the book list are listed; the shared "common" block is not', () => {
  const s = fresh(); s.progress = { a: { ZZ: { 'X1.1': '2026-10-07' }, common: { 'FLT.1': '2026-09-09' } } };
  const r = rows(s, 'progress-book'); assert.strictEqual(r.length, 1); assert(/ZZ/.test(r[0].text)); assert.strictEqual(r[0].fix, '');
});

// 4. a flag or note tied to a removed book or person
test('a flag about a child who left the roster, or a book that is gone, is listed and kept', () => {
  const s = fresh(); s.flags = { f1: { kid: 'gone', level: 'child', note: 'ask mom', at: '2026-10-01', book: '', block: '', key: '' },
    f2: { kid: 'a', level: 'sheet', note: 'check', at: '2026-10-01', book: 'ZZ', block: '', key: '' },
    f3: { kid: 'a', level: 'sheet', note: 'ok', at: '2026-10-01', book: 'AoG', block: '', key: '' },
    f4: { kid: '', level: 'general', note: 'a note', at: '2026-10-01', book: '', block: '', key: '' } };
  const r = rows(s, 'flag-target'); assert.deepStrictEqual(r.map(x => x.id).sort(), ['gone', 'a'].sort()); assert(r.every(x => x.fix === ''), 'a note is what a leader wrote: never removed for you');
});

// 5. a team color that is not one of the four
test('a color that is not one of the group\'s colors is listed and kept', () => {
  const s = fresh(); s.roster.people.a.v['team:Q1'] = 'Purple'; s.roster.people.b.v['team:Q1'] = 'Green';
  const r = rows(s, 'team-color'); assert.strictEqual(r.length, 1); assert.strictEqual(r[0].id, 'a'); assert.strictEqual(r[0].fix, ''); assert.strictEqual(s.roster.people.a.v['team:Q1'], 'Purple');
});

// 6. duplicate or conflicting award entries
test('the same award twice in one night is listed and the fix keeps one copy', () => {
  const s = fresh(); s.awards = { '2026-10-07': { a: ['AoG Blue Emblem 1', 'AoG Blue Emblem 1', 'AoG Blue Emblem 2'] } };
  const r = rows(s, 'award-duplicate'); assert.strictEqual(r.length, 1); assert.strictEqual(r[0].fix, 'dedupeAwards');
  assert.strictEqual(S.fixOddball(s, r[0]), true); assert.deepStrictEqual(s.awards['2026-10-07'].a, ['AoG Blue Emblem 1', 'AoG Blue Emblem 2']);
});
test('the same award announced on two nights is listed and left alone', () => {
  const s = fresh(); s.awards = { '2026-10-07': { a: ['AoG Blue Emblem 1'] }, '2026-10-14': { a: ['AoG Blue Emblem 1'] } };
  const r = rows(s, 'award-twice'); assert.strictEqual(r.length, 1); assert.strictEqual(r[0].fix, ''); assert.strictEqual(Object.keys(s.awards).length, 2);
});

// Review finding: groupOf also answers 'Puggles', 'Volunteers' and 'Unassigned' for a room that is not a book group. Those children are not judged on class, so a valid record is never listed (and never offered a clear).
test('a child in Puggles, Volunteers or an unrecognised room is not judged on class', () => {
  const s = fresh(); s.roster.people.c = { v: {} }; s.roster.people.d = { v: {} }; s.roster.people.e = { v: {} };
  s.handbooks = { c: 'HC', d: 'WR', e: 'AoG' }; s.received = { c: { HC: '2026-10-07' }, d: { WR: '2026-10-07' } };
  const g = { c: 'Puggles', d: 'Unassigned', e: 'Volunteers' }, r = S.oddballs(s, id => g[id] || '').filter(x => ['handbook-group', 'received-book'].includes(x.check));
  assert.deepStrictEqual(r, [], 'listed: ' + JSON.stringify(r));
});
test('fixOddball refuses a row with no fix', () => {
  const s = fresh(); s.received = { a: { ZZ: '2026-10-07' } };
  assert.strictEqual(S.fixOddball(s, rows(s, 'received-book')[0]), false); assert.strictEqual(s.received.a.ZZ, '2026-10-07');
});
test('the list never changes the data', () => {
  const s = fresh(); s.handbooks = { b: 'WR', a: 'WR 261105' }; s.awards = { '2026-10-07': { a: ['x', 'x'] } };
  const before = JSON.stringify(s); S.oddballs(s, groupOf); assert.strictEqual(JSON.stringify(s), before);
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
