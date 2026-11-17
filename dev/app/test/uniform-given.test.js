// Uniforms: Given out is a date, or the "no date" box when it was handed over but nobody wrote down when. Either counts: the To do item, the report and the filter agree.
// Usage: node test/uniform-given.test.js     (invented test club only)
const assert = require('assert'), fs = require('fs'), path = require('path');
const Season = require('../season.js'), M = require('../model.js'), Todo = require('../todo.js'), Reports = require('../reports.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).find(f => /TEST.*\.json$/.test(f));
const load = () => { const s = Season.fromJson(fs.readFileSync(path.join(dir, file), 'utf8')); return { season: s, master: M.fromRoster(s.roster), calendar: s.calendar }; };
const U = M.UNI;
const toOrder = (master, season) => (Todo.compute({ master, season, quarter: 'Q2', today: '2026-10-29' }).groups.find(g => g.id === 'uniform') || { items: [] }).items.map(i => i.id);
const withUniform = master => master.people.filter(p => M.isClubber(p) && M.isActive(p) && M.uniformItems(p).length);

test('the model counts a date or the no-date box as given out, and nothing else', () => {
  assert.strictEqual(M.uniGiven({}), false); assert.strictEqual(M.uniGiven({ [U.GIVEN]: '2026-10-21' }), true); assert.strictEqual(M.uniGiven({ [U.GIVEN_FLAG]: '1' }), true); assert.strictEqual(M.uniGiven({ [U.GIVEN_FLAG]: '' }), false);
  assert(M.BASE_USER_COLS.includes('x_Uni_GivenFlag'), 'the box is a column of the data file');
});
test('To do "Uniform to order": a child with no order date is listed; a date given out, or the no-date box, takes them off it', () => {
  const { master, season } = load(), kid = withUniform(master).find(p => !p[U.ORDERED]); assert(kid, 'the test club has a child who bought a uniform and has no order date');
  const id = kid[M.X.ID]; assert(toOrder(master, season).includes(id), 'listed first');
  kid[U.GIVEN_FLAG] = '1'; assert(!toOrder(master, season).includes(id), 'the box clears it');
  kid[U.GIVEN_FLAG] = ''; assert(toOrder(master, season).includes(id), 'unticking puts it back');
  kid[U.GIVEN] = '2026-10-21'; assert(!toOrder(master, season).includes(id), 'a date clears it too');
});
test('an order date still clears the item, as before, and the box does not change who else is listed', () => {
  const { master, season } = load(), kids = withUniform(master).filter(p => !p[U.ORDERED]); assert(kids.length >= 2);
  const before = toOrder(master, season); kids[0][U.GIVEN_FLAG] = '1'; assert.deepStrictEqual(toOrder(master, season), before.filter(i => i !== kids[0][M.X.ID]));
  kids[1][U.ORDERED] = '2026-10-01'; assert(!toOrder(master, season).includes(kids[1][M.X.ID]));
});
test('the Uniform tracking report shows a tick for given with no date, and its "still to give" count follows the box', () => {
  const { master, calendar, season } = load(), ctx = { master, season, calendar, settings: {}, opts: {} }, kid = withUniform(master)[0], render = () => Reports.LIST.find(r => r.id === 'uniforms').render(ctx);
  const left = () => +/still to give to students: (\d+)/.exec(render())[1], name = M.fullName(kid), at = Reports.uniformHead(master).indexOf('Given'), mine = () => Reports.uniformRows(master).find(r => r[0] === Reports.esc(name));
  assert(at > 0); delete kid[U.GIVEN]; kid[U.GIVEN_FLAG] = ''; assert.strictEqual(mine()[at], ''); const n = left();
  kid[U.GIVEN_FLAG] = '1'; assert(/\u2713 \(no date\)/.test(mine()[at]), mine()[at]); assert.strictEqual(left(), n - 1, 'one fewer still to give');
  kid[U.GIVEN] = '2026-10-21'; assert.strictEqual(mine()[at], '2026-10-21', 'a date is shown as the date'); assert.strictEqual(left(), n - 1);
});
test('a new season clears the box with the other uniform dates, and an older file without it opens fine', () => {
  const { season, master } = load(), id = withUniform(master)[0][M.X.ID]; season.roster.people[id].v[U.GIVEN_FLAG] = '1';
  assert.strictEqual(Season.newSeason(season, '2027-28').roster.people[id].v[U.GIVEN_FLAG], undefined);
  assert.strictEqual(M.uniGiven(M.fromRoster(Season.fromJson(fs.readFileSync(path.join(dir, file), 'utf8')).roster).people[0]), false);
});
test('later steps settle earlier ones: given (date or box) needs no order or receive; received needs no order', () => {
  assert.strictEqual(M.uniToOrder({}), true); assert.strictEqual(M.uniToReceive({}), true);
  assert.strictEqual(M.uniToOrder({ [U.RECEIVED]: '2026-10-05' }), false, 'received needs no order date');
  assert.strictEqual(M.uniToReceive({ [U.RECEIVED]: '2026-10-05' }), false);
  [{ [U.GIVEN]: '2026-10-21' }, { [U.GIVEN_FLAG]: '1' }].forEach(g => { assert.strictEqual(M.uniToOrder(g), false); assert.strictEqual(M.uniToReceive(g), false); });
  assert.strictEqual(M.uniToOrder({ [U.ORDERED]: '2026-10-01' }), false); assert.strictEqual(M.uniToReceive({ [U.ORDERED]: '2026-10-01' }), true, 'ordered but not yet received still waits');
});
test('To do and the report counts follow the same rules', () => {
  const { master, season, calendar } = load(), kids = withUniform(master).filter(p => !p[U.ORDERED] && !M.uniGiven(p)); assert(kids.length >= 1);
  const kid = kids[0], id = kid[M.X.ID]; assert(toOrder(master, season).includes(id));
  kid[U.RECEIVED] = '2026-10-05'; assert(!toOrder(master, season).includes(id), 'received clears "to order"');
  const ctx = { master, season, calendar, settings: {}, opts: {} }, render = () => Reports.LIST.find(r => r.id === 'uniforms').render(ctx);
  const cnt = re => +re.exec(render())[1], order = () => cnt(/Still to order: (\d+)/), recv = () => cnt(/still to receive from Awana: (\d+)/);
  kid[U.RECEIVED] = ''; const o = order(), r = recv(); kid[U.GIVEN_FLAG] = '1'; assert.strictEqual(order(), o - 1); assert.strictEqual(recv(), r - 1);
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
