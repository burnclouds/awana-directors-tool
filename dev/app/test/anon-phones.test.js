// The anonymizer's phone rule (CR-01): a phone is any run of 7 or more digits, with or without separators. Invented numbers only (555-01xx).
// Also: every long digit run in the public test data is an invented shape, so a real number cannot be sitting in the files that are published.
// Usage: node test/anon-phones.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const A = require('../../tools/anon-pc.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const hits = s => (String(s).match(A.PHONE_RE) || []);

test('7, 8 and 9 digit numbers, with or without separators, are found', () => {
  ['555-0142', '5550143', '555 0144', '15550146', '937555014', '937-555-014', '555.0147'].forEach(s => assert.strictEqual(hits('call ' + s + ' now').length, 1, s));
});
test('10 and 11 digit numbers are still found, punctuation and all; two numbers in one text are both found', () => {
  assert.strictEqual(hits('(937) 555-0147').length, 1); assert.strictEqual(hits('1-937-555-0148').length, 1);
  assert.strictEqual(hits('Mom 555-0150; Dad (513) 555-0151 ext. 12').length, 2);
});
test('words, money, dates and ZIP+4 are not phone numbers', () => {
  ['N/A', '$70', '2026-11-03', '45433-1234', 'grade 3', '12'].forEach(s => assert.strictEqual(hits(s).length, 0, s));
});
test('a short number becomes the last digits of a 555-01xx fake: same length, never the same digits, the same answer each time', () => {
  ['5550142', '15550146', '937555014'].forEach(core => {
    const f = A.fakeShortPhone(core); assert.strictEqual(f.length, core.length, core); assert.notStrictEqual(f, core); assert(/55501\d\d$/.test(f), 'shape ' + f); assert.strictEqual(A.fakeShortPhone(core), f, 'deterministic');
  });
});
test('phoneRuns finds runs of 7+ digits through separators and leaves dates and ZIP+4 alone', () => {
  assert.deepStrictEqual(A.phoneRuns('Call 555-0142 or (937) 555-0147 on 2026-11-03 zip 45433-1234'), ['5550142', '9375550147']);
  assert.deepStrictEqual(A.phoneRuns('2026-11-03T14:00:00Z and 12'), []);
  assert.deepStrictEqual(A.phoneRuns('20261117 -- sc-awana-club-2026-27.csv'), []); assert.deepStrictEqual(A.phoneRuns('20261104-3 -- sc-awana-club-2026-27.csv'), []); assert.deepStrictEqual(A.phoneRuns('call 20261117'), ['20261117'], 'a bare 8-digit number is still checked');
});
test('leakingPhones counts a surviving number without printing it; numbers in the exception text are not leaks', () => {
  assert.strictEqual(A.leakingPhones('Call 555-0142', 'x 555-0142 y'), 1); assert.strictEqual(A.leakingPhones('Call 555-0142', 'x 555-9999 y'), 0);
  assert.strictEqual(A.leakingPhones('Call 555-0142', 'x 555-0142', '555-0142'), 0);
  assert(!/\d/.test(String(A.leakingPhones('Call 555-0142', 'x 555-0142 y')).replace(/^\d+$/, '')), 'only a count');
});
test('the published test data holds only invented phone shapes (never a number of 7+ digits that could be real)', () => {
  const td = path.join(__dirname, '..', '..', 'test-data'), files = fs.readdirSync(td).filter(f => /TEST.*\.(json|csv)$/.test(f)), bad = [];
  files.forEach(f => {
    const text = fs.readFileSync(path.join(td, f), 'utf8');
    A.phoneRuns(text).forEach(d => {
      const ok = /5550[01]\d\d$|55501\d\d$/.test(d)        // a 555-01xx fake of any length
        || /^(937|513|614|330|419|440|216|567)55501\d$/.test(d)      // the 9-digit fake the old rule made (an area code, 555, then 01 cut short)
        || /^7\d{7}$/.test(d) || /^9000\d{4}$/.test(d)      // an invented registration or export ID
        || /^20\d{6}$/.test(d);                              // a stamp such as the export date in a file name
      if (!ok) bad.push(f + ': a ' + d.length + '-digit run');
    });
  });
  assert.deepStrictEqual([...new Set(bad)], [], 'unexpected long digit runs (shapes only, no values)');
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
