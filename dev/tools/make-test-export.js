#!/usr/bin/env node
// Builds a Planning Center export for testing imports: a base export (normally the anonymized one from make-test-data.js, so no real child is in
// the test files) plus 15 invented registrations that between them cover
// the corner cases the import, the export check and the To do page have to handle. Nobody in the 15 is a real person: names, phone
// numbers (555-01xx), addresses and emails (example.com / example.org) are made up. Colors are not part of a Planning Center export.
//   node make-test-export.js [base-export.csv] [out-dir]      writes "20261103 -- demo-club-2026-27 TEST.csv" and TEST-CASES.md
// The rows live in CASES below; the generator is deterministic, so running it again gives the same file.
const fs = require('fs'), path = require('path');
const Csv = require('../app/csv.js');
const dev = path.join(__dirname, '..');
const src = process.argv[2] || path.join(dev, 'test-data', '20261028 -- demo-club-2026-27 TEST.csv');
const outDir = process.argv[3] || path.join(dev, 'test-data');
const AS_OF = '2026-11-03', OUT_NAME = '20261103 -- demo-club-2026-27 TEST.csv';

const rows = Csv.parse(fs.readFileSync(src, 'utf8')).filter(r => r.some(c => c !== ''));
const header = rows[0], col = prefix => { const i = header.findIndex(h => h.startsWith(prefix)); if (i < 0) throw new Error('no column ' + prefix); return header[i]; };
const ALLERGY = col('Does your child have any allergies'), PICKUP = col('Please list the names of ALL adults'), PRIMARY = col('Please provide the primary phone'), SHIRT = col('If you are purchasing');

// date of birth for a given age on AS_OF, `daysSince` days after the birthday
const born = (age, daysSince) => { const [y, m, d] = AS_OF.split('-').map(Number), t = new Date(Date.UTC(y - age, m - 1, d - (daysSince || 0))); return (t.getUTCMonth() + 1) + '/' + t.getUTCDate() + '/' + t.getUTCFullYear(); };
const fam = (n, last, phone, email) => ({
  'Registration ID': '9000' + String(n).padStart(4, '0'), 'Last Name': last, 'Home Address Street': (100 + n) + ' Fictional Way', 'Home Address City': 'Kettering', 'Home Address State': 'OH', 'Home Address Zip': '45429',
  'Registration Contact First Name': 'Pat', 'Registration Contact Last Name': last, 'Registration Contact Phone Number': phone, 'Registration Contact Home Email Address': email,
  'Mobile Phone Number': phone, 'Home Email Address': email, [PRIMARY]: phone, 'Emergency Contact': 'Pat ' + last + ' - ' + phone,
});
const base = { Status: 'Active', Submitted: '10/30/2026 at 6:15pm', 'Registration Cost': '$70', 'Attendee Balance Due': '$0', 'Registration Amount Paid': '$70', 'Balance Due': '$0', 'Paid by Credit': '$70',
  'Paid by Check': '$0', 'Paid by Cash': '$0', 'Paid by Other': '$0', 'Paid by Scholarships': '$0', 'Paid by ACH': '$0', [ALLERGY]: 'No', [SHIRT]: 'N/A', Selection: 'Clubber (Cubbies, Sparks & T&T only)' };

const CASES = [
  { id: 1, what: 'Puggles toddler, age 2: the plain case for the youngest group. Emoji in the notes.',
    row: Object.assign(fam(101, 'Calloway', '(937) 555-0101', 'calloway.family@example.com'), { 'First Name': 'Wren', Gender: 'Female', Birthdate: born(2, 100), Age: '2', Grade: '', Selection: 'Puggles (Ages 2-3 years)', 'Registration Cost': '$35', 'Registration Amount Paid': '$35', 'Paid by Credit': '$35',
      'Medical Notes': 'Loves dinosaurs \u{1F60A}. Naps at 2pm; bring blanket.', 'Assignment Area: Classes': 'Puggles' }),
    expect: 'No action. Imports as a Puggle.' },
  { id: 2, what: 'Puggle who is 3 years 11 months, Pre-K, with NO class assigned, and a first name padded with spaces. Sibling of case 3 (same registration ID).',
    row: Object.assign(fam(102, 'Fenwick', '(937) 555-0102', 'fenwick.family@example.com'), { 'First Name': '  Nora  ', Gender: 'Female', Birthdate: born(3, 330), Age: '3', Grade: 'Pre-K', Selection: 'Puggles (Ages 2-3 years)', 'Registration Cost': '$35', 'Registration Amount Paid': '$35', 'Paid by Credit': '$35', 'Assignment Area: Classes': '' }),
    expect: 'Export check: name has extra spaces; no room. To do: assign a class (Puggles or Cubbies).' },
  { id: 3, what: 'Cubbies Pre-K, age 4, bought a Cubbies vest and still owes $35. Sibling of case 2.',
    row: Object.assign(fam(102, 'Fenwick', '(937) 555-0102', 'fenwick.family@example.com'), { 'First Name': 'Linus', Gender: 'Male', Birthdate: born(4, 40), Age: '4', Grade: 'Pre-K', 'Cubbies Vest': '1', 'Registration Amount Paid': '$35', 'Attendee Balance Due': '$35', 'Balance Due': '$35', 'Paid by Credit': '$35', 'Assignment Area: Classes': 'Cubbies' }),
    expect: 'To do: uniform to order, balance due. A new sibling in a family the file already has a registration ID for.' },
  { id: 4, what: 'Kindergartener, age 5, name typed in all lower case, NO class assigned (this club puts Kindergarten in Sparks).',
    row: Object.assign(fam(104, 'mcdonald', '9375550104', 'mcdonald.family@example.com'), { 'First Name': 'olivia', Gender: 'Female', Birthdate: born(5, 200), Age: '5', Grade: 'Kindergarten', [PICKUP]: 'Grandma Pat & Papa Joe', 'Assignment Area: Classes': '' }),
    expect: 'Export check: names all lower case, no room. To do: assign a class (suggested Sparks).' },
  { id: 5, what: 'Sparks 1st grader with a severe allergy in a note that has commas, quotes, a line break and a line starting with =.',
    row: Object.assign(fam(105, 'Vandermeer', '(937) 555-0105', 'vandermeer.family@example.com'), { 'First Name': 'Theo', Gender: 'Male', Birthdate: born(6, 120), Age: '6', Grade: '1st Grade', 'Sparks Vest': '1', [SHIRT]: 'Youth S',
      'Medical Notes': 'Peanut, tree nut allergy; carries EpiPen.\n"Severe" - call 911 first\n=1+1', [ALLERGY]: 'Yes - peanuts, tree nuts, sesame', 'Assignment Area: Classes': 'Sparks C' }),
    expect: 'CSV quoting survives; medical text shows on the medical report; uniform to order (Sparks vest).' },
  { id: 6, what: 'Sparks 2nd grader: accented, apostrophe and hyphen in the name, every kind of phone format, a "no photos" note.',
    row: Object.assign(fam(106, "O'Brien-Nuñez", '937.555.0106 ext 7', 'obrien.nunez@example.com'), { 'First Name': 'Zoë', Gender: 'Female', Birthdate: born(7, 60), Age: '7', Grade: '2nd Grade', 'Sparks Vest': '1', [SHIRT]: 'Youth L',
      'Home Phone Number': '9375550143', 'Registration Contact Phone Number': '+1 (937) 555-0144', 'Emergency Contact': '+1 937-555-0106 (Dad); (937) 555-0188 (Aunt)', 'Medical Notes': 'No photos please', 'Assignment Area: Classes': 'Sparks A' }),
    expect: 'Name and phones are kept exactly as typed. "No photos" is recognised from the note.' },
  { id: 7, what: 'T&T 3rd grader with a two-part first name, a hyphenated last name, the room spelled TnT, a yyyy-mm-dd birthdate and a T&T shirt.',
    row: Object.assign(fam(107, 'Hartwell-Quinn', '(937) 555-0107', 'hartwellquinn@example.com'), { 'First Name': 'Mateo Alejandro', Gender: 'Male', Birthdate: '2018-04-09', Age: '8', Grade: '3rd Grade', 'T&T shirt': '1', [SHIRT]: 'Youth M', 'Assignment Area: Classes': 'TnT Boys (Group A)' }),
    expect: 'TnT is treated as T&T. The ISO birthdate is accepted. To do: uniform to order (T&T shirt).' },
  { id: 8, what: 'Oldest child still in T&T (6th grade, age 11) with a 9-digit zip, state typed "ohio", an invalid email and two emails in one box.',
    row: Object.assign(fam(108, 'Raghunathan', '(937) 555-0108', 'priya.family at example.com'), { 'First Name': 'Priya', Gender: 'Female', Birthdate: '3/2/2015', Age: '11', Grade: '6th Grade', 'Home Address State': 'ohio', 'Home Address Zip': '45459-1234',
      'Other Email Address': 'a.raghunathan@example.com; b.raghunathan@example.com', 'Assignment Area: Classes': 'T&T Girls (Group A)' }),
    expect: 'Export check: "priya.family at example.com" is not a valid email. Two addresses in one box are both checked.' },
  { id: 9, what: 'A 7th grader (age 12) registered as a clubber and put in a room that does not exist here (Trek/Journey).',
    row: Object.assign(fam(109, 'Whitaker', '(937) 555-0109', 'whitaker.family@example.com'), { 'First Name': 'Caleb', Gender: 'Male', Birthdate: '6/18/2014', Age: '12', Grade: '7th Grade', 'Assignment Area: Classes': 'Trek/Journey' }),
    expect: 'Export check: unknown room; past T&T. To do: no class fits.' },
  { id: 10, what: 'A 4th grader (age 9) put in a Sparks room.',
    row: Object.assign(fam(110, 'Castellano', '(937) 555-0110', 'castellano.family@example.com'), { 'First Name': 'Ruby', Gender: 'Female', Birthdate: '2/11/2017', Age: '9', Grade: '4th Grade', 'Assignment Area: Classes': 'Sparks D' }),
    expect: 'To do: class does not match grade (suggested T&T).' },
  { id: 11, what: 'Age, birthdate and grade disagree: the Age column says 5, the birthdate makes them 9, the grade is 2nd.',
    row: Object.assign(fam(111, 'Volkov', '(937) 555-0111', 'volkov.family@example.com'), { 'First Name': 'Dmitri', Gender: 'Male', Birthdate: '8/14/2017', Age: '5', Grade: '2nd Grade', 'Assignment Area: Classes': 'Sparks B' }),
    expect: 'Export check: the Age column says 5 but the birthdate makes them 9.' },
  { id: 12, what: 'A registration with almost nothing filled in: no birthdate, grade, age, phone, email, address or emergency contact.',
    row: { 'Registration ID': '90000112', 'First Name': 'Sam', 'Last Name': 'Okafor', Gender: 'Male', Grade: '', Birthdate: '', Age: '', 'Assignment Area: Classes': 'Cubbies', [ALLERGY]: '', [SHIRT]: '' },
    expect: 'Export check: no birthdate, grade, contact or emergency contact. To do: details missing.' },
  { id: 13, what: 'A child registered twice (same registration ID and name). This is the first, Active copy.',
    row: Object.assign(fam(113, 'Whitfield', '(937) 555-0113', 'whitfield.family@example.com'), { 'First Name': 'Jordan', Gender: 'Male', Birthdate: '1/30/2018', Age: '8', Grade: '3rd Grade', 'Assignment Area: Classes': 'T&T Boys (Group B)' }),
    expect: 'Export check: the name appears twice. Both rows are added with their own ID.' },
  { id: 14, what: 'The second registration for case 13: Status Cancelled, a different phone, submitted later.',
    row: Object.assign(fam(113, 'Whitfield', '(937) 555-0199', 'whitfield.family@example.com'), { 'First Name': 'Jordan', Gender: 'Male', Birthdate: '1/30/2018', Age: '8', Grade: '3rd Grade', Status: 'Cancelled', Submitted: '11/1/2026 at 9:02am', 'Assignment Area: Classes': 'T&T Boys (Group B)' }),
    expect: 'Export check: not Active, duplicate name. To do: cancelled registration to review.' },
  { id: 15, what: 'An adult volunteer assigned to a class room, with only a work email and no grade.',
    row: Object.assign(fam(115, 'Delacroix-Boyd', '(937) 555-0115', ''), { 'First Name': 'Marguerite', Gender: 'Female', Birthdate: '3/9/1984', Age: '42', Grade: '', Selection: 'Awana Adult Volunteer', 'Registration Cost': '$0', 'Registration Amount Paid': '$0', 'Paid by Credit': '$0',
      'Home Email Address': '', 'Registration Contact Home Email Address': '', 'Work Email Address': 'mdelacroix@example.org', 'Emergency Contact': '', 'Assignment Area: Classes': 'Sparks C' }),
    expect: 'Counts as an adult, not a clubber, even though the room is Sparks C. No grade or emergency contact needed.' },
];

const out = rows.concat(CASES.map(c => header.map(h => (c.row[h] === undefined ? (base[h] === undefined ? '' : base[h]) : c.row[h]))));
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, OUT_NAME), Csv.serialize(out));
const md = ['# Import test file: ' + OUT_NAME, '',
  'The base export (' + (rows.length - 1) + ' people; in `dev/test-data` this is the anonymized export) plus ' + CASES.length + ' invented registrations, as of ' + AS_OF + '. Nobody in the added rows is real: names, phone numbers (555-01xx), addresses and emails (example.com / example.org) are made up, and their registration IDs run 90000101 to 90000115. Test input only.', '',
  '## How to use it', '',
  '1. Open the app, then **Open files…** and pick the newest data file and this CSV together.',
  '2. The **TEST** in the file name puts the session in test mode: a red banner shows, and every download is named with TEST and needs two presses. Reload the page to clear it. Do not download the data file from a test session if you can avoid it; if you do, the TEST in its name tells it apart, and it must never replace the real file.',
  '3. The import review lists 15 new people. **Apply import**, and the **To do** tab opens with the file check and the actions.',
  '4. Assign classes from the To do page, then colors on the Color teams tab (*Assign blanks*) and handbooks on the Progress or Person tab, and watch the list shrink.',
  '5. Close or reload the tab when done. Nothing is saved unless you download.', '',
  '## The 15 registrations', '',
  '| # | Registration ID | Name as typed | What it tests | What should happen |', '|---|---|---|---|---|']
  .concat(CASES.map(c => '| ' + c.id + ' | ' + c.row['Registration ID'] + ' | ' + (c.row['First Name'] + ' ' + c.row['Last Name']).replace(/\|/g, '/') + ' | ' + c.what + ' | ' + c.expect + ' |'));
md.push('', '## What the To do page lists for the 15 new people (pinned by `test/import-test-file.test.js`)', '',
  '- **Assign a class:** Nora Fenwick (suggested Puggles), olivia mcdonald (suggested Sparks), Caleb Whitaker (no class: past 6th grade).',
  '- **Class does not match the grade:** Ruby Castellano (4th grade in Sparks D; T&T is usual).',
  '- **Needs a Q2 color team:** the Sparks and T&T children: Dmitri Volkov, both Jordan Whitfield registrations, Mateo Alejandro Hartwell-Quinn, Priya Raghunathan, Ruby Castellano, Theo Vandermeer, Zoë O\'Brien-Nuñez. Not the Puggles, Cubbies or the adult.',
  '- **Uniform to order:** Linus Fenwick, Mateo Alejandro Hartwell-Quinn, Theo Vandermeer, Zoë O\'Brien-Nuñez. **Balance due:** Linus Fenwick.',
  '- **Details missing:** Sam Okafor. **Registration not Active:** the Cancelled Jordan Whitfield. **Possible duplicates:** both Jordan Whitfields.',
  '- **Medical or allergy notes to read:** Theo Vandermeer, Wren Calloway.',
  '- **Nothing:** Marguerite Delacroix-Boyd (an adult in a class room needs no grade, emergency contact or color).', '',
  'The file check (errors and warnings about the file itself) should find no errors and warn about: the unknown room "Trek/Journey", one person not Active, "Jordan Whitfield" appearing twice, and per person the problems in the table above (padded and lower-case names, the invalid email, past T&T, class that does not fit the grade, Age against birthdate, a nearly empty registration). `TnT` in a room name is read as `T&T` and raises nothing.', '',
  '## What it does not cover', '',
  'Every added row is a brand-new person, so these import cases need a hand-edited copy of an existing row and are not in this file: a **renamed** child (same registration ID, new name), someone **missing** from the export (marked inactive), a child who **reappears**, a changed phone, medical note or class on a **matched** child, and a **pending change** you made here that Planning Center now matches. `test/test.js` and `test/roster.test.js` cover those with small fixtures.', '',
  'Colors and handbooks are not part of a Planning Center export, so every new Sparks or T&T child needs them after the import.', '',
  'Generated by `dev/tools/make-test-export.js`; run `node dev/tools/make-test-export.js` to regenerate the identical file.');
fs.writeFileSync(path.join(outDir, 'TEST-CASES.md'), md.join('\n') + '\n');
console.log('wrote', path.join(outDir, OUT_NAME), '(' + (out.length - 1) + ' rows) and TEST-CASES.md');
