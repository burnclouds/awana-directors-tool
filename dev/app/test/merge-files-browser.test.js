// File menu > Merge a data file: the three-step screen (summary, conflicts, final summary), Apply only at the end, one undoable History entry. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/merge-files-browser.test.js
const { chromium } = require('playwright');
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html', f = path.join(app, u);
  if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f));
});
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const open = async () => {
    const ctx = await browser.newContext({ acceptDownloads: true }), page = await ctx.newPage(), msgs = [];
    page.on('dialog', d => { msgs.push(d.message()); d.accept(); }); page.on('pageerror', e => msgs.push('PAGE ERROR ' + e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    return { page, msgs };
  };
  // One Sparks child, one Sparks book item and a night with no marks yet; the other file is this file plus `edit`, logged in its History.
  const ids = page => page.evaluate(() => {
    const kids = App.master.people.filter(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === 'Sparks').map(x => x[Model.X.ID]), bl = App.season.config.progress.Sparks.perBook[0];
    return { a: kids[0], b: kids[1], key: bl.key + '.' + (bl.items[0]), night: Object.keys(App.season.attendance).sort().pop() };
  });
  const other = (page, edit, ctx) => page.evaluate(([src, ctx]) => {
    const o = Season.fromJson(Season.toJson(App.season)), before = Season.snapshot(o); new Function('o', 'ctx', 'Season', src)(o, ctx, Season); Season.record(o, before, { separate: true, now: '2030-01-01T00:00:00Z' }); return Season.toJson(o);
  }, [edit, ctx]);
  // The other file is made first (it dates one item 10/03), then this copy dates the same item 10/02: both changed it after they last agreed.
  const conflict = async (page, c) => {
    const text = await other(page, 'o.progress[ctx.a] = o.progress[ctx.a] || {}; o.progress[ctx.a].HG = Object.assign({}, o.progress[ctx.a].HG, { [ctx.key]: "2026-10-03" });', c);
    await page.evaluate(([id, k]) => { App.season.progress[id] = App.season.progress[id] || {}; App.season.progress[id].HG = Object.assign({}, App.season.progress[id].HG, { [k]: '2026-10-02' }); App.touch(); }, [c.a, c.key]); return text;
  };
  const merge = async (page, text, name) => { await page.setInputFiles('#fileMerge', { name: name || 'other.json', mimeType: 'application/json', buffer: Buffer.from(text) }); await page.waitForSelector('#mergeDlg[open]'); };
  const dlg = page => page.$eval('#mergeDlg', e => e.textContent);
  const btn = (page, k) => page.locator('#mergeDlg [data-mg="' + k + '"]');

  await test('File menu has "Merge a data file…"', async () => {
    const { page } = await open(); await page.click('#btnFile'); await page.waitForTimeout(150);
    assert(await page.isVisible('#fileMenu [data-fm="imp-merge"]'), 'the menu item is shown'); assert(/Merge a data file/.test(await page.textContent('#fileMenu [data-fm="imp-merge"]'))); await page.close();
  });
  await test('additions only: the summary lists them by category, there is no conflict step, nothing changes until Apply, then the merge is one History entry', async () => {
    const { page } = await open(), c = await ids(page);
    const text = await other(page, 'ctx.b && Season.setMark(o, ctx.night, ctx.b, "a", 1); o.progress[ctx.a] = o.progress[ctx.a] || {}; o.progress[ctx.a].HG = Object.assign({}, o.progress[ctx.a].HG, { [ctx.key]: "2026-10-27" });', c);
    const had = await page.evaluate(([n, id]) => ((App.season.attendance[n] || {})[id] || {}).a, [c.night, c.b]), hist = await page.evaluate(() => App.season.history.length);
    await merge(page, text, 'sam.json'); const t = await dlg(page);
    assert(/Merge sam\.json into this file/.test(t)); assert(/Attendance/.test(t) && /Progress/.test(t), t.slice(0, 300)); assert(/Added \d+/.test(t)); assert(!(await btn(page, 'next').count()), 'no conflict step'); assert(await btn(page, 'apply').isVisible());
    assert.strictEqual(await page.evaluate(([n, id]) => ((App.season.attendance[n] || {})[id] || {}).a, [c.night, c.b]), had, 'nothing changed before Apply'); assert.strictEqual(await page.evaluate(() => App.season.history.length), hist);
    await btn(page, 'apply').click(); await page.waitForTimeout(400); assert(!(await page.isVisible('#mergeDlg')), 'the dialog closed');
    assert.strictEqual(await page.evaluate(([n, id]) => ((App.season.attendance[n] || {})[id] || {}).a, [c.night, c.b]), 1);
    assert.strictEqual(await page.evaluate(([id, k]) => (((App.season.progress[id] || {}).HG) || {})[k], [c.a, c.key]), '2026-10-27');
    assert.strictEqual(await page.evaluate(() => App.season.history.length), hist + 1); assert(/^Merged \(sam\.json\)/.test(await page.evaluate(() => App.season.history.at(-1).label)));
    assert(await page.evaluate(() => App.dirty()), 'the merged file is marked unsaved'); await page.close();
  });
  await test('Cancel leaves the open file exactly as it was', async () => {
    const { page } = await open(), c = await ids(page), text = await other(page, 'Season.setMark(o, ctx.night, ctx.b, "a", 1);', c), before = await page.evaluate(() => JSON.stringify(Season.snapshot(App.season)));
    await merge(page, text); await btn(page, 'cancel').click(); await page.waitForTimeout(200); assert(!(await page.isVisible('#mergeDlg')));
    assert.strictEqual(await page.evaluate(() => JSON.stringify(Season.snapshot(App.season))), before); assert.strictEqual(await page.evaluate(() => App.dirty()), false); await page.close();
  });
  await test('a real conflict: Apply is not offered on step 1, step 2 needs a choice for every conflict, Take theirs is applied, and the final summary says Changed "you chose"', async () => {
    const { page } = await open(), c = await ids(page);
    const text = await conflict(page, c);
    await merge(page, text); assert(!(await btn(page, 'apply').count()), 'no Apply on step 1'); assert(/1 to decide/.test(await dlg(page)));
    await btn(page, 'next').click(); await page.waitForTimeout(150); assert(await page.isDisabled('#mgNext'), 'the final step is locked until every conflict has a choice'); assert(/1 still to decide/.test(await dlg(page)));
    assert.strictEqual(await page.$$eval('#mergeDlg input[type=radio]:checked', e => e.length), 0, 'nothing is chosen for the leader');
    await page.check('#mergeDlg input[type=radio][value="other"]'); await page.waitForTimeout(100); assert(!(await page.isDisabled('#mgNext')), 'unlocked once decided'); assert(/All decided/.test(await dlg(page)));
    await page.click('#mgNext'); await page.waitForTimeout(150); const t = await dlg(page); assert(/Changed 1/.test(t), t.slice(0, 300)); assert(/you chose/.test(t)); assert(/2026-10-03/.test(t));
    await btn(page, 'apply').click(); await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(([id, k]) => App.season.progress[id].HG[k], [c.a, c.key]), '2026-10-03'); await page.close();
  });
  await test('Keep all mine decides every conflict, keeps this file\'s value, and Back from the final summary returns to the choices', async () => {
    const { page } = await open(), c = await ids(page);
    const text = await conflict(page, c);
    await merge(page, text); await btn(page, 'next').click(); await btn(page, 'all-mine').click(); await page.waitForTimeout(100); assert(/All decided/.test(await dlg(page)));
    await page.click('#mgNext'); await page.waitForTimeout(100); await btn(page, 'back').click(); await page.waitForTimeout(100); assert(/Step 2/.test(await dlg(page))); await page.click('#mgNext'); await btn(page, 'apply').click(); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(([id, k]) => App.season.progress[id].HG[k], [c.a, c.key]), '2026-10-02'); await page.close();
  });
  await test('an Edit choice with a typed date is applied; an Edit with nothing typed is not a decision', async () => {
    const { page } = await open(), c = await ids(page);
    const text = await conflict(page, c);
    await merge(page, text); await btn(page, 'next').click(); await page.check('#mergeDlg input[type=radio][value="edit"]'); await page.waitForTimeout(100); assert(await page.isDisabled('#mgNext'), 'empty Edit does not count');
    await page.fill('#mergeDlg input[data-edit]', '2026-10-09'); await page.waitForTimeout(100); assert(!(await page.isDisabled('#mgNext')));
    await page.click('#mgNext'); await btn(page, 'apply').click(); await page.waitForTimeout(300); assert.strictEqual(await page.evaluate(([id, k]) => App.season.progress[id].HG[k], [c.a, c.key]), '2026-10-09'); await page.close();
  });
  await test('a mark the other file un-ticked is kept here and listed as Review, with no question', async () => {
    const { page } = await open(), c = await ids(page);
    await page.evaluate(([n, id]) => { Season.setMark(App.season, n, id, 'a', 1); App.touch(); }, [c.night, c.a]);
    const text = await other(page, 'delete (o.attendance[ctx.night] || {})[ctx.a];', c);
    await page.evaluate(([n, id]) => { App.season.attendance[n][id] = App.season.attendance[n][id] || { a: 1 }; }, [c.night, c.a]);
    await merge(page, text); const t = await dlg(page); assert(!/to decide/.test(t), t.slice(0, 200)); assert(/Review [1-9]/.test(t), 'flagged for review: ' + t.slice(0, 200)); assert(await page.$('#mergeDlg .mgtag-review'), 'a Review row is listed');
    await btn(page, 'apply').click(); await page.waitForTimeout(300); assert.strictEqual(await page.evaluate(([n, id]) => ((App.season.attendance[n] || {})[id] || {}).a, [c.night, c.a]), 1, 'the mark is still ticked'); await page.close();
  });
  await test('the category and tag filters narrow the list, and the summary downloads as text and as CSV', async () => {
    const { page } = await open(), c = await ids(page);
    const text = await other(page, 'Season.setMark(o, ctx.night, ctx.b, "a", 1); o.progress[ctx.a] = o.progress[ctx.a] || {}; o.progress[ctx.a].HG = Object.assign({}, o.progress[ctx.a].HG, { [ctx.key]: "2026-10-27" });', c);
    await merge(page, text); assert(await page.$$eval('#mergeDlg .mgcat', e => e.length) >= 2);
    await page.selectOption('#mgCat', 'Progress'); await page.waitForTimeout(100); assert.strictEqual(await page.$$eval('#mergeDlg .mgcat', e => e.length), 1);
    await page.selectOption('#mgCat', ''); await page.selectOption('#mgTag', 'Review'); await page.waitForTimeout(100); assert(/Nothing in the other file/.test(await dlg(page)), 'no Review rows here');
    const [d1] = await Promise.all([page.waitForEvent('download'), btn(page, 'dl-text').click()]); assert.strictEqual(d1.suggestedFilename(), 'merge-summary.txt');
    const t1 = fs.readFileSync(await d1.path(), 'utf8'); assert(/Merge summary/.test(t1) && /Attendance/.test(t1), t1.slice(0, 120));
    const [d2] = await Promise.all([page.waitForEvent('download'), btn(page, 'dl-csv').click()]); assert.strictEqual(d2.suggestedFilename(), 'merge-summary.csv'); assert(/^Category,Tag,Where,Now,After,From/.test(fs.readFileSync(await d2.path(), 'utf8')));
    await page.close();
  });
  await test('a file that is not a data file is refused with a message, and a phone-width screen keeps the buttons reachable', async () => {
    const { page, msgs } = await open(); await page.setInputFiles('#fileMerge', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('not json') }); await page.waitForTimeout(400);
    assert(msgs.some(m => /not a data file/.test(m)), msgs.join(' | ')); assert(!(await page.isVisible('#mergeDlg')));
    const c = await ids(page), text = await other(page, 'Season.setMark(o, ctx.night, ctx.b, "a", 1);', c); await page.setViewportSize({ width: 390, height: 844 }); await merge(page, text);
    assert(await btn(page, 'apply').isVisible()); assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll'); await page.close();
  });
  await test('no script errors', async () => { const { page, msgs } = await open(); await page.close(); assert.deepStrictEqual(msgs.filter(m => /PAGE ERROR/.test(m)), []); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
