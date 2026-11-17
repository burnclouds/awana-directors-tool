#!/usr/bin/env node
// One-time migration: turn the records extracted from the Google Sheets (extract-sheets.py) into a season file.
// usage: node build-season.js records.json roster.csv calendar.csv out.json [year]
// Prints a report of Unique IDs that are not on the roster and dates that are not club nights on the calendar.
// Nothing is dropped: unknown IDs and off-calendar dates are kept and listed so you can decide what they are.
const fs = require('fs'), path = require('path');
const app = path.join(__dirname, '..', '..', 'app');
const M = require(path.join(app, 'model.js')), Calendar = require(path.join(app, 'calendar.js')), Season = require(path.join(app, 'season.js'));

function build(records, master, calRows, year) {
  const season = Season.blank(year);
  ['attendance', 'games', 'awards', 'handbooks'].forEach(k => { season[k] = JSON.parse(JSON.stringify(records[k] || {})); });
  const known = new Set(master.people.map(p => p[M.X.ID]));
  const ids = new Set();
  Object.values(season.attendance).forEach(n => Object.keys(n).forEach(i => ids.add(i)));
  Object.values(season.awards).forEach(n => Object.keys(n).forEach(i => ids.add(i)));
  Object.keys(season.handbooks).forEach(i => ids.add(i));
  const nights = Season.counted(calRows);
  const dates = new Set(Object.keys(season.attendance).concat(Object.keys(season.games), Object.keys(season.awards)));
  return { season, report: {
    unknownIds: [...ids].filter(i => !known.has(i)).sort(),
    offCalendar: [...dates].filter(d => !nights[d]).sort(),
  } };
}

if (require.main === module) {
  const [rec, roster, cal, out, year] = process.argv.slice(2);
  if (!out) { console.error('usage: node build-season.js records.json roster.csv calendar.csv out.json [year]'); process.exit(2); }
  const r = build(JSON.parse(fs.readFileSync(rec, 'utf8')), M.loadMaster(fs.readFileSync(roster, 'utf8'), new Date().toLocaleDateString('en-CA')),
    Calendar.load(fs.readFileSync(cal, 'utf8')), year || '2026-27');
  fs.writeFileSync(out, Season.toJson(r.season));
  console.log('wrote', out);
  console.log('unknown IDs (' + r.report.unknownIds.length + '):', r.report.unknownIds.join(', ') || 'none');
  console.log('dates not on the calendar (' + r.report.offCalendar.length + '):', r.report.offCalendar.join(', ') || 'none');
}
module.exports = { build };
