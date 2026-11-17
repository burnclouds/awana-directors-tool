// Emergency contact phone on the binder pages, in this order: (1) the registration answer "Please provide the primary phone number for a parent." (printed as is, no mark);
// (2) the emergency contact's own number (printed as is, no mark); (3) the registration contact's phone (printed with †, and a footnote on that page says so); (4) none: a bold warning in the cell
// and a warning under the table. The contact NAME is always the Planning Center emergency contact's. Invented children only (built in memory).
// Usage: node test/emergency-phone.test.js
const assert = require('assert');
const M = require('../model.js'), Reports = require('../reports.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const { C } = M, PARENT = 'Please provide the primary phone number for a parent.', REG = 'Registration Contact Phone Number';

const KIDS = [
  // first name, emergency contact (Name - phone), parent's primary phone, registration contact phone
  ['Both', 'Aunt Both - 555-0101', '555-0199', '555-0196'],   // the parent's number is printed; no mark
  ['OnlyEmergency', 'Aunt Only - 555-0102', '', ''],          // the contact's own number, no mark
  ['OnlyParent', '', '555-0198', ''],                          // no contact on file, but a parent's number
  ['Neither', '', '', '555-0196'],                             // only the registration contact: printed with †
  ['Spaces', 'Aunt Space - 555-0103', '   ', '   '],            // blank in all but spaces: not an answer
  ['NoPhone', 'Aunt Nophone', '555-0197', ''],                 // the contact has a name but no number of its own
  ['Nothing', '', '', '']                                      // no phone of any kind: the warning
];
function master() {
  const m = M.emptyMaster(); m.pcCols = M.TRACKED.slice(); if (!m.pcCols.includes(PARENT)) m.pcCols.push(PARENT);
  KIDS.forEach(([f, emerg, phone, reg], i) => {
    const p = M.addManualPerson(m, { 'First Name': f, 'Last Name': 'Test', [C.ROOM]: 'Sparks A', Selection: 'Clubber', 'Registration ID': String(7000001 + i), [C.EMERG]: emerg, [PARENT]: phone, [REG]: reg }, '2026-10-01');
    p[C.EMERG] = emerg; p[PARENT] = phone; p[REG] = reg;
  });
  return m;
}
const render = (id, m) => Reports.LIST.find(r => r.id === id).render({ master: m, settings: { quarter: 'Q2', club: 'AWANA Club' }, calendar: [], opts: {} });
// the table row of one child: text of its Emergency contact cell
const cellOf = (html, first) => { const row = html.split('<tr').find(r => r.includes('>' + first + ' Test<')) || ''; const tds = row.split('<td'); return (tds[2] || '').replace(/<br>/g, ' | ').replace(/<[^>]+>/g, '').replace(/&nbsp;|&#160;/g, ' ').trim(); };
const cellOfClass = cellOf;
const FOOT = /registration contact.s number/i, WARN = /NO PHONE ON FILE/, PARENT_NOTE = /primary phone number a parent gave/i;

test('the parent\'s number, when given, is printed first, with no mark; the name stays the emergency contact\'s', () => {
  const h = render('binderClass', master()); const c = cellOf(h, 'Both');
  assert(/Aunt Both/.test(c), c); assert(/555-0199/.test(c), 'parent number: ' + c); assert(!/555-0101/.test(c), 'the contact\'s own number is not shown: ' + c); assert(!/†/.test(c), 'no mark: ' + c);
});
test('with no parent number, the emergency contact\'s own number is shown, with no mark', () => {
  const h = render('binderClass', master()); const c = cellOf(h, 'OnlyEmergency'); assert(/Aunt Only/.test(c) && /555-0102/.test(c), c); assert(!/†/.test(c), c);
  assert(cellOf(h, 'Spaces').includes('555-0103'), 'spaces do not count as an answer: ' + cellOf(h, 'Spaces'));
});
test('a contact with a name but no number gets the parent\'s number; a parent number with no contact is shown alone', () => {
  const h = render('binderClass', master()); const a = cellOf(h, 'NoPhone'); assert(/Aunt Nophone/.test(a) && /555-0197/.test(a), a);
  const b = cellOf(h, 'OnlyParent'); assert(/555-0198/.test(b), b); assert(!WARN.test(b), b);
});
test('with only the registration contact\'s phone, it is printed with †', () => {
  const h = render('binderClass', master()); const c = cellOf(h, 'Neither'); assert(/555-0196/.test(c), c); assert(/†/.test(c), 'the mark: ' + c); assert(!/Aunt/.test(c), 'no name when there is no contact: ' + c);
});
test('a child with no phone of any kind gets the bold warning in the cell', () => {
  const h = render('binderClass', master()); assert(WARN.test(cellOf(h, 'Nothing')), cellOf(h, 'Nothing'));
});
test('the footnote appears only when a registration contact\'s number is printed (not for parent or contact numbers)', () => {
  const h = render('binderClass', master()); assert(FOOT.test(h), 'the footnote is there');
  const m = master(); m.people.forEach(p => { p[REG] = ''; }); assert(!FOOT.test(render('binderClass', m)), 'no footnote when no registration number is used');
});
test('no footnote for a parent\'s number (none is marked); a warning sits under the table when a child has no phone', () => {
  const h = render('binderClass', master()); assert(!PARENT_NOTE.test(h), 'the parent number is not marked, so no note about it'); assert(/NO phone number on file/.test(h), 'the warning under the table');
  const m = master(); m.people.forEach(p => { p[C.ROOM] = 'Sparks A'; }); m.people = m.people.filter(p => M.fullName(p) !== 'Nothing Test'); assert(!/NO phone number on file/.test(render('binderClass', m)), 'no warning when everyone has a phone');
});
test('"N/A" or a short answer is not a phone: it is skipped and the next number is used (CR-02)', () => {
  const m = M.emptyMaster(); m.pcCols = M.TRACKED.slice(); if (!m.pcCols.includes(PARENT)) m.pcCols.push(PARENT);
  [['NaParent', 'Aunt Na - 555-0104', 'N/A', ''], ['ShortParent', 'Aunt Sh - 555-0105', '12', ''], ['NaReg', '', '', 'N/A'], ['WordsParent', '', 'Mom 555-0106', '']].forEach(([f, emerg, phone, reg], i) => {
    const p = M.addManualPerson(m, { 'First Name': f, 'Last Name': 'Test', [C.ROOM]: 'Sparks A', Selection: 'Clubber', 'Registration ID': String(7100001 + i), [C.EMERG]: emerg, [PARENT]: phone, [REG]: reg }, '2026-10-01');
    p[C.EMERG] = emerg; p[PARENT] = phone; p[REG] = reg;
  });
  ['binderClass', 'binderAll'].forEach(id => {
    const h = render(id, m), cellOf = (html, first) => id === 'binderAll' ? (html.split('<tr').find(r => r.includes(first)) || '').replace(/<[^>]+>/g, ' ') : cellOfClass(html, first);      // the coaches binder lists "Last, First": read the whole row
    const a = cellOf(h, 'NaParent'); assert(/555-0104/.test(a) && !/N\/A/.test(a), id + ' NaParent: ' + a);
    const b = cellOf(h, 'ShortParent'); assert(/555-0105/.test(b) && !/>12</.test(b), id + ' ShortParent: ' + b);
    const c = cellOf(h, 'NaReg'); assert(WARN.test(c) && !/N\/A/.test(c) && !/†/.test(c), id + ' NaReg: ' + c);
    assert(/555-0106/.test(cellOf(h, 'WordsParent')), id + ' words with a number are printed as typed');
  });
  const k = M.addManualPerson(m, { 'First Name': 'NaClub', 'Last Name': 'Test', [C.ROOM]: 'Sparks A', Selection: 'Clubber', 'Registration ID': '7100009' }, '2026-10-01'); k[M.X.EMERG_PHONE] = 'N/A';
  assert.strictEqual(M.clubPhone(k), '', 'a club phone of "N/A" is not a phone');
  assert.strictEqual(M.parentPhone(Object.assign({}, k, { [PARENT]: 'N/A' })), ''); assert.strictEqual(M.hasPhoneDigits('555-0142'), true); assert.strictEqual(M.hasPhoneDigits('12'), false);
});
test('the coaches binder (everyone by name) follows the same order', () => {
  const h = render('binderAll', master()); const row = h.split('<tr').find(r => r.includes('Both')) || ''; assert(/555-0199/.test(row) && !/555-0101/.test(row), row.replace(/<[^>]+>/g, ' ').slice(0, 160));
  assert(WARN.test(h.split('<tr').find(r => r.includes('Nothing')) || ''), 'the warning for a child with no phone');
});

const kid = (m, first) => m.people.find(p => M.fullName(p) === first + ' Test');
test('a club choice prints with no mark when neither the parent nor the emergency contact has a number', () => {
  const m = master(); kid(m, 'Nothing')[M.X.EMERG_PHONE] = '555-0130'; const c = cellOf(render('binderClass', m), 'Nothing');
  assert(/555-0130/.test(c), c); assert(!/†/.test(c), 'no mark: ' + c); assert(!WARN.test(c), 'no warning: ' + c);
});
test('a club choice beats the registration contact\'s number, which is then not printed', () => {
  const m = master(); kid(m, 'Neither')[M.X.EMERG_PHONE] = '555-0131'; const c = cellOf(render('binderClass', m), 'Neither');
  assert(/555-0131/.test(c), c); assert(!/555-0196/.test(c), 'registration number hidden: ' + c); assert(!/†/.test(c), c);
});
test('a club choice does not replace a parent\'s number or an emergency contact\'s number', () => {
  const m = master(); kid(m, 'Both')[M.X.EMERG_PHONE] = '555-0132'; const c = cellOf(render('binderClass', m), 'Both');
  assert(/555-0199/.test(c), c); assert(!/555-0132/.test(c), 'the choice is not used while a parent number is listed: ' + c);
});

test('once the Emergency Contact box has data, the club choice is not used: the registration contact\'s number is printed instead', () => {
  const m = master(); const p = kid(m, 'Neither'); p[M.X.EMERG_PHONE] = '555-0133'; p[C.EMERG] = 'Aunt Neither - 555-0134';
  const c = cellOf(render('binderClass', m), 'Neither'); assert(!/555-0133/.test(c), 'the choice is hidden: ' + c); assert(/555-0134/.test(c), 'the emergency contact number: ' + c);
  const d = kid(m, 'Nothing'); d[M.X.EMERG_PHONE] = '555-0135'; d[C.EMERG] = 'Aunt Nothing'; assert(/555-0135/.test(cellOf(render('binderClass', m), 'Nothing')), 'a name alone is not a number, so the chosen number shows');
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
