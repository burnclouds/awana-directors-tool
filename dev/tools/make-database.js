#!/usr/bin/env node
// One-time move to the single data file. Reads the old files and writes one JSON that holds all of it:
// roster extras (colors, uniforms, notes, active flags, pending Planning Center changes), the full Planning Center record as of the
// export, calendar, rotation and the season records. The Planning Center export stays the only CSV; open a newer one to refresh.
//   node make-database.js --export pc.csv --calendar cal.csv --rotation rot.csv --season season.json   (writes awana-<year>-<yyyymmdd-hhmmss>.json; --out may name the file, but it must carry that tag)
//                         [--master old-master.csv | --colors colors.csv]
// With --master the owned fields come from the old master CSV; otherwise the roster is built from the export and --colors.
const fs = require('fs'), path = require('path');
const app = path.join(__dirname, '..', 'app');
const M = require(path.join(app, 'model.js')), Teams = require(path.join(app, 'teams.js')), Season = require(path.join(app, 'season.js')),
  Calendar = require(path.join(app, 'calendar.js')), Rotation = require(path.join(app, 'rotation.js'));

function build(o) {
  const today = o.today || new Date().toLocaleDateString('en-CA');
  const master = M.loadMaster(o.masterText || o.exportText, today);
  if (!o.masterText && o.colorsText) Teams.importList(master, null, o.colorsText);
  master.pcAsOf = M.exportDate(o.exportName, today); master.pcSource = o.exportName || '';
  const season = o.seasonText ? Season.fromJson(o.seasonText) : Season.blank(o.year || '');
  season.roster = M.toRoster(master);
  if (o.calendarText) season.calendar = Calendar.load(o.calendarText);
  if (o.rotationText) season.rotation = Rotation.load(o.rotationText);
  season.history = [];
  const colors = master.people.reduce((n, p) => n + Teams.QUARTERS.filter(q => p['team:' + q]).length, 0);
  return { season, report: { people: master.people.length, colors, calendarRows: season.calendar.length, rotationRows: season.rotation.length, nights: Object.keys(season.attendance).length } };
}

if (require.main === module) {
  const a = {}; process.argv.slice(2).forEach((v, i, all) => { if (v.startsWith('--')) a[v.slice(2)] = all[i + 1]; });
  if (!a.export) { console.error('usage: node make-database.js --export pc.csv [--out awana-2026-27-20261029-070509.json] [--master m.csv | --colors c.csv] [--calendar c.csv] [--rotation r.csv] [--season s.json]'); process.exit(2); }
  const rd = p => p ? fs.readFileSync(p, 'utf8') : '';
  const { season, report } = build({ exportName: path.basename(a.export), exportText: rd(a.export), masterText: rd(a.master), colorsText: rd(a.colors), calendarText: rd(a.calendar), rotationText: rd(a.rotation), seasonText: rd(a.season) });
  const out = a.out || Season.fileName(season.year);
  if (!/^awana-.+-\d{8}-\d{6}\.json$/.test(path.basename(out))) { console.error('the file name must end in a yyyymmdd-hhmmss tag, e.g. awana-2026-27-20261029-070509.json'); process.exit(2); }
  fs.writeFileSync(out, Season.toJson(season));
  console.log('wrote', out, JSON.stringify(report));
}
module.exports = { build };
