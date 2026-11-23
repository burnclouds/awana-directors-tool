#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const Model = require('../app/model.js');
const Pace = require('../app/pace.js');
const Season = require('../app/season.js');

function reviewPace(season) {
  const calendar = season.calendar;
  const rows = Pace.rows({ season, calendar, master: Model.fromRoster(season.roster) });
  const held = Season.heldNights(season, calendar);
  const median = values => {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return Pace.round((sorted[mid] + sorted[Math.floor((sorted.length - 1) / 2)]) / 2, 2);
  };
  const groups = ['Sparks', 'T&T'].map(group => {
    const all = rows.filter(row => row.group === group);
    const rated = all.filter(row => row.roomEntered && row.overall !== null);
    return {
      group,
      clubbers: all.length,
      classesWithoutSignoffs: new Set(all.filter(row => !row.roomEntered).map(row => row.room)).size,
      withDatedCoreSignoffs: all.filter(row => row.core > 0).length,
      eligibleForWatch: rated.length,
      eligibleForTrend: rated.filter(row => row.prior !== null).length,
      medianOverall: median(rated.map(row => row.overall)),
      medianRecent: median(rated.map(row => row.recent)),
      watchLists: Object.fromEntries(Object.keys(Pace.LISTS).map(list => [list, rated.filter(row => row.list === list).length]))
    };
  });
  return { heldNights: held.length, attendanceThrough: held.at(-1) || null, thresholds: { ...Pace.CFG }, groups };
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node dev/tools/review-pace.js <season.json>');
    process.exitCode = 2;
  } else {
    try {
      const season = Season.fromJson(fs.readFileSync(file, 'utf8'));
      console.log(JSON.stringify(reviewPace(season), null, 2));
    } catch {
      console.error('Could not review the season file.');
      process.exitCode = 2;
    }
  }
}

module.exports = { reviewPace };
