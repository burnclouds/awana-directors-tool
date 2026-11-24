// Google Drive access (drive.js) against a pretend Google: what is requested, what is refused, and that nothing runs unconfigured.
const assert = require('assert'), fs = require('fs'), path = require('path');
const Drive = require('../drive.js');
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
}
const CFG = { clientId: 'x.apps.googleusercontent.com', apiKey: 'KEY', appId: '123' };
function fake(responses) {
  const calls = [], loaded = [];
  const env = {
    loadScript: async src => { loaded.push(src); },
    google: () => ({ accounts: { oauth2: { initTokenClient: o => ({ requestAccessToken: () => o.callback({ access_token: 'TOKEN', expires_in: 3600 }) }), revoke: () => calls.push({ revoked: true }) } } }),
    fetch: async (url, init) => {
      calls.push({ url, init }); const r = responses.shift();
      return { ok: r.status < 400, status: r.status, json: async () => r.json, text: async () => r.text };
    },
  };
  return { env, calls, loaded };
}
const pendingKey = 'awana-drive-pending', corruptKey = pendingKey + '-corrupt';
function memoryStorage(raw) {
  const values = new Map(raw === undefined ? [] : [[pendingKey, raw]]);
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
}
const unreadable = name => 'The earlier save check for ' + name + ' could not be read. Reopen the file from Drive before saving.';
const ours = '{"mark":"ours"}', theirs = '{"other":true}';
function recoveryServer(firstUpload) {
  const f = fake([]), revisions = ['{}'], retained = new Set(), uploads = [], state = { offline: false, lag: 0, waits: 0 };
  const add = text => { revisions.push(text); return 'r' + revisions.length; };
  f.env.wait = async () => { state.waits++; };
  f.env.fetch = async (url, init) => {
    if (state.offline) throw new TypeError('offline');
    if (init.method === 'PUT') {
      const body = init.body.split('\r\n\r\n')[2].split('\r\n--')[0];
      uploads.push(body);
      if (uploads.length === 1) {
        firstUpload(add, body, state);
        throw new TypeError('lost reply');
      }
      return Response.json({ id: 'F', title: 'club.json', headRevisionId: add(body) });
    }
    const revision = /\/revisions\/(r\d+)/.exec(url)?.[1];
    if (revision && init.method === 'PATCH') { retained.add(revision); return Response.json({}); }
    if (revision) {
      assert(retained.has(revision));
      return new Response(revisions[Number(revision.slice(1)) - 1]);
    }
    if (url.includes('/revisions?')) {
      const rows = (state.lag > 0 ? revisions.slice(0, 1) : revisions).map((_, i) => ({
        id: 'r' + (i + 1), modifiedTime: '2040-09-05T00:00:00Z', keepForever: retained.has('r' + (i + 1))
      }));
      if (state.lag > 0) state.lag--;
      return Response.json({ revisions: rows });
    }
    const headRevisionId = 'r' + revisions.length;
    return Response.json({ headRevisionId, etag: JSON.stringify(headRevisionId) });
  };
  const save = (d = Drive.create(CFG, f.env), prepare = async (rev, remote) =>
    remote ? JSON.stringify({ ...JSON.parse(remote), ...JSON.parse(ours) }) : ours) =>
    d.updateMerged('F', 'club.json', prepare, ours);
  return { env: f.env, save, add, retained, uploads, state, revisions };
}

(async () => {
  for (const blocked of ['getItem', 'setItem']) {
    await test('blocked storage ' + blocked + ' warns once and keeps save checks in memory', async () => {
      const f = recoveryServer(() => {});
      const fetch = f.env.fetch, warnings = [];
      f.env.fetch = (url, init) => init.method === 'PUT'
        ? Response.json({ id: 'F', title: 'club.json', headRevisionId: f.add(ours) })
        : fetch(url, init);
      f.env.storage = { getItem: () => null, setItem: () => {} };
      f.env.storage[blocked] = () => { throw new Error('storage blocked'); };
      f.env.onStorageUnavailable = message => warnings.push(message);
      const d = Drive.create(CFG, f.env);
      assert.equal((await f.save(d)).headRevisionId, 'r2');
      assert.equal(await d.verifyReopened('F'), null);
      assert.equal(await d.verifyReopened('F'), null);
      assert.deepEqual(warnings, ['This browser will not keep save checks between reloads. Save a local copy before closing.']);
    });
  }
  await test('storage recovery flushes a pending deletion without reviving the stale check', async () => {
    const f = recoveryServer(() => {});
    const other = { name: 'other.json', base: 'r2', written: null };
    let saved = JSON.stringify([['F', { name: 'club.json', base: 'r1', written: null }], ['G', other]]);
    let writable = false;
    const write = value => {
      if (!writable) throw new Error('storage blocked');
      saved = value;
    };
    f.env.storage = { getItem: key => key === pendingKey ? saved : null, setItem: (key, value) => write(value), removeItem: () => write(null) };
    const d = Drive.create(CFG, f.env);
    assert.equal(d.clearPending('F'), true);
    assert.equal(await d.verifyReopened('F'), null);
    assert(saved.includes('club.json'));
    writable = true;
    assert.equal(await d.verifyReopened('F'), null);
    assert.deepEqual(JSON.parse(saved), [['G', other]]);
    assert.equal(Drive.create(CFG, f.env).pendingFor('F'), undefined);
    assert.equal(f.uploads.length, 0);
  });
  await test('storage recovery does not revive an added check discarded while writes were blocked', async () => {
    const f = recoveryServer((add, body, state) => { state.offline = true; });
    const unrelated = JSON.stringify([['G', { name: 'other.json', base: 'r1', written: null }]]);
    const storage = f.env.storage = memoryStorage(unrelated);
    const set = storage.setItem;
    let attempts = 0;
    storage.setItem = () => { attempts++; throw new Error('storage blocked'); };
    const d = Drive.create(CFG, f.env);
    await assert.rejects(f.save(d), { kind: 'pending' });
    assert.equal(attempts, 1);
    assert(d.pendingFor('F'));
    assert.equal(d.clearPending('F'), true);
    assert.equal(attempts, 2);
    storage.setItem = set;
    assert.equal(await d.verifyReopened('F'), null);
    assert.equal(storage.getItem(pendingKey), unrelated);
    assert.equal(Drive.create(CFG, f.env).pendingFor('F'), undefined);
  });
  await test('storage recovery replaces a failed update with only the latest check', async () => {
    const f = recoveryServer(() => {});
    const storage = f.env.storage = memoryStorage();
    const set = storage.setItem, fetch = f.env.fetch;
    let blocked = false, failures = 0;
    storage.setItem = (key, value) => {
      if (blocked) { failures++; throw new Error('storage blocked'); }
      set(key, value);
    };
    f.env.fetch = (url, init) => {
      if (init.method !== 'PUT') return fetch(url, init);
      blocked = f.state.offline = true;
      return Response.json({ id: 'F', title: 'club.json', headRevisionId: f.add(ours) });
    };
    const d = Drive.create(CFG, f.env);
    await assert.rejects(f.save(d), { pendingWrite: true });
    assert(failures > 0);
    assert.equal(JSON.parse(storage.getItem(pendingKey))[0][1].written, null);
    blocked = false;
    await assert.rejects(d.verifyReopened('F'), { kind: 'offline' });
    const stored = JSON.parse(storage.getItem(pendingKey));
    assert.equal(stored.length, 1);
    assert.deepEqual(stored.map(([id, entry]) => [id, entry.written]), [['F', 'r2']]);
  });
  await test('saving a second file preserves a named corrupt check through reload', async () => {
    const f = recoveryServer((add, body, state) => { add(body); state.offline = true; });
    const raw = '[["F", {"name":"club.json", "base":';
    const storage = f.env.storage = memoryStorage(raw);
    const warnings = [];
    f.env.onStorageUnavailable = message => warnings.push(message);
    const saveOther = d => d.updateMerged('G', 'other.json', async () => theirs, theirs);
    await assert.rejects(saveOther(Drive.create(CFG, f.env)), { kind: 'pending' });
    assert.equal(JSON.parse(storage.getItem(corruptKey))[0].raw, raw);
    assert.deepEqual(JSON.parse(storage.getItem(pendingKey)).map(([id]) => id), ['G']);
    const reloaded = Drive.create(CFG, f.env);
    assert.deepEqual(reloaded.unreadableWarnings(), [unreadable('club.json')]);
    assert.deepEqual(reloaded.pendingFor('F'), { unreadable: true });
    await assert.rejects(f.save(reloaded), { message: unreadable('club.json'), pendingWrite: true });
    assert.deepEqual(warnings, []);
  });
  await test('the corrupt archive survives until every named file passes its reopen check', async () => {
    const f = recoveryServer(() => {});
    const raw = JSON.stringify([['F', { name: 'club.json' }], ['G', { name: 'other.json' }]]);
    const storage = f.env.storage = memoryStorage(raw);
    const d = Drive.create(CFG, f.env);
    assert.deepEqual(d.unreadableWarnings(), [unreadable('club.json'), unreadable('other.json')]);
    f.state.offline = true;
    await assert.rejects(d.verifyReopened('F', 'club.json'), { kind: 'offline' });
    assert.equal(JSON.parse(storage.getItem(corruptKey))[0].raw, raw);
    assert.deepEqual(d.pendingFor('F'), { unreadable: true });
    f.state.offline = false;
    assert.deepEqual(await d.verifyReopened('F', 'club.json'), []);
    assert.equal(d.pendingFor('F'), undefined);
    const reloaded = Drive.create(CFG, f.env);
    assert.deepEqual(reloaded.unreadableWarnings(), [unreadable('other.json')]);
    assert.equal(JSON.parse(storage.getItem(corruptKey))[0].raw, raw);
    assert.deepEqual(await reloaded.verifyReopened('G', 'other.json'), []);
    assert.equal(reloaded.pendingFor('G'), undefined);
    assert.equal(storage.getItem(corruptKey), null);
    assert.deepEqual(Drive.create(CFG, f.env).unreadableWarnings(), []);
  });
  await test('the primary corrupt value cannot be replaced until the archive write succeeds', async () => {
    const f = recoveryServer((add, body, state) => { state.offline = true; });
    const raw = JSON.stringify([['F', { name: 'club.json' }]]);
    const storage = f.env.storage = memoryStorage(raw);
    const set = storage.setItem, warnings = [];
    f.env.onStorageUnavailable = message => warnings.push(message);
    let archiveWritable = false;
    storage.setItem = (key, value) => {
      if (key === corruptKey && !archiveWritable) throw new Error('archive blocked');
      if (key === pendingKey) assert.equal(JSON.parse(storage.getItem(corruptKey))[0].raw, raw);
      set(key, value);
    };
    const d = Drive.create(CFG, f.env);
    await assert.rejects(d.updateMerged('G', 'other.json', async () => theirs), { kind: 'pending' });
    assert.equal(storage.getItem(pendingKey), raw);
    assert.equal(storage.getItem(corruptKey), null);
    archiveWritable = true;
    await assert.rejects(d.verifyReopened('G', 'other.json'), { kind: 'offline' });
    assert.equal(JSON.parse(storage.getItem(corruptKey))[0].raw, raw);
    assert.deepEqual(JSON.parse(storage.getItem(pendingKey)).map(([id]) => id), ['G']);
    assert.deepEqual(warnings, []);
  });
  await test('a damaged archive warns after reload and preserves a valid pending check', async () => {
    const f = fake([]);
    const pending = { name: 'club.json', base: 'r1', written: null };
    const raw = JSON.stringify([['F', pending]]);
    const storage = f.env.storage = memoryStorage(raw);
    const warnings = [];
    f.env.onStorageUnavailable = message => warnings.push(message);
    storage.setItem(corruptKey, '{bad');

    const reloaded = Drive.create(CFG, f.env);
    assert.deepEqual(reloaded.unreadableWarnings(), [unreadable('a file')]);
    assert.deepEqual(reloaded.pendingFor('F'), pending);
    await assert.rejects(reloaded.updateMerged('F', pending.name, async () => ours),
      { message: unreadable('club.json'), pendingWrite: true });
    assert.deepEqual(warnings, []);
    assert.equal(storage.getItem(pendingKey), raw);
    assert.equal(storage.getItem(corruptKey), '{bad');
  });
  await test('unidentifiable corrupt storage warns about a file until a reopen check succeeds', async () => {
    const f = recoveryServer(() => {});
    const storage = f.env.storage = memoryStorage('{bad json');
    const d = Drive.create(CFG, f.env);
    assert.deepEqual(Drive.create(CFG, f.env).unreadableWarnings(), [unreadable('a file')]);
    assert.deepEqual(d.pendingFor('F'), { unreadable: true });
    assert.deepEqual(await d.verifyReopened('F'), []);
    assert.equal(storage.getItem(corruptKey), null);
    assert.equal(d.pendingFor('F'), undefined);
  });
  await test('with no client ID or API key nothing is configured and every call refuses before touching the network', async () => {
    const f = fake([]), d = Drive.create({ clientId: '', apiKey: '' }, f.env);
    assert(!d.configured());
    for (const fn of [() => d.preload(), () => d.connect(), () => d.read('1'), () => d.save('a', 'b', 'text/plain')]) await assert.rejects(fn, /not set up/);
    assert.strictEqual(f.calls.length + f.loaded.length, 0);
  });
  await test('reading a file asks for its details, then its content, with the sign-in token', async () => {
    const f = fake([{ status: 200, json: { id: 'F1', name: 'awana-2026-27-20261029-214815.json', parents: ['P1'], modifiedTime: '2026-10-29T21:48:15.000Z', mimeType: 'application/json' } }, { status: 200, text: '{"a":1}' }]);
    const d = Drive.create(CFG, f.env), r = await d.read('F1');
    assert.deepStrictEqual([r.name, r.text, r.parents, r.lastModified], ['awana-2026-27-20261029-214815.json', '{"a":1}', ['P1'], Date.parse('2026-10-29T21:48:15.000Z')]);
    assert(/files\/F1\?supportsAllDrives=true&fields=/.test(f.calls[0].url) && /alt=media/.test(f.calls[1].url));
    assert.strictEqual(f.calls[0].init.headers.Authorization, 'Bearer TOKEN');
    assert.deepStrictEqual(f.loaded, ['https://accounts.google.com/gsi/client']);
  });
  await test('a Google Sheet or Doc is refused with an explanation instead of garbage', async () => {
    const f = fake([{ status: 200, json: { id: 'S', name: 'Roster', mimeType: 'application/vnd.google-apps.spreadsheet' } }]);
    await assert.rejects(() => Drive.create(CFG, f.env).read('S'), /Google document/);
  });
  await test('saving makes a new file in the chosen folder (a POST, never an overwrite) with the exact content', async () => {
    const f = fake([{ status: 200, json: { id: 'N1', name: 'n.json', parents: ['P1'] } }]);
    const text = '{"name":"Zoë – ü","n":1}', r = await Drive.create(CFG, f.env).save('n.json', text, 'application/json', 'P1');
    const c = f.calls[0];
    assert.strictEqual(r.id, 'N1'); assert.strictEqual(c.init.method, 'POST');
    assert(/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?uploadType=multipart/.test(c.url) && !/files\/[A-Za-z0-9]+\?/.test(c.url), c.url);
    assert(/^multipart\/related; boundary=gonk/.test(c.init.headers['Content-Type']));
    assert(c.init.body.includes('"parents":["P1"]') && c.init.body.includes('"name":"n.json"') && c.init.body.includes(text));
  });
  await test('saving a PNG or ZIP keeps every byte (the body is binary, not text)', async () => {
    const f = fake([{ status: 200, json: { id: 'N2', name: 's.png', parents: ['P1'] } }]), bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00, 0x80, 0xc3, 0x28]);
    const r = await Drive.create(CFG, f.env).save('s.png', bytes, 'image/png', 'P1'), c = f.calls[0];
    assert.strictEqual(r.id, 'N2'); assert.strictEqual(c.init.method, 'POST');
    const body = Buffer.from(await new Response(c.init.body).arrayBuffer());
    assert(body.includes(Buffer.from(bytes)), 'the exact bytes are in the upload');
    const head = body.toString('latin1'); assert(head.includes('"mimeType":"image/png"') && head.includes('"parents":["P1"]') && head.includes('"name":"s.png"'));
    assert(/^multipart\/related; boundary=gonk/.test(c.init.headers['Content-Type']));
  });
  await test('a Blob (what the slide drawing and the ZIP maker produce) is uploaded the same way', async () => {
    const f = fake([{ status: 200, json: { id: 'N3', name: 'z.zip', parents: [] } }]), bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x90, 0xff, 0x00]);
    await Drive.create(CFG, f.env).save('z.zip', new Blob([bytes]), 'application/zip');
    assert(Buffer.from(await new Response(f.calls[0].init.body).arrayBuffer()).includes(Buffer.from(bytes)));
  });
  await test('a refused folder comes back as an error carrying the status, so the app can ask for another folder', async () => {
    const f = fake([{ status: 404, json: { error: { message: 'File not found: P9.' } } }]);
    await assert.rejects(() => Drive.create(CFG, f.env).save('n.json', '{}', 'application/json', 'P9'), e => e.status === 404 && /File not found/.test(e.message));
  });
  await test('an expired token (401) is dropped so the next call signs in again; signing out revokes it', async () => {
    const f = fake([{ status: 401, json: { error: { message: 'Invalid Credentials' } } }, { status: 200, json: { id: 'N', name: 'n', parents: [] } }]), d = Drive.create(CFG, f.env);
    await assert.rejects(() => d.save('n', '{}', 'application/json'), e => e.status === 401);
    assert(!d.connected());
    await d.save('n', '{}', 'application/json'); assert(d.connected());
    d.disconnect(); assert(!d.connected()); assert(f.calls.some(c => c.revoked));
  });
  await test('head pairs a revision and ETag, update conditionally replaces the same file with a new name and body (never a POST), and nothing is deleted', async () => {
    const f = fake([{ status: 200, json: { id: 'F1', headRevisionId: 'R1' } }, { status: 200, json: { id: 'F1', name: 'new.json', headRevisionId: 'R2' } }]);
    const d = Drive.create(CFG, f.env), h = await d.head('F1'); assert.strictEqual(h.headRevisionId, 'R1'); assert(/fields=id,etag,headRevisionId/.test(f.calls[0].url));
    const u = await d.update('F1', 'new.json', '{"a":2}', 'application/json', '"tag1"'); assert.strictEqual(u.headRevisionId, 'R2');
    const c = f.calls[1]; assert.strictEqual(c.init.headers['If-Match'], '"tag1"'); assert.strictEqual(c.init.method, 'PUT'); assert(/upload\/drive\/v2\/files\/F1\?uploadType=multipart/.test(c.url));
    assert(c.init.body.includes('{"title":"new.json"}') && c.init.body.includes('{"a":2}'), 'new name and new content in one request');
    assert(f.calls.every(x => !x.init || x.init.method !== 'DELETE'));
  });
  await test('a changing head exhausts four conditional writes, and a missing validator never sends a write', async () => {
    const responses = Array.from({ length: 4 }, (_, i) => [
      { status: 200, json: { headRevisionId: String(i), etag: JSON.stringify(String(i)) } },
      { status: 200, json: { headRevisionId: String(i), etag: JSON.stringify(String(i)) } },
      { status: 412, json: {} }
    ]).flat();
    const f = fake(responses), d = Drive.create(CFG, f.env), prepared = [];
    await assert.rejects(d.updateMerged('F', 'club.json', async rev => { prepared.push(rev); return '{}'; }), /keeps changing/);
    assert.deepEqual(prepared, ['0', '1', '2', '3']);
    assert.equal(d.pendingFor('F'), undefined);
    assert.equal(f.calls.filter(c => c.init.method === 'PUT').length, 4);
    for (const tag of [undefined, '*', 'W/"weak"']) {
      await assert.rejects(d.update('F', 'club.json', '{}', 'application/json', tag), /strong file ETag/);
    }
    assert.equal(f.calls.length, 12);
  });
  await test('B1: a stored upload with a lost reply is recovered without uploading again', async () => {
    const f = recoveryServer((add, body) => add(body)), d = Drive.create(CFG, f.env);
    const result = await f.save(d);
    assert.equal(result.headRevisionId, 'r2');
    assert.equal(result.recovered, true);
    assert.equal(f.uploads.length, 1);
    assert.equal(d.pendingFor('F'), undefined);
  });
  await test('B2: a lost reply after an ignored condition merges the displaced revision', async () => {
    const f = recoveryServer((add, body) => { add(theirs); add(body); });
    assert.equal((await f.save()).recovered, true);
    assert(f.retained.has('r2'));
    assert.deepEqual(JSON.parse(f.revisions.at(-1)), { other: true, mark: 'ours' });
  });
  await test('B3: an upload that never landed is retried', async () => {
    const f = recoveryServer(() => {});
    assert.equal((await f.save()).headRevisionId, 'r2');
    assert.equal(f.uploads.length, 2);
    assert.equal(f.revisions.length, 2);
  });
  await test('B4: offline checks preserve the pending entry until Drive comes back', async () => {
    const f = recoveryServer((add, body, state) => { add(body); state.offline = true; });
    const d = Drive.create(CFG, f.env);
    await assert.rejects(f.save(d), err => err.kind === 'pending' && /club\.json.*needs checking/.test(err.message));
    assert.equal(d.pendingFor('F').written, null);
    f.state.offline = false;
    assert.equal((await f.save(d)).headRevisionId, 'r2');
    assert.equal(f.uploads.length, 1);
  });
  await test('B5a: the revision list catches up after two waits', async () => {
    const f = recoveryServer((add, body, state) => { add(body); state.lag = 2; });
    assert.equal((await f.save()).headRevisionId, 'r2');
    assert.equal(f.state.waits, 2);
  });
  await test('B5b: a still-lagging list gets a retryable message', async () => {
    const f = recoveryServer((add, body, state) => { add(body); state.lag = Infinity; });
    const d = Drive.create(CFG, f.env);
    await assert.rejects(f.save(d), err => err.kind === 'lagging' && /not caught up/.test(err.message) && !/Cannot match/.test(err.message));
    f.state.lag = 0;
    assert.equal((await f.save(d)).headRevisionId, 'r2');
  });
  await test('B6: a newer head blocks repair until deliberately cleared and keeps the displaced revision', async () => {
    const f = recoveryServer((add, body) => { add(theirs); add(body); });
    const d = Drive.create(CFG, f.env);
    await assert.rejects(f.save(d, async (rev, remote) => {
      if (!remote) return ours;
      f.add('{"newer":true}');
      throw Object.assign(new Error('review cancelled'), { cancelled: true });
    }), /review cancelled/);
    for (let i = 0; i < 2; i++) {
      await assert.rejects(f.save(d), err => err.kind === 'pending' && /2040-09-05.*version history/.test(err.message));
    }
    assert.equal(f.uploads.length, 1);
    assert(f.retained.has('r2'));
    assert.equal(d.clearPending('F'), true);
    const result = await f.save(d, async rev => {
      assert.equal(rev, 'r4');
      return JSON.stringify({ ...JSON.parse(f.revisions.at(-1)), ...JSON.parse(ours) });
    });
    assert.equal(result.headRevisionId, 'r5');
    assert.deepEqual(JSON.parse(f.revisions.at(-1)), { newer: true, mark: 'ours' });
  });
  await test('B8: a reload can recover an unknown write using only persisted metadata', async () => {
    const f = recoveryServer((add, body, state) => { add(body); state.offline = true; });
    let saved;
    f.env.storage = { getItem: key => key === pendingKey ? saved : null, setItem: (key, value) => { saved = value; } };
    f.env.crypto = require('node:crypto').webcrypto;
    await assert.rejects(f.save(), { kind: 'pending' });
    assert(!saved.includes('ours'));
    const d = Drive.create(CFG, f.env);
    assert.equal(d.pendingFor('F').written, null);
    assert.equal(d.pendingFor('F').body, undefined);
    f.state.offline = false;
    assert.equal((await f.save(d)).recovered, true);
    assert.equal(f.uploads.length, 1);
    assert.equal(d.pendingFor('F'), undefined);
  });
  await test('reopening checks the saved fingerprint and pins and identifies a displaced revision', async () => {
    const f = recoveryServer((add, body, state) => { add(theirs); add(body); state.offline = true; });
    let saved;
    f.env.storage = { getItem: key => key === pendingKey ? saved : null, setItem: (key, value) => { saved = value; } };
    const crypto = require('node:crypto');
    f.env.crypto = crypto.webcrypto;
    await assert.rejects(f.save(), { kind: 'pending' });
    const d = Drive.create(CFG, f.env);
    assert.equal(d.pendingFor('F').digest, crypto.createHash('sha256').update(ours).digest('hex'));
    await assert.rejects(d.verifyReopened('F'));
    assert(d.pendingFor('F'));
    f.state.offline = false;
    assert.deepEqual((await d.verifyReopened('F')).map(r => [r.id, r.modifiedTime]), [['r2', '2040-09-05T00:00:00Z']]);
    assert(f.retained.has('r2'));
    assert.equal(d.pendingFor('F'), undefined);
    assert.equal(f.uploads.length, 1);
    f.state.offline = true;
    assert.equal(await d.verifyReopened('F'), null);
  });
  await test('a different SHA-256 fingerprint does not identify a lost write as saved', async () => {
    const f = recoveryServer((add, body, state) => { add(theirs); state.offline = true; });
    let saved;
    f.env.storage = { getItem: key => key === pendingKey ? saved : null, setItem: (key, value) => { saved = value; } };
    f.env.crypto = require('node:crypto').webcrypto;
    await assert.rejects(f.save(), { kind: 'pending' });
    f.state.offline = false;
    const d = Drive.create(CFG, f.env);
    assert.deepEqual(await d.verifyReopened('F'), []);
    assert.equal(d.pendingFor('F'), undefined);
    assert.equal(f.revisions.at(-1), theirs);
  });
  await test('missing SHA-256 allows ordinary saves and explains why a lost write cannot be verified after reload', async () => {
    const f = recoveryServer((add, body, state) => { add(body); state.offline = true; });
    let saved;
    f.env.storage = { getItem: key => key === pendingKey ? saved : null, setItem: (key, value) => { saved = value; } };
    f.env.crypto = {};
    await assert.rejects(f.save(), { kind: 'pending' });
    assert.equal(f.uploads.length, 1);
    assert(!saved.includes('ours'));
    f.state.offline = false;
    const d = Drive.create(CFG, f.env);
    await assert.rejects(d.verifyReopened('F'), /club\.json.*SHA-256 save fingerprint is unavailable/);
    assert(d.pendingFor('F'));
    const ordinary = recoveryServer(() => {});
    Object.assign(ordinary.env, { storage: f.env.storage, crypto: {} });
    assert.equal((await Drive.create(CFG, ordinary.env).updateMerged('other', 'other.json', async () => ours)).headRevisionId, 'r2');
    assert(d.pendingFor('F'));
  });
  await test('pending changes from two tabs preserve the other file entry', async () => {
    const f = recoveryServer((add, body, state) => { add(body); state.offline = true; });
    let saved;
    f.env.storage = { getItem: key => key === pendingKey ? saved : null, setItem: (key, value) => { saved = value; } };
    const second = recoveryServer((add, body, state) => { add(body); state.offline = true; });
    second.env.storage = f.env.storage;
    const a = Drive.create(CFG, f.env), b = Drive.create(CFG, second.env);
    await assert.rejects(f.save(a), { kind: 'pending' });
    await assert.rejects(b.updateMerged('G', 'other.json', async () => theirs, theirs), { kind: 'pending' });
    assert.deepEqual([...new Map(JSON.parse(saved)).keys()], ['F', 'G']);
    assert.equal(a.clearPending('F'), true);
    assert.deepEqual([...new Map(JSON.parse(saved)).keys()], ['G']);
  });
  await test('incompatible revision IDs fail closed after one write and one verification', async () => {
    const head = { headRevisionId: 'v2-1', etag: '"1"' };
    const f = fake([head, head, { headRevisionId: 'v2-2' }, { revisions: [{ id: '1' }, { id: '2' }] }]
      .map(json => ({ status: 200, json })));
    await assert.rejects(Drive.create(CFG, f.env).updateMerged('F', 'club.json', async () => '{}'), /v2 revision IDs.*v3/);
    assert.equal(f.calls.length, 4);
  });
  await test('a stable v2 head with a different v3 ID fails before upload without retrying', async () => {
    const head = { status: 200, json: { headRevisionId: 'v2-1', etag: '"1"' } };
    const f = fake([head, { status: 200, text: '{}' }, { status: 200, json: { headRevisionId: '1' } }, head]);
    const d = Drive.create(CFG, f.env);
    await assert.rejects(d.updateMerged('F', 'club.json', rev => d.readContent('F', rev)), /v2 and v3 head revision IDs/);
    assert.equal(f.calls.length, 4);
    assert(f.calls.every(c => !c.init.method));
  });
  await test('a revision change during the media read rejects the mismatched content', async () => {
    const f = fake([{ status: 200, text: 'newer' }, { status: 200, json: { headRevisionId: 'R2' } }]);
    await assert.rejects(Drive.create(CFG, f.env).readContent('F', 'R1'), e => e.status === 412);
    assert(f.calls.every(c => !c.init.method));
  });
  await test('revisions are listed across pages, read by id, and pinned with keepForever', async () => {
    const f = fake([{ status: 200, json: { revisions: [{ id: 'R1', modifiedTime: 'a', keepForever: true }], nextPageToken: 'T2' } }, { status: 200, json: { revisions: [{ id: 'R2', modifiedTime: 'b' }] } },
      { status: 200, text: '{"old":1}' }, { status: 200, json: {} }]);
    const d = Drive.create(CFG, f.env), r = await d.revisions('F1'); assert.deepStrictEqual(r.map(x => x.id), ['R1', 'R2']); assert(/pageToken=T2/.test(f.calls[1].url));
    assert.strictEqual(await d.readRevision('F1', 'R1'), '{"old":1}'); assert(/files\/F1\/revisions\/R1\?alt=media/.test(f.calls[2].url));
    await d.pin('F1', 'R2'); assert.strictEqual(f.calls[3].init.method, 'PATCH'); assert.deepStrictEqual(JSON.parse(f.calls[3].init.body), { keepForever: true });
  });
  await test('read also returns the revision it read, so a later save can tell whether someone saved in between', async () => {
    const f = fake([{ status: 200, json: { id: 'F1', name: 'a.json', mimeType: 'application/json', headRevisionId: 'R9' } }, { status: 200, text: '{}' }, { status: 200, json: { headRevisionId: 'R9' } }]);
    assert.strictEqual((await Drive.create(CFG, f.env).read('F1')).revision, 'R9');
  });
  await test('connected with a margin is false once less than the margin is left, and connect uses the test clock (R11)', async () => {
    let clock = 1000000, asks = 0; const f = fake([{ status: 200, json: { id: 'F' } }, { status: 200, json: { id: 'F' } }]);
    f.env.now = () => clock; f.env.google = () => ({ accounts: { oauth2: { initTokenClient: o => ({ requestAccessToken: () => { asks++; o.callback({ access_token: 'T', expires_in: 3600 }); } }), revoke: () => {} } } });
    const d = Drive.create(CFG, f.env); await d.head('F');
    assert(d.connected() && d.connected(300000) && asks === 1);
    clock += 3600000 - 299000; assert.strictEqual(d.connected(), true); assert.strictEqual(d.connected(300000), false);
    clock = 1000000 + 3600000 - 59000; await d.head('F'); assert.strictEqual(asks, 2, 'inside the 60 s margin a new token is asked for');
    clock += 3700000; assert.strictEqual(d.connected(), false);
  });
  await test('the page stays closed-network by default: no external script tags, an empty config, and Google addresses only inside drive.js', async () => {
    const dir = path.join(__dirname, '..'), html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    assert(!/<(script|link)[^>]+(src|href)="https?:/i.test(html), 'external resource in index.html');
    global.window = {}; delete require.cache[require.resolve('../drive-config.js')];
    const cfg = new Function(fs.readFileSync(path.join(dir, 'drive-config.js'), 'utf8') + '; return this.AwanaDriveConfig;').call({});
    assert.deepStrictEqual(cfg, { clientId: '', apiKey: '', appId: '' }, 'drive-config.js ships empty; fill it in on your own copy');
    fs.readdirSync(dir).filter(n => n.endsWith('.js') && n !== 'drive.js').forEach(n => assert(!/accounts\.google\.com|apis\.google\.com|googleapis\.com/.test(fs.readFileSync(path.join(dir, n), 'utf8')), n + ' mentions a Google address'));
  });
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
