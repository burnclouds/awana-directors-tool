// The To do page: a handbook code that is not one of the books is corrected on the row; a medical note is ticked read (and comes back only if it changes). Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/todo-book-medical-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
setTimeout(() => { console.log('timed out'); process.exit(2); }, 170000).unref();
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const flashes = () => page.$$eval('#flash, .flash', e => e.map(x => x.textContent).join('|')).catch(() => '');

  // A Sparks child with a handbook code that is not one of the books.
  const kid = await page.evaluate(() => {
    const M = Model, S = Season, s = App.season, p = App.master.people.find(x => M.isActive(x) && M.isClubber(x) && M.groupOf(M.room(x)) === 'Sparks');
    if (!p) return null; const id = p[M.X.ID]; S.setHandbook(s, id, { code: 'XQ', date: '', note: '' }); App.touch(); return id;
  });
  await page.evaluate(() => App.showTab('todo')); await page.waitForTimeout(300);

  await test('a child with an unknown handbook code has a "Correct book code" box on the To do page', async () => {
    assert(kid, 'the test club has a Sparks child');
    assert((await page.locator('input[data-book-fix="' + kid + '"]').count()) >= 1, 'box present');      // a Sparks child with an unknown code is also on "Needs a handbook", so there can be two boxes
  });
  await test('a code that is not one of the books is refused: the reason shows and the typed text stays', async () => {
    const box = page.locator('input[data-book-fix="' + kid + '"]').first(); await box.fill('ZZ'); await box.dispatchEvent('change'); await page.waitForTimeout(300);
    assert(/not one of your books/.test(await flashes()), 'reason shown: ' + await flashes());
    assert.strictEqual(await page.evaluate(id => App.season.handbooks[id], kid), 'XQ', 'stored code unchanged');
    assert.strictEqual(await box.inputValue(), 'ZZ', 'typed text kept');
  });
  await test('a known book code saves to the handbook and the row leaves To do', async () => {
    const code = await page.evaluate(() => Object.keys(App.season.config.books || {})[0]);
    assert(code, 'the test club has a book');
    const box = page.locator('input[data-book-fix="' + kid + '"]').first(); await box.fill(code); await box.dispatchEvent('change'); await page.waitForTimeout(300);
    const stored = await page.evaluate(id => App.season.handbooks[id], kid);
    assert(stored && stored.toUpperCase().indexOf(code.toUpperCase()) === 0, 'stored: ' + stored);
    const stillBooks = await page.evaluate(id => Todo.compute({ master: App.master, season: App.season, calendar: App.calendar, quarter: App.quarterOf(App.today()), today: App.today(), newIds: new Set() }).groups.some(g => g.id === 'books' && g.items.some(i => i.id === id)), kid);
    assert.strictEqual(stillBooks, false, 'the "Unrecognized book" row is gone');
  });

  // A medical note, for a child who was just imported: tick read, and it stops showing.
  const med = await page.evaluate(() => { const p = App.master.people.find(x => Model.isActive(x) && Model.medicalText(x)); if (!p) return null; App.lastImport = { newIds: new Set([p[Model.X.ID]]), findings: [], counts: {}, name: 'test', asOf: null }; return p[Model.X.ID]; });
  await page.evaluate(() => App.showTab('todo')); await page.waitForTimeout(300);
  await test('a medical note just imported has a "read" tick; ticking it removes the row and stores the text read', async () => {
    assert(med, 'the test club has a medical note');
    const tick = page.locator('input[data-med-read="' + med + '"]').first(); assert.strictEqual(await tick.count(), 1, 'tick present');
    await tick.evaluate(e => { e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); }); await page.waitForTimeout(300);
    assert.strictEqual(await page.locator('input[data-med-read="' + med + '"]').count(), 0, 'row gone');
    const stored = await page.evaluate(id => App.season.config.medRead && App.season.config.medRead[id], med);
    assert(stored && stored.length > 0, 'text stored');
  });
  await test('a read note comes back only when its text changes', async () => {
    const r = await page.evaluate(id => {
      const p = App.master.people.find(x => x[Model.X.ID] === id);
      const before = Todo.compute({ master: App.master, season: App.season, quarter: App.quarterOf(App.today()), today: App.today(), newIds: new Set() }).groups.some(g => g.id === 'medical' && g.items.some(i => i.id === id));
      App.season.config.medRead[id] = Model.medicalText(p) + ' (changed)';
      const after = Todo.compute({ master: App.master, season: App.season, quarter: App.quarterOf(App.today()), today: App.today(), newIds: new Set() }).groups.some(g => g.id === 'medical' && g.items.some(i => i.id === id));
      return { before, after };
    }, med);
    assert.strictEqual(r.before, false, 'read note not listed');
    assert.strictEqual(r.after, true, 'changed note listed again');
  });
  // Handbook code typed on the row.
  await test('"Needs a handbook": a book code typed on the row is saved and the row leaves To do', async () => {
    const id = await page.evaluate(() => {
      const s = App.season, M = Model, kids = App.master.people.filter(p => M.isActive(p) && M.isClubber(p) && M.groupOf(M.room(p)) === 'Sparks');
      // N33: a child with no progress and no book gets no warning, so this child has a non-Sparks handbook code (progress indicated)
      for (const p of kids) { const i = p[M.X.ID]; s.handbooks[i] = 'AS'; if (s.received) delete s.received[i]; const code = Season.childBook(s, i); if (!['HG', 'WR', 'SS'].includes(code)) { App.touch(); return i; } }
      return null;
    });
    await page.evaluate(() => { App.lastImport = null; App.showTab('todo'); }); await page.waitForTimeout(300);
    assert(id, 'a Sparks child with no book');
    const box = page.locator('input[data-book-fix="' + id + '"]'); assert.strictEqual(await box.count(), 1, 'box on the handbook row');
    await box.fill('HG'); await box.dispatchEvent('change'); await page.waitForTimeout(300);
    assert(/^HG/.test(await page.evaluate(i => App.season.handbooks[i] || '', id)), 'saved');
    assert.strictEqual(await page.locator('input[data-book-fix="' + id + '"]').count(), 0, 'row gone');
  });
  // Color: the best choice is selected and Set saves it.
  await test('"Needs a color team": the best choice is selected on the row, and Set saves the color shown', async () => {
    const r = await page.evaluate(() => {
      const M = Model, q = App.quarterOf(App.today()), p = App.master.people.find(x => M.isActive(x) && M.isClubber(x) && ['Sparks', 'T&T'].includes(M.groupOf(M.room(x))) && M.teamOf(x, q));
      if (!p) return null; const id = p[M.X.ID]; p['team:' + q] = ''; App.touch(); return { id, q };
    });
    assert(r, 'a child with a color to clear');
    await page.evaluate(() => App.showTab('todo')); await page.waitForTimeout(300);
    const row = page.locator('tr[data-id="' + r.id + '"]').filter({ has: page.locator('select[data-team-pick]') }).first();
    assert.strictEqual(await row.count(), 1, 'the row has a color list');
    const shown = await row.locator('select[data-team-pick] option:checked').textContent(); assert(/best choice/.test(shown), 'best choice selected: ' + shown);
    const color = await row.locator('select[data-team-pick]').inputValue();
    await row.locator('button[data-team-set]').click(); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(([i, q]) => Model.teamOf(App.master.people.find(x => x[Model.X.ID] === i), q), [r.id, r.q]), color, 'saved the color shown');
  });
  // Printing updated medical sheets.
  await test('a changed medical note adds "Print updated medical sheets"; Open sheet shows the class sheet and clears the item until the note changes again', async () => {
    const room = await page.evaluate(id => { const p = App.master.people.find(x => x[Model.X.ID] === id); App.lastImport = null; App.season.config.medRead = App.season.config.medRead || {}; App.season.config.medRead[id] = Model.medicalText(p) + ' (older)'; delete (App.season.config.medPrinted || {})[id]; App.touch(); App.showTab('todo'); return Model.room(p); }, med);
    await page.waitForTimeout(300);
    const btn = page.locator('button[data-med-print="' + room + '"]').first(); assert.strictEqual(await btn.count(), 1, 'a print button for ' + room);
    await btn.click(); await page.waitForTimeout(400);
    assert.strictEqual(await page.inputValue('#rSel'), 'binderClass', 'the class medical sheet is open');
    const printed = await page.evaluate(id => (App.season.config.medPrinted || {})[id], med); assert(printed && printed.length, 'marked printed');
    const again = await page.evaluate(id => Todo.compute({ master: App.master, season: App.season, quarter: App.quarterOf(App.today()), today: App.today(), newIds: new Set() }).groups.some(g => g.id === 'medprint' && g.items.some(i => i.id === id)), med);
    assert.strictEqual(again, false, 'item cleared');
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
