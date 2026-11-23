const assert = require('node:assert/strict'), test = require('node:test');
const { encode, decode, capture } = require('../location-code.js');

test('round trips a date and built-in class', () => {
  const value = { tab: 'attend', target: 'marks', view: { date: '2028-02-29', room: 'T&T Boys (Group A)' } };
  assert.deepEqual(decode(' ' + encode(value) + '\n'), value);
});

test('captures only portable view values', () => {
  const result = capture('attend', 'room', { room: 'Custom private class', date: '2026-11-18', person: 'Test Child' });
  assert.deepEqual(decode(result.code), { tab: 'attend', target: 'room', view: { date: '2026-11-18' } });
  assert.deepEqual(result.omitted, ['room', 'person']);
});

test('rejects malformed, oversized and unsupported locations', () => {
  ['AW2.abc', 'AW1.abc!', 'AW1.' + 'a'.repeat(421)].forEach(s => assert.throws(() => decode(s)));
  [
    '{"tab":"debug","target":"#save"}',
    '{"tab":"reports","view":{"quarter":"Q0"}}',
    '{"tab":"attend","view":{"date":"2026-02-29"}}',
    '{"tab":"attend","view":{"__proto__":"x"}}',
    '{"tab":"reports","view":{"report":"bundle:Private name"}}',
    '{"tab":"person","view":{"kid":"Private name"}}',
    '{"tab":"constructor"}',
    '{"tab":"reports","view":[]}',
    '{"tab":"attend","record":1}'
  ].forEach(s => assert.throws(() => decode('AW1.' + Buffer.from(s).toString('base64url'))));
});
