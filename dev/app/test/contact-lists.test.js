// Contact lists print several phone numbers / email addresses from one Planning Center cell with "; " between them (Planning Center joins them with a bare ";"), and the cell can wrap (flag 16).
// Invented values only. Usage: node test/contact-lists.test.js
const assert = require('assert');
const M = require('../model.js'), Reports = require('../reports.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
function master(vals) {
  const m = M.emptyMaster(); m.pcCols = M.TRACKED.slice();
  const rec = { 'First Name': 'Vera', 'Last Name': 'Volunteer', 'Assignment Area: Classes': 'Sparks A', 'Selection': 'Volunteer', 'Registration ID': '7000009' };
  M.addManualPerson(m, rec, '2026-10-01'); Object.assign(m.people[0], vals); return m;
}
const render = m => Reports.LIST.find(r => r.id === 'volunteers').render({ master: m, settings: { quarter: 'Q1', club: 'x' }, calendar: [], opts: {} });
const cells = html => [...html.matchAll(/<tr><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><\/tr>/g)].map(r => ({ phone: r[3], email: r[4] }));
const text = h => h.replace(/<[^>]+>/g, '');

test('several phone numbers in one cell are printed "a; b", each number kept whole on one line, and the cell can wrap between them', () => {
  const c = cells(render(master({ 'Mobile Phone Number': '555-0100;555-0101' })))[0];
  assert(c, 'the volunteer is on the list'); assert.strictEqual(text(c.phone), '555-0100; 555-0101');
  assert(!/;[^ ]/.test(text(c.phone)), 'every ; is followed by a space');
  assert((c.phone.match(/class="nw"/g) || []).length === 2, 'each number is its own no-break piece, so a long list can wrap between numbers: ' + c.phone);
});
test('several email addresses are printed "a; b"', () => {
  const c = cells(render(master({ 'Home Email Address': 'a@x.test;b@x.test' })))[0]; assert.strictEqual(text(c.email), 'a@x.test; b@x.test');
});
test('values already separated by "; ", extra spaces, empty pieces and single values come out the same way', () => {
  const p = v => text(cells(render(master({ 'Mobile Phone Number': v })))[0].phone);
  assert.strictEqual(p('555-0100; 555-0101'), '555-0100; 555-0101'); assert.strictEqual(p('555-0100 ;  555-0101'), '555-0100; 555-0101'); assert.strictEqual(p('555-0100;;'), '555-0100'); assert.strictEqual(p('555-0100'), '555-0100'); assert.strictEqual(p(''), '');
});
test('the first filled column is still the one used, and markup in a value is escaped', () => {
  const c = cells(render(master({ 'Mobile Phone Number': '', 'Home Phone Number': '555-0102', 'Home Email Address': '<b>x</b>@x.test;y@x.test' })))[0];
  assert.strictEqual(text(c.phone), '555-0102'); assert(!/<b>/.test(c.email) && /&lt;b&gt;/.test(c.email), c.email);
});

test('N13 the list is ordered by class (the app\'s class order), then last name; a volunteer with no class comes after every class', () => {
  const m = M.emptyMaster(); m.pcCols = M.TRACKED.slice();
  [['Zed', 'Adams', 'T&T Boys (Group A)'], ['Amy', 'Young', 'Sparks A'], ['Bea', 'Zimmer', 'Puggles'], ['Cal', 'Baker', 'Sparks A'], ['Dee', 'Moore', 'Volunteers'], ['Eve', 'Allen', 'Cubbies']]
    .forEach(([f, l, room], i) => M.addManualPerson(m, { 'First Name': f, 'Last Name': l, 'Assignment Area: Classes': room, 'Selection': 'Volunteer', 'Registration ID': '71000' + i }, '2026-10-01'));
  const rows = [...render(m).matchAll(/<tr><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td>/g)].map(r => [text(r[1]), text(r[2])]);
  assert.deepStrictEqual(rows.map(r => r[0]), ['Zimmer, Bea', 'Allen, Eve', 'Baker, Cal', 'Young, Amy', 'Adams, Zed', 'Moore, Dee'], JSON.stringify(rows));
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
