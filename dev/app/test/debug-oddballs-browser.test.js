// N39, Debug tab "Records that look wrong": Check lists the oddballs with the child's name; a fix button appears only where the fix loses nothing; one click is one History step and Undo takes it back.
// A row that holds a date (a received date for an unknown book) has no button and is never changed. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/debug-oddballs-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext()).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  // child a: a bare handbook code for a book of ANOTHER group, with a dated book of its own group (so it is not the "no dates" case); child b: a received date for a book that does not exist
  await page.evaluate(() => App.showTab('debug')); await page.waitForTimeout(200); assert.strictEqual(await page.evaluate(() => App.view()), 'debug', 'really on the Debug tab');      // edits on the Roster tab are a draft until Apply: set the file up on a tab that logs at once
  const ids = await page.evaluate(() => { const M = Model, ps = App.master.people.filter(p => M.isActive(p) && M.isClubber(p) && ['Sparks', 'T&T', 'Cubbies'].includes(M.groupOf(M.room(p))));
    const a = ps[0][M.X.ID], b = ps[1][M.X.ID], g = M.groupOf(M.room(ps[0])), own = { Sparks: 'HG', 'T&T': 'AoG', Cubbies: 'HC' }[g], other = g === 'Sparks' ? 'AoG' : 'HG', s = App.season;
    s.received = s.received || {}; s.received[a] = Object.assign({}, s.received[a], { [own]: '2026-10-07' }); s.handbooks[a] = other;
    s.received[b] = Object.assign({}, s.received[b], { ZZ: '2026-10-14' });
    s.awards['2026-10-07'] = Object.assign({}, s.awards['2026-10-07'], { [a]: ['Test Award 1', 'Test Award 1'] }); App.touch(); return { a, b, other }; });
  const section = async () => { const t = await page.textContent('#debugWrap'); return t.slice(t.indexOf('Records that look wrong'), t.indexOf('Open now')); };
  await test('Check lists the three oddballs and says what each is', async () => {
    assert((await page.textContent('#debugWrap')).includes('Records that look wrong'), 'section is on the Debug tab');
    await page.evaluate(() => document.getElementById('dbgOddCheck').click()); await page.waitForTimeout(200);
    const t = await section(); ['Handbook for another class', 'Same award listed twice', 'Received date with no matching book'].forEach(w => assert(t.includes(w), 'missing "' + w + '": ' + t.slice(0, 400)));
  });
  await test('only a fix that loses nothing gets a button (the received date has none)', async () => {
    const btns = await page.evaluate(() => [...document.querySelectorAll('#debugWrap [data-oddfix]')].map(b => b.dataset.oddfix).sort());
    assert.deepStrictEqual(btns, ['award-duplicate', 'handbook-group']);
  });
  await test('one click clears the handbook: one History step, the date and the received book untouched, Undo brings it back', async () => {
    const before = await page.evaluate(() => App.season.history.length);
    await page.evaluate(() => document.querySelector('#debugWrap [data-oddfix="handbook-group"]').click()); await page.waitForTimeout(400);
    const after = await page.evaluate(([a, b]) => ({ hb: App.season.handbooks[a], n: App.season.history.length, label: App.season.history[App.season.history.length - 1].label, zz: (App.season.received[b] || {}).ZZ }), [ids.a, ids.b]);
    assert.strictEqual(after.hb, undefined, 'handbook cleared'); assert.strictEqual(after.n, before + 1, 'exactly one new History entry: before ' + before + ', after ' + after.n + ', last label ' + after.label + ', hb ' + after.hb); assert(/^Debug: cleared 1 handbook code/.test(after.label), 'its own labelled entry, got: ' + after.label); assert.strictEqual(after.zz, '2026-10-14', 'the received date is untouched');
    await page.click('#btnUndo'); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(a => App.season.handbooks[a], ids.a), ids.other, 'Undo restores the code');
  });
  await test('the duplicate award is cut to one copy', async () => {
    await page.evaluate(() => { document.getElementById('dbgOddCheck') && document.getElementById('dbgOddCheck').click(); }); await page.waitForTimeout(150);
    await page.evaluate(() => document.querySelector('#debugWrap [data-oddfix="award-duplicate"]').click()); await page.waitForTimeout(300);
    assert.deepStrictEqual(await page.evaluate(a => App.season.awards['2026-10-07'][a], ids.a), ['Test Award 1']);
  });
  await test('Debug corrects legacy uniform flags and missing Cubbies assignments, with Undo', async () => {
    const date = '2026-10-09';
    const id = await page.evaluate(date => {
      const p = App.master.people.find(p => Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'Cubbies');
      const id = p[Model.X.ID];
      p[Model.UNI.GIVEN] = date; p[Model.UNI.GIVEN_FLAG] = '1';
      delete App.season.handbooks[id];
      App.season.progress[id] = {};
      App.season.doneBooks[id] = [];
      App.season.received[id] = { HC: date };
      App.touch();
      return id;
    }, date);
    await page.click('#dbgOddCheck');
    const uniform = page.locator('[data-oddfix="uniform-given-conflict"]');
    const handbook = page.locator('[data-oddfix="cubbies-handbook"]');
    const honeyComb = page.locator('#progressWrap button[data-book="HC"]');
    const showProgress = () => page.evaluate(id => App.showPerson(id, { sub: 'progress' }), id);
    const values = () => page.evaluate(id => {
      const p = App.master.people.find(p => p[Model.X.ID] === id);
      const v = App.season.roster.people[id].v;
      return [p[Model.UNI.GIVEN], p[Model.UNI.GIVEN_FLAG], v[Model.UNI.GIVEN_FLAG] || '', Season.childBook(App.season, id), Season.receivedShown(App.season, id, 'HC')];
    }, id);
    await uniform.click();
    assert.deepStrictEqual((await values()).slice(0, 3), [date, '', '']);
    await page.click('#btnUndo');
    assert.deepStrictEqual((await values()).slice(0, 3), [date, '1', '1']);
    assert(await uniform.isVisible());
    await showProgress();
    assert.match(await honeyComb.getAttribute('class'), /\bst-open\b/);
    await page.evaluate(() => App.showTab('debug'));
    await handbook.click();
    assert.deepStrictEqual((await values()).slice(3), ['HC', date]);
    await showProgress();
    assert.match(await honeyComb.getAttribute('class'), /\bst-cur\b/);
    await page.click('#btnUndo');
    assert.notStrictEqual((await values())[3], 'HC');
    assert.match(await honeyComb.getAttribute('class'), /\bst-open\b/);
    await page.evaluate(() => App.showTab('debug'));
    assert(await handbook.isVisible());
  });
  await test('no script errors', async () => { assert.strictEqual(errs.length, 0, errs.join(' | ')); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
