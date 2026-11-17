#!/usr/bin/env node
// Runs the app's file check (the Validate tab) on a data file and prints COUNTS ONLY, so the result can be shared without sharing anything about the children.
//   node dev/tools/check-file.js <data.json>
// One line per (level, check) pair: "<level> <check> <count>", sorted, then "total: <e> errors, <w> warnings, <i> info".
// No file name, no message text, no id and no name is printed. Read-only. Exit 0 = no errors, 1 = at least one error, 2 = usage problem or unreadable file.
const fs = require('fs');
const V = require('../app/validate.js');
const file = process.argv[2];
if (!file) { console.error('usage: node check-file.js <data.json>'); process.exit(2); }
let text; try { text = fs.readFileSync(file, 'utf8'); } catch (e) { console.error('cannot read that file'); process.exit(2); }
const r = V.validate(text, require('path').basename(file)), count = {}, tot = { error: 0, warn: 0, info: 0 };
r.findings.forEach(f => { const k = f.level + ' ' + (f.check || 'file'); count[k] = (count[k] || 0) + 1; tot[f.level]++; });
Object.keys(count).sort().forEach(k => console.log(k + ' ' + count[k]));
console.log('total: ' + tot.error + ' errors, ' + tot.warn + ' warnings, ' + tot.info + ' info');
process.exit(tot.error ? 1 : 0);
