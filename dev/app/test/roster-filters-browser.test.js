// UX-17: the Roster's Class, Role and Active filters are the header row's dropdowns (like a spreadsheet filter row); the bar keeps Search and Quarter. A "Showing" line says what is filtered and how many; a phone gets one Filter line.
// Invented test club only. Usage: NODE_PATH=<dir with playwright> node test/roster-filters-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const open = async w => { const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }), page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.dismiss());
    await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); await page.evaluate(() => App.showTab('roster')); await page.waitForSelector('#rosterWrap tbody tr'); return { page, ctx, errs }; };
  const rows = page => page.$$eval('#rosterWrap tbody tr', r => r.length);
  await test('1280: the bar has Search and Quarter; Class, Role and Active are the header row dropdowns; the bar\'s three selects are not on screen', async () => {
    const { page, ctx, errs } = await open(1280); for (const id of ['fSearch', 'fQuarter']) assert(await page.isVisible('#' + id), id); for (const id of ['fRoom', 'fRole', 'fInactive', 'rosterFilterSum']) assert(!(await page.isVisible('#' + id)), id + ' hidden on a computer');
    for (const k of ['room', 'role', 'active']) assert(await page.isVisible('#rosterWrap select[data-cf="' + k + '"]'), k + ' filter in the header row'); assert(!(await page.isVisible('#rosterShowing')), 'no Showing line with nothing filtered'); assert.deepStrictEqual(errs, []); await ctx.close();
  });
  await test('1280: a header filter narrows the list, is highlighted, and the Showing line says what and how many; Clear puts it all back', async () => {
    const { page, ctx } = await open(1280); const all = await rows(page); await page.selectOption('#rosterWrap select[data-cf="room"]', { index: 1 }); await page.waitForTimeout(200);
    const room = await page.$eval('#rosterWrap select[data-cf="room"]', s => s.options[s.selectedIndex].text), n = await rows(page); assert(n > 0 && n < all, 'narrowed ' + n + ' of ' + all);
    assert(await page.$eval('#rosterWrap select[data-cf="room"]', s => s.classList.contains('cfset')), 'highlighted'); const t = await page.textContent('#rosterShowing'); assert(t.includes(room) && new RegExp('\\u2014 ' + n + ' of \\d+ people').test(t), t);
    await page.selectOption('#rosterWrap select[data-cf="role"]', 'kid'); await page.waitForTimeout(200); assert(/Clubbers only|Clubber/i.test(await page.textContent('#rosterShowing')), await page.textContent('#rosterShowing'));
    await page.fill('#fSearch', 'zzzz'); await page.waitForTimeout(200); assert(/matching/.test(await page.textContent('#rosterShowing')) && (await rows(page)) === 0);
    await page.click('#btnRosterClear'); await page.waitForTimeout(250); assert.strictEqual(await rows(page), all, 'Clear restores the list'); assert(!(await page.isVisible('#rosterShowing')), 'and the line goes'); await ctx.close();
  });
  await test('Active filter: Active / Inactive / Everyone from the header, and the status shows in the Showing line', async () => {
    const { page, ctx } = await open(1280); await page.evaluate(() => { Model.setActive(App.master.people.find(x => Model.isClubber(x)), false); App.commitScope(() => App.changed()); App.refresh(); }); await page.waitForTimeout(150);
    await page.selectOption('#rosterWrap select[data-cf="active"]', 'inactive'); await page.waitForTimeout(200); assert.strictEqual(await rows(page), 1); assert(/Inactive/.test(await page.textContent('#rosterShowing')));
    await page.selectOption('#rosterWrap select[data-cf="active"]', 'all'); await page.waitForTimeout(200); assert.strictEqual(await rows(page), await page.evaluate(() => App.master.people.length)); await ctx.close();
  });
  for (const w of [390, 430]) {
    await test('phone (' + w + '): one Filter line (44px) opens Class, Role and Status; the summary follows; no sideways scroll', async () => {
      const { page, ctx } = await open(w); assert(await page.isVisible('#rosterFilterSum'), 'the Filter line'); assert(!(await page.isVisible('#fRoom')), 'closed at first'); assert((await page.$eval('#rosterFilterSum', e => e.getBoundingClientRect().height)) >= 44, '44px');
      assert(/^Filter: everyone active$/.test(await page.textContent('#rosterFilterSum')), await page.textContent('#rosterFilterSum')); await page.click('#rosterFilterSum'); await page.waitForTimeout(100); assert(await page.isVisible('#fRoom') && await page.isVisible('#fRole') && await page.isVisible('#fInactive'));
      const all = await rows(page); await page.selectOption('#fRoom', { index: 1 }); await page.waitForTimeout(200); assert(await rows(page) < all, 'narrowed'); assert(/Filter: /.test(await page.textContent('#rosterFilterSum')) && !/everyone active/.test(await page.textContent('#rosterFilterSum')), await page.textContent('#rosterFilterSum'));
      assert(/Showing:/.test(await page.textContent('#rosterShowing'))); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll'); await ctx.close();
    });
  }
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
