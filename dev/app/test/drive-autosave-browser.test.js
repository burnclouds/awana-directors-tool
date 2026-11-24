// R11 and R7, in a real browser with Google pretended (the fake Drive of drive-inplace-browser.test.js): an automatic save that cannot proceed without asking waits quietly (no sign-in window, alert or download),
// the file is shown as saved only after Drive confirms and only if nothing was edited meanwhile, and a merged save that was edited over merges again before the next upload.
// Usage: NODE_PATH=<dir with playwright> node test/drive-autosave-browser.test.js        (uses ../../test-data, which holds only invented people)
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)), EXPORT = fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort()[0];
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const CONFIG = (on) => 'this.AwanaDriveConfig = ' + JSON.stringify(on ? { clientId: 'c.apps.googleusercontent.com', apiKey: 'K', appId: '1' } : { clientId: '', apiKey: '', appId: '' }) + ';';
let driveOn = true;
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html';
  if (u === 'drive-config.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(CONFIG(driveOn)); }
  const f = path.join(app, u); if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f));
});

// The sign-in counts its asks (window.__tokenAsks), gives a token that lasts window.__ttl seconds, and with window.__strictPopup refuses a window opened without a click (what a real browser does).
const GSI = 'window.google=window.google||{};google.accounts={oauth2:{initTokenClient:function(o){return{requestAccessToken:function(){window.__tokenAsks=(window.__tokenAsks||0)+1;if(window.__strictPopup&&!navigator.userActivation.isActive){setTimeout(function(){o.error_callback({type:"popup_failed_to_open"})},0);return}setTimeout(function(){o.callback({access_token:"T",expires_in:window.__ttl||3600})},0)}}},revoke:function(){}}};';
const GAPI = `window.gapi={load:function(n,o){google.picker=(function(){
  function V(){} V.prototype.setIncludeFolders=V.prototype.setSelectFolderEnabled=V.prototype.setMimeTypes=function(){return this}; V.prototype.setParent=function(id){(window.__parents=window.__parents||[]).push(id);return this};
  function B(){this.folder=false} B.prototype.addView=function(v){this.folder=!!v.folder;return this};
  ['setOAuthToken','setDeveloperKey','setTitle','setAppId','enableFeature'].forEach(function(m){B.prototype[m]=function(){return this}});
  B.prototype.setSelectedFileIds=function(ids){window.__selected=ids;return this}; B.prototype.setCallback=function(cb){this.cb=cb;return this}; B.prototype.build=function(){var s=this;return{setVisible:function(){(window.__dlgOpenAtPick=window.__dlgOpenAtPick||[]).push(document.getElementById('dlg').open);var docs=s.folder?window.__folder:window.__pick;setTimeout(function(){s.cb({action:docs?'picked':'cancel',docs:docs||[]})},0)}}};
  function DV(id){this.folder=id==='folders'} DV.prototype=Object.create(V.prototype);
  return{DocsView:DV,PickerBuilder:B,ViewId:{DOCS:'docs',FOLDERS:'folders'},Action:{PICKED:'picked',CANCEL:'cancel'},Response:{ACTION:'action',DOCUMENTS:'docs'},Feature:{MULTISELECT_ENABLED:'m'}}})();o.callback()}};`;

// A fake Drive: files with revisions. beforePatch(id) runs just before an update is applied: use it to make "someone else saved in the gap".
const optDrive = async p => { await p.evaluate(() => { const sk = document.getElementById('splashSkip'); if (sk && document.getElementById('splash') && !document.getElementById('splash').hidden) sk.click(); document.querySelector('.tabs button[data-tab="options"]').click(); }); await p.waitForSelector('#optDriveCard'); };
const T0 = Date.now() - 10 * 86400000;      // relative to now, so the 30-day pinning interval does not pass while the test sits in the repository
const iso = n => new Date(T0 + n * 3600000).toISOString();
function newDrive() {
  const d = { files: {}, calls: [], clock: 0, beforePatch: null, next: 1 };
  d.put = (id, name, text, parents) => { d.files[id] = { name, parents: parents || ['P1'], mime: name.endsWith('.json') ? 'application/json' : 'text/csv', revs: [{ id: 'R1', text, modifiedTime: iso(d.clock++), keepForever: false }] }; };
  d.rev = (id, text) => { const f = d.files[id], r = { id: 'R' + (f.revs.length + 1), text, modifiedTime: iso(d.clock++), keepForever: false }; f.revs.push(r); return r; };
  d.head = id => d.files[id].revs.at(-1);
  d.text = id => d.head(id).text;
  d.part = body => { const m = /^--([^\r\n]+)\r\n/.exec(body), b = m[1], parts = body.split('--' + b).filter(x => x.trim() && x.trim() !== '--'); const cut = x => x.replace(/^\r\n/, '').replace(/\r\n$/, ''); return parts.map(x => { const t = cut(x), i = t.indexOf('\r\n\r\n'); return t.slice(i + 4); }); };
  return d;
}
const info = (d, id) => { const f = d.files[id], h = d.head(id); return { id, name: f.name, parents: f.parents, mimeType: f.mime, modifiedTime: h.modifiedTime, etag: JSON.stringify(h.id), title: f.name, headRevisionId: h.id }; };
async function session(browser, base, d, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ acceptDownloads: true }), p = await ctx.newPage(), seen = { errors: [], dialogs: [], downloads: 0 };
  p.on('pageerror', e => seen.errors.push(e.message)); p.on('download', () => seen.downloads++);
  p.on('dialog', dlg => { seen.dialogs.push(dlg.message()); if (dlg.type() === 'prompt' && opts.promptAnswer) dlg.accept(opts.promptAnswer); else if (dlg.type() === 'confirm' && opts.acceptConfirm) dlg.accept(); else dlg.dismiss(); });
  await p.route(/accounts\.google\.com|apis\.google\.com|googleapis\.com/, async r => {
    const u = r.request().url(), method = r.request().method(), json = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify(o) });
    if (/gsi\/client/.test(u)) return r.fulfill({ contentType: 'application/javascript', body: GSI });
    if (/api\.js/.test(u)) return r.fulfill({ contentType: 'application/javascript', body: GAPI });
    if (d.offline) return r.abort();      // no network
    d.calls.push(method + ' ' + u.replace(/^https:\/\/[^/]+/, ''));
    let m;
    if (d.refuseUpload && method === 'POST' && /upload\/drive\/v3\/files\?/.test(u)) return r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 403, message: 'the app has no access to that folder' } }) });      // Google refuses the folder (the person has not confirmed it)
    if (method === 'POST' && /upload\/drive\/v3\/files\?/.test(u)) { const [meta, text] = d.part(r.request().postData()), id = 'N' + d.next++, j = JSON.parse(meta); d.put(id, j.name, text, j.parents); return json({ id, name: j.name, parents: j.parents, headRevisionId: 'R1' }); }
    if (method === 'PUT' && (m = /upload\/drive\/v2\/files\/([A-Za-z0-9]+)\?/.exec(u))) {
      if (d.beforePatch) { const h = d.beforePatch; d.beforePatch = null; await h(m[1]); }
      if (d.delayPatchMs) await new Promise(r => setTimeout(r, d.delayPatchMs));
      if (r.request().headers()['if-match'] !== JSON.stringify(d.head(m[1]).id)) return r.fulfill({ status: 412, body: '{}' });
      const [meta, text] = d.part(r.request().postData()), f = d.files[m[1]]; f.name = JSON.parse(meta).title; d.rev(m[1], text); return json(info(d, m[1]));
    }
    if ((m = /files\/([A-Za-z0-9]+)\/revisions\/([A-Za-z0-9]+)(\?|$)/.exec(u))) {
      const rv = d.files[m[1]].revs.find(x => x.id === m[2]);
      if (method === 'PATCH') { rv.keepForever = JSON.parse(r.request().postData()).keepForever === true; return json({ id: rv.id }); }
      return r.fulfill({ contentType: 'text/plain', body: rv.text });
    }
    if ((m = /files\/([A-Za-z0-9]+)\/revisions\?/.exec(u))) return json({ revisions: d.files[m[1]].revs.map(x => ({ id: x.id, modifiedTime: x.modifiedTime, keepForever: x.keepForever })) });
    if ((m = /files\/([A-Za-z0-9]+)\?/.exec(u)) && d.files[m[1]]) return /alt=media/.test(u) ? r.fulfill({ contentType: 'text/plain', body: d.text(m[1]) }) : json(info(d, m[1]));
    return r.fulfill({ status: 404, body: '{}' });
  });
  await p.goto(base); return { p, seen, ctx };
}
const openF = async (p, ids) => { await p.evaluate(x => { window.__pick = x.map(i => ({ id: i, name: i, mimeType: 'x' })); }, ids); await p.click('#splashDrive'); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent), null, { timeout: 8000 }); };
const save = async p => { await p.evaluate(() => App.testFiles().length ? 0 : 0); await p.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); if (await p.evaluate(() => App.testFiles().length)) await p.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); };
// A save that finds someone else's changes on Drive shows the merge screen (the same one as File > Merge a data file); this presses through it.
const applyMerge = async (p, pick) => { await p.waitForSelector('#mergeDlg[open]', { timeout: 8000 }); if (await p.locator('#mergeDlg [data-mg="next"]').count()) { await p.click('#mergeDlg [data-mg="next"]'); await p.check('#mergeDlg input[type=radio][value="' + (pick || 'mine') + '"]'); await p.click('#mgNext'); } await p.click('#mergeDlg [data-mg="apply"]'); };
const settle = p => p.waitForFunction(() => /saved/.test(document.getElementById('driveStatus').textContent), null, { timeout: 8000 });
const mark = (p, date, id, m) => p.evaluate(([d, i, k]) => { Season.setMark(App.season, d, i, k, 1); App.commitScope(() => App.changed()); }, [date, id, m]);
const kids = p => p.evaluate(() => Object.keys(App.season.roster.people).slice(0, 3));

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/index.html', browser = await chromium.launch(), ORIG = fs.readFileSync(path.join(td, DATA), 'utf8');
  const fresh = () => { const d = newDrive(); d.put('F1', DATA, ORIG); d.put('F2', EXPORT, fs.readFileSync(path.join(td, EXPORT), 'utf8')); return d; };
  const prep = async (d, opts) => { const s = await session(browser, base, d, opts); await openF(s.p, ['F1', 'F2']); return s; };
  const inplace = async p => { await p.evaluate(() => App.driveStyle.set('inplace')); };
  const press = async p => { await p.click('#btnSeasonSave'); if (await p.evaluate(() => App.testFiles().length)) await p.click('#btnSeasonSave'); };      // trusted clicks: a user gesture, as a person's tap is
  const auto = p => p.evaluate(() => App.autosave.set(true, 0.02));      // about 1.2 s
  const gone = p => p.evaluate(() => ({ dirty: App.dirty(), wait: App.driveSave.waiting && App.driveSave.waiting(), asks: window.__tokenAsks || 0 }));
  const patches = d => d.calls.filter(c => /^PUT .*upload/.test(c)).length;
  const watchFlash = p => p.evaluate(() => { window.__flashes = []; new MutationObserver(() => { const f = document.getElementById('flash'); if (f && !f.hidden && /auto-save is waiting/.test(f.textContent)) window.__flashes.push(f.textContent); }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true }); });

  await test('the file is not shown as saved until Drive has confirmed the save', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p); await mark(p, '2026-10-28', k[0], 'h');
    d.delayPatchMs = 1500; await save(p); await p.waitForTimeout(300);
    assert.strictEqual(await p.evaluate(() => App.dirty()), true, 'still unsaved while Drive has not answered'); await settle(p);
    assert.strictEqual(await p.evaluate(() => App.dirty()), false); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('3.1 an automatic save with a good sign-in saves to Drive and marks the file saved', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p);
    await press(p); await settle(p);      // a pressed save gives a sign-in
    await p.evaluate(() => { window.__strictPopup = true; });
    const n0 = patches(d); await mark(p, '2026-10-28', k[0], 'h'); await auto(p); await p.waitForFunction(() => /Auto-saved \d\d:\d\d/.test(document.getElementById('autoStatus').textContent), null, { timeout: 8000 });
    assert.strictEqual(patches(d), n0 + 1); const g = await gone(p); assert.strictEqual(g.dirty, false); assert.strictEqual(g.wait, null); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('3.2 an automatic save after the sign-in ran out asks nothing, downloads nothing, and waits; the next Save you press signs in and saves', async () => {
    const d = fresh(), { p, seen, ctx } = await session(browser, base, d); await p.evaluate(() => { window.__strictPopup = true; window.__ttl = 299; });      // a token that lasts under the 5-minute margin
    await openF(p, ['F1', 'F2']); await inplace(p); const k = await kids(p); await press(p); await settle(p);
    const asks0 = (await gone(p)).asks, calls0 = d.calls.length, n0 = patches(d), dl0 = seen.downloads, dia0 = seen.dialogs.length;
    await watchFlash(p); await mark(p, '2026-10-28', k[0], 'h'); await auto(p); await p.waitForTimeout(3300);
    const g = await gone(p);
    assert.strictEqual(seen.dialogs.length, dia0, 'no alert'); assert.strictEqual(seen.downloads, dl0, 'no download'); assert.strictEqual(g.asks, asks0, 'no sign-in asked');
    assert.strictEqual(d.calls.length, calls0, 'no Drive call: ' + d.calls.slice(calls0).join(' | ')); assert.strictEqual(g.dirty, true); assert(g.wait && g.wait.kind === 'signin', JSON.stringify(g.wait));
    assert(/auto-save is waiting\. Press Save to sign in/.test(await p.locator('#driveStatus').textContent()));
    assert.strictEqual(await p.evaluate(() => new Set(window.__flashes).size), 1, 'the banner is shown once per waiting spell');
    await p.evaluate(() => { window.__ttl = 3600; }); await press(p); await settle(p);
    const g2 = await gone(p); assert.strictEqual(patches(d), n0 + 1, 'one PUT'); assert(g2.asks >= asks0, 'a pressed save keeps its own 60 s rule: the 299 s token is still good for it'); assert.strictEqual(g2.dirty, false, 'clean'); assert.strictEqual(g2.wait, null, 'not waiting');
    assert(/saved \d\d:\d\d/.test(await p.locator('#driveStatus').textContent())); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('3.3 an automatic save that cannot reach Drive is quiet and tries again', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p);
    await press(p); await settle(p); const dl0 = seen.downloads, dia0 = seen.dialogs.length, n0 = patches(d);
    d.offline = true; await mark(p, '2026-10-28', k[0], 'h'); await auto(p); await p.waitForTimeout(2200);
    let g = await gone(p); assert.strictEqual(seen.dialogs.length, dia0); assert.strictEqual(seen.downloads, dl0); assert(g.wait && g.wait.kind === 'error', JSON.stringify(g.wait)); assert.strictEqual(g.dirty, true);
    d.offline = false; await p.waitForFunction(() => !App.dirty(), null, { timeout: 8000 }); g = await gone(p);
    assert.strictEqual(patches(d), n0 + 1); assert.strictEqual(g.wait, null); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('3.4 after Update now (no sign-in carried), an automatic save asks nothing', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p);
    const cur = await p.evaluate(() => App.driveHandoff.get()); await p.evaluate(h => { window.__strictPopup = true; App.driveDo.signOut(); App.driveHandoff.set(h); }, cur);      // what restore() does after a reload: Drive saving is on, the lineage is kept, no sign-in
    const asks0 = (await gone(p)).asks, calls0 = d.calls.length; await mark(p, '2026-10-28', k[0], 'h'); await auto(p); await p.waitForTimeout(2600);
    const g = await gone(p); assert.strictEqual(g.asks, asks0, 'no sign-in asked'); assert.strictEqual(seen.dialogs.length, 0); assert.strictEqual(seen.downloads, 0); assert.strictEqual(d.calls.length, calls0);
    assert(g.wait && g.wait.kind === 'signin', JSON.stringify(g.wait)); assert.strictEqual(g.dirty, true);
    await press(p); await settle(p); assert.strictEqual((await gone(p)).dirty, false); assert(JSON.parse(d.text('F1')).attendance['2026-10-28'][k[0]].h === 1); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('3.6 an edit made while a Drive save is in flight is still unsaved afterwards, and the next save sends it', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p);
    await mark(p, '2026-10-28', k[0], 'h'); d.delayPatchMs = 1500; await save(p); await p.waitForTimeout(300); await mark(p, '2026-10-28', k[1], 'h'); await settle(p);
    assert.strictEqual(await p.evaluate(() => App.dirty()), true); const head = JSON.parse(d.text('F1')).attendance['2026-10-28'];
    assert(head[k[0]].h === 1 && !(head[k[1]] && head[k[1]].h), 'Drive has the first edit only'); d.delayPatchMs = 0;
    await save(p); await p.waitForFunction(() => !App.dirty(), null, { timeout: 8000 }); assert(JSON.parse(d.text('F1')).attendance['2026-10-28'][k[1]].h === 1); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('3.7 opening another file while a save is in flight does not mark the new file saved', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p);
    await mark(p, '2026-10-28', k[0], 'h'); d.delayPatchMs = 1500; await save(p); await p.waitForTimeout(300);
    await p.evaluate(text => { App.openSeason(text); }, ORIG); const k2 = await kids(p); await mark(p, '2026-10-28', k2[1], 'h');
    await p.waitForTimeout(1800); assert.strictEqual(await p.evaluate(() => App.dirty()), true, 'the old save must not mark the new file saved'); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });

  // ---- R7: a merged save that was edited over must merge again before the next upload ----
  const B_MARK = { a: 1, x: 1 };      // leader B's mark, saved straight into Drive
  const withB = (d, k) => { const t = JSON.parse(ORIG); t.attendance = t.attendance || {}; t.attendance['2026-10-28'] = t.attendance['2026-10-28'] || {}; t.attendance['2026-10-28'][k[2]] = B_MARK; d.rev('F1', JSON.stringify(t)); };
  const headAtt = d => JSON.parse(d.text('F1')).attendance['2026-10-28'];
  const gets = (d, from) => d.calls.slice(from).filter(c => /^GET .*F1\?.*alt=media/.test(c)).length;
  await test('F a merged save that was not edited over refreshes the screen, and the next save does not read Drive', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p); withB(d, k);
    await mark(p, '2026-10-28', k[0], 'h'); await save(p); await applyMerge(p); await settle(p); await p.waitForTimeout(500);
    assert.deepStrictEqual(await p.evaluate(i => App.season.attendance['2026-10-28'][i], k[2]), B_MARK, 'the screen shows B'); assert.strictEqual(await p.evaluate(() => App.dirty()), false);
    const from = d.calls.length; await mark(p, '2026-10-28', k[1], 'h'); await save(p); await p.waitForFunction(() => !App.dirty(), null, { timeout: 8000 });
    assert.strictEqual(gets(d, from), 0, 'no read of Drive'); const h = headAtt(d); assert(h[k[0]].h === 1 && h[k[1]].h === 1 && h[k[2]].x === 1); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('A leader B saved, A merged on Save, A edited during that save: A\'s next save still holds B\'s changes', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p); withB(d, k);
    await mark(p, '2026-10-28', k[0], 'h');      // X
    d.beforePatch = async () => { await mark(p, '2026-10-28', k[1], 'h'); };      // Y, made while the upload is in flight
    await save(p); await applyMerge(p); await settle(p); await p.waitForTimeout(500);
    assert.strictEqual(await p.evaluate(() => App.dirty()), true, 'the late edit is still unsaved'); let h = headAtt(d); assert(h[k[0]].h === 1 && h[k[2]].x === 1 && !(h[k[1]] && h[k[1]].h), 'Drive has B and X, not Y');
    const from = d.calls.length; await save(p); await applyMerge(p); await p.waitForFunction(() => !App.dirty(), null, { timeout: 8000 });
    h = headAtt(d); assert(h[k[0]].h === 1, 'X'); assert(h[k[1]].h === 1, 'Y'); assert.deepStrictEqual(h[k[2]], B_MARK, 'B is still there');
    assert(gets(d, from) >= 1, 'Drive was read before the second upload'); assert.deepStrictEqual(await p.evaluate(i => App.season.attendance['2026-10-28'][i], k[2]), B_MARK, 'A\'s screen shows B');
    assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('B the same when both saves are automatic (no screen, no alert)', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p); withB(d, k);
    await mark(p, '2026-10-28', k[0], 'h'); d.beforePatch = async () => { await mark(p, '2026-10-28', k[1], 'h'); };
    await p.evaluate(() => App.saveNow({ auto: true })); await p.waitForTimeout(1200);
    assert.strictEqual(await p.evaluate(() => App.dirty()), true); let h = headAtt(d); assert(h[k[0]].h === 1 && h[k[2]].x === 1 && !(h[k[1]] && h[k[1]].h));
    await p.evaluate(() => App.saveNow({ auto: true })); await p.waitForFunction(() => !App.dirty(), null, { timeout: 8000 });
    h = headAtt(d); assert(h[k[0]].h === 1 && h[k[1]].h === 1 && h[k[2]].x === 1, JSON.stringify(h)); assert.strictEqual(seen.dialogs.length, 0, 'no alert from an automatic save'); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('H the pending remerge survives a further edit: A edits again before the next save and Drive still ends with B, X, Y and Z', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p); withB(d, k);
    await mark(p, '2026-10-28', k[0], 'h');      // X
    d.beforePatch = async () => { await mark(p, '2026-10-28', k[1], 'h'); };      // Y, in flight
    await save(p); await applyMerge(p); await settle(p); await p.waitForTimeout(500);
    await mark(p, '2026-10-28', k[0], 'a');      // Z, after the merged save that was edited over
    await save(p); await applyMerge(p); await p.waitForFunction(() => !App.dirty(), null, { timeout: 8000 });
    const h = headAtt(d); assert(h[k[0]].h === 1 && h[k[0]].a === 1, 'X and Z'); assert(h[k[1]].h === 1, 'Y'); assert.deepStrictEqual(h[k[2]], B_MARK, 'B is still there');
    assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('I cancelling the merge screen uploads nothing and keeps the edit unsaved; the next save still merges and keeps B', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p); withB(d, k);
    await mark(p, '2026-10-28', k[0], 'h');
    const before = patches(d); await save(p); await p.waitForSelector('#mergeDlg[open]', { timeout: 8000 }); await p.click('#mergeDlg [data-mg="cancel"]'); await p.waitForTimeout(500);
    assert.strictEqual(patches(d), before, 'nothing was uploaded'); assert.strictEqual(await p.evaluate(() => App.dirty()), true, 'still unsaved');
    let h = headAtt(d); assert(!(h[k[0]] && h[k[0]].h), 'Drive does not have the edit'); assert.deepStrictEqual(h[k[2]], B_MARK);
    await save(p); await applyMerge(p); await settle(p); h = headAtt(d);
    assert(h[k[0]].h === 1, 'X saved'); assert.deepStrictEqual(h[k[2]], B_MARK, 'B kept'); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('G a clash decided "Keep Drive\'s" is not asked again when someone saves in the gap; the new revision gets a fresh summary', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p);
    { const t = JSON.parse(ORIG); t.handbooks = Object.assign({}, t.handbooks, { [k[2]]: 'HG' }); d.rev('F1', JSON.stringify(t)); }      // B gave k[2] the HG handbook and saved
    await p.evaluate(() => { const o = App.mergeScreen; window.__screens = 0; App.mergeScreen = function () { window.__screens++; return o.apply(this, arguments); }; });
    await p.evaluate(id => { App.season.handbooks[id] = 'WR'; App.commitScope(() => App.changed()); }, k[2]);      // A gave the same child the WR handbook: a real clash (both added, differently)
    d.beforePatch = async () => { const t = JSON.parse(d.text('F1')); t.attendance = t.attendance || {}; t.attendance['2026-10-28'] = t.attendance['2026-10-28'] || {}; t.attendance['2026-10-28'][k[1]] = { a: 1 }; d.rev('F1', JSON.stringify(t)); };      // B saves again in the gap, on another child
    await save(p); await p.waitForSelector('#mergeDlg[open]', { timeout: 8000 });
    const radios = await p.locator('#mergeDlg [data-mg="next"]').count();
    await applyMerge(p, 'mine'); await applyMerge(p, 'mine'); await settle(p); await p.waitForTimeout(500);
    const h = headAtt(d); assert.strictEqual(await p.evaluate(() => window.__screens), 2, 'reviewed both revisions (' + radios + ' conflict step)');
    const hb = JSON.parse(d.text('F1')).handbooks; assert.strictEqual(hb[k[2]], 'HG', 'Drive\'s handbook was kept for the clash: ' + JSON.stringify(hb[k[2]]) + ' (conflict step buttons: ' + radios + ')'); assert.deepStrictEqual(h[k[1]], { a: 1 }, 'B\'s second save is kept too');
    assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('L undoing the late edit after a save that was edited over: the next save still brings in B and leaves the undone edit out', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p); withB(d, k);
    await mark(p, '2026-10-28', k[0], 'h');      // X
    d.beforePatch = async () => { await mark(p, '2026-10-28', k[1], 'h'); };      // Y, in flight
    await save(p); await applyMerge(p); await settle(p); await p.waitForTimeout(500);
    await p.click('#btnUndo');      // takes Y back
    assert.strictEqual(await p.evaluate(i => !!(App.season.attendance['2026-10-28'][i] || {}).h, k[1]), false, 'Y is undone on screen');
    await save(p); await applyMerge(p); await p.waitForFunction(() => !App.dirty(), null, { timeout: 8000 });
    const h = headAtt(d); assert(h[k[0]].h === 1, 'X is on Drive'); assert(!(h[k[1]] && h[k[1]].h), 'Y is not on Drive'); assert.deepStrictEqual(h[k[2]], B_MARK, 'B is still there');
    assert.deepStrictEqual(await p.evaluate(i => App.season.attendance['2026-10-28'][i], k[2]), B_MARK, 'A\'s screen shows B'); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('D an edit held on a tab (an unapplied draft) during a Drive save stays held and unsaved; applying it and saving sends it', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d, { acceptConfirm: true }); await inplace(p); const k = await kids(p);
    await mark(p, '2026-10-28', k[0], 'h');      // X, committed
    d.beforePatch = async () => { await p.evaluate(id => { App.showTab('roster'); Season.setMark(App.season, '2026-10-28', id, 'a', 1); App.changed(); }, k[1]); };      // Y, a draft made on the Roster tab while the upload is in flight
    await save(p); await settle(p); await p.waitForTimeout(500);
    assert.strictEqual(await p.evaluate(() => App.draftPending()), true, 'the draft is still pending'); assert.strictEqual(await p.evaluate(() => App.dirty()), true, 'the file is not shown as saved');
    assert(!(headAtt(d)[k[1]] && headAtt(d)[k[1]].a), 'Drive does not have the held edit'); assert(headAtt(d)[k[0]].h === 1, 'Drive has the committed one');
    await save(p); await p.waitForFunction(() => !App.dirty() && !App.draftPending(), null, { timeout: 8000 });      // the confirm applies the draft, then the save sends it
    const h = headAtt(d); assert(h[k[0]].h === 1 && h[k[1]].a === 1, 'both are on Drive now: ' + JSON.stringify(h)); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('3.5 an automatic save whose Drive folder is refused is quiet (no alert, no download), says it is waiting for a folder, and stays unsaved', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); const k = await kids(p); await p.evaluate(() => App.driveStyle.set('dated'));      // a new dated file in the club folder (the default style updates one file in place)
    d.refuseUpload = true; await mark(p, '2026-10-28', k[0], 'h'); const dl0 = seen.downloads, dia0 = seen.dialogs.length, n0 = d.calls.filter(c => /^POST .*upload/.test(c)).length;
    await auto(p); await p.waitForTimeout(2600);
    const g = await gone(p); assert.strictEqual(seen.dialogs.length, dia0, 'no alert'); assert.strictEqual(seen.downloads, dl0, 'no download');
    assert(g.wait && g.wait.kind === 'folder', JSON.stringify(g.wait)); assert.strictEqual(g.dirty, true, 'still unsaved'); assert(d.calls.filter(c => /^POST .*upload/.test(c)).length > n0, 'the upload was tried');
    d.refuseUpload = false; await press(p); await p.waitForFunction(() => !App.dirty(), null, { timeout: 8000 }); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('E a save that did not merge, edited over, does not read Drive next time', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p);
    await mark(p, '2026-10-28', k[0], 'h'); d.beforePatch = async () => { await mark(p, '2026-10-28', k[1], 'h'); }; await save(p); await settle(p); await p.waitForTimeout(300);
    const from = d.calls.length; await save(p); await p.waitForFunction(() => !App.dirty(), null, { timeout: 8000 });
    assert.strictEqual(gets(d, from), 0); const h = headAtt(d); assert(h[k[0]].h === 1 && h[k[1]].h === 1); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('R18 an older file on Drive (old folder names, x_ClubberID in v), merged in place, shows nothing to review about them and is saved in one spelling', async () => {
    const o = JSON.parse(ORIG), ids = Object.keys(o.roster.people); o.config.driveDirs = { open: { id: 'PO', name: 'Open' }, data: { id: 'PD', name: 'Data' }, slides: null };
    o.roster.people[ids[0]].v.x_ClubberID = ids[0]; o.roster.people[ids[1]].v.x_ClubberID = ids[1];
    const d = newDrive(); d.put('F1', DATA, JSON.stringify(o)); d.put('F2', EXPORT, fs.readFileSync(path.join(td, EXPORT), 'utf8'));
    const { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p);
    const theirs = JSON.parse(JSON.stringify(o)); theirs.attendance = theirs.attendance || {}; theirs.attendance['2026-10-28'] = theirs.attendance['2026-10-28'] || {}; theirs.attendance['2026-10-28'][k[2]] = B_MARK; d.rev('F1', JSON.stringify(theirs));
    await mark(p, '2026-10-28', k[0], 'h'); await save(p); await p.waitForSelector('#mergeDlg[open]', { timeout: 8000 });
    const shown = await p.$eval('#mergeDlg', e => e.textContent); assert(!/driveDirs|x_ClubberID/.test(shown), 'the merge screen mentions the migration: ' + shown.slice(0, 200));
    await applyMerge(p); await settle(p); await p.waitForTimeout(400);
    const file = JSON.parse(d.text('F1')); assert.deepStrictEqual(Object.keys(file.config.driveDirs).sort(), ['club', 'slides']); assert.strictEqual(file.config.driveDirs.club.id, 'PD');
    assert(!Object.values(file.roster.people).some(x => 'x_ClubberID' in x.v), 'no copy of the id is saved'); assert(file.attendance['2026-10-28'][k[0]].h === 1 && file.attendance['2026-10-28'][k[2]].x === 1, 'both edits');
    assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('K an edit made during the update\'s own save stops the update', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p); let offer = false;
    await p.route(/\/index\.html/, async r => { const res = await r.fetch(); let body = await res.text(); if (offer) body = body.replace(/(name="app-version" content=")[^"]*/, '$19.9.9'); await r.fulfill({ response: res, body }); });
    await mark(p, '2026-10-28', k[0], 'h'); offer = true; await p.evaluate(() => App.updates.check()); await p.waitForSelector('#updateBar:not([hidden])');
    d.beforePatch = async () => { await mark(p, '2026-10-28', k[1], 'h'); }; await p.click('#updateNow'); await p.waitForTimeout(2500);
    assert(!/updated=/.test(p.url()), 'no reload'); assert.strictEqual(await p.evaluate(() => App.dirty()), true); await ctx.close();
  });
  await test('J the lineage carries a pending remerge through the update handoff', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p); withB(d, k);
    await mark(p, '2026-10-28', k[0], 'h'); d.beforePatch = async () => { await mark(p, '2026-10-28', k[1], 'h'); }; await save(p); await applyMerge(p); await settle(p); await p.waitForTimeout(500);
    const h = await p.evaluate(() => App.driveHandoff.get()); assert.strictEqual(h.cur.remerge, true);
    await p.evaluate(x => App.driveHandoff.set(x), h); assert.strictEqual((await p.evaluate(() => App.driveHandoff.get())).cur.remerge, true, 'kept after set'); await ctx.close();
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
