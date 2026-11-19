// N9 point 9: each Google Drive failure carries a kind (signin, folder, busy, offline, other) that the app turns into one plain sentence.
// Pretend Google only; invented names. Usage: node test/drive-errors.test.js
const assert = require('assert');
const Drive = require('../drive.js');
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
}
const CFG = { clientId: 'x.apps.googleusercontent.com', apiKey: 'KEY', appId: '123' };
// A pretend Google that answers one request with the given status, or throws (a network failure) when status is 'network'.
function pretend(status) {
  return {
    loadScript: async () => {},
    google: () => ({ accounts: { oauth2: { initTokenClient: o => ({ requestAccessToken: () => o.callback({ access_token: 'TOKEN', expires_in: 3600 }) }), revoke: () => {} } } }),
    fetch: async () => {
      if (status === 'network') throw new TypeError('Failed to fetch');
      return { ok: status < 400, status, json: async () => ({ error: { message: 'why' } }), text: async () => '' };
    },
  };
}
async function kindOf(status) {
  const d = Drive.create(CFG, pretend(status));
  try { await d.save('n', '{}', 'application/json'); return 'no error'; } catch (e) { return e.kind; }
}
(async () => {
  await test('a 401 is a sign-in problem', async () => assert.strictEqual(await kindOf(401), 'signin'));
  await test('a 403 or 404 is a folder problem', async () => { assert.strictEqual(await kindOf(403), 'folder'); assert.strictEqual(await kindOf(404), 'folder'); });
  await test('429 and 5xx are busy (Google is working, nothing changed)', async () => { for (const s of [429, 500, 502, 503, 504]) assert.strictEqual(await kindOf(s), 'busy', String(s)); });
  await test('a network failure is offline', async () => assert.strictEqual(await kindOf('network'), 'offline'));
  await test('anything else is other, and the technical text and status are kept', async () => {
    assert.strictEqual(await kindOf(418), 'other');
    const d = Drive.create(CFG, pretend(503));
    await assert.rejects(() => d.save('n', '{}', 'application/json'), e => e.status === 503 && /Google Drive said 503/.test(e.message));
  });
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
