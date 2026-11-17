#!/usr/bin/env node
// Why does the Validate tab say "the current data differs from what the history says"? Prints COUNTS AND SHAPES ONLY, so the result can be shared.
//   node dev/tools/replay-report.js <data.json>
// Output:
//   History entries: N   Differences: D   Changed by this open's upgrades: U
//   count  kind      shape                                         last logged (day)
// kind: replay+ (the replay has it, the data does not), data+ (the data has it, the replay does not), changed.
// A shape names the section and the kind of key, never a person, a value or a record date: ids print as <id>, dates as <date>, and any word that is not a
// standard award, a Planning Center column, a book, a group, a team or a config key prints as <award> (in an award section) or <key>.
// "last logged" is the day (not a label) of the newest History entry with a change at or above the path. Read-only. Exit 0 = no differences, 1 = differences, 2 = usage or unreadable.
const fs = require('fs'), path = require('path');
const Season = require('../app/season.js'), Catalog = require('../app/catalog.js');
const file = process.argv[2];
if (!file) { console.error('usage: node replay-report.js <data.json>'); process.exit(2); }
let text; try { text = fs.readFileSync(file, 'utf8').replace(/^﻿/, ''); } catch (e) { console.error('cannot read that file'); process.exit(2); }
let raw; try { raw = JSON.parse(text); } catch (e) { console.error('not valid JSON'); process.exit(2); }
let s; try { s = Season.fromJson(text); } catch (e) { console.error('the app cannot open this file'); process.exit(2); }

const cfg = Catalog.defaultConfig(), known = new Set();
const addAll = x => { if (Array.isArray(x)) x.forEach(addAll); else if (x && typeof x === 'object') Object.keys(x).forEach(k => { known.add(k); addAll(x[k]); }); else if (typeof x === 'string' && x.length <= 40) known.add(x); };
addAll(cfg.awardLists); Object.keys(cfg).forEach(k => known.add(k)); Object.keys(cfg.books).forEach(k => known.add(k));
['Puggles', 'Cubbies', 'Sparks', 'T&T', 'Red', 'Blue', 'Green', 'Yellow', 'common', 'pc', 'v', 'people', 'cols', 'pcCols', 'pcKeys', 'pcAsOf', 'pcSource'].forEach(k => known.add(k));
Season.SECTIONS.forEach(k => known.add(k)); Season.MARKS.forEach(k => known.add(k));
((raw.roster || {}).pcCols || []).forEach(c => { if (typeof c === 'string' && c.length <= 40) known.add(c); });
const OLD = /^(Red|Green|Blue) Jewel [1-4]$|^(HG|WR|SS|AoG|DoG|GiA|EoG|AS|HC) (Red|Green|Blue) (Jewel|Emblem) [1-4]$|^(Blue|Red|Green) Emblem [1-4]$|^SS Review Emblem - Yellow$/;
const AWARD_SECTIONS = new Set(['awards', 'given', 'givenNoDate', 'held', 'announcedNoDate', 'blueDrops', 'blueOverrides', 'blueWings', 'received', 'doneBooks']);
const people = (raw.roster && raw.roster.people) || {};
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const part = (x, i, sect) => {
  const t = String(x);
  if (i === 0) return known.has(t) ? t : '<key>';
  if (t in people || /^\d+_/.test(t)) return '<id>';
  if (DATE.test(t)) return '<date>';
  if (/^\d+$/.test(t)) return '<n>';
  if (known.has(t) || OLD.test(t)) return t;
  return AWARD_SECTIONS.has(sect) ? '<award>' : '<key>';
};
const shapeOf = p => p.map((x, i) => part(x, i, String(p[0]))).join(' › ');

const diffs = Season.replayDiff(s), hist = s.history || [];
const startsWith = (a, b) => { const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) if (String(a[i]) !== String(b[i])) return false; return true; };
const groups = {};
diffs.forEach(d => {
  const kind = d.o === undefined ? 'data+' : d.n === undefined ? 'replay+' : 'changed', shape = shapeOf(d.p), key = kind + '|' + shape;
  let day = ''; hist.forEach(e => { if ((e.changes || []).some(c => startsWith(c.p, d.p)) && typeof e.t === 'string' && /^\d{4}-\d{2}-\d{2}/.test(e.t) && e.t.slice(0, 10) > day) day = e.t.slice(0, 10); });
  const g = groups[key] = groups[key] || { kind, shape, n: 0, day: '' }; g.n++; if (day > g.day) g.day = day;
});

// What this open's upgrades changed (a count only): the raw sections against what fromJson made of them, outside the roster and the history.
let upgraded = 0;
try { upgraded = Season.diff(Season.snapshot(raw), Season.snapshot(s)).filter(c => c.p[0] !== 'roster' && c.p[0] !== 'history').length; } catch (e) { upgraded = -1; }

console.log('History entries: ' + hist.length + '   Differences: ' + diffs.length + "   Changed by this open's upgrades: " + (upgraded < 0 ? 'unknown' : upgraded));
console.log('count  kind      shape' + ' '.repeat(40) + 'last logged (day)');
Object.values(groups).sort((a, b) => b.n - a.n || a.shape.localeCompare(b.shape)).forEach(g => console.log(String(g.n).padStart(5) + '  ' + g.kind.padEnd(8) + '  ' + g.shape.padEnd(44) + ' ' + (g.day || '')));
process.exit(diffs.length ? 1 : 0);
