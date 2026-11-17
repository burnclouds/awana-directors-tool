// Printed sheets use the team on the chosen night (moves and one-night teams), and mark movers with *.
// Usage: node test/teammoves.test.js
const assert = require('assert');
const M = require('../model.js'), S = require('../season.js'), R = require('../reports.js');
const { C, X } = M;
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
}
const kid = (id, first) => { const p = {}; p[X.ID] = id; p[C.FIRST] = first; p[C.LAST] = 'Test'; p[C.ROOM] = 'Sparks A'; p[C.SELECTION] = 'Clubber (Cubbies, Sparks & TnT only)'; p['team:Q2'] = 'Red'; return p; };
const master = { people: [kid('k1', 'Mover'), kid('k2', 'Stayer')] };
const season = S.blank('2026-27'); S.setTeamMove(season, 'k1', 'Q2', '2026-11-11', 'Blue');
const ctx = date => ({ master, season, calendar: [], settings: { quarter: 'Q2', dates: '10/28 11/4' }, opts: { date, order: 'name' } });
const cellFor = (html, name) => { const row = html.split('<tr>').find(r => r.includes(name + '</td>') || r.includes(name + ' *')) || ''; return row; };

test('attendance sheet: the team column follows the chosen night, with * on the mover', () => {
  const before = R.LIST.find(r => r.id === 'attendance').render(ctx('2026-11-04')), after = R.LIST.find(r => r.id === 'attendance').render(ctx('2026-11-11'));
  assert(/team-Red">Red\*<\/td>/.test(before) && /team-Blue">Blue\*<\/td>/.test(after), 'mover before/after');
  assert(/team-Red">Red<\/td>/.test(after), 'the other child stays Red, no star');
  assert(/Teams as of 2026-11-11\. \* = changes team this quarter/.test(after));
});
test('color team list groups by the team on that night', () => {
  const html = R.LIST.find(r => r.id === 'teams').render(ctx('2026-11-18'));
  assert(/Mover Test \*/.test(html) && /team-Blue/.test(html), html.slice(0, 300));
});
test('without a data file the sheet shows the quarter colors, as before', () => {
  const c = ctx('2026-11-18'); c.season = null;
  const html = R.LIST.find(r => r.id === 'attendance').render(c);
  assert(!/Blue/.test(html) && !/\*/.test(html));
});
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
