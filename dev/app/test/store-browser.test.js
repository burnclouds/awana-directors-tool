// The Awana store points tab in a real browser: it draws, a changed weight updates the page, is saved in the data, and Undo takes it back.
// Usage: NODE_PATH=<dir with playwright> node test/store-browser.test.js        (uses ../../test-data)
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  const browser = await chromium.launch(), ctx = await browser.newContext({ acceptDownloads: true }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.dismiss());
  await p.goto('file://' + path.join(app, 'index.html'));
  await p.setInputFiles('#fileAny', [DATA]); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const open = () => p.evaluate(() => document.querySelector('.tabs button[data-tab="store"]').click());
  const txt = () => p.textContent('#storeWrap'), w = () => p.evaluate(() => App.season.config.store && App.season.config.store.weights.attendance);
  await test('the tab shows the settings, where the points come from, the spread, programs and every child', async () => {
    await open(); const t = await txt();
    ['Minimum points per child', 'Where the points come from', 'How the points are spread', 'By program', 'Every child', 'projected to the end of the year'].forEach(s => assert(t.includes(s), 'missing: ' + s));
    assert(/\d+ of \d+ club nights are in/.test(t)); assert.strictEqual(await p.$$eval('#storeWrap h3', h => h.length) >= 5, true);
  });
  await test('changing a weight updates the numbers, is stored in the data, marks the file changed, and Undo restores it', async () => {
    const before = await p.textContent('#storeWrap .stgrid');
    await p.fill('input[data-w="attendance"]', '4'); await p.dispatchEvent('input[data-w="attendance"]', 'change');
    assert.strictEqual(await w(), 4); assert.notStrictEqual(await p.textContent('#storeWrap .stgrid'), before);
    assert(await p.evaluate(() => App.dirty()), 'the data file should now count as changed');
    await p.click('#btnUndo'); await p.waitForTimeout(150); assert.notStrictEqual(await w(), 4);
  });
  await test('flag 15: the "Most points first" order says which points it sorts by, and follows the Show choice', async () => {
    await open(); const label = () => p.evaluate(() => document.querySelector('#stSort option[value="points"]').textContent);
    assert(/projected/i.test(await label()), 'by default it sorts by projected points and must say so: ' + await label());
    await p.check('input[name="stView"][value="now"]'); await p.waitForTimeout(150);
    assert(/now/i.test(await label()) && !/projected/i.test(await label()), 'after choosing "now": ' + await label());
    const order = await p.evaluate(() => [...document.querySelectorAll('#storeWrap h3')].find(h => /Every child/.test(h.textContent)).nextElementSibling.nextElementSibling);
    const nowCol = await p.evaluate(() => { const t = [...document.querySelectorAll('#storeWrap table')].pop(), th = [...t.querySelectorAll('thead th')], i = th.findIndex(x => /Points now/.test(x.textContent)); const v = [...t.querySelectorAll('tbody tr')].map(r => parseFloat(r.children[i].textContent)); return v.every((x, j) => j === 0 || v[j - 1] >= x); });
    assert(nowCol, 'with "now" chosen the list is in order of Points now');
    await p.check('input[name="stView"][value="projected"]'); await p.waitForTimeout(100);
  });
  await test('an invalid weight is refused and the box goes back to the old value', async () => {
    await open(); await p.fill('input[data-w="extra"]', 'abc'); await p.dispatchEvent('input[data-w="extra"]', 'change');
    assert.strictEqual(await p.inputValue('input[data-w="extra"]'), '1');
  });
  await test('"scale weights" puts the best projected child on the maximum; the method list changes the numbers', async () => {
    await p.click('#stFit'); await p.waitForTimeout(150);
    const top = await p.evaluate(() => Math.max(...Store.compute({ master: App.master, season: App.season, calendar: App.calendar }).kids.map(k => k.projected)));
    assert.strictEqual(top, 200);
    await p.selectOption('select[data-k="method"]', 'range'); await p.waitForTimeout(100);
    assert.strictEqual(await p.evaluate(() => App.season.config.store.method), 'range');
  });
  await test('the TEST banner applies: the CSV needs two presses and is named with TEST', async () => {
    const dl = p.waitForEvent('download', { timeout: 8000 }); await p.click('#stCsv'); await p.click('#stCsv'); const d = await dl;
    assert(/Awana store points .*TEST.*\.csv$/.test(d.suggestedFilename()), d.suggestedFilename());
    const text = fs.readFileSync(await d.path(), 'utf8').replace(/^\uFEFF/, ''); assert(/^Name,Class,Program/.test(text), text.slice(0, 60)); assert(text.trim().split(/\r?\n/).length === 85, 'rows: ' + text.trim().split(/\r?\n/).length);
  });
  await test('Cubbies and Puggles are left out until ticked; ticking Cubbies adds them and is saved in the data', async () => {
    await open(); assert.strictEqual(await p.isChecked('input[data-p="Cubbies"]'), false); assert.strictEqual(await p.isChecked('input[data-p="Sparks"]'), true);
    const n = async () => +(await p.textContent('#storeWrap .stgrid .stat b'));
    const before = await n(); await p.check('input[data-p="Cubbies"]'); await p.waitForTimeout(150);
    assert(await n() > before); assert.deepStrictEqual(await p.evaluate(() => App.season.config.store.programs), ['Cubbies', 'Sparks', 'T&T']);
    assert((await p.$$eval('#stGroup option', o => o.map(x => x.textContent))).includes('Cubbies'));
    await p.uncheck('input[data-p="Cubbies"]'); await p.waitForTimeout(150); assert.strictEqual(await n(), before);
  });
  await test('no script errors', async () => assert.deepStrictEqual(errs, []));
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
