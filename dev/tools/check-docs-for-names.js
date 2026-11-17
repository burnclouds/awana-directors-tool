#!/usr/bin/env node
// Finds real children's names in the files git tracks, so they can be taken out before the repository is ever shared.
//   node dev/tools/check-docs-for-names.js <real-data.json> [--root <repo folder>] [--strict] [--show]
// Reads the roster of a real data file (keep that file outside the repository) and scans every tracked .md .txt .js .html .json .csv file
// except the invented ones (dev/test-data, deploy/app/try). It prints file:line and a count, NEVER the name itself; the list lives in
// memory only and is not written anywhere. Exit 1 if anything is found.
//   default   a FULL NAME: a person's first and last name next to each other ("First Last" or "Last, First"), or an adult's name as typed.
//   --strict  also any single first or last name word of 4+ letters that is not an ordinary English word (needs /usr/share/dict/words to
//             skip words like "Grace"). Many invented test names equal a real first name, so expect hits in the test tools.
//   --show    also print each hit line with the name replaced by [NAME], to judge whether it is a real child or an invented example.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const Season = require('../app/season.js'), M = require('../app/model.js');
const { C } = M;

const args = process.argv.slice(2), flag = n => { const i = args.indexOf(n); return i < 0 ? null : args.splice(i, 2)[1]; };
const bool = n => { const i = args.indexOf(n); if (i < 0) return false; args.splice(i, 1); return true; };
const show = bool('--show'), strict = bool('--strict');
const root = path.resolve(flag('--root') || path.join(__dirname, '..', '..'));
const [dataPath] = args;
if (!dataPath) { console.error('usage: node check-docs-for-names.js <real-data.json> [--root <repo folder>] [--strict] [--show]'); process.exit(2); }

const data = Season.fromJson(fs.readFileSync(dataPath, 'utf8'));
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), norm = s => String(s || '').trim().replace(/\s+/g, ' ').replace(/’/g, "'");
const pairs = new Set(), single = new Set();
const english = new Set(); try { fs.readFileSync('/usr/share/dict/words', 'utf8').split('\n').forEach(w => { if (w && w === w.toLowerCase()) english.add(w); }); } catch (e) { /* no dictionary: nothing is skipped */ }
const word = w => { w = w.toLowerCase(); if (w.length >= 4 && !english.has(w)) single.add(w); };
const people = Object.values(data.roster && data.roster.people || {}).map(e => e.pc || {});
people.forEach(pc => {
  [[pc[C.FIRST], pc[C.LAST]], [pc['Registration Contact First Name'], pc['Registration Contact Last Name']]].forEach(([f, l]) => {
    f = norm(f); l = norm(l); if (f.length < 2 || l.length < 2) return;
    pairs.add(esc(f) + "[ ,.]{1,3}" + esc(l)); pairs.add(esc(l) + "[ ,.]{1,3}" + esc(f));      // "First Last" and "Last, First"
    (f + ' ' + l).match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’]*/g).forEach(word);
  });
});
Object.values(data.adults || {}).forEach(l => (l || []).forEach(a => { const n = norm(a.n); if (/ /.test(n) && n.length >= 5) pairs.add(esc(n)); }));
if (!pairs.size) { console.error('no names found in that data file'); process.exit(2); }
const edge = "(^|[^A-Za-zÀ-ÿ'])", tail = "(?![A-Za-zÀ-ÿ'])";
const fullRe = new RegExp(edge + '(?:' + [...pairs].join('|') + ')' + tail, 'i');
const oneRe = single.size ? new RegExp(edge + '(?:' + [...single].map(esc).join('|') + ')' + tail, 'i') : null;
const maskRe = new RegExp(fullRe.source + (strict && oneRe ? '|' + oneRe.source : ''), 'gi');
const hitRe = strict && oneRe ? new RegExp('(?:' + fullRe.source + ')|(?:' + oneRe.source + ')', 'i') : fullRe;

const tracked = cp.execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const SKIP = [/^dev\/test-data\//, /^deploy\/app\/try\//, /(^|\/)package-lock\.json$/];
let found = 0, files = 0;
tracked.filter(f => /\.(md|txt|js|html|json|csv)$/.test(f) && !SKIP.some(r => r.test(f))).forEach(f => {
  let text; try { text = fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { return; }
  const hits = []; text.split('\n').forEach((line, i) => { if (hitRe.test(line)) { hits.push(i + 1); if (show) console.log('  ' + f + ':' + (i + 1) + ': ' + (m => m.slice(Math.max(0, m.indexOf('[NAME]') - 70), m.indexOf('[NAME]') + 90))(line.replace(maskRe, '$1[NAME]').trim())); } });
  if (hits.length) { files++; found += hits.length; console.log(f + ':' + hits.slice(0, 20).join(',') + (hits.length > 20 ? ',… (' + hits.length + ' lines)' : '')); }
});
console.log(found ? found + ' line(s) in ' + files + ' file(s) contain ' + (strict ? 'a name' : 'a full name') + ' from that data file (the names are not printed). Take them out, then run this again.' : 'no ' + (strict ? 'name' : 'full name') + ' from that data file in any tracked file (' + pairs.size + ' name patterns checked, ' + tracked.length + ' tracked files)');
process.exit(found ? 1 : 0);
