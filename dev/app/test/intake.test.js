// Registration rules shared by the export check and the To do page.
// Usage: node test/intake.test.js
const assert = require('assert');
const I = require('../intake.js');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
}

test('birthdates: M/D/YYYY and yyyy-mm-dd are read; blanks and impossible dates are not', () => {
  assert.deepStrictEqual(I.parseBirthdate('4/26/2017'), { y: 2017, m: 4, d: 26 });
  assert.deepStrictEqual(I.parseBirthdate('2018-04-09'), { y: 2018, m: 4, d: 9 });
  ['', null, '2/30/2017', '13/1/2017', '2017', 'April 26'].forEach(s => assert.strictEqual(I.parseBirthdate(s), null, String(s)));
});
test('age is whole years on the reference day, birthday included', () => {
  const b = I.parseBirthdate('11/3/2020');
  assert.strictEqual(I.ageOn(b, '2026-11-02'), 5); assert.strictEqual(I.ageOn(b, '2026-11-03'), 6); assert.strictEqual(I.ageOn(null, '2026-11-03'), null);
});
test('grades: Pre-K, Kindergarten and 1st to 12th in the forms Planning Center and people use', () => {
  assert.deepStrictEqual(['Pre-K', 'PreK', 'Preschool', 'Kindergarten', 'K', '1st Grade', '3rd', '6th Grade', '12th Grade', '', 'Homeschool', '13th'].map(I.parseGrade), [-1, -1, -1, 0, 0, 1, 3, 6, 12, null, null, null]);
});
test('group for a registration: selection first, then grade; past 6th grade has no group', () => {
  const sel = 'Clubber (Cubbies, Sparks & T&T only)';
  assert.deepStrictEqual([['Awana Adult Volunteer', ''], ['Puggles (Ages 2-3 years)', 'Pre-K'], [sel, 'Pre-K'], [sel, 'Kindergarten'], [sel, '2nd Grade'], [sel, '3rd Grade'], [sel, '6th Grade'], [sel, '7th Grade'], [sel, '']].map(([s, g]) => I.suggestGroup(s, g)),
    ['Volunteers', 'Puggles', 'Cubbies', 'Sparks', 'Sparks', 'T&T', 'T&T', 'Older', '']);
});
test('a Pre-K child fits Puggles or Cubbies; anything else must match', () => {
  const sel = 'Clubber (Cubbies, Sparks & T&T only)';
  assert(I.classFits(sel, 'Pre-K', 'Puggles') && I.classFits(sel, 'Pre-K', 'Cubbies') && !I.classFits(sel, 'Pre-K', 'Sparks'));
  assert(I.classFits(sel, '4th Grade', 'T&T') && !I.classFits(sel, '4th Grade', 'Sparks') && I.classFits(sel, '7th Grade', 'T&T') && I.classFits(sel, '', 'Sparks'));
});
test('grade against age: the usual age is grade + 5, give or take two; Pre-K is anything before Kindergarten (any age up to 5)', () => {
  assert(I.gradeFitsAge('4th Grade', 9) && I.gradeFitsAge('Kindergarten', 5) && I.gradeFitsAge('Pre-K', 3) && I.gradeFitsAge('', 40) && I.gradeFitsAge('3rd Grade', null));
  assert(I.gradeFitsAge('Pre-K', 1) && I.gradeFitsAge('Pre-K', 0) && !I.gradeFitsAge('Pre-K', 7) && !I.gradeFitsAge('Kindergarten', 9) && !I.gradeFitsAge('6th Grade', 5));
});
test('emails: several in one box, but a space inside an address is an error, not a separator', () => {
  assert.deepStrictEqual(I.emails('a@x.com; b@y.org'), ['a@x.com', 'b@y.org']);
  assert.deepStrictEqual(I.emails('priya.family at example.com').filter(e => !I.validEmail(e)), ['priya.family at example.com']);
  assert(I.validEmail('a.b+c@example.co.uk') && !I.validEmail('a@b') && !I.validEmail('@x.com'));
});
test('names: extra spaces, all lower case and all capitals are flagged; ordinary names are not', () => {
  assert.deepStrictEqual(['  Nora  ', 'olivia', 'MCDONALD', "O'Brien-Nuñez", 'Zoë', 'Mateo Alejandro', 'McDonald', 'Bo', 'a  b', ''].map(I.oddName),
    ['has extra spaces', 'is all lower case', 'is all capitals', '', '', '', '', '', 'has extra spaces', '']);
});
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
