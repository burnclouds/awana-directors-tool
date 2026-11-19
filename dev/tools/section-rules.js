// N9 point 6: one rules table for every section in Season.SECTIONS, read by make-test-data.js (fail closed) and by test/section-rules.test.js (coverage).
// A section with no rule stops make-test-data before it writes anything, so a new section cannot reach the public TEST data unchanged.
// Rules:
//   by-person        keys are person IDs: renamed to the invented IDs (remap)
//   by-person-text   as by-person, and free text inside is anonymized
//   by-date-person   date, then person ID: each date's keys renamed
//   config           the club's settings: FBK becomes AWANA, Drive folder IDs removed, to-do ignores and the team plan rekeyed
//   scrub-text       plain settings, calendar or rotation: FBK becomes AWANA, nothing else
//   roster           people and the Planning Center export, through the per-column anonymizer (anon-pc.js)
//   deep-scrub       free text about people: anonymized field by field
//   copy             kept as it is: holds no names or free text (checked by the leak scan in make-test-data.js)
//   drop             not copied at all: free text written about real children or volunteers (flags, absences)
(function (root) {
  const RULES = {
    config: 'config', handbooks: 'by-person', attendance: 'by-date-person', awards: 'by-date-person', given: 'by-person', givenNoDate: 'by-person',
    held: 'by-person', flags: 'drop', doneBooks: 'by-person', received: 'by-person', adults: 'deep-scrub', teamMoves: 'by-person', games: 'copy',
    progress: 'by-person', progressNoDate: 'by-person', extraSheets: 'by-person', announcedNoDate: 'by-person', blueWings: 'by-person', blueOverrides: 'by-person-text',
    blueDrops: 'by-person', pastTurnout: 'by-person', absences: 'drop', roster: 'roster', calendar: 'scrub-text', rotation: 'scrub-text',
  };
  const RULE_KINDS = ['config', 'by-person', 'by-person-text', 'by-date-person', 'scrub-text', 'roster', 'deep-scrub', 'copy', 'drop'];
  const api = { RULES, RULE_KINDS };
  if (typeof module !== 'undefined') module.exports = api; else root.SectionRules = api;
})(this);
