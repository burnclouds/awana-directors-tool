#!/usr/bin/env node
// Build a starting master CSV (the file the app saves and re-opens) from a Planning Center export,
// optionally importing a colors file. Uses the app's own code, so the result is exactly what the app would save.
// usage: node make-master.js export.csv out.csv [colors.csv]
const fs = require('fs'), path = require('path');
const app = path.join(__dirname, '..', '..', 'app');
const M = require(path.join(app, 'model.js')), Teams = require(path.join(app, 'teams.js'));
const [exp, out, colors] = process.argv.slice(2);
if (!out) { console.error('usage: node make-master.js export.csv out.csv [colors.csv]'); process.exit(2); }
const master = M.loadMaster(fs.readFileSync(exp, 'utf8'), new Date().toLocaleDateString('en-CA'));
if (colors) {
  const r = Teams.importList(master, null, fs.readFileSync(colors, 'utf8'));
  console.log('colors set:', r.set, '| unmatched:', r.unmatched.length, '| invalid:', r.invalid.length, '| ambiguous:', r.ambiguous.length, '| skipped:', r.skipped.length);
}
fs.writeFileSync(out, M.toCsv(master));
const kids = master.people.filter(p => M.isActive(p) && M.isClubber(p) && Teams.GROUPS.includes(M.groupOf(M.room(p))));
const blank = kids.filter(p => !Teams.colorOf(p, 'Q1')).length;
console.log('wrote', out, '|', master.people.length, 'people |', kids.length, 'Sparks/T&T kids,', blank, 'without colors yet (use Color teams > Assign blanks)');
