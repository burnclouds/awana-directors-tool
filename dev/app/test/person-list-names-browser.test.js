// The Person list shows names only: no class in front (the Class and Group pickers filter the list). Two people with the same name in the list are told apart by the class in brackets. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/person-list-names-browser.test.js
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
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage(), errs = [];
    page.on('dialog', d => d.accept()); page.on('pageerror', e => errs.push(e.message));
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="person"]').click()); await page.waitForTimeout(400);
    return { page, errs };
  };
  const options = page => page.$$eval('#pePerson option', o => o.map(x => ({ v: x.value, t: x.textContent })));

  await test('with every class showing, the list has names only: no class, no dash', async () => {
    const { page } = await open(), o = await options(page); assert(o.length > 20, 'a full list');
    assert(o.every(x => !/ — /.test(x.t)), 'a dash in: ' + o.filter(x => / — /.test(x.t)).slice(0, 2).map(x => x.t));
    const names = await page.evaluate(ids => ids.map(i => Model.fullName(App.master.people.find(p => p[Model.X.ID] === i))), o.map(x => x.v));
    o.forEach((x, i) => assert(x.t.replace(/ \(.*\)$/, '') === names[i] || x.t === names[i], x.t + ' vs ' + names[i])); await page.close();
  });
  await test('the Class picker still narrows the list, and the names are the same with or without it', async () => {
    const { page } = await open(), all = await options(page); await page.selectOption('#peClass', { index: 2 }); await page.waitForTimeout(300); const some = await options(page);
    assert(some.length > 0 && some.length < all.length, some.length + ' of ' + all.length); assert(some.every(x => !/ — /.test(x.t)));
    const byId = new Map(all.map(x => [x.v, x.t])); some.forEach(x => assert.strictEqual(x.t, byId.get(x.v), 'the same text as in the full list')); await page.close();
  });
  await test('two people with the same name are told apart by the class in brackets; everyone else is just the name', async () => {
    const { page } = await open();
    const twin = await page.evaluate(() => { const p = App.master.people.find(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === 'Sparks'), copy = Model.addManualPerson(App.master, { [Model.C.FIRST]: p[Model.C.FIRST], [Model.C.LAST]: p[Model.C.LAST], [Model.C.ROOM]: 'Cubbies', [Model.C.SELECTION]: 'Cubbies' }, App.today()); App.touch(); App.refresh(); return { name: Model.fullName(p), room: Model.room(p), id: copy[Model.X.ID] }; });
    await page.evaluate(() => document.querySelector('.tabs button[data-tab="roster"]').click()); await page.evaluate(() => document.querySelector('.tabs button[data-tab="person"]').click()); await page.waitForTimeout(400);
    const o = await options(page), hits = o.filter(x => x.t.startsWith(twin.name)); assert.strictEqual(hits.length, 2, hits.map(h => h.t).join(' | '));
    assert(hits.every(h => /\(.+\)/.test(h.t)), 'both carry a class: ' + hits.map(h => h.t).join(' | ')); assert(hits.some(h => h.t.includes('Cubbies')) && hits.some(h => h.t.includes(twin.room)));
    const rest = o.filter(x => !x.t.startsWith(twin.name)), names = await page.evaluate(ids => ids.map(i => Model.fullName(App.master.people.find(p => p[Model.X.ID] === i))), rest.map(x => x.v));
    rest.forEach((x, i) => assert(x.t === names[i] || x.t === names[i] + ' (inactive)', 'only their name (some names have brackets of their own): ' + x.t)); await page.close();
  });
  await test('no script errors', async () => { const { page, errs } = await open(); await page.close(); assert.deepStrictEqual(errs, []); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
