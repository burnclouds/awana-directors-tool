#!/usr/bin/env node
// Adds a small color team plan to the invented demo data file, so "Try it out" shows projected (dashed) quarters and a few hand-set colors.
// Q3 and Q4 are marked as projected for every Sparks and T&T child who has a color there, except about one child in twelve in Q3, whose color
// stays unmarked: an unmarked color in an open quarter is a pin (see teamplan.js). Q1 and Q2 are left alone (they are played).
// Usage: node demo-plan.js <demo data file>      rewrites the file in place. It refuses a file that is not flagged "fake": true.
// make-test-data.js calls add() on the file it writes, so a regenerated demo keeps the plan.
const fs = require('fs'), path = require('path');
const app = path.join(__dirname, '..', 'app');
const Season = require(path.join(app, 'season.js')), M = require(path.join(app, 'model.js')), TeamPlan = require(path.join(app, 'teamplan.js'));

function add(text) {
  const s = Season.fromJson(text);
  if (!s.fake) throw new Error('Refusing: the file is not flagged "fake": true. A demo plan is never added to a real data file.');
  const master = M.fromRoster(s.roster);
  master.people.filter(p => M.isActive(p) && M.isClubber(p) && ['Sparks', 'T&T'].includes(M.groupOf(M.room(p)))).forEach((p, i) => {
    ['Q3', 'Q4'].forEach(q => { const color = p['team:' + q]; if (color && !(q === 'Q3' && i % 12 === 5)) TeamPlan.setProjected(s, p[M.X.ID], q, color); });
  });
  return Season.toJson(s);
}

if (require.main === module) {
  const file = process.argv[2]; if (!file) { console.error('Usage: node demo-plan.js <demo data file>'); process.exit(2); }
  try { fs.writeFileSync(file, add(fs.readFileSync(file, 'utf8'))); console.log('demo plan added to ' + file); } catch (err) { console.error(err.message); process.exit(1); }
}
module.exports = { add };
