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
(async () => {
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
  await test('head asks only for the revision, update PATCHes the same file with a new name and body (never a POST), and nothing is deleted', async () => {
    const f = fake([{ status: 200, json: { id: 'F1', headRevisionId: 'R1' } }, { status: 200, json: { id: 'F1', name: 'new.json', headRevisionId: 'R2' } }]);
    const d = Drive.create(CFG, f.env), h = await d.head('F1'); assert.strictEqual(h.headRevisionId, 'R1'); assert(/fields=id,name,parents,modifiedTime,headRevisionId/.test(f.calls[0].url));
    const u = await d.update('F1', 'new.json', '{"a":2}', 'application/json'); assert.strictEqual(u.headRevisionId, 'R2');
    const c = f.calls[1]; assert.strictEqual(c.init.method, 'PATCH'); assert(/upload\/drive\/v3\/files\/F1\?uploadType=multipart/.test(c.url));
    assert(c.init.body.includes('{"name":"new.json"}') && c.init.body.includes('{"a":2}'), 'new name and new content in one request');
    assert(f.calls.every(x => !x.init || x.init.method !== 'DELETE'));
  });
  await test('revisions are listed across pages, read by id, and pinned with keepForever', async () => {
    const f = fake([{ status: 200, json: { revisions: [{ id: 'R1', modifiedTime: 'a', keepForever: true }], nextPageToken: 'T2' } }, { status: 200, json: { revisions: [{ id: 'R2', modifiedTime: 'b' }] } },
      { status: 200, text: '{"old":1}' }, { status: 200, json: {} }]);
    const d = Drive.create(CFG, f.env), r = await d.revisions('F1'); assert.deepStrictEqual(r.map(x => x.id), ['R1', 'R2']); assert(/pageToken=T2/.test(f.calls[1].url));
    assert.strictEqual(await d.readRevision('F1', 'R1'), '{"old":1}'); assert(/files\/F1\/revisions\/R1\?alt=media/.test(f.calls[2].url));
    await d.pin('F1', 'R2'); assert.strictEqual(f.calls[3].init.method, 'PATCH'); assert.deepStrictEqual(JSON.parse(f.calls[3].init.body), { keepForever: true });
  });
  await test('read also returns the revision it read, so a later save can tell whether someone saved in between', async () => {
    const f = fake([{ status: 200, json: { id: 'F1', name: 'a.json', mimeType: 'application/json', headRevisionId: 'R9' } }, { status: 200, text: '{}' }]);
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
