// Pure anonymizer rules for Planning Center data (no file access): which rule each export column gets, which keys of a data file the tool knows,
// and how the export record kept in roster.pcExport (R17) is scrubbed. make-test-data.js uses it and fails closed on anything not named here.
'use strict';

// Top-level keys the tool knows how to handle (anything else, of any type, stops the run).
const TOP_HANDLED = ['format', 'version', 'year', 'fake', 'config', 'roster', 'calendar', 'rotation', 'handbooks', 'attendance', 'games', 'awards', 'given', 'givenNoDate', 'held', 'flags', 'absences', 'doneBooks', 'received', 'adults', 'teamMoves', 'progress', 'history', 'progressNoDate', 'extraSheets', 'announcedNoDate', 'blueWings', 'blueOverrides', 'blueDrops', 'pastTurnout'];
const ROSTER_HANDLED = ['cols', 'pcCols', 'pcKeys', 'pcAsOf', 'pcSource', 'pcExport', 'people'];
const PERSON_HANDLED = ['pc', 'v'];
const CAPTURE_KEYS = ['at', 'hash', 'header', 'names', 'rows', 'blankRows', 'ids', 'loose'];      // the same list as Model.CAPTURE_KEYS (test/pc-capture.test.js checks they agree)
const HISTORY_ROSTER_OK = ['cols', 'pcCols', 'pcKeys', 'pcAsOf', 'pcSource', 'pcExport'];      // History paths under roster other than people

// One rule per column the app knows (every Model.PC_KNOWN column and role). A column that is not here is 'unknown': its value is emptied or becomes TEST.
//   keep: copied as it is (grade, class, money, dates of registration...)   name / regid / address / contactAddress / birthdate / medical / phone / email: the per-kind replacements
//   namelist: free text that is mostly people's names   freetext: free text, word-scrubbed
const COLUMN_RULES = {};
const add = (rule, cols) => cols.forEach(c => { COLUMN_RULES[c] = rule; });
add('keep', ['Grade', 'Age', 'Gender', 'Selection', 'Status', 'Submitted', 'Registration Cost', 'Attendee Balance Due', 'Registration Amount Paid', 'Balance Due', 'Attendance Status', 'Times Attended',
  'Paid by Check', 'Paid by Credit', 'Paid by Cash', 'Paid by Other', 'Paid by Scholarships', 'Paid by ACH', 'Discount Name', 'Discount Type', 'Discount Amount', 'Cubbies Vest', 'Sparks Vest', 'T&T shirt', 'TnT shirt',
  'Assignment Area: Classes', 'Home Address State']);
add('name', ['First Name', 'Last Name', 'Registration Contact First Name', 'Registration Contact Last Name']);
add('regid', ['Registration ID']);
add('address', ['Home Address Street', 'Home Address City', 'Home Address Zip']);
add('contactAddress', ['Registration Contact Address']);
add('birthdate', ['Birthdate']);
add('medical', ['Medical Notes', 'Does your child have any allergies or medical conditions that we should be made aware of?']);
add('phone', ['Mobile Phone Number', 'Home Phone Number', 'Work Phone Number', 'Other Phone Number', 'Registration Contact Phone Number']);
add('email', ['Home Email Address', 'Work Email Address', 'Other Email Address', 'Registration Contact Home Email Address', 'Registration Contact Work Email Address', 'Registration Contact Other Email Address']);
add('namelist', ['Emergency Contact', 'Please list the names of ALL adults with permission to pick up your child.', 'Please provide the primary phone number for a parent.']);
add('freetext', ['If you are purchasing a Awana shirt, please provide size.', 'Uniform']);

// The rule for a column as it may be stored: without a " (2)" repeat marker and without the "pc:" prefix; 'unknown' when nothing names it.
function ruleOf(col) {
  const c = String(col == null ? '' : col).replace(/^pc:/, '').replace(/ \(\d+\)$/, '');
  return Object.prototype.hasOwnProperty.call(COLUMN_RULES, c) ? COLUMN_RULES[c] : 'unknown';
}

// Keys of a data file this tool does not know, as paths ("top › futureThing"): counts of kinds only, never a value. `raw` is the file as parsed from disk (not through the app's loader, which drops what it does not know).
function unknownKeys(raw) {
  const out = [], seen = new Set(), push = p => { if (!seen.has(p)) { seen.add(p); out.push(p); } };
  Object.keys(raw || {}).forEach(k => { if (!TOP_HANDLED.includes(k)) push('top › ' + k); });
  const r = raw && raw.roster; if (r && typeof r === 'object' && !Array.isArray(r)) {
    Object.keys(r).forEach(k => { if (!ROSTER_HANDLED.includes(k)) push('roster › ' + k); });
    const people = r.people && typeof r.people === 'object' ? r.people : {};
    Object.keys(people).forEach(id => { const e = people[id]; if (e && typeof e === 'object') Object.keys(e).forEach(k => { if (!PERSON_HANDLED.includes(k)) push('person › ' + k); }); });
    const cap = r.pcExport; if (cap && typeof cap === 'object' && !Array.isArray(cap)) Object.keys(cap).forEach(k => { if (!CAPTURE_KEYS.includes(k)) push('pcExport › ' + k); });
  }
  return out;
}

const initials = s => typeof s === 'string' ? s.replace(/\bFBK\b/g, 'AWANA') : s;
// The export record, scrubbed: ids renamed (idOf throws for one it does not know), each kept row scrubbed column by column (anonRecord is the tool's own per-column rules), the hash emptied
// (it would identify the real export), the header with the church's initials replaced. Counts and the time are kept.
function anonCapture(cap, { anonRecord, idOf }) {
  const out = {};
  Object.keys(cap).forEach(k => { if (!CAPTURE_KEYS.includes(k)) throw new Error('make-test-data does not know the export record key "' + k + '"'); });
  out.at = cap.at; out.rows = cap.rows; out.blankRows = cap.blankRows; out.hash = '';
  const names = (cap.names || []).map(initials);
  out.header = (cap.header || []).map(initials); out.names = names;
  out.ids = {}; Object.keys(cap.ids || {}).forEach(id => { out.ids[idOf(id)] = cap.ids[id]; });
  out.loose = (cap.loose || []).map(row => {
    const rec = {}; (cap.names || []).forEach((n, i) => { rec[n] = row[i] == null ? '' : row[i]; });
    const a = anonRecord(rec); return (cap.names || []).map(n => a[n] == null ? '' : a[n]);
  });
  return out;
}

// ---------- phone numbers of any length (CR-01) ----------
// A phone is any run of 7 or more digits, with or without separators. The old rule only caught 9 and 10 digit numbers, so "555-1234" in a free-text or emergency phone box passed through.
const PHONE_RE = /(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]*\d{3}[\s.\-]*\d{4}|\b\d{3}[\s.\-]\d{3}[\s.\-]\d{3}\b|\b\d{3}[\s.\-]\d{4}\b|\b\d{7,9}\b/g;
const SHORT_AREAS = ['937', '513', '614', '330', '419', '440', '216', '567'];
const hashOf = s => { let h = 5381; for (const c of String(s)) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return h; };
// A short number (7 to 9 digits) becomes the last N digits of a 555-01xx fake, chosen from the digits themselves (not the seeded random sequence, so names, IDs and the rest of the test data do not move). Never the same digits.
function fakeShortPhone(core) {
  const n = String(core).length; let h = hashOf(core), f = '';
  for (let i = 0; i < 40; i++) { f = (SHORT_AREAS[h % SHORT_AREAS.length] + '55501' + String(Math.floor(h / 8) % 100).padStart(2, '0')).slice(10 - n); if (f !== String(core)) break; h = hashOf(String(h) + i); }
  return f;
}
// Every run of 7 or more digits in the text (separators ignored), as bare digits. Dates (2026-11-16, with a time), ZIP+4 and the date at the start of a saved export's file name (20261117 -- sc-awana-club…, which History records) are not phone numbers.
function phoneRuns(text) {
  const t = String(text == null ? '' : text).replace(/\d{4}-\d{2}-\d{2}(?:[T ][\d:.Z+\-]*)?/g, ' ').replace(/\b\d{5}-\d{4}\b/g, ' ').replace(/\b20\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?:-\d{1,2})? -- /g, ' '), out = [];
  t.replace(/\d[\d\s().\-]{5,}\d|\d{7,}/g, m => { const d = m.replace(/\D/g, ''); if (d.length >= 7) out.push(d); return m; });
  return out;
}
// How many phone numbers in realText are still in outText (and not in exceptText, such as config and calendar). A count only: values are never printed.
function leakingPhones(realText, outText, exceptText) {
  const out = new Set(phoneRuns(outText)), skip = new Set(phoneRuns(exceptText || ''));
  return [...new Set(phoneRuns(realText))].filter(d => !skip.has(d) && out.has(d)).length;
}

module.exports = { PHONE_RE, fakeShortPhone, phoneRuns, leakingPhones, TOP_HANDLED, ROSTER_HANDLED, PERSON_HANDLED, CAPTURE_KEYS, HISTORY_ROSTER_OK, COLUMN_RULES, ruleOf, unknownKeys, anonCapture, initials };
