// Saving to Drive as one file updated in place, in a real browser with Google pretended (a small fake Drive that keeps revisions): what may be overwritten, merging when someone else saved,
// the gap between the check and the write, pinned versions, and that a new season or a file from the computer never overwrites anything.
// Usage: NODE_PATH=<dir with playwright> node test/drive-inplace-browser.test.js        (uses ../../test-data, which holds only invented people)
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

const GSI = 'window.google=window.google||{};google.accounts={oauth2:{initTokenClient:function(o){return{requestAccessToken:function(){setTimeout(function(){o.callback({access_token:"T",expires_in:3600})},0)}}},revoke:function(){}}};';
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
const info = (d, id) => { const f = d.files[id], h = d.head(id); return { id, name: f.name, parents: f.parents, mimeType: f.mime, modifiedTime: h.modifiedTime, headRevisionId: h.id }; };
async function session(browser, base, d, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ acceptDownloads: true }), p = await ctx.newPage(), seen = { errors: [], dialogs: [], downloads: 0 };
  p.on('pageerror', e => seen.errors.push(e.message)); p.on('download', () => seen.downloads++);
  p.on('dialog', dlg => { seen.dialogs.push(dlg.message()); if (dlg.type() === 'prompt' && opts.promptAnswer) dlg.accept(opts.promptAnswer); else if (dlg.type() === 'confirm' && opts.acceptConfirm) dlg.accept(); else dlg.dismiss(); });
  await p.route(/accounts\.google\.com|apis\.google\.com|googleapis\.com/, async r => {
    const u = r.request().url(), method = r.request().method(), json = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify(o) });
    if (/gsi\/client/.test(u)) return r.fulfill({ contentType: 'application/javascript', body: GSI });
    if (/api\.js/.test(u)) return r.fulfill({ contentType: 'application/javascript', body: GAPI });
    d.calls.push(method + ' ' + u.replace(/^https:\/\/[^/]+/, ''));
    let m;
    if (method === 'POST' && /upload\/drive\/v3\/files\?/.test(u)) { const [meta, text] = d.part(r.request().postData()), id = 'N' + d.next++, j = JSON.parse(meta); d.put(id, j.name, text, j.parents); return json({ id, name: j.name, parents: j.parents, headRevisionId: 'R1' }); }
    if (method === 'PATCH' && (m = /upload\/drive\/v3\/files\/([A-Za-z0-9]+)\?/.exec(u))) {
      if (d.beforePatch) { const h = d.beforePatch; d.beforePatch = null; h(m[1]); }
      const [meta, text] = d.part(r.request().postData()), f = d.files[m[1]]; f.name = JSON.parse(meta).name; d.rev(m[1], text); return json(info(d, m[1]));
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

  await test('one file in place is the default (plan item 1): a save updates the opened file and creates no new one', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); const k = await kids(p); await mark(p, '2026-10-28', k[0], 'h'); await save(p); await settle(p);
    assert(!d.calls.some(c => /^POST/.test(c)), d.calls.join('\n')); assert.strictEqual(d.calls.filter(c => /^PATCH .*upload/.test(c)).length, 1); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('in place, nobody else: the opened file is updated (one PATCH, no new file), keeps its name, and the first save pins a version', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p); await mark(p, '2026-10-28', k[0], 'h'); await save(p); await settle(p);
    assert(!d.calls.some(c => /^POST/.test(c)), d.calls.join('\n')); assert.strictEqual(d.calls.filter(c => /^PATCH .*upload/.test(c)).length, 1);
    assert.strictEqual(d.files.F1.revs.length, 2, 'the old content is still there as a revision'); assert.strictEqual(d.files.F1.revs[0].text, ORIG);
    assert.strictEqual(d.files.F1.name, DATA, 'the file keeps the name it was opened with');
    assert(JSON.parse(d.text('F1')).attendance['2026-10-28'][k[0]].h === 1, 'the new content is the file');
    assert(d.files.F1.revs.at(-1).keepForever, 'a version was pinned'); await mark(p, '2026-10-28', k[1], 'h'); await save(p); await p.waitForTimeout(400);
    assert.strictEqual(d.files.F1.revs.length, 3); assert(!d.files.F1.revs.at(-1).keepForever, 'not pinned again within the interval'); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('in place with a name typed on Options: the file is saved under that name (.json added), and emptying the box goes back to keeping the name', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p);
    await p.evaluate(() => App.driveKeepName.set('Club Master')); await mark(p, '2026-10-28', k[0], 'h'); await save(p); await settle(p);
    assert.strictEqual(d.files.F1.name, 'Club Master.json'); assert(!d.calls.some(c => /^POST/.test(c)));
    await p.evaluate(() => App.driveKeepName.set('')); await mark(p, '2026-10-28', k[1], 'h'); await save(p); await p.waitForTimeout(500);
    assert.strictEqual(d.files.F1.name, 'Club Master.json', 'empty = keep the name the file has now'); assert.strictEqual(await p.evaluate(() => App.driveKeepName.get()), ''); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('the Options box for the kept name exists on the Drive card and is a setting of the data file', async () => {
    const d = fresh(), { p, ctx } = await prep(d); await inplace(p); await optDrive(p);
    await p.fill('#optKeepName', 'Season File'); await p.press('#optKeepName', 'Tab'); await p.waitForTimeout(200);
    assert.strictEqual(await p.evaluate(() => App.driveKeepName.get()), 'Season File.json'); assert.strictEqual(await p.evaluate(() => App.season.config.driveKeepName), 'Season File.json'); await ctx.close();
  });
  await test('someone else saved since this copy opened: their changes and ours are merged into the one file, and this screen shows both', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p), theirs = JSON.parse(ORIG);
    theirs.attendance = theirs.attendance || {}; theirs.attendance['2026-10-28'] = theirs.attendance['2026-10-28'] || {}; theirs.attendance['2026-10-28'][k[2]] = { a: 1, x: 1 }; d.rev('F1', JSON.stringify(theirs));
    await mark(p, '2026-10-28', k[0], 'h'); await save(p); await p.waitForSelector('#mergeDlg[open]'); assert.strictEqual(JSON.parse(d.text('F1')).attendance['2026-10-28'][k[0]], undefined, 'nothing is written to Drive before the screen is accepted');
    const shown = await p.$eval('#mergeDlg', e => e.textContent); assert(/Someone else saved this file on Google Drive/.test(shown) && /Save to Drive/.test(shown) && /Added \d+/.test(shown), shown.slice(0, 200));
    await applyMerge(p); await settle(p); await p.waitForTimeout(500);
    const file = JSON.parse(d.text('F1')); assert.strictEqual(file.attendance['2026-10-28'][k[0]].h, 1, 'ours'); assert.deepStrictEqual(file.attendance['2026-10-28'][k[2]], { a: 1, x: 1 }, 'theirs');
    assert(/^Merged/.test(file.history.at(-1).label), file.history.at(-1).label);
    assert.deepStrictEqual(await p.evaluate(i => App.season.attendance['2026-10-28'][i], k[2]), { a: 1, x: 1 }, 'this screen shows their mark too'); assert(d.files.F1.revs.length >= 3, 'their revision is kept');
    assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('someone saves in the gap between the check and the write: the next look at the revisions finds it and merges again, and their revision is never lost', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p), theirs = JSON.parse(ORIG);
    theirs.attendance = theirs.attendance || {}; theirs.attendance['2026-10-28'] = theirs.attendance['2026-10-28'] || {}; theirs.attendance['2026-10-28'][k[2]] = { a: 1 };
    d.beforePatch = id => d.rev(id, JSON.stringify(theirs));
    await mark(p, '2026-10-28', k[0], 'h'); await save(p); await applyMerge(p); await settle(p); await p.waitForTimeout(600);
    const file = JSON.parse(d.text('F1')); assert.strictEqual(file.attendance['2026-10-28'][k[0]].h, 1); assert.deepStrictEqual(file.attendance['2026-10-28'][k[2]], { a: 1 }, 'the one who saved in the gap still has their change');
    assert(d.files.F1.revs.some(r => !((JSON.parse(r.text).attendance || {})['2026-10-28'] || {})[k[0]]) && d.files.F1.revs.some(r => ((JSON.parse(r.text).attendance || {})['2026-10-28'] || {})[k[2]]), 'their revision is still in the list');
    assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  const clash = async (pick, cancel) => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p), theirs = JSON.parse(ORIG);
    theirs.progress = theirs.progress || {}; theirs.progress[k[0]] = { HG: { 'R.1': '2026-10-03' } }; d.rev('F1', JSON.stringify(theirs));
    await p.evaluate(i => { App.season.progress[i] = { HG: { 'R.1': '2026-10-02' } }; App.commitScope(() => App.changed()); }, k[0]); await save(p);
    await p.waitForSelector('#mergeDlg[open]'); assert(/1 to decide/.test(await p.$eval('#mergeDlg', e => e.textContent)), 'the clash is a question for the leader'); assert(!(await p.locator('#mergeDlg [data-mg="apply"]').count()), 'no Save button until the clash is decided');
    if (cancel) { await p.click('#mergeDlg [data-mg="cancel"]'); await p.waitForTimeout(600); return { d, p, seen, ctx, k }; }
    await applyMerge(p, pick); await settle(p); await p.waitForTimeout(500); return { d, p, seen, ctx, k };
  };
  await test('the same thing changed by both: Keep Drive’s leaves what was saved, and nothing is silently dropped', async () => {
    const { d, seen, ctx, k } = await clash('mine'); assert.strictEqual(JSON.parse(d.text('F1')).progress[k[0]].HG['R.1'], '2026-10-03', 'Drive’s value stayed'); assert(!seen.dialogs.some(m => /NOT kept/.test(m)), seen.dialogs.join(' | ')); await ctx.close();
  });
  await test('the same thing changed by both: Use my copy’s saves this copy’s value over Drive’s', async () => {
    const { d, ctx, k } = await clash('other'); assert.strictEqual(JSON.parse(d.text('F1')).progress[k[0]].HG['R.1'], '2026-10-02'); await ctx.close();
  });
  await test('cancelling the merge writes nothing to Drive (a copy of this file is downloaded instead, so nothing is lost)', async () => {
    const { d, seen, ctx, k } = await clash('mine', true); assert.strictEqual(JSON.parse(d.text('F1')).progress[k[0]].HG['R.1'], '2026-10-03', 'Drive’s file is as the other person left it'); assert(seen.dialogs.some(m => /cancelled/.test(m)), seen.dialogs.join(' | ')); await ctx.close();
  });
  await test('a new season never overwrites last year\'s file: its first save is a new file, which then becomes the one kept up to date', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d, { promptAnswer: '2027-28', acceptConfirm: true }); await p.evaluate(() => document.querySelector('.tabs button[data-tab="options"]').click()); await p.waitForTimeout(300); const pre = await p.evaluate(() => ({ btns: document.querySelectorAll('#btnNewSeason').length, vis: !!(document.querySelector('#btnNewSeason') && document.querySelector('#btnNewSeason').offsetParent), tab: document.querySelector('.tabs button[data-tab="options"]').className, dlg: document.getElementById('dlg').open, status: document.getElementById('status').textContent.slice(0, 80) })); await p.click('#btnNewSeason'); await p.waitForTimeout(300);
    assert.strictEqual(await p.evaluate(() => App.season.year), '2027-28', 'new season year (' + JSON.stringify(pre) + '): ' + JSON.stringify(seen.dialogs) + ' now ' + await p.evaluate(() => App.season.year + ' dirty=' + App.dirty()) + ' errors ' + JSON.stringify(seen.errors).slice(0, 400)); await save(p); await settle(p);
    assert.strictEqual(d.files.F1.revs.length, 1, 'last year\'s file was not touched: calls ' + JSON.stringify(d.calls) + ' status ' + await p.textContent('#driveStatus')); assert.strictEqual(d.files.F1.revs[0].text, ORIG); assert(d.files.N1 && JSON.parse(d.text('N1')).year === '2027-28', 'a new file holds the new season');
    await p.evaluate(() => { Season.setMark(App.season, '2027-09-08', Object.keys(App.season.roster.people)[0], 'a', 1); App.commitScope(() => App.changed()); }); await save(p); await p.waitForTimeout(500);
    assert.strictEqual(d.files.N1 && d.files.N1.revs.length, 2, 'the second save updates that new file: calls ' + JSON.stringify(d.calls) + ' files ' + Object.keys(d.files).join(',')); assert.strictEqual(d.files.F1.revs.length, 1, 'F1 again'); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('a data file opened from the computer is never saved over a Drive file: it makes a new one', async () => {
    const d = fresh(), s = await session(browser, base, d, { acceptConfirm: true }); await openF(s.p, ['F1', 'F2']);      // F1 was opened from Drive; then a different file is opened from the computer
    await inplace(s.p); const other = JSON.parse(ORIG); other.year = '2025-26'; fs.writeFileSync(path.join(require('os').tmpdir(), 'awana-2025-26-TEST-20250101-000000.json'), JSON.stringify(other));
    await s.p.setInputFiles('#fileAny', [path.join(require('os').tmpdir(), 'awana-2025-26-TEST-20250101-000000.json')]); await s.p.waitForFunction(() => App.season && App.season.year === '2025-26', null, { timeout: 8000 }); const k = await kids(s.p); await mark(s.p, '2026-10-28', k[0], 'h'); await save(s.p); await settle(s.p);
    assert(d.calls.some(c => /^POST/.test(c)) && !d.calls.some(c => /^PATCH .*upload/.test(c))); assert.strictEqual(d.files.F1.revs.length, 1, 'the Drive file the app had opened earlier was not written'); await s.ctx.close();
  });
  await test('opening a second data file after the first means the first is no longer the file this season belongs to', async () => {
    const d = fresh(); d.put('F3', 'awana-2026-27-TEST-20261001-000000.json', ORIG); const { p, ctx } = await prep(d); await inplace(p);
    await p.evaluate(() => { window.__pick = [{ id: 'F3', name: 'z', mimeType: 'x' }]; }); await p.evaluate(() => { document.getElementById('importMenuBtn').click(); }); await p.click('[data-sm="drive"]'); await p.waitForTimeout(800);
    const k = await kids(p); await mark(p, '2026-10-28', k[0], 'h'); await save(p); await p.waitForTimeout(600);
    assert.strictEqual(d.files.F1.revs.length, 1, 'the first file was not written'); assert.strictEqual(d.files.F3.revs.length, 2, 'the file that is open was updated'); await ctx.close();
  });
  await test('pinning follows the club setting: every N days, and never when it is 0', async () => {
    const d = fresh(), { p, ctx } = await prep(d); await inplace(p); const k = await kids(p);
    await p.evaluate(() => { App.season.config.drivePinDays = 0; }); await mark(p, '2026-10-28', k[0], 'h'); await save(p); await settle(p); await p.waitForTimeout(300);
    assert(!d.files.F1.revs.some(r => r.keepForever), 'pinning is off'); await ctx.close();
  });
  await test('an older data file that kept separate "open from" and "data files" folders gets one club folder: the data folder', async () => {
    const d = fresh(), s = await session(browser, base, d), o = JSON.parse(ORIG); o.config = o.config || {}; o.config.driveDirs = { open: { id: 'PO', name: 'Inbox', parent: '' }, data: { id: 'PD', name: 'Saves', parent: '' }, slides: null }; d.rev('F1', JSON.stringify(o));
    await openF(s.p, ['F1']); await optDrive(s.p); await s.p.waitForSelector('[data-gdset="club"]');
    assert(/Saves/.test(await s.p.textContent('#optDriveCard')) && !/Inbox/.test(await s.p.textContent('#optDriveCard'))); await s.ctx.close();
  });
  await test('Options has the Drive card: club folder, save style (a setting of the data file), keep-a-version days (a club setting), each with its (i) note', async () => {
    const d = fresh(), { p, ctx } = await prep(d); await p.evaluate(() => document.querySelector('.tabs button[data-tab="options"]').click()); await p.waitForSelector('input[name="optDriveStyle"]');
    assert.strictEqual(await p.$eval('input[name="optDriveStyle"]:checked', e => e.value), 'inplace', 'one file in place until chosen otherwise');
    assert(/Club files folder/.test(await p.textContent('#optionsWrap')) && !/Open files from|Data files \(JSON\)/.test(await p.textContent('#optionsWrap')), 'one folder row, not separate open and data rows');
    for (const k of ['drive.folder', 'drive.style', 'drive.pin']) assert.strictEqual(await p.locator('#optionsWrap i.info[data-info="' + k + '"]').count(), 1, k);
    await p.check('input[name="optDriveStyle"][value="inplace"]'); await p.waitForTimeout(150); assert.strictEqual(await p.evaluate(() => App.driveStyle.get()), 'inplace'); assert.strictEqual(await p.evaluate(() => App.season.config.saveStyleDrive), 'inplace');
    assert(await p.evaluate(() => App.season.config.saveStyleDrive === 'inplace'), 'the style is stored in the data file, so it follows the file');
    await p.fill('#optPinDays', '14'); await p.press('#optPinDays', 'Tab'); await p.waitForTimeout(150); assert.strictEqual(await p.evaluate(() => App.season.config.drivePinDays), 14);
    await p.fill('#optPinDays', 'x'); await p.press('#optPinDays', 'Tab'); await p.waitForTimeout(150); assert.strictEqual(await p.evaluate(() => App.season.config.drivePinDays), 14); assert(/whole number/.test(await p.textContent('#optionsWrap')));
    await ctx.close();
  });
  await test('the Google Drive settings are on the Options tab, not in a pop-up: a long folder name wraps inside the card and its buttons stay inside it, and there is no horizontal scroll', async () => {
    const d = fresh(), { p, ctx } = await prep(d); await p.evaluate(() => { window.__folder = [{ id: 'PL', name: 'A very long shared club folder name for the whole children\'s ministry team 2026-27 season' }]; });
    await optDrive(p); await p.waitForSelector('[data-gdset="club"]'); await p.click('[data-gdset="club"]'); await p.waitForSelector('[data-gdclear="club"]'); await p.waitForTimeout(200);
    const m = await p.evaluate(() => { const c = document.getElementById('optDriveCard'), b = document.querySelector('[data-gdclear="club"]').getBoundingClientRect(), r = c.getBoundingClientRect(); return { sideways: document.documentElement.scrollWidth > innerWidth + 1, inside: b.right <= r.right + 1 && b.left >= r.left, dlg: document.getElementById('dlg').open }; });
    assert(!m.sideways, 'the page scrolls sideways'); assert(m.inside, 'the Clear button is outside the card'); assert(!m.dlg, 'no pop-up'); await ctx.close();
  });
  await test('the blue save button says where the file goes: Download data file normally, Save to Google Drive while saving to Drive is on, and its tooltip names the style', async () => {
    const d = fresh(), s = await session(browser, base, d); const btn = () => s.p.evaluate(() => [document.getElementById('btnSeasonSave').textContent, document.getElementById('btnSeasonSave').title]);
    assert.deepStrictEqual(await btn(), ['Download data file', ''], 'before Drive is used'); await openF(s.p, ['F1', 'F2']);
    let [t, tip] = await btn(); assert.strictEqual(t, 'Save to Google Drive'); assert(/in place/.test(tip), tip);      // the default is one file in place (plan item 1)
    await inplace(s.p); [t, tip] = await btn(); assert.strictEqual(t, 'Save to Google Drive'); assert(/in place/.test(tip), tip);
    await optDrive(s.p); await s.p.waitForSelector('#gdSave'); await s.p.uncheck('#gdSave'); [t, tip] = await btn(); assert.deepStrictEqual([t, tip], ['Download data file', ''], 'untick: back to downloading');
    await s.p.check('#gdSave'); assert.strictEqual((await btn())[0], 'Save to Google Drive'); await s.ctx.close();
  });
  await test('without Drive set up the button is untouched', async () => {
    const ctx = await browser.newContext(), p = await ctx.newPage(); await p.route(/drive-config\.js/, r => r.fulfill({ contentType: 'application/javascript', body: 'this.AwanaDriveConfig = { clientId: "", apiKey: "", appId: "" };' })); await p.goto(base);
    assert.strictEqual(await p.$eval('#btnSeasonSave', e => e.textContent), 'Download data file'); await ctx.close();
  });
  await test('one save button: with Drive set up a menu arrow chooses where the file goes (computer, new dated file, update in place) and the button follows; there is no separate Google Drive button', async () => {
    const d = fresh(), s = await session(browser, base, d), p = s.p; await p.click('#splashSkip'); const state = () => p.evaluate(() => [document.getElementById('btnSeasonSave').textContent, App.driveStyle.get(), document.getElementById('saveMenuBtn').getAttribute('aria-expanded')]);
    assert.strictEqual(await p.locator('#driveBtn').count(), 0, 'the old second button is gone'); await p.click('#btnFile'); await p.waitForTimeout(150); assert.strictEqual(await p.locator('#fileMenu [data-fm="to-inplace"]').count(), 1, 'the File menu offers where to save when Drive is set up'); assert.strictEqual(await p.locator('#fileMenu [data-fm="imp-drive"]').count(), 1); await p.keyboard.press('Escape');
    assert.strictEqual((await state())[0], 'Download data file'); await p.evaluate(() => { document.getElementById('saveMenuBtn').click(); }); await p.waitForSelector('#saveMenu [data-sm]');
    assert.deepStrictEqual(await p.$$eval('#saveMenu [role="menuitemradio"]', e => e.map(x => x.getAttribute('aria-checked'))), ['true', 'false', 'false'], 'this computer is checked until Drive is chosen');
    assert.deepStrictEqual(await p.$$eval('#saveMenu [data-sm]', e => e.map(x => x.dataset.sm)), ['local', 'dated', 'inplace', 'settings']);
    assert.strictEqual(await p.locator('#saveMenu [data-sm="open"]').count(), 0, 'importing is on the Import button now');
    await p.click('[data-sm="dated"]'); assert.deepStrictEqual((await state()).slice(0, 2), ['Save to Google Drive', 'dated']); assert(!(await p.isVisible('#saveMenu')), 'the menu closes after a choice'); assert(await p.$eval('#driveStatus', e => !e.hidden && /Google Drive/.test(e.textContent)), 'the Drive status is set (it is shown in the (i), not the bar)');
    await p.evaluate(() => { document.getElementById('saveMenuBtn').click(); }); assert.deepStrictEqual(await p.$$eval('#saveMenu [role="menuitemradio"]', e => e.map(x => x.getAttribute('aria-checked'))), ['false', 'true', 'false']);
    await p.click('[data-sm="inplace"]'); assert.deepStrictEqual((await state()).slice(0, 2), ['Save to Google Drive', 'inplace']);      // no file is open here, so the choice is only kept until one is
    await p.evaluate(() => { document.getElementById('saveMenuBtn').click(); }); await p.click('[data-sm="local"]');
    assert.strictEqual((await state())[0], 'Save to Google Drive', 'This computer downloads now and does not change the save mode'); assert((await state())[1] === 'inplace', 'the Drive style is kept');
    await s.ctx.close();
  });
  await test('the File menu: Esc and a click elsewhere close it, arrows move through it, Google Drive settings goes to the Options tab, Import from Google Drive opens the Drive picker', async () => {
    const d = fresh(), s = await session(browser, base, d), p = s.p; await p.click('#splashSkip');
    await p.click('#btnFile'); assert(await p.isVisible('#fileMenu')); await p.keyboard.press('Escape'); assert(!(await p.isVisible('#fileMenu'))); assert.strictEqual(await p.evaluate(() => document.activeElement.id), 'btnFile', 'focus returns to the arrow');
    await p.click('#btnFile'); await p.click('h1'); assert(!(await p.isVisible('#fileMenu')), 'a click elsewhere closes it');
    await p.click('#btnFile'); const first = await p.evaluate(() => document.activeElement.dataset.fm); await p.keyboard.press('ArrowDown'); const second = await p.evaluate(() => document.activeElement.dataset.fm); assert.notStrictEqual(first, second, 'arrows move'); await p.keyboard.press('Escape');
    const r = await p.evaluate(() => document.getElementById('btnSeasonSave').getBoundingClientRect().bottom); await p.click('#btnFile'); const mb = await p.evaluate(() => document.getElementById('fileMenu').getBoundingClientRect()); assert(mb.top >= r && mb.left >= 0 && mb.right <= 1280 + 1, 'the menu sits under the Save button, on screen');
    assert(/<hr>/.test(await p.innerHTML('#fileMenu')), 'a separator between Import and Save');
    await p.click('#fileMenu [data-fm="settings"]'); await p.waitForSelector('#gdSave'); assert(!(await p.evaluate(() => document.getElementById('dlg').open)), 'no pop-up'); assert(await p.evaluate(() => !document.getElementById('tab-options').hidden), 'it goes to the Options tab');
    await p.evaluate(() => { window.__pick = [{ id: 'F1', name: 'x', mimeType: 'application/json' }]; }); await p.click('#btnFile'); await p.click('#fileMenu [data-fm="imp-drive"]'); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent), null, { timeout: 8000 });
    assert.strictEqual(await p.$eval('#btnSeasonSave', e => e.textContent), 'Save to Google Drive', 'opening from Drive switches Drive saving on'); await s.ctx.close();
  });
  await test('on a phone the File menu is fully on screen and its items are tall enough to tap', async () => {
    const d = fresh(), s = await session(browser, base, d), p = s.p; await p.click('#splashSkip'); await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(150);
    await p.evaluate(() => document.getElementById('btnFile').scrollIntoView({ inline: 'end' })); await p.click('#btnFile');
    const m = await p.evaluate(() => { const r = document.getElementById('fileMenu').getBoundingClientRect(), b = document.querySelector('#fileMenu [data-fm]').getBoundingClientRect(); return { l: r.left, r: r.right, h: b.height }; }); assert(m.l >= 0 && m.r <= 391, JSON.stringify(m)); assert(m.h >= 44, 'tap height ' + m.h); await s.ctx.close();
  });
  await test('after a successful Drive save the blue save button turns green and fades back to blue (dated and in-place saves alike)', async () => {
    const d = fresh(), { p, ctx } = await prep(d); await inplace(p); await p.evaluate(() => { App.driveSavedMs = 1500; });
    const color = () => p.$eval('#btnSeasonSave', e => { const m = getComputedStyle(e).backgroundColor.match(/\d+/g).map(Number); return { r: m[0], g: m[1], b: m[2], saved: e.parentElement.classList.contains('saved') }; });
    const blue = await color(); assert(blue.b > blue.g && !blue.saved, 'blue before any save: ' + JSON.stringify(blue));
    const k = await kids(p); await mark(p, '2026-10-28', k[0], 'h'); await save(p); await settle(p); await p.waitForTimeout(80);
    const green = await color(); assert(green.saved && green.g > green.b && green.g > green.r, 'green right after the save: ' + JSON.stringify(green));
    assert(await p.$eval('#saveMenuBtn', e => getComputedStyle(e).backgroundColor !== getComputedStyle(document.body).backgroundColor), 'the arrow is part of the button');
    await p.waitForTimeout(2200); const back = await color(); assert(!back.saved && back.b > back.g, 'faded back to blue: ' + JSON.stringify(back));
    await p.evaluate(() => { App.driveStyle.set('dated'); }); await mark(p, '2026-10-28', k[1], 'h'); await save(p); await p.waitForTimeout(500); assert((await color()).saved, 'a dated Drive save turns it green too');
    await p.evaluate(() => { document.getElementById('saveMenuBtn').click(); }); await p.click('[data-sm="local"]'); await p.waitForTimeout(2200); assert(!(await color()).saved); await ctx.close();
  });
  await test('one Import button follows the save default: this computer\'s file picker normally, Google\'s picker while saving to Drive is on; the arrow picks either for one import', async () => {
    const d = fresh(), s = await session(browser, base, d), p = s.p; await p.click('#splashSkip'); const label = () => p.$eval('#btnImport', e => e.textContent);
    assert.strictEqual(await p.locator('header label.btn').count(), 0, 'no separate Open files / Import labels in the header'); await p.click('#btnFile'); await p.waitForTimeout(150); assert.strictEqual(await p.locator('#fileMenu [data-fm="imp-drive"]').count(), 1, 'Import from Google Drive is in the File menu when Drive is set up'); await p.keyboard.press('Escape'); assert.strictEqual(await label(), 'Import…');
    const chooser = p.waitForEvent('filechooser', { timeout: 3000 }); await p.evaluate(() => { document.getElementById('btnImport').click(); }); await chooser;      // saving to Drive is off: the computer's picker
    await p.evaluate(() => { document.getElementById('importMenuBtn').click(); }); assert.deepStrictEqual(await p.$$eval('#importMenu [data-sm]', e => e.map(x => x.dataset.sm)), ['local', 'drive']); assert.deepStrictEqual(await p.$$eval('#importMenu [role="menuitemradio"]', e => e.map(x => x.getAttribute('aria-checked'))), ['true', 'false'], 'this computer is the default');
    await p.keyboard.press('Escape'); assert(!(await p.isVisible('#importMenu')));
    await p.evaluate(() => { document.getElementById('saveMenuBtn').click(); }); await p.click('[data-sm="dated"]'); assert.strictEqual(await label(), 'Import from Drive…', 'the label follows the save target'); assert(/Google Drive/.test(await p.$eval('#btnImport', e => e.title)));
    await p.evaluate(() => { document.getElementById('importMenuBtn').click(); }); assert.deepStrictEqual(await p.$$eval('#importMenu [role="menuitemradio"]', e => e.map(x => x.getAttribute('aria-checked'))), ['false', 'true'], 'Drive is the default now');
    const chooser2 = p.waitForEvent('filechooser', { timeout: 3000 }); await p.click('#importMenu [data-sm="local"]'); await chooser2;      // the arrow still gives this computer for one import
    assert.strictEqual(await label(), 'Import from Drive…', 'one import does not change the default');
    await p.evaluate(() => { window.__pick = [{ id: 'F1', name: 'x', mimeType: 'application/json' }]; }); await p.evaluate(() => { document.getElementById('btnImport').click(); }); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent), null, { timeout: 8000 });
    assert(await p.evaluate(() => App.season && App.master.people.length > 0), 'the main button opened the Drive picker and imported');
    await p.evaluate(() => { document.getElementById('saveMenuBtn').click(); }); assert(!(await p.isVisible('#importMenu')), 'only one menu is open at a time'); await p.evaluate(() => { document.getElementById('importMenuBtn').click(); }); assert(!(await p.isVisible('#saveMenu'))); await s.ctx.close();
  });
  await test('CSV exports go to the second folder (the club folder when none is set) while saving to Drive is on, and are downloaded when it is off; a printed report is the browser\'s own', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); const exportCsv = () => p.evaluate(() => App.download('Awana store points 2026-10-28.csv', 'Name,Points\nAva,12\n', 'text/csv;charset=utf-8'));
    await p.evaluate(() => { App.driveSavedMs = 500; }); await optDrive(p); await p.uncheck('#gdSave'); const dl = p.waitForEvent('download', { timeout: 3000 }); await exportCsv(); await dl;      // Drive off: an ordinary download
    assert(!d.calls.some(c => /^POST/.test(c)), 'nothing was sent to Drive');
    await p.evaluate(() => { document.getElementById('saveMenuBtn').click(); }); await p.click('[data-sm="dated"]'); const before = d.calls.length; await exportCsv(); await p.waitForTimeout(800);
    const posts = d.calls.slice(before).filter(c => /^POST .*upload/.test(c)); assert.strictEqual(posts.length, 1, 'the CSV was uploaded'); const f = Object.values(d.files).find(x => /^Awana store points 2026-10-28.*\.csv$/.test(x.name)); assert(f && /Ava,12/.test(f.revs[0].text), 'with its contents'); assert.deepStrictEqual(f.parents, ['P1'], 'in the club folder when no second folder is set');
    await optDrive(p); await p.evaluate(() => { window.__folder = [{ id: 'PS', name: 'Slides and reports' }]; }); await p.click('[data-gdset="slides"]'); await p.waitForSelector('[data-gdclear="slides"]'); await exportCsv(); await p.waitForTimeout(800);
    const g = Object.values(d.files).filter(x => /^Awana store points 2026-10-28.*\.csv$/.test(x.name)).pop(); assert.deepStrictEqual(g.parents, ['PS'], 'in the second folder once one is chosen'); assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await test('Options: the Drive card is complete (saving on/off, both folders, sign-out) and says what goes where, with no pop-up', async () => {
    const d = fresh(), { p, ctx } = await prep(d); await optDrive(p); const text = await p.textContent('#optDriveCard');
    assert(/Slide images, reports and exports go to/.test(text) && /Club files folder/.test(text) && /Print \/ Save as PDF/.test(text) && /browser.s own print window/.test(text), text.slice(0, 300));
    assert.strictEqual(await p.locator('#optDriveCard #gdSave').count(), 1); assert.strictEqual(await p.locator('#optDriveCard [data-gdset]').count(), 2); assert.strictEqual(await p.locator('#optDriveCard i.info[data-info="drive.reports"]').count(), 1, 'with its (i) note');
    assert.strictEqual(await p.$eval('#gdSave', e => e.checked), true, 'importing from Drive switched saving on'); await p.uncheck('#gdSave'); assert.strictEqual(await p.$eval('#btnSeasonSave', e => e.textContent), 'Download data file'); assert.strictEqual(await p.$eval('#btnImport', e => e.textContent), 'Import…');
    await p.check('#gdSave'); await p.click('#optSignOut').catch(() => {}); assert(!(await p.evaluate(() => document.getElementById('dlg').open))); await ctx.close();
  });
  await test('an app update with Drive saving: the open file is saved (updated in place) first, and after the reload saving still goes to Drive and the SAME file is kept up to date', async () => {
    const d = fresh(), { p, ctx } = await prep(d); await inplace(p); const k = await kids(p); let offer = false;
    await p.route(/\/index\.html/, async r => { const res = await r.fetch(); let body = await res.text(); if (offer) body = body.replace(/(name="app-version" content=")[^"]*/, '$19.9.9'); await r.fulfill({ response: res, body }); });
    await mark(p, '2026-10-28', k[0], 'h'); offer = true; await p.evaluate(() => App.updates.check()); await p.waitForSelector('#updateBar:not([hidden])');
    const nav = p.waitForNavigation({ timeout: 10000 }); await p.click('#updateNow'); await nav; await p.waitForFunction(() => App.season && document.querySelector('meta[name="app-version"]').content === '9.9.9', null, { timeout: 10000 }); await p.waitForTimeout(600);
    assert(d.calls.some(c => /^PATCH .*upload/.test(c)) && !d.calls.some(c => /^POST/.test(c)), 'the unsaved mark was saved into the Drive file first: ' + d.calls.filter(c => /^(PATCH|POST)/.test(c)).join(' | ')); assert.strictEqual(JSON.parse(d.text('F1')).attendance['2026-10-28'][k[0]].h, 1);
    const st = await p.evaluate(() => [App.driveInfo().save, App.driveStyle.get(), App.dirty()]); assert.deepStrictEqual(st, [true, 'inplace', false], 'saving still goes to Drive, in place, and nothing is unsaved: ' + st.join());
    const patches = () => d.calls.filter(c => /^PATCH .*upload/.test(c)).length, before = patches(); await mark(p, '2026-10-28', k[1], 'h'); await save(p); await p.waitForTimeout(900);
    assert.strictEqual(patches(), before + 1, 'the next save updated the same Drive file'); assert(!d.calls.some(c => /^POST/.test(c)), 'and did not make a new one'); assert.strictEqual(JSON.parse(d.text('F1')).attendance['2026-10-28'][k[1]].h, 1); await ctx.close();
  });
  await test('a copy cannot save over a Drive file from a newer format (R17: an older copy meeting a version 6 file takes this same path)', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p), newer = JSON.parse(ORIG); newer.version = 99; d.rev('F1', JSON.stringify(newer)); const head = d.text('F1');
    await mark(p, '2026-10-28', k[0], 'h'); await save(p); await p.waitForTimeout(1500);
    assert.strictEqual(d.calls.filter(c => /^PATCH .*upload/.test(c)).length, 0, 'nothing was written to Drive: ' + d.calls.join(' | ')); assert.strictEqual(d.text('F1'), head, 'Drive still holds the newer file untouched');
    assert.strictEqual(await p.evaluate(() => App.dirty()), true, 'the open file is still unsaved'); assert(seen.dialogs.some(m => /newer version/.test(m)), 'the person is told why: ' + seen.dialogs.join(' | ')); await ctx.close();
  });
  await test('a Drive save after an import here, while someone else saved attendance: Drive holds their marks and this copy\'s whole export record (R17)', async () => {
    const d = fresh(), { p, seen, ctx } = await prep(d); await inplace(p); const k = await kids(p), theirs = JSON.parse(ORIG), later = fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort()[1];
    theirs.attendance = theirs.attendance || {}; theirs.attendance['2026-10-28'] = theirs.attendance['2026-10-28'] || {}; theirs.attendance['2026-10-28'][k[2]] = { a: 1, x: 1 }; d.rev('F1', JSON.stringify(theirs));
    await p.setInputFiles('#fileAny', [path.join(td, later)]); await p.waitForSelector('#review:not([hidden])', { timeout: 8000 }); await p.click('#rvApply'); await p.waitForTimeout(700);
    await save(p); await applyMerge(p); await settle(p); await p.waitForTimeout(600);
    const file = JSON.parse(d.text('F1')); assert.deepStrictEqual(file.attendance['2026-10-28'][k[2]], { a: 1, x: 1 }, 'their mark is in Drive'); assert.strictEqual(file.roster.pcAsOf, '2026-11-03', 'this copy\'s export is the one Drive holds');
    assert(file.roster.pcExport && file.roster.pcExport.names.length > 10 && /^[0-9a-f]{8}-\d+$/.test(file.roster.pcExport.hash), 'the whole export record: ' + JSON.stringify(Object.keys(file.roster.pcExport || {})));
    assert.deepStrictEqual(seen.errors, []); await ctx.close();
  });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
