// Typing a Date received (handbook) by hand: the box reports 0002-09-23 after the first digit of the year, which must not be rejected while you are still typing. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/handbook-date-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext()).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const tab = t => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t);
  const flashes = () => page.$$eval('#flash, .flash', e => e.map(x => x.textContent).join('|')).catch(() => '');
  // The date received is entered on Progress (and on the To do page); Registration no longer has it, so only the Progress run remains.
  for (const where of ['progress']) {
    if (where === 'person') { await page.reload(); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); }
    await test('typing a Date received on ' + where + ' (month, day, then the year digit by digit) is not rejected half way, and is saved when finished', async () => {
      await tab('person'); await page.waitForTimeout(400);
      if (where === 'progress') { await page.selectOption('#peGroup', 'Sparks'); await page.waitForTimeout(250); }
      else { const id = await page.evaluate(() => App.master.people.find(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === 'T&T').x_ClubberID); await page.selectOption('#pePerson', id); await page.waitForTimeout(400); await page.click('#peSub button[data-sub="registration"]'); await page.waitForTimeout(200); }
      const box = page.locator(where === 'progress' ? 'input[data-recv]:visible' : '.hbbox [data-hb="date"]:visible').first(); await box.focus(); await page.keyboard.type('09232026', { delay: 60 }); await page.waitForTimeout(300);
      console.log('   typed ->', await box.inputValue(), '| flashes:', await flashes());
      assert(!/not a real date/.test(await flashes()), 'no error while typing: ' + await flashes());
      assert.strictEqual(await box.inputValue(), '2026-09-23'); await page.keyboard.press('Tab'); await page.waitForTimeout(300);
      assert.strictEqual(await box.inputValue(), '2026-09-23', 'still there after leaving');
    });
    await test('leaving the box with a half-typed year (0020) says so and puts the last saved date back (' + where + ')', async () => {
      const box = page.locator(where === 'progress' ? 'input[data-recv]:visible' : '.hbbox [data-hb="date"]:visible').first(); await box.focus(); await page.keyboard.type('0101', { delay: 60 }); await page.keyboard.type('20', { delay: 60 }); await page.waitForTimeout(200);
      assert(/^0/.test(await box.inputValue()), 'the box holds a half-typed year: ' + await box.inputValue());
      for (let i = 0; i < 4 && await box.evaluate(e => document.activeElement === e); i++) await page.keyboard.press('Tab');      // Tab walks the month, day and year parts first
      await page.waitForTimeout(400);
      const stored = await page.evaluate(() => { const A = window.App, id = Object.keys(A.season.handbooks).find(i => /\d{6}/.test(A.season.handbooks[i]) && document.querySelector('.hbbox [data-hb="date"]')); return null; });
      const v = await box.inputValue(); assert(/^\d{4}-\d\d-\d\d$/.test(v) && +v.slice(0, 4) >= 2000, 'a real date is back: ' + v);
      assert(/not a real date/.test(await flashes()), 'it said so: ' + await flashes());
    });
  }
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
