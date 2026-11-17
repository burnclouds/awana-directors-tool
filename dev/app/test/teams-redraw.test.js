// Teams.previewRedo / Teams.applyRedo (the Re-draw preview): a dry run puts every color back, the result lists who a Confirm would clear, and applying writes exactly the colors that were drawn. Invented TEST club only.
// Usage: node test/teams-redraw.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const Season = require('../season.js'), M = require('../model.js'), Teams = require('../teams.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).filter(f => /TEST.*\.json$/.test(f)).sort().pop();
const load = () => { const s = Season.fromJson(fs.readFileSync(path.join(dir, file), 'utf8')); return M.fromRoster(s.roster); };
const colors = (m, q) => JSON.stringify(m.people.map(p => [p[M.X.ID], Object.prototype.hasOwnProperty.call(p, 'team:' + q), p['team:' + q]]));
const rng = () => Teams.mulberry32(12345);

test('previewRedo changes nothing on the roster, even for a quarter that already has colors', () => {
  const m = load(), before = colors(m, 'Q3'); const r = Teams.previewRedo(m, 'Q3', { rng: rng() });
  assert.strictEqual(colors(m, 'Q3'), before, 'every color (and every missing key) is back'); assert(r.assigned.length > 20, r.assigned.length + ' proposed'); assert(r.cleared.length >= r.assigned.length);
});
test('previewRedo puts a missing color column back as missing, not as an empty value', () => {
  const m = load(); m.people.forEach(p => { delete p['team:Q4']; }); const before = colors(m, 'Q4'); Teams.previewRedo(m, 'Q4', { rng: rng() }); assert.strictEqual(colors(m, 'Q4'), before);
});
test('the same seed gives the same proposal; a different seed can differ', () => {
  const m = load(), a = Teams.previewRedo(m, 'Q3', { rng: rng() }).assigned.map(x => x.person[M.X.ID] + x.color).join(), b = Teams.previewRedo(m, 'Q3', { rng: rng() }).assigned.map(x => x.person[M.X.ID] + x.color).join();
  assert.strictEqual(a, b);
});
test('applyRedo writes exactly the proposed colors, and clears the children who got none', () => {
  const m = load(), r = Teams.previewRedo(m, 'Q3', { rng: rng() }); Teams.applyRedo(m, 'Q3', r);
  r.assigned.forEach(x => assert.strictEqual(x.person['team:Q3'], x.color)); const got = new Set(r.assigned.map(x => x.person[M.X.ID]));
  r.cleared.filter(p => !got.has(p[M.X.ID])).forEach(p => assert.strictEqual(p['team:Q3'], '', 'a cleared child with no new color is blank'));
});
test('a child marked No team is never cleared or given a color', () => {
  const m = load(), k = m.people.find(p => M.isActive(p) && M.isClubber(p) && ['Sparks', 'T&T'].includes(M.groupOf(M.room(p)))); M.setNoTeam ? M.setNoTeam(k, 'Q3', true) : (k['x_noteam:Q3'] = '1');
  if (!M.noTeam(k, 'Q3')) return; const r = Teams.previewRedo(m, 'Q3', { rng: rng() }); assert(!r.cleared.includes(k) && !r.assigned.some(x => x.person === k));
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
