// The Google Drive buttons in a real browser, with Google pretended: the picker, sign-in and Drive API are stubbed, the page and app code are real.
// Usage: NODE_PATH=<dir with playwright> node test/drive-browser.test.js        (uses ../../test-data, which holds only invented people)
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)), EXPORT = fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort()[0];
// N9 point 9: the failure dialog is announced a moment after the download, so wait for it (up to 5 s) before checking its text.
const dialogSeen = async s => { for (let i = 0; i < 50 && !s.seen.dialogs.some(m => /Google Drive/.test(m)); i++) await s.p.waitForTimeout(100); return s.seen.dialogs.some(m => /Google Drive/.test(m)); };
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

const GSI = 'window.google=window.google||{};google.accounts={oauth2:{initTokenClient:function(o){return{requestAccessToken:function(){setTimeout(function(){o.callback({access_token:"T",expires_in:3600})},0)}}},revoke:function(){}}};';
const GAPI = `window.gapi={load:function(n,o){google.picker=(function(){
  function V(){} V.prototype.setIncludeFolders=V.prototype.setSelectFolderEnabled=V.prototype.setMimeTypes=function(){return this}; V.prototype.setParent=function(id){(window.__parents=window.__parents||[]).push(id);return this};
  function B(){this.folder=false} B.prototype.addView=function(v){this.folder=!!v.folder;return this};
  ['setOAuthToken','setDeveloperKey','setTitle','setAppId','enableFeature'].forEach(function(m){B.prototype[m]=function(){return this}});
  B.prototype.setSelectedFileIds=function(ids){window.__selected=ids;return this}; B.prototype.setCallback=function(cb){this.cb=cb;return this}; B.prototype.build=function(){var s=this;return{setVisible:function(){(window.__dlgOpenAtPick=window.__dlgOpenAtPick||[]).push(document.getElementById('dlg').open);var docs=s.folder?window.__folder:window.__pick;setTimeout(function(){s.cb({action:docs?'picked':'cancel',docs:docs||[]})},0)}}};
  function DV(id){this.folder=id==='folders'} DV.prototype=Object.create(V.prototype);
  return{DocsView:DV,PickerBuilder:B,ViewId:{DOCS:'docs',FOLDERS:'folders'},Action:{PICKED:'picked',CANCEL:'cancel'},Response:{ACTION:'action',DOCUMENTS:'docs'},Feature:{MULTISELECT_ENABLED:'m'}}})();o.callback()}};`;

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/index.html', browser = await chromium.launch();
  const files = { F1: { name: DATA, mime: 'application/json', parents: ['P1'], text: fs.readFileSync(path.join(td, DATA), 'utf8') }, F2: { name: EXPORT, mime: 'text/csv', parents: ['P1'], text: fs.readFileSync(path.join(td, EXPORT), 'utf8') } };
  const optDrive = async p => { await p.evaluate(() => { const s = document.getElementById('splashSkip'); if (s && document.getElementById('splash') && !document.getElementById('splash').hidden) s.click(); document.querySelector('.tabs button[data-tab="options"]').click(); }); await p.waitForSelector('#optDriveCard'); };
  async function session(opts) {
    const ctx = await browser.newContext({ acceptDownloads: true }), p = await ctx.newPage(), seen = { google: [], posts: [], patches: [], rev: 'R1', downloads: 0, errors: [], dialogs: [] };
    p.on('pageerror', e => seen.errors.push(e.message)); p.on('download', () => seen.downloads++); p.on('dialog', d => { seen.dialogs.push(d.message()); if (d.type() === 'beforeunload') d.accept(); else d.dismiss(); });
    await p.route(/accounts\.google\.com|apis\.google\.com|googleapis\.com/, async r => {
      const u = r.request().url(); seen.google.push(u);
      if (/gsi\/client/.test(u)) return r.fulfill({ contentType: 'application/javascript', body: GSI });
      if (/api\.js/.test(u)) return r.fulfill({ contentType: 'application/javascript', body: GAPI });
      const m = /files\/([A-Za-z0-9]+)\?/.exec(u);
      if (r.request().method() === 'POST') {
        seen.posts.push({ url: u, body: r.request().postData() });
        const refuse = opts && opts.refuseFolder && seen.posts.at(-1).body.includes(opts.refuseFolder) && (!opts.once || (seen.refused = (seen.refused || 0) + 1) === 1);      // once: Google refuses until this person has picked the folder, then accepts
        const busy = opts && opts.busyOnce && (seen.busy = (seen.busy || 0) + 1) === 1;      // N9 point 9: Google is busy once (503), then accepts
        if (busy) return r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"message":"Backend Error"}}' });
        return refuse ? r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":{"message":"File not found"}}' }) : r.fulfill({ contentType: 'application/json', body: '{"id":"N1","name":"x","parents":[]}' });
      }
      if (/\/revisions/.test(u)) return r.fulfill({ contentType: 'application/json', body: JSON.stringify(r.request().method() === 'PATCH' ? {} : { revisions: ['R1', 'R2'].slice(0, seen.rev === 'R2' ? 2 : 1).map(id => ({ id, modifiedTime: '2026-10-29T21:48:15.000Z' })) }) });      // revisions: opts.revisions gives the opened file a head revision, so saving updates it in place
      if (r.request().method() === 'PATCH') { seen.patches.push({ url: u, body: r.request().postData() }); seen.rev = 'R2'; return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: m && m[1], name: m && files[m[1]] && files[m[1]].name, headRevisionId: 'R2', modifiedTime: '2026-10-29T21:49:00.000Z' }) }); }
      const f = m && files[m[1]]; if (!f) return r.fulfill({ status: 404, body: '{}' });
      if (/alt=media/.test(u)) return r.fulfill({ contentType: 'text/plain', body: f.text });
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: m[1], name: f.name, parents: f.parents, mimeType: f.mime, modifiedTime: '2026-10-29T21:48:15.000Z', headRevisionId: opts && opts.revisions ? seen.rev : undefined }) });
    });
    await p.goto(base); return { p, seen, ctx };
  }

  await test('not configured: no Drive buttons and no request to Google, only Try it out and local files', async () => {
    driveOn = false; const { p, seen, ctx } = await session();
    assert(!(await p.isVisible('#saveMenuBtn')) && !(await p.isVisible('#splashDrive')));
    await p.waitForTimeout(300); assert.strictEqual(seen.google.length, 0); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  driveOn = true;
  await test('configured: nothing loads from Google until a Drive button is pressed', async () => {
    const { p, seen, ctx } = await session(); await p.waitForTimeout(300);
    assert(await p.isVisible('#splashDrive')); assert.strictEqual(seen.google.length, 0); await ctx.close();
  });
  await test('open from Drive, then Download data file saves a new TEST file into the folder it came from, without a local download', async () => {
    const { p, seen, ctx } = await session();
    await p.evaluate(() => { window.__pick = [{ id: 'F1', name: 'x', mimeType: 'application/json' }, { id: 'F2', name: 'y', mimeType: 'text/csv' }]; });
    await p.click('#splashDrive'); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent), null, { timeout: 8000 });
    assert(!(await p.isVisible('#splash'))); assert(await p.isVisible('#testBanner'));
    await p.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await p.evaluate(() => { document.getElementById('btnSeasonSave').click(); });           // test data: two presses
    await p.waitForFunction(() => /saved/.test(document.getElementById('driveStatus').textContent), null, { timeout: 8000 });
    assert.strictEqual(seen.posts.length, 1); const b = seen.posts[0].body;
    assert(b.includes('"parents":["P1"]'), 'folder'); assert(/"name":"awana-2026-27-TEST-\d{8}-\d{6}\.json"/.test(b), 'name'); assert(b.includes('"format"'), 'content');
    assert.strictEqual(seen.downloads, 0); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('Google busy once (503): a sentence and Try again; Try again saves with one more request, and the copy downloads once', async () => {
    const s = await session({ busyOnce: true });
    s.p.removeAllListeners('dialog'); const shown = [];      // this test answers the app's dialog itself: the first one is Try again (its primary button), any later one is closed
    s.p.on('dialog', async d => { shown.push(d.message()); if (shown.length === 1) await d.accept(); else await d.dismiss(); });
    await s.p.evaluate(() => { window.__pick = [{ id: 'F1' }, { id: 'F2' }]; window.__folder = [{ id: 'P2', name: 'Backups' }]; });
    await s.p.click('#splashDrive'); await s.p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent), null, { timeout: 8000 });
    await s.p.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await s.p.evaluate(() => { document.getElementById('btnSeasonSave').click(); });      // test data: two presses
    await s.p.waitForFunction(() => document.getElementById('driveStatus') && /saved/.test(document.getElementById('driveStatus').textContent), null, { timeout: 8000 });
    assert(!(await s.p.$eval('#btnSeasonSave', e => e.classList.contains('saving'))), 'the Save button shows its label again once the save has finished (N36)');
    assert(shown.length >= 1, 'the failure dialog did not open');
    assert(/busy right now \(it said 503\)/.test(shown[0]) && /Nothing was changed on Drive/.test(shown[0]), shown[0]);
    assert.strictEqual(s.seen.posts.length, 2, 'the busy save, then Try again'); assert.strictEqual(s.seen.downloads, 1, 'one copy, on the first failure');
    assert.deepStrictEqual(s.seen.errors, []); await s.ctx.close();
  });
  await test('a folder Google refuses prompts for another folder and the save goes there; cancelling falls back to a normal download', async () => {
    let s = await session({ refuseFolder: '"P1"' });
    await s.p.evaluate(() => { window.__pick = [{ id: 'F1' }, { id: 'F2' }]; window.__folder = [{ id: 'P2', name: 'Backups' }]; });
    await s.p.click('#splashDrive'); await s.p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent), null, { timeout: 8000 });
    await s.p.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await s.p.evaluate(() => { document.getElementById('btnSeasonSave').click(); });
    await s.p.waitForFunction(() => /saved/.test(document.getElementById('driveStatus').textContent), null, { timeout: 8000 });
    assert.strictEqual(s.seen.posts.length, 2); assert(s.seen.posts[1].body.includes('"parents":["P2"]')); assert.strictEqual(s.seen.downloads, 0); await s.ctx.close();
    s = await session({ refuseFolder: '"P1"' });
    await s.p.evaluate(() => { window.__pick = [{ id: 'F1' }, { id: 'F2' }]; window.__folder = null; });
    await s.p.click('#splashDrive'); await s.p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent), null, { timeout: 8000 });
    const dl = s.p.waitForEvent('download', { timeout: 8000 });
    await s.p.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await s.p.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); const d = await dl;
    assert(/TEST/.test(d.suggestedFilename())); assert(await dialogSeen(s)); await s.ctx.close();
  });
  // The save style. The test above opens a file whose Drive head revision is unknown, so it is not "in place" and is saved as a new file; the cases below name the style and the file explicitly.
  const press = async p => { await p.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await p.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); };      // test data: two presses
  const opened = async (s, folder) => { await s.p.evaluate(f => { window.__pick = [{ id: 'F1' }, { id: 'F2' }]; window.__folder = f; }, folder); await s.p.click('#splashDrive'); await s.p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent), null, { timeout: 8000 }); };
  const saved = (p, ms) => p.waitForFunction(() => /saved/.test(document.getElementById('driveStatus').textContent), null, { timeout: ms || 8000 }).catch(async e => { throw new Error('no "saved" on the Drive status: "' + await p.textContent('#driveStatus') + '"'); });
  await test('dated style (chosen in the data file): a folder Google refuses prompts for another folder and the save goes there; cancelling falls back to a normal download', async () => {
    let s = await session({ refuseFolder: '"P1"' });
    await opened(s, [{ id: 'P2', name: 'Backups' }]); await s.p.evaluate(() => App.driveStyle.set('dated')); assert.strictEqual(await s.p.evaluate(() => App.driveStyle.get()), 'dated');
    await press(s.p); await saved(s.p);
    assert.strictEqual(s.seen.posts.length, 2, 'refused once, then saved'); assert(s.seen.posts[0].body.includes('"parents":["P1"]')); assert(s.seen.posts[1].body.includes('"parents":["P2"]'), 'saved in the folder picked instead');
    assert.strictEqual(s.seen.patches.length, 0, 'dated style never overwrites a file'); assert.strictEqual(s.seen.downloads, 0); assert.deepStrictEqual(s.seen.errors, []); await s.ctx.close();
    s = await session({ refuseFolder: '"P1"' });
    await opened(s, null); await s.p.evaluate(() => App.driveStyle.set('dated'));
    const dl = s.p.waitForEvent('download', { timeout: 8000 }); await press(s.p); const d = await dl;
    assert(/TEST/.test(d.suggestedFilename())); assert(await dialogSeen(s)); assert.strictEqual(s.seen.posts.length, 1, 'only the refused attempt reached Drive'); assert.strictEqual(s.seen.patches.length, 0); await s.ctx.close();
  });
  await test('in-place style, file opened from Drive: the file is updated where it is (no new file, no folder asked for), even when its folder is one Google refuses for new files', async () => {
    const s = await session({ refuseFolder: '"P1"', revisions: true });
    await opened(s, [{ id: 'P2', name: 'Backups' }]); assert.strictEqual(await s.p.evaluate(() => App.driveStyle.get()), 'inplace'); assert.strictEqual(await s.p.evaluate(() => App.driveInfo().inPlace), true, 'the opened file is the one kept up to date');
    await press(s.p); await saved(s.p);
    assert.strictEqual(s.seen.patches.length, 1, 'one update of the opened file'); assert(/\/files\/F1\?/.test(s.seen.patches[0].url), 'it is F1 that is updated'); assert(s.seen.patches[0].body.includes('"format"'), 'with the season content');
    assert.strictEqual(s.seen.posts.length, 0, 'no new file was created'); assert(!s.seen.patches[0].body.includes('"parents"'), 'an update names no folder'); assert.strictEqual(s.seen.downloads, 0);
    assert(!s.seen.dialogs.some(m => /Google Drive/.test(m))); assert.deepStrictEqual(s.seen.errors, []); await s.ctx.close();
  });
  await test('in-place style, no file to update (opened from this computer): a folder Google refuses prompts for another folder and the save goes there; cancelling falls back to a normal download', async () => {
    const start = async (folder) => {
      const s = await session({ refuseFolder: '"parents":["P1"]', revisions: true });      // the data file itself now names P1, so refuse on the upload's parents only
      await s.p.evaluate(f => { window.__folder = f; }, folder); await s.p.setInputFiles('#splashFiles', [path.join(td, DATA)]); await s.p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent), null, { timeout: 8000 });
      await s.p.evaluate(() => { App.season.config.driveDirs = { club: { id: 'P1', name: 'Old folder', parent: 'ROOT' } }; });      // the data file names a folder this person cannot use yet
      await s.p.evaluate(() => { document.getElementById('saveMenuBtn').click(); }); await s.p.click('[data-sm="inplace"]');
      assert.strictEqual(await s.p.evaluate(() => App.driveStyle.get()), 'inplace'); assert.strictEqual(await s.p.evaluate(() => App.driveInfo().inPlace), false, 'nothing on Drive to update yet'); return s;
    };
    let s = await start([{ id: 'P2', name: 'Backups' }]); await press(s.p); await saved(s.p);
    assert.strictEqual(s.seen.posts.length, 2, 'refused once, then saved'); assert(s.seen.posts[1].body.includes('"parents":["P2"]'), 'saved in the folder picked instead'); assert.strictEqual(s.seen.patches.length, 0); assert.strictEqual(s.seen.downloads, 0); assert.deepStrictEqual(s.seen.errors, []); await s.ctx.close();
    s = await start(null); const dl = s.p.waitForEvent('download', { timeout: 8000 }); await press(s.p); const d = await dl;
    assert(/TEST/.test(d.suggestedFilename())); assert(await dialogSeen(s)); assert.strictEqual(s.seen.posts.length, 1, 'only the refused attempt reached Drive'); assert.strictEqual(s.seen.patches.length, 0); await s.ctx.close();
  });
  await test('with saving to Drive on, slide images (one PNG, or the ZIP) go to the same folder instead of being downloaded', async () => {
    const { p, seen, ctx } = await session(); seen.bin = [];
    p.on('request', rq => { if (rq.method() === 'POST' && /googleapis\.com\/upload/.test(rq.url())) seen.bin.push(rq.postDataBuffer()); });
    await p.evaluate(() => { window.__pick = [{ id: 'F1', name: 'x', mimeType: 'application/json' }]; });
    await p.click('#splashDrive'); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent), null, { timeout: 8000 });
    await p.click('button[data-tab="awards"]'); await p.selectOption('#awDate', '2026-10-21'); await p.click('#btnAwImages'); await p.waitForSelector('#slOne');
    await p.click('#slOne'); await p.click('#slOne');                       // test data: two presses
    await p.waitForFunction(() => /saved/.test(document.getElementById('driveStatus').textContent), null, { timeout: 15000 });
    assert.strictEqual(seen.bin.length, 1); assert(seen.bin[0].includes(Buffer.from([0x89, 0x50, 0x4e, 0x47])), 'PNG signature in the upload');
    const head = seen.bin[0].toString('latin1'); assert(head.includes('"parents":["P1"]') && /"name":"[^"]*TEST[^"]*\.png"/.test(head) && head.includes('"mimeType":"image/png"'), head.slice(0, 300));
    await p.click('#slAll'); await p.click('#slAll');
    for (let i = 0; i < 60 && seen.bin.length < 2; i++) await p.waitForTimeout(250);      // drawing the slides takes a moment
    assert.strictEqual(seen.bin.length, 2); assert(seen.bin[1].includes(Buffer.from([0x50, 0x4b, 0x03, 0x04])), 'ZIP signature in the upload');
    assert(/"mimeType":"application\/zip"/.test(seen.bin[1].toString('latin1')));
    assert.strictEqual(seen.downloads, 0); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('unticking "Save data files to Drive" goes back to normal downloads', async () => {
    const { p, seen, ctx } = await session();
    await p.evaluate(() => { window.__pick = [{ id: 'F1' }, { id: 'F2' }]; });
    await p.click('#splashDrive'); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent), null, { timeout: 8000 });
    await p.evaluate(() => { document.getElementById('saveMenuBtn').click(); }); await p.click('[data-sm="settings"]'); await p.waitForSelector('#gdSave'); await p.uncheck('#gdSave');
    const dl = p.waitForEvent('download', { timeout: 8000 }); await p.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await p.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await dl;
    assert.strictEqual(seen.posts.length, 0); await ctx.close();
  });
  await test('one club files folder: the picker opens in it, data files (JSON) are saved into it, slide images go to their own folder, and the choices live in the data file and are not kept by the browser after a reload', async () => {
    const { p, seen, ctx } = await session(); seen.bin = [];
    p.on('request', rq => { if (rq.method() === 'POST' && /googleapis\.com\/upload/.test(rq.url())) seen.bin.push(rq.postDataBuffer().toString('latin1')); });
    await p.click('#splashDrive'); await p.waitForFunction(() => false, null, { timeout: 500 }).catch(() => {});
    await p.evaluate(() => { window.__pick = null; }); await p.waitForTimeout(200);
    const choose = async (kind, id, name) => { await p.evaluate(([i, n]) => { window.__folder = [{ id: i, name: n }]; }, [id, name]); await p.click('[data-gdset="' + kind + '"]'); await p.waitForFunction(k => document.querySelector('[data-gdclear="' + k + '"]'), kind, { timeout: 8000 }); };
    await p.setInputFiles('#splashFiles', [path.join(td, DATA)]); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));      // folders are kept in the data file, so a file is open first
    await optDrive(p); await p.waitForSelector('[data-gdset="club"]');
    assert.strictEqual(await p.$$eval('[data-gdset]', e => e.length), 2, 'two folder rows: the club folder and the slides'); await choose('club', 'PO', 'Club files'); await choose('slides', 'PS', 'Slide images');
    const open = await p.evaluate(() => window.__dlgOpenAtPick); assert(open.length >= 2 && open.every(x => x === false), 'no modal dialog is open while Google\'s picker is up (it would sit above the picker and block it): ' + open);
    assert(!(await p.evaluate(() => document.getElementById('dlg').open)), 'there is no pop-up at all: the settings are on the Options tab');
    assert(/Club files/.test(await p.textContent('#optDriveCard')) && /Slide images, reports and exports/.test(await p.textContent('#optDriveCard')), 'the card names the two folders');
    assert.strictEqual(await p.evaluate(() => localStorage.getItem('awana-drive-dirs')), null, 'no folder copy in the browser');
    assert.deepStrictEqual(await p.evaluate(() => [App.season.config.driveDirs.club.id, App.season.config.driveDirs.slides.id]), ['PO', 'PS'], 'the two folders are kept in the data file');
    await p.evaluate(() => App.driveSave.go('a.json', '{}', 'application/json')); await p.evaluate(() => App.driveSave.go('s.png', new Uint8Array([1, 2, 3]), 'image/png'));
    assert(seen.bin[0].includes('"parents":["PO"]') && seen.bin[0].includes('application/json'), 'JSON goes to the club folder from the file: ' + seen.bin[0].slice(0, 120));
    assert(seen.bin[1].includes('"parents":["PS"]') && seen.bin[1].includes('image/png'), 'the slide goes to the slide folder from the file: ' + seen.bin[1].slice(0, 120));
    assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('shared defaults: folders chosen are saved in the data file; a second person opening that file (no browser memory) gets them, and a folder they have not confirmed is asked for once, opened beside it with it ticked', async () => {
    files.PD = { name: 'Data files', mime: 'application/vnd.google-apps.folder', parents: ['ROOT'], text: '' }; files.PS = { name: 'Slide images', mime: 'application/vnd.google-apps.folder', parents: ['ROOT'], text: '' };
    const one = await session(); one.seen.bin = [];
    await one.p.evaluate(() => { window.__pick = [{ id: 'F1', name: 'x', mimeType: 'application/json' }]; }); await one.p.click('#splashDrive'); await one.p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent), null, { timeout: 8000 });
    await one.p.evaluate(() => document.querySelector('.tabs button[data-tab="options"]').click()); await one.p.waitForSelector('[data-gdset="club"]');
    const choose = async (kind, id, name) => { await one.p.evaluate(([i, n]) => { window.__folder = [{ id: i, name: n }]; }, [id, name]); await one.p.click('[data-gdset="' + kind + '"]'); await one.p.waitForFunction(k => document.querySelector('[data-gdclear="' + k + '"]'), kind, { timeout: 8000 }); };
    await choose('club', 'PD', 'Data files'); await choose('slides', 'PS', 'Slide images');
    const dirs = await one.p.evaluate(() => App.season.config.driveDirs); assert.strictEqual(dirs.club.id, 'PD'); assert.strictEqual(dirs.slides.id, 'PS'); assert(!('open' in dirs) && !('data' in dirs), 'the old separate keys are gone'); assert.strictEqual(dirs.club.parent, 'ROOT', 'the folder\'s parent is kept so the picker can open beside it');
    assert(/shared: saved in the data file/.test(await one.p.textContent('#optDriveCard')), 'the card says it is shared'); assert(await one.p.evaluate(() => App.dirty()), 'choosing a folder is a change to the data file');
    const json = await one.p.evaluate(() => Season.toJson(App.season)); assert(JSON.parse(json).config.driveDirs.club.id === 'PD', 'it is in the saved file'); await one.ctx.close();
    const saved = files.F1.text; files.F1.text = json;
    const two = await session({ refuseFolder: '"PD"', once: true }); two.seen.bin = [];                                  // a new browser: nothing remembered; Google refuses PD until this person confirms it
    two.p.on('request', rq => { if (rq.method() === 'POST' && /googleapis\.com\/upload/.test(rq.url())) two.seen.bin.push(rq.postDataBuffer().toString('latin1')); });
    await two.p.evaluate(() => { window.__pick = [{ id: 'F1', name: 'x', mimeType: 'application/json' }]; window.__folder = [{ id: 'PD', name: 'Data files' }]; window.__parents = []; });
    await two.p.click('#splashDrive'); await two.p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent), null, { timeout: 8000 });
    assert.strictEqual(await two.p.evaluate(() => App.season.config.driveDirs.club.id), 'PD', 'the defaults came with the file');
    await two.p.evaluate(() => { window.__selected = null; window.__parents = []; }); await two.p.evaluate(() => App.driveSave.go('a.json', '{}', 'application/json'));
    assert.deepStrictEqual(await two.p.evaluate(() => window.__selected), ['PD'], 'the refused folder was offered ticked, to confirm'); assert.deepStrictEqual(await two.p.evaluate(() => window.__parents), ['ROOT'], 'opened beside it');
    assert.strictEqual(two.seen.posts.length, 2, 'refused once, then saved after confirming'); assert.deepStrictEqual(two.seen.errors, []);
    files.F1.text = saved; await two.ctx.close();
  });
  await test('N41/N42: the splash offers the remembered Drive file by its exact name (full name on hover), and opens it with no picker', async () => {
    driveOn = true; const s = await session({});
    assert(!(await s.p.isVisible('#splashLastRow')), 'shown with nothing remembered');
    await s.p.evaluate(([id, name]) => localStorage.setItem('awana-drive-last', JSON.stringify({ id, name })), ['F1', DATA]);
    await s.p.reload(); await s.p.waitForTimeout(400);
    assert(await s.p.isVisible('#splashLastRow'), 'the remembered file button is not shown');
    const btn = await s.p.evaluate(() => ({ text: document.getElementById('splashLast').textContent, title: document.getElementById('splashLast').title }));
    assert(btn.text.includes(DATA), 'the button shows the exact file name: ' + btn.text); assert.strictEqual(btn.title, DATA, 'the hover shows the full name');
    await s.p.evaluate(() => { window.__pick = []; }); await s.p.click('#splashLast'); await s.p.waitForFunction(() => document.getElementById('status') && /\d+ active/.test(document.getElementById('status').textContent), null, { timeout: 8000 });
    assert.strictEqual(s.seen.google.filter(u => /picker/.test(u)).length, 0, 'no picker opened');
    assert.deepStrictEqual(s.seen.errors, []); await s.ctx.close();
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
