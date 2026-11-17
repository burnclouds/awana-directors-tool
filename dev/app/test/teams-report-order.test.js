// The Color teams report: four list orders (color or name first, first name or last name), and no Night box (it follows the quarter). Invented names only.
// Usage: node test/teams-report-order.test.js
const assert = require('assert');
const M = require('../model.js'), S = require('../season.js'), R = require('../reports.js');
const { C, X } = M;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const kid = (id, first, last, team) => { const p = {}; p[X.ID] = id; p[C.FIRST] = first; p[C.LAST] = last; p[C.ROOM] = 'Sparks A'; p[C.SELECTION] = 'Clubber (Cubbies, Sparks & TnT only)'; p['team:Q2'] = team; return p; };
const master = { people: [kid('a', 'Zed', 'Adams', 'Red'), kid('b', 'Amy', 'Young', 'Red'), kid('c', 'Bob', 'Brown', 'Blue'), kid('d', 'Cal', 'Adams', 'Blue')] };
const season = S.blank('2026-27');
const teams = R.LIST.find(r => r.id === 'teams'), run = order => teams.render({ master, season, calendar: [], settings: { quarter: 'Q2', dates: '' }, opts: { order } });
const names = html => [...html.matchAll(/<td>((?:Zed|Amy|Bob|Cal|Adams|Young|Brown)[^<]*)<\/td>/g)].map(m => m[1]);

const at = (h, x) => h.indexOf(x), inOrder = (h, list) => { const p = list.map(x => at(h, x)); return p.every((v, i) => v >= 0 && (i === 0 || v > p[i - 1])); };
test('Color, then first name: the usual list (Red is Amy then Zed; Blue is Bob then Cal)', () => { const h = run('color'); assert(inOrder(h, ['Amy Young', 'Zed Adams']) && inOrder(h, ['Bob Brown', 'Cal Adams'])); assert(!/Last, first name/.test(h)); });
test('Color, then last name: shows "Last, First" and sorts by last name inside each color (Red: Adams then Young; Blue: Adams then Brown)', () => {
  const h = run('colorLast'); assert(/Last, first name/.test(h)); assert(inOrder(h, ['Adams, Zed', 'Young, Amy']) && inOrder(h, ['Adams, Cal', 'Brown, Bob']), 'inside each color');
  const red = Math.max(at(h, 'Adams, Zed'), at(h, 'Young, Amy')), blue = Math.max(at(h, 'Adams, Cal'), at(h, 'Brown, Bob')), redFirst = Math.min(at(h, 'Adams, Zed'), at(h, 'Young, Amy')), blueFirst = Math.min(at(h, 'Adams, Cal'), at(h, 'Brown, Bob'));
  assert(red < blueFirst || blue < redFirst, 'each color is one block: the two colors do not interleave');
});
test('Last name, then color: one list sorted by last then first name, the color is just a column', () => {
  const h = run('nameLast'); const order = ['Adams, Cal', 'Adams, Zed', 'Brown, Bob', 'Young, Amy'].map(x => h.indexOf(x)); assert(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), order.join()); assert(/by name/.test(h));
});
test('First name, then color: one list sorted by first name', () => { const h = run('name'); const order = ['Amy Young', 'Bob Brown', 'Cal Adams', 'Zed Adams'].map(x => h.indexOf(x)); assert(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), order.join()); });
test('the report asks for the quarter but not a Night: the Night box does not apply to it', () => { assert(teams.opts.includes('quarter') && teams.opts.includes('order') && !teams.opts.includes('date'), teams.opts.join()); });
test('with no night the teams are the quarter\'s and the note says so', () => { assert(/Q2 teams/.test(run('color'))); });
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
