#!/usr/bin/env node
// Builds a complete anonymized test set from the real files: a data file and a Planning Center export that behave exactly like the
// real ones (same people, classes, grades, birthdates, attendance, games, awards, colors, handbooks, history) with the identifying
// details replaced:
//   names      every real first name and last name becomes one invented name, the same everywhere it appears (so brothers and sisters
//              still share a last name, a parent in the contact and emergency fields still matches the child's family, and "chelsea,
//              ashley, landis" typed into a phone box is replaced too). Girls get girls' names, boys get boys' names.
//   phones     every number becomes an invented 555-01xx number, the same fake for the same real number, in the same punctuation.
//   emails     every address becomes parentNNN@example.com (or .org), the same fake for the same real address.
//   addresses  street, city and zip are invented; a family keeps one address across the fields that repeat it.
//   reg. IDs   Planning Center registration IDs become random 7xxxxxxx numbers, the same for a family.
//   birthdates each one moves two to eight weeks (the same date moves the same way, so twins stay twins) and the age on the export date stays the same.
//   medical    the Medical Notes and allergy answers are replaced by generic invented notes (a real note maps to the same invented note everywhere).
//              "None", "N/A" and a plain photo request are not medical and stay, so the empty and no-photos cases still occur.
// Grades, classes, costs and other dates are not changed (see ANONYMIZATION.md). The mapping from real to
// invented names is never written anywhere: it is rebuilt from a fixed seed each run and discarded.
//   node make-test-data.js <data.json> <export.csv> <out-dir> [--extra private-names.json]
// --extra is a JSON list of further real name words (found in free text such as medical notes) to replace; keep that file out of the project.
const fs = require('fs'), path = require('path');
const Csv = require('../app/csv.js'), M = require('../app/model.js'), Season = require('../app/season.js'), V = require('../app/validate.js'), Intake = require('../app/intake.js');
const pools = require('./name-pools.js'), AnonPc = require('./anon-pc.js');
// N9 point 6: every section in Season.SECTIONS needs a rule (dev/tools/section-rules.js), and every rule must name a real section. Fail closed, before any file is written.
const SECTION_RULES = require('./section-rules.js').RULES;
{ const missing = Season.SECTIONS.filter(k => !SECTION_RULES[k]), stale = Object.keys(SECTION_RULES).filter(k => !Season.SECTIONS.includes(k));
  if (missing.length || stale.length) throw new Error('make-test-data: section rules out of step with Season.SECTIONS. No rule for: ' + (missing.join(', ') || 'none') + '. Rule for a section that does not exist: ' + (stale.join(', ') || 'none') + '. Fix dev/tools/section-rules.js first.'); }
const { C } = M;

const args = process.argv.slice(2), flag = n => { const i = args.indexOf(n); return i < 0 ? null : args.splice(i, 2)[1]; };
const extraPath = flag('--extra');
const [dataPath, exportPath, outDir] = args;
if (!dataPath || !exportPath || !outDir) { console.error('usage: node make-test-data.js <data.json> <export.csv> <out-dir> [--extra private-names.json]'); process.exit(2); }

// Fail closed, before anything else: a key this tool has not been taught about (at the top level, in roster, in a person's entry or in the export record, of any type) could carry real names or IDs,
// so it stops the run until it is handled in dev/tools/anon-pc.js. The check reads the file as it is on disk: the app's loader, used below, quietly drops a section it does not know.
const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
AnonPc.unknownKeys(rawData).forEach(p => { const [where, key] = p.split(' › '); throw new Error('make-test-data does not know the ' + ({ top: 'data key', roster: 'roster key', person: 'person key', pcExport: 'export record key' }[where] || where) + ' "' + key + '": teach it how to anonymize it first'); });

// ---------- seeded randomness ----------
let seed = 20261029;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.floor(rnd() * a.length)];

// ---------- read ----------
const rows = Csv.parse(fs.readFileSync(exportPath, 'utf8')).filter(r => r.some(c => c !== ''));
const header = rows[0];
const data = Season.fromJson(fs.readFileSync(dataPath, 'utf8'));      // the app's own loader: a current data file keeps each person's Planning Center values as a packed list, and this turns them back into named fields (older files are upgraded the same way)
const extra = extraPath ? JSON.parse(fs.readFileSync(extraPath, 'utf8')) : [];
const FIRST = C.FIRST, LAST = C.LAST, RC_FIRST = 'Registration Contact First Name', RC_LAST = 'Registration Contact Last Name';
const words = s => String(s || '').match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’]*/g) || [];
const low = s => s.toLowerCase().replace(/’/g, "'");

// ---------- real name words, with who they belong to ----------
const real = new Map();           // lowercased word -> 'F' | 'M' | 'C' (a parent or unknown) | 'L' (surname)
const note = (w, role) => { w = low(w); if (w.length < 2) return; const cur = real.get(w); if (!cur || (cur === 'L' && role !== 'L') || (cur === 'C' && (role === 'F' || role === 'M'))) real.set(w, role); };
const records = rows.slice(1).map(r => { const o = {}; header.forEach((h, i) => { o[h] = r[i] === undefined ? '' : r[i]; }); return o; });
const peoplePc = Object.values(data.roster.people).map(e => e.pc);
const allPc = records.concat(peoplePc);
allPc.forEach(rec => {
  const g = /^f/i.test(rec.Gender || '') ? 'F' : /^m/i.test(rec.Gender || '') ? 'M' : 'C';
  words(rec[FIRST]).forEach(w => note(w, g)); words(rec[LAST]).forEach(w => note(w, 'L'));
  words(rec[RC_FIRST]).forEach(w => note(w, 'C')); words(rec[RC_LAST]).forEach(w => note(w, 'L'));
});
Object.values(data.roster.people).forEach(e => Object.keys(e.v || {}).filter(k => /^ov:(First|Last) Name$/.test(k)).forEach(k => words(e.v[k]).forEach(w => note(w, k.endsWith('Last Name') ? 'L' : 'C'))));
Object.values(data.adults || {}).forEach(l => l.forEach(a => words(a.n).forEach(w => note(w, 'C'))));
extra.forEach(w => note(w, 'C'));
const ROLE_WORDS = new Set('and the my of mom mommy mother dad daddy father grandma grandpa grandmother grandfather granny gramps nana papa pops pop aunt auntie uncle cousin sister brother family friend neighbor neighbors parents parent guardian husband wife step stepmom stepdad mr mrs ms dr pastor can will not only also with for or on at to from by home work cell mobile phone number numbers text call ext x n a na none no yes unknown'.split(' '));
// Names that appear only in the name-heavy boxes (a grandparent who may pick up) are found now, so no invented name can equal one of them.
const NAME_BOXES = ['Emergency Contact', 'Please list the names', 'Please provide the primary'];
const eng0 = (() => { try { return new Set(fs.readFileSync('/usr/share/dict/words', 'utf8').split('\n').filter(w => /^[a-z]+$/.test(w))); } catch (e) { return new Set(); } })();
records.forEach(rec => Object.keys(rec).filter(c => NAME_BOXES.some(n => c.startsWith(n))).forEach(c => words(rec[c].replace(/[\w.%+\-]+@[\w.\-]+\.[a-z]{2,}/gi, ' ')).forEach(w => { const l = low(w); if (l.length >= 3 && !ROLE_WORDS.has(l) && (w !== w.toLowerCase() || !eng0.has(l))) note(w, 'C'); })));
const SUFFIX = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);
[...real.keys()].filter(w => SUFFIX.has(w)).forEach(w => real.delete(w));

// ---------- invented names ----------
// English words (lower-case entries only), used to leave ordinary words like "mark" alone when they are written in lower case.
let english = new Set(); try { english = new Set(fs.readFileSync('/usr/share/dict/words', 'utf8').split('\n').filter(w => /^[a-z]+$/.test(w))); } catch (e) { /* the review is weaker without it */ }
const taken = new Set([...real.keys()]);
['wren calloway nora fenwick linus olivia mcdonald theo vandermeer zoë brien nuñez mateo alejandro hartwell quinn priya raghunathan caleb whitaker ruby castellano dmitri volkov sam okafor jordan whitfield marguerite delacroix boyd pat lee kim moe test']
  .forEach(s => s.split(' ').forEach(w => taken.add(w)));
const free = a => shuffle(a.filter(w => !taken.has(low(w))));
const pool = { F: free(pools.girls), M: free(pools.boys), L: free(pools.surnames) };
const neutral = shuffle(pool.F.slice(0, Math.floor(pool.F.length / 2)).concat(pool.M.slice(0, Math.floor(pool.M.length / 2))));
const used = new Set();
// when a list runs dry (a grandparent only ever named in a pickup box), names are made up from syllables
const ON = ['B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'V', 'W', 'Br', 'Cl', 'Dr', 'Gr', 'Pr', 'St', 'Tr', 'Fl', 'Sh'], VO = ['a', 'e', 'i', 'o', 'u', 'ai', 'ea', 'ou'], CO = ['n', 'r', 'l', 'm', 's', 't', 'nd', 'ld', 'rt', 'll', 'rk', 'x'], EN = ['a', 'en', 'ly', 'ton', 'er', 'dale', 'ford', 'ie', 'ow', 'ard'];
const synth = () => pick(ON) + pick(VO) + pick(CO) + pick(EN);
const draw = role => {
  const lists = role === 'F' ? [pool.F] : role === 'M' ? [pool.M] : role === 'L' ? [pool.L] : [neutral, pool.F, pool.M, pool.L];
  for (;;) {
    const src = lists.find(l => l.length); const w = src ? src.shift() : synth();
    if (!used.has(low(w)) && !taken.has(low(w)) && !english.has(low(w))) { used.add(low(w)); return w; }
  }
};
const tok = new Map();      // real lowercased word -> invented Title-case word
[...real.keys()].sort().forEach(w => tok.set(w, draw(real.get(w))));
const caseLike = (orig, fake) => orig === orig.toUpperCase() && orig.length > 1 ? fake.toUpperCase() : orig === orig.toLowerCase() ? fake.toLowerCase() : fake;
const mapWord = w => { const f = tok.get(low(w)); return f ? caseLike(w, f) : w; };


// a structured name field: every word mapped, punctuation and initials kept
const mapName = s => String(s || '').replace(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’]*/g, w => (w.length < 2 || SUFFIX.has(low(w)) ? w : mapWord(w)));
// free text: names anywhere, but an ordinary English word written in lower case is left alone unless it is also a name we know to be a name
const anonNames = s => String(s || '').replace(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’]*/g, w => {
  const l = low(w); if (l.length < 3 || !tok.has(l)) return w;
  if (w === w.toLowerCase() && english.has(l)) return w;
  return mapWord(w);
});

// ---------- phones, emails, registration IDs, addresses ----------
const phoneMap = new Map(), usedPhones = new Set(), AREAS = ['937', '513', '614', '330', '419', '440', '216', '567'];
const fakePhone = key => {
  if (phoneMap.has(key)) return phoneMap.get(key);
  let f; do { f = pick(AREAS) + '5550' + String(100 + Math.floor(rnd() * 100)).slice(1).padStart(3, '0').slice(-3); f = f.slice(0, 6) + '01' + String(Math.floor(rnd() * 100)).padStart(2, '0'); } while (usedPhones.has(f));
  usedPhones.add(f); phoneMap.set(key, f); return f;
};
const PHONE = AnonPc.PHONE_RE;      // 7 or more digits, any shape (CR-01); see anon-pc.js
const anonPhones = s => String(s || '').replace(PHONE, m => {
  const digits = m.replace(/\D/g, ''), lead = digits.length === 11 && digits[0] === '1' ? '1' : '', core = lead ? digits.slice(1) : digits;
  const fake = core.length === 10 ? fakePhone(core) : core.length >= 7 && core.length <= 9 ? AnonPc.fakeShortPhone(core) : fakePhone(core).slice(0, core.length).padEnd(core.length, '0');
  let i = 0, seenLead = false;
  return m.replace(/\d/g, () => { if (lead && !seenLead) { seenLead = true; return '1'; } return fake[i++] || '0'; });
});
const mailMap = new Map(); let mailN = 0;
const anonEmails = s => String(s || '').replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, m => {
  const k = m.toLowerCase(); if (!mailMap.has(k)) mailMap.set(k, 'parent' + String(++mailN).padStart(3, '0') + '@example.' + (/\.(org|edu|gov)$/.test(k) ? 'org' : 'com'));
  return mailMap.get(k);
});
const anonText = s => anonNames(anonPhones(anonEmails(s)));

// ---------- birthdates and medical notes ----------
// Own hash and generator, so adding these did not change which invented names, phones and addresses the other columns get.
const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const REF = (/(\d{4})(\d{2})(\d{2}) -- /.exec(path.basename(exportPath)) || []).slice(1).join('-') || new Date().toISOString().slice(0, 10);
// the public copy carries no club name: <yyyymmdd of the real export> -- demo-club-<season> TEST.csv
const csvName0 = () => REF.replace(/-/g, '') + ' -- demo-club-' + (data.year || 'file') + ' TEST.csv';
const pad2 = n => String(n).padStart(2, '0');
// a date two to eight weeks away in either direction that gives the same age on the export date; text that is not a date is left alone
const shiftBirthdate = s => {
  const b = Intake.parseBirthdate(s); if (!b) return s;
  const age = Intake.ageOn(b, REF), h = hash('birthdate ' + String(s).trim());
  for (let k = 0; k < 200; k++) {
    const days = 14 + Math.floor((h >>> 4) % 43) + (k >> 1) % 43, sign = ((h >>> 1) + k) & 1 ? 1 : -1;
    const t = new Date(Date.UTC(b.y, b.m - 1, b.d + sign * (days % 43 + 14))), n = { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
    if (Intake.ageOn(n, REF) === age) return /^\d{4}-/.test(String(s).trim()) ? n.y + '-' + pad2(n.m) + '-' + pad2(n.d) : n.m + '/' + n.d + '/' + n.y;
  }
  return s;
};
const MED_POOL = ['Peanut allergy (carries an EpiPen)', 'Allergic to walnuts and pecans', 'Allergic to shrimp', 'Cannot have milk', 'Wheat-free diet', 'Please avoid red food coloring', 'Hives from strawberries',
  'Sulfa drug allergy', 'Reacts to wasp stings; EpiPen in backpack', 'Hay fever in spring and fall', 'Mild asthma; inhaler in backpack', 'Wears glasses', 'Gets thirsty, needs a water bottle', 'Takes a vitamin with breakfast',
  'No gummy candy', 'Sensitive to loud noises', 'Allergic to dogs', 'Dry skin; fragrance-free soap only', 'Soy allergy', 'Sesame allergy', 'Kiwi allergy', 'Latex-free gloves please', 'Nosebleeds in dry weather',
  'Gets carsick', 'Needs a snack mid-evening', 'Allergic to bananas', 'Allergic to oats', 'Cannot have cinnamon', 'Tomato makes mouth itchy', 'Allergic to wheat', 'Lactose-free milk only', 'Headaches in bright light',
  'Reaction to adhesive bandages', 'Allergic to pollen and ragweed', 'Bothered by strong smells', 'Reacts to fish', 'No raisins please', 'No honey', 'Allergic to mold', 'Mild reaction to citrus', 'Allergic to chocolate',
  'Allergic to apples', 'Sunscreen allergy', 'Allergic to lavender', 'Allergic to peaches', 'Dairy-free, please check labels', 'Egg allergy; baked goods are fine', 'Allergic to corn', 'Allergic to pineapple', 'Allergic to melon'];
const SENSITIVE = /nephrectom|pacemaker|feeding tube|\bng\b|autis|\belope|epileps|crohn|diabet|adhd|speech delay|language delay|potty|pull-?ups|morphine|augmentin|ciprofloxacin|amoxil|kidney|seizure|medicine at night/i;
const MED_TRIVIAL = /^(no|n|na|n\/a|none|nka|nope|nothing|nil|-+|no allergies|no medical.*|yes|y|already on my profile|no food allergies)\.?$/i;
const medMap = new Map(), medReplaced = new Set(); let medN = 0;
const medOrder = (() => { let a = 7; const r = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; const l = MED_POOL.slice(); for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l; })();
const anonMedical = s => {
  const v = String(s || '').trim();
  if (!v || MED_TRIVIAL.test(v)) return s;
  const photo = M.photoRequest(v);
  if (photo && !/\b(allerg|gluten|dye|epi|asthma|seiz|diabet)/i.test(v) && v.replace(/\b(no|photos?|pics?|pictures?|please|\W)\b/gi, '').trim().length < 3) return s;      // only a photo request: not medical
  const k = v.toLowerCase();
  if (!medMap.has(k)) { medMap.set(k, medOrder[medN++ % medOrder.length]); medReplaced.add(v); }
  return medMap.get(k) + (photo ? ' No photos please.' : '');
};
// Columns that are mostly people's names (who may pick up, emergency contacts, a "primary phone" box that someone typed names into):
// any word that is not an ordinary word is a name, including ones that are in no name field (a grandparent), and gets an invented name too.
const anonNameList = s => anonNames(anonPhones(anonEmails(s))).replace(/[A-Za-z\u00c0-\u00ff][A-Za-z\u00c0-\u00ff'\u2019]*/g, w => {
  const l = low(w);
  if (l.length < 3 || ROLE_WORDS.has(l) || used.has(l)) return w;
  if (!tok.has(l) && (w !== w.toLowerCase() || !english.has(l))) tok.set(l, draw('C'));
  return tok.has(l) ? mapWord(w) : w;
});

const regMap = new Map(), usedReg = new Set(['manual']);
const fakeReg = r => { r = String(r || '').trim(); if (!r || r === 'manual') return r; if (!regMap.has(r)) { let n; do { n = String(70000000 + Math.floor(rnd() * 9999999)); } while (usedReg.has(n)); usedReg.add(n); regMap.set(r, n); } return regMap.get(r); };

const CITIES = [['Kettering', '45429'], ['Dayton', '45409'], ['Centerville', '45459'], ['Beavercreek', '45431'], ['Fairborn', '45324'], ['Springboro', '45066'], ['Miamisburg', '45342'], ['Troy', '45373'], ['Xenia', '45385'], ['Huber Heights', '45424'], ['Vandalia', '45377'], ['Englewood', '45322'], ['Tipp City', '45371'], ['Lebanon', '45036'], ['Franklin', '45005'], ['Oakwood', '45419'], ['Moraine', '45439'], ['Trotwood', '45426'], ['West Carrollton', '45449'], ['Waynesville', '45068']];
const STREETS = ['Maple', 'Cedar', 'Willow', 'Birchwood', 'Orchard', 'Meadowbrook', 'Sycamore', 'Harvest', 'Lantern', 'Stonebridge', 'Foxglove', 'Hollow', 'Juniper', 'Ridgeview', 'Brookside', 'Clover', 'Pinecrest', 'Windmill', 'Heron', 'Tamarack', 'Bluebell', 'Lakeshore', 'Sunrise', 'Wheatfield', 'Cranberry', 'Mulberry', 'Elmhurst', 'Granite', 'Primrose', 'Quail'], SUFFIXES = ['Street', 'Lane', 'Drive', 'Court', 'Avenue', 'Way', 'Road', 'Circle'];
const STREETS_OK = STREETS.filter(s => !real.has(low(s))), CITIES_OK = CITIES.filter(c => !real.has(low(c[0])));       // an invented street must not be a real child's name
const addrMap = new Map();
const addrKey = (street, zip) => String(street || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14) + '|' + String(zip || '').slice(0, 5);
const fakeAddr = key => {
  if (!addrMap.has(key)) { const c = pick(CITIES_OK); addrMap.set(key, { street: (100 + Math.floor(rnd() * 8900)) + ' ' + pick(STREETS_OK) + ' ' + pick(SUFFIXES), city: c[0], zip: c[1] }); }
  return addrMap.get(key);
};
const fakeZip = (orig, a) => /-/.test(orig) ? a.zip + '-' + (a.plus4 || (a.plus4 = String(Math.floor(rnd() * 10000)).padStart(4, '0'))) : a.zip;

// ---------- one Planning Center record ----------
const KEEP = new Set(['Grade', 'Birthdate', 'Age', 'Gender', 'Selection', 'Status', 'Submitted', 'Registration Cost', 'Attendee Balance Due', 'Registration Amount Paid', 'Balance Due', 'Attendance Status', 'Times Attended',
  'Paid by Check', 'Paid by Credit', 'Paid by Cash', 'Paid by Other', 'Paid by Scholarships', 'Paid by ACH', 'Discount Name', 'Discount Type', 'Discount Amount', 'Cubbies Vest', 'Sparks Vest', 'T&T shirt', 'TnT shirt',
  'Assignment Area: Classes', 'Home Address State', 'Gender']);
const NAME_COLS = ['Emergency Contact', 'Please list the names', 'Please provide the primary'];
function anonRecord(rec) {
  const out = {}, hs = rec['Home Address Street'], hz = rec['Home Address Zip'];
  const home = hs ? fakeAddr(addrKey(hs, hz)) : null;
  Object.keys(rec).forEach(col => {
    const v = rec[col] == null ? '' : String(rec[col]);
    if (col === FIRST || col === LAST || col === RC_FIRST || col === RC_LAST) out[col] = mapName(v);
    else if (col === 'Registration ID') out[col] = fakeReg(v);
    else if (col === 'Home Address Street') out[col] = v && home ? home.street : v;
    else if (col === 'Home Address City') out[col] = v && home ? home.city : v;
    else if (col === 'Home Address Zip') out[col] = v && home ? fakeZip(v, home) : v;
    else if (col === 'Registration Contact Address') {
      const m = /^(.*?),\s*(.*?),\s*([A-Za-z]{2})\s+([\d-]+)\s*$/.exec(v);
      if (!v) out[col] = v;
      else if (!m) { const a = fakeAddr(addrKey(v, '')); out[col] = a.street + ', ' + a.city + ', OH ' + a.zip; }       // a form I cannot take apart: replace the whole address
      else { const a = home && addrKey(m[1], m[4]) === addrKey(hs, hz) ? home : fakeAddr(addrKey(m[1], m[4])); out[col] = a.street + ', ' + a.city + ', ' + m[3] + ' ' + fakeZip(m[4], a); }
    }
    else if (col === C.BDAY) out[col] = shiftBirthdate(v);
    else if (col === C.MED || col === C.ALLERGY) out[col] = anonMedical(v);
    else if (KEEP.has(col)) out[col] = v;
    else if (NAME_COLS.some(n => col.startsWith(n))) out[col] = anonNameList(v);
    else if (AnonPc.ruleOf(col) === 'unknown') out[col] = v === '' ? '' : 'TEST';      // a column this tool has no rule for could hold anything (R17): its value is emptied, whatever it was
    else if (/^pc:|\s\(\d+\)$/.test(col)) out[col] = anonRecord({ [col.replace(/^pc:/, '').replace(/\s\(\d+\)$/, '')]: v })[col.replace(/^pc:/, '').replace(/\s\(\d+\)$/, '')];      // a stored name of a known column (a repeat, or one kept as pc:) takes that column's rule
    else out[col] = anonText(v);
  });
  return out;
}

// ---------- the export ----------
const outRecords = records.map(anonRecord);
const outRows = [header].concat(outRecords.map(o => header.map(h => o[h])));

// ---------- the data file ----------
const idMap = new Map();
const newPeople = {};
// The fields this club keeps for a person (v): notes and uniform text become generic, the person's own ID is the new one, dates, teams and flags stay.
const anonV = (ev, id) => {
  const v = {};
  Object.keys(ev || {}).forEach(k => {
    const x = ev[k];
    if (k === 'x_ClubberID') v[k] = id;      // Season.fromJson removes it since R18 (when it equals the id); kept here for a hand-built input
    else if (typeof x !== 'string') v[k] = x;
    else if (/^ov:/.test(k)) { const col = k.slice(3); v[k] = anonRecord({ [col]: x })[col]; }
    else if (/^(team:|x_noteam:|x_Active|x_NoPhotos|x_FirstSeen|x_LastSeen|x_Uni_(Ordered|Received|Given)Date)/.test(k)) v[k] = x;
    else v[k] = anonText(x);
  });
  return v;
};
Object.keys(data.roster.people).forEach(oldId => {
  const e = data.roster.people[oldId], pc = anonRecord(e.pc), suffix = (/#\d+$/.exec(oldId) || [''])[0];
  const id = (pc['Registration ID'] ? pc['Registration ID'] + '_' : '') + pc[FIRST] + '_' + pc[LAST] + suffix;
  if (newPeople[id]) throw new Error('two people became ' + id);
  idMap.set(oldId, id);
  const v = anonV(e.v, id);
  newPeople[id] = Object.assign({}, e, { pc, v });
});
const remap = o => { const r = {}; Object.keys(o || {}).forEach(k => { if (!idMap.has(k)) throw new Error('unknown person ' + k); r[idMap.get(k)] = o[k]; }); return r; };
const deep = x => typeof x === 'string' ? (idMap.has(x) ? idMap.get(x) : anonText(x)) : Array.isArray(x) ? x.map(deep) : x && typeof x === 'object' ? Object.keys(x).reduce((o, k) => { o[k] = deep(x[k]); return o; }, {}) : x;
const out = JSON.parse(JSON.stringify(data));
// the church's initials appear in a calendar theme ("Service project @ ..."); the public copy says AWANA
['calendar', 'rotation', 'config'].forEach(k => { if (out[k]) out[k] = JSON.parse(JSON.stringify(out[k]).replace(/\bFBK\b/g, 'AWANA')); });
out.roster.people = newPeople;
const idOf = id => { if (!idMap.has(id)) throw new Error('make-test-data: the export record names a person who is not on the roster (' + id.replace(/\d/g, '#') + ')'); return idMap.get(id); };
if (out.roster.pcExport) out.roster.pcExport = AnonPc.anonCapture(out.roster.pcExport, { anonRecord, idOf });      // the kept export: ids renamed, loose rows scrubbed column by column, hash emptied
// A change to the roster recorded in History: the people paths are handled below; the rest of roster goes through these rules, and a path this tool does not know stops the run.
const rosterChange = (c, x) => {
  const k = c.p[1];
  if (!AnonPc.HISTORY_ROSTER_OK.includes(k)) throw new Error('make-test-data does not know this History change to the roster (roster › ' + k + '): teach it how to anonymize it first');
  if (k === 'pcSource') return typeof x === 'string' && x ? csvName0() : x;
  if (k !== 'pcExport') return deep(x);
  const sub = c.p[2];
  if (sub === undefined) return x && typeof x === 'object' ? AnonPc.anonCapture(x, { anonRecord, idOf }) : x;
  if (sub === 'hash') return typeof x === 'string' ? '' : x;
  if (sub === 'header' || sub === 'names') return Array.isArray(x) ? x.map(AnonPc.initials) : x;
  if (sub === 'ids') return x && typeof x === 'object' ? Object.keys(x).reduce((o, id) => { o[idOf(id)] = x[id]; return o; }, {}) : x;      // a single id's own change is keyed by the id in the path, which pathId renames
  if (sub === 'loose') return Array.isArray(x) ? x.map(row => (Array.isArray(row) ? row.map(() => 'TEST') : row)) : x;      // a History line about kept rows is not worth scrubbing cell by cell: the cells become TEST
  if (['at', 'rows', 'blankRows'].includes(sub)) return x;
  throw new Error('make-test-data does not know this History change to the export record (' + sub + '): teach it how to anonymize it first');
};
out.fake = true;      // marks the invented club: Try it out moves its dates forward to today (Season.freshenFake)
if (out.roster.pcSource) out.roster.pcSource = csvName0();
['handbooks', 'progress', 'teamMoves'].forEach(k => { if (out[k]) out[k] = remap(data[k]); });
// Sections keyed by person ID (Given, held awards, books received, books finished before): the keys are real registration IDs, so they are renamed like the rest.
['given', 'givenNoDate', 'held', 'received', 'doneBooks', 'doneReviews', 'progressNoDate', 'extraSheets', 'announcedNoDate', 'blueWings', 'blueDrops', 'pastTurnout'].forEach(k => { if (data[k] && Object.keys(data[k]).length) out[k] = remap(data[k]); });      // pastTurnout holds only a year label and two counts per child: kept under the new ID
// Blue Jewels given by hand carry a leader's free-text note about the child. Free text about a real child cannot be reliably scrubbed (like Notes and flags, below), so the grant is kept under the new ID and the note is left empty.
const noNote = list => (Array.isArray(list) ? list : []).map(x => (x && typeof x === 'object' ? Object.assign({}, x, { note: '' }) : x));
if (data.blueOverrides && Object.keys(data.blueOverrides).length) { out.blueOverrides = remap(data.blueOverrides); Object.keys(out.blueOverrides).forEach(k => { out.blueOverrides[k] = noNote(out.blueOverrides[k]); }); }
// Notes and flags are free text written about real children and keyed by their IDs: they are not copied at all (nor are History lines about them, below).
delete out.flags;
// Volunteer absences hold a free-text reason about a real person, like flags: they are not copied at all (nor are History lines about them, below).
delete out.absences;
// (Fail closed on unknown keys: see the check right after the arguments, at the top. Unknown columns of the export are emptied by anonRecord, and unknown History paths stop the run below.)
['attendance', 'awards'].forEach(k => { out[k] = {}; Object.keys(data[k] || {}).forEach(d => { out[k][d] = remap(data[k][d]); }); });
if (data.adults) out.adults = deep(data.adults);
// a whole night (or a whole person's records) added or removed is logged as one value keyed by person IDs: rename those keys and ID strings, nothing else
const rekey = x => typeof x === 'string' ? (idMap.has(x) ? idMap.get(x) : x) : Array.isArray(x) ? x.map(rekey) : x && typeof x === 'object' ? Object.keys(x).reduce((o, k) => { o[idMap.has(k) ? idMap.get(k) : k] = rekey(x[k]); return o; }, {}) : x;
const pathId = p => p.map(x => (typeof x === 'string' && idMap.has(x) ? idMap.get(x) : x));
// To do items the leader chose to Ignore are kept in config.todoIgnored as "group|person ID|text" (real IDs and free text): rename the ID, anonymize the text. Google Drive folder IDs (config.driveDirs) are the church's own, so they are not copied (nor are History lines about them).
const ignoredEntry = s => { const [g, id, ...rest] = String(s).split('|'); return [g, idMap.has(id) ? idMap.get(id) : 'unknown person', anonText(rest.join('|'))].join('|'); };
if (out.config) { out.config.todoIgnored = (out.config.todoIgnored || []).map(ignoredEntry); delete out.config.driveDirs; }
// The projected color team plan is keyed by person ID (config.teamPlan.proj): rename those IDs, or the real names in the keys reach the public copy (found on the real files: 6 name words in 3 keys).
if (out.config && out.config.teamPlan) out.config.teamPlan = rekey(out.config.teamPlan);
// One Planning Center field changed in the History. A home address column cannot be mapped from a lone value (anonRecord needs the street and zip beside it, and without them it returned the REAL value): the person's current
// address value maps to the same invented one as their record, and any other (an older address) maps by the value alone. Never passed through. Every other column goes through the same rules as the export.
const HOME_COLS = ['Home Address Street', 'Home Address City', 'Home Address Zip'];
const histPc = (c, x) => {
  const col = c.p[4]; if (!HOME_COLS.includes(col)) return anonRecord({ [col]: x })[col];
  if (!x) return x;
  const was = data.roster.people[c.p[2]], cur = was && was.pc && was.pc[col], mine = idMap.has(c.p[2]) ? newPeople[idMap.get(c.p[2])] : null;
  if (mine && mine.pc && cur !== undefined && String(cur) === String(x) && mine.pc[col] !== undefined) return mine.pc[col];
  const a = fakeAddr(addrKey(col === 'Home Address Street' ? x : '', col === 'Home Address Zip' ? x : ''));
  return col === 'Home Address Street' ? a.street : col === 'Home Address City' ? a.city : fakeZip(x, a);
};
// Notes, flags and absences are not in the public copy, so their changes leave the History (so do the real team plan, which the demo step replaces with an invented one, and the Drive folders). Only THOSE changes go: an entry that also changed awards, given dates or the roster keeps those changes (it used to be dropped whole, so the data and its own History disagreed in 68 places on the real files).
out.history = (data.history || []).map(e => Object.assign({}, e, { changes: e.changes.filter(c => !(c.p[0] === 'flags' || c.p[0] === 'absences') && !(c.p[0] === 'config' && (c.p[1] === 'driveDirs' || c.p[1] === 'teamPlan'))).map(c => { const people = c.p[0] === 'roster' || c.p[0] === 'adults', n = Object.assign({}, c, { p: pathId(c.p) }); if (c.p[0] === 'config' && c.p[1] === 'todoIgnored') { if ('o' in c) n.o = (c.o || []).map(ignoredEntry); if ('n' in c) n.n = (c.n || []).map(ignoredEntry); } else if (c.p[0] === 'blueOverrides') { const clean = v => (Array.isArray(v) ? noNote(v) : v && typeof v === 'object' ? Object.keys(v).reduce((o, k) => { o[idMap.has(k) ? idMap.get(k) : k] = noNote(v[k]); return o; }, {}) : v); if ('o' in c) n.o = clean(c.o); if ('n' in c) n.n = clean(c.n); } else if (people) { const val = x => (c.p[0] === 'roster' && c.p[1] === 'people' && c.p.length === 3 && x && typeof x === 'object' && x.pc) ? Object.assign({}, x, { pc: anonRecord(x.pc), v: anonV(x.v, pathId(c.p)[2]) })      /* a whole person added or removed */
      : (c.p[0] === 'roster' && c.p[1] === 'people' && c.p.length === 5 && c.p[3] === 'pc' && typeof x === 'string') ? histPc(c, x)
      : (c.p[0] === 'roster' && c.p[1] === 'people' && c.p.length === 5 && c.p[3] === 'v') ? anonV({ [c.p[4]]: x }, pathId(c.p)[2])[c.p[4]]      /* one field of a person's own record: the same per-key rules as anonV (override columns, notes, uniform text) */
      : (c.p[0] === 'roster' && c.p[1] === 'people') ? (() => { throw new Error('make-test-data does not know this History change to a person (' + c.p.slice(0, 2).concat(c.p.slice(3)).join(' › ') + '): teach it how to anonymize it first'); })()      /* fail closed */
      : (c.p[0] === 'roster') ? rosterChange(c, x)
      : (c.p[0] === 'config' && c.p[1] === 'teamPlan') ? rekey(x)      /* a change to the team plan: its keys are person IDs */
      : deep(x); if ('o' in c) n.o = val(c.o); if ('n' in c) n.n = val(c.n); } else {      /* a change to one Planning Center field of a person goes through the same per-column rules as the export (medical text, phones, emails, addresses) */ if ('o' in c) n.o = rekey(c.o); if ('n' in c) n.n = rekey(c.n); } return n; }) })).filter(e => e.changes.length);      // an entry with nothing left (it was only notes, flags or absences) goes

// ---------- build (the files are written at the very end, only when every check passes) ----------
const base = path.basename(dataPath), stamp = (/-(\d{8}-\d{6})\.json$/.exec(base) || [])[1] || '00000000-000000';
const dataName = 'awana-' + (data.year || 'file') + '-TEST-' + stamp + '.json';
const csvName = csvName0();
const dataText = require('./demo-plan.js').add(Season.toJson(Season.fromJson(JSON.stringify(out))));      // the demo also shows a color team plan (projected quarters, a few hand-set colors)
const csvText = Csv.serialize(outRows);

// ---------- checks ----------
const problems = [];
// 1. no real name word survives anywhere (whole word, any case); an invented name that happens to equal an English word is not a leak
const hay = (dataText + '\n' + csvText).toLowerCase();
// words that are also ordinary text elsewhere in the file ("Agents of Grace" in the book list) are not leaks
const plain = (JSON.stringify(data.config || {}) + JSON.stringify(data.calendar || []) + JSON.stringify(data.rotation || [])).toLowerCase();
const leaks = [...real.keys()].filter(w => w.length >= 3 && !new RegExp('\\b' + w + '\\b').test(plain) && new RegExp("(^|[^a-zÀ-ÿ'])" + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "([^a-zÀ-ÿ']|$)").test(hay));
console.log('real name words replaced:', real.size, '| still present anywhere in the output:', leaks.length);
leaks.forEach(w => problems.push('real word still present: ' + w));
// 2. the export and the data file agree: importing one into the other changes nothing
const m = M.fromRoster(Season.fromJson(dataText).roster), plan = M.planImport(m, require('../app/csv.js').toRecords(Csv.parse(csvText)));
const changes = plan.matched.filter(x => x.changes.length).length;
console.log('export against data file: matched', plan.matched.length, 'new', plan.added.length, 'missing', plan.missing.length, 'renamed', plan.renames.length, 'field changes', changes);
if (plan.added.length || plan.missing.length || plan.renames.length || changes) problems.push('the anonymized export does not match the anonymized data file');
// 2b. every birthdate moved but kept its age; no medical text of the originals survives
let moved = 0, bad = 0;
records.forEach((r, i) => { const b = Intake.parseBirthdate(r[C.BDAY]), n = Intake.parseBirthdate(outRecords[i][C.BDAY]); if (!b) return; if (!n || outRecords[i][C.BDAY] === r[C.BDAY] || Intake.ageOn(b, REF) !== Intake.ageOn(n, REF)) bad++; else moved++; });
console.log('birthdates moved:', moved, '| left alone or age changed:', bad); if (bad) problems.push(bad + ' birthdates were not moved or changed the age');
const outAll = (dataText + '\n' + csvText);
console.log('medical notes replaced:', medReplaced.size, 'distinct');
medReplaced.forEach(v => { if (new RegExp('(^|[^a-z0-9])' + v.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)').test(outAll.toLowerCase())) problems.push('real medical text still present: ' + v); });
// 2c. no phone number from the input survives, of any length from 7 digits (CR-01). Counts only; the numbers are never printed. Numbers that also sit in the config, calendar or rotation are ordinary text, not leaks.
const phoneIn = JSON.stringify(data.roster.people) + JSON.stringify(data.adults || []) + JSON.stringify(data.history || []) + JSON.stringify(records), phoneKeep = JSON.stringify(data.config || {}) + JSON.stringify(data.calendar || []) + JSON.stringify(data.rotation || []);
const phoneLeak = AnonPc.leakingPhones(phoneIn, outAll, phoneKeep);
console.log('phone numbers from the input still present anywhere in the output:', phoneLeak); if (phoneLeak) problems.push(phoneLeak + ' phone number(s) from the input are still present in the output');
// 2d. no real home street address survives, from a record or from a History change (a lone address value used to pass through the History unchanged). Counts only.
const realStreets = new Set(), addStreet = v => { const s = String(v == null ? '' : v).trim().toLowerCase(); if (s.length > 6 && /\d/.test(s)) realStreets.add(s); };
allPc.forEach(r => addStreet(r['Home Address Street']));
(data.history || []).forEach(e => (e.changes || []).forEach(c => { if (c.p[0] === 'roster' && c.p[1] === 'people' && c.p[4] === 'Home Address Street') { addStreet(c.o); addStreet(c.n); } }));
const outLow = outAll.toLowerCase(), streetLeak = [...realStreets].filter(s => outLow.includes(s)).length;
console.log('real street addresses', realStreets.size, '| still present anywhere in the output:', streetLeak); if (streetLeak) problems.push(streetLeak + ' real street address(es) are still present in the output');
const sens = outAll.match(new RegExp(SENSITIVE.source, 'gi')); if (sens) problems.push('sensitive medical terms still present: ' + [...new Set(sens.map(x => x.toLowerCase()))].join(', '));
// 3. valid files
const vd = V.validate(dataText, dataName).findings.filter(f => f.level !== 'info'), vp = V.validate(csvText, csvName).findings.filter(f => f.level === 'error');
// A warning the real file already has (dates that are not club nights, history that differs from the data) is carried over, not caused by the anonymizing: only new findings are problems.
const norm = f => f.msg.replace(/[0-9]+/g, '#').replace(/\(.*$/, '').slice(0, 50), realFound = new Set(V.validate(fs.readFileSync(dataPath, 'utf8'), path.basename(dataPath)).findings.map(norm));
const vdNew = vd.filter(f => !realFound.has(norm(f)));
console.log('data file check:', vdNew.length ? vdNew.map(f => f.level + ': ' + f.msg) : 'no problems', vd.length - vdNew.length ? '(' + (vd.length - vdNew.length) + ' warning(s) carried over from the real file)' : '', '| export errors:', vp.length);
vdNew.concat(vp).forEach(f => problems.push('file check ' + f.level + ': ' + f.msg));
// 4. words left in free-text fields that look like names (not ordinary English, not an invented name): for a person to read
const FREE_COLS = ['Medical Notes', 'Emergency Contact', 'Does your child', 'Please list the names', 'Please provide the primary', 'If you are purchasing', 'Registration Contact Address'];
const inv = new Set([...tok.values()].map(low)), seen = new Map();
outRecords.forEach(rec => Object.keys(rec).filter(c => FREE_COLS.some(f => c.startsWith(f))).forEach(c => words(rec[c]).forEach(w => {
  const l = low(w); if (l.length < 3 || inv.has(l) || english.has(l) || /^(n|na)$/.test(l)) return;
  const k = l + ' [' + c.slice(0, 14) + ']'; seen.set(k, (seen.get(k) || 0) + 1);
})));
Object.values(out.roster.people).forEach(e => ['x_Notes', 'x_Uni_Notes', 'x_Uni_SizeVerified', 'x_Uni_SizeOrdered', 'x_Uni_SizeGiven'].forEach(c => words(e.v[c]).forEach(w => { const l = low(w); if (l.length >= 3 && !inv.has(l) && !english.has(l)) seen.set(l + ' [' + c + ']', 1); })));
console.log('\nwords in free-text fields that are not ordinary English and not invented names (read these):');
console.log([...seen.keys()].sort().join('\n') || '(none)');
const cal = JSON.stringify(data.calendar || []) + JSON.stringify(data.rotation || []), calHits = [...real.keys()].filter(w => w.length >= 3 && new RegExp('\\b' + w + '\\b', 'i').test(cal));
console.log('\nreal name words in the calendar or rotation (left as they are):', calHits.length ? calHits.join(', ') : 'none');
if (problems.length) { console.log('\nPROBLEMS:\n' + problems.join('\n') + '\n\nNothing was written to ' + outDir + '.'); process.exit(1); }
// ---------- write (only now: a run that found a problem leaves the out folder as it was) ----------
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, dataName), dataText); fs.writeFileSync(path.join(outDir, csvName), csvText);
console.log('\nwrote', dataName, 'and', csvName, '(' + records.length + ' people)');
