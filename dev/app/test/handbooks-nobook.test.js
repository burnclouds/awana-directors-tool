// Handbooks by book, with the option to also list children who have not received a book. Invented children only.
// Usage: node test/handbooks-nobook.test.js
const assert = require('assert');
const M = require('../model.js'), S = require('../season.js'), RS = require('../reports-season.js');
const { C, X } = M;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const kid = (id, first, last, room = 'Sparks A') => { const p = {}; p[X.ID] = id; p[C.FIRST] = first; p[C.LAST] = last; p[C.ROOM] = room; p[C.SELECTION] = 'Clubber (Cubbies, Sparks & TnT only)'; return p; };
const master = { people: [kid('k1', 'Has', 'Dated'), kid('k2', 'Has', 'Nothing'), kid('k3', 'Has', 'Undated'), kid('k4', 'Has', 'Nodate')] };
const season = S.blank('2026-27');
season.handbooks.k1 = 'HG 260916'; S.setReceived(season, 'k1', 'HG', '2026-09-16');            // a book and the day it was received
/* k2: no book at all */
season.handbooks.k3 = 'HG';                                                                      // a book, but no day received
season.handbooks.k4 = 'HG'; S.setReceived(season, 'k4', 'HG', '', { noDate: true });             // received, day unknown
const run = noBook => RS.handbooks({ master, season, calendar: [], settings: {}, opts: { noBook } });
const section = html => (/Not received a book \((\d+)\)(.*?)(?=<h3>|<\/section>|$)/s.exec(html.split('Sparks (')[1] || '') || [])[0] || '';

test('off by default: no list of children without a book', () => { assert(!/Not received a book/.test(run(false))); });
test('on: Sparks lists the child with no book and the child with a book but no day received, with the reason', () => {
  const s = section(run(true)); assert(/Not received a book \(2\)/.test(s), s.slice(0, 200));
  assert(/Nothing<\/td>|Has Nothing/.test(s) && /No book yet/.test(s)); assert(/Has Undated/.test(s) && /no date received/.test(s));
});
test('a child with a received date, and a child ticked "no date" (received, day unknown), are not listed', () => { const s = section(run(true)); assert(!/Has Dated/.test(s) && !/Has Nodate/.test(s), s.slice(0, 300)); });
test('when everyone in a group has a book the list says so', () => { assert(/Everyone in (Puggles|Cubbies|T&amp;T) has received a book/.test(run(true))); });

master.people.push(
  kid('c1', 'Cubbie', 'Received', 'Cubbies A'),
  kid('c2', 'Cubbie', 'Bookless', 'Cubbies A'),
  kid('t1', 'Clubber', 'Received', 'T&T A'),
  kid('t2', 'Clubber', 'Assigned', 'T&T A')
);
S.setReceived(season, 'c1', 'HC', '2026-09-16');
S.setReceived(season, 't1', 'AoG', '2026-09-23');
season.handbooks.t2 = 'DoG';
const groupSection = (html, group) => html.split('<h3>' + group + ' (2)</h3>')[1].split(/<h3>|<\/section>/)[0];
for (const noBook of [false, true]) {
  test('Cubbies and T&T count receipt-only books with the missing list ' + (noBook ? 'on' : 'off'), () => {
    const html = run(noBook);
    assert(groupSection(html, 'Cubbies').includes('<td>HoneyComb</td><td>1</td>'));
    assert(groupSection(html, 'T&amp;T').includes('<td>Agents of Grace</td><td>1</td>'));
  });
}
test('the Cubbies and T&T missing lists distinguish bookless and assigned-but-undated children', () => {
  const html = run(true), cubbies = groupSection(html, 'Cubbies'), tnt = groupSection(html, 'T&amp;T');
  assert(/Cubbie Bookless<\/td>.*?<td>No book yet<\/td>/.test(cubbies));
  assert(/Clubber Assigned<\/td>.*?<td>Discovery of Grace: no date received<\/td>/.test(tnt));
  assert(!cubbies.includes('Cubbie Received'));
  assert(!tnt.includes('Clubber Received'));
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
