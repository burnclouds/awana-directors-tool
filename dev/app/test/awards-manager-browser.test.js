// The Awards tab as a manager: four lists (To announce, To hand out, End-of-year ceremony, Announced), one filter and sort bar, the night to announce on defaulting to the next club night, end-of-year awards kept off the weekly hand-out list. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/awards-manager-browser.test.js
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
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  const tab = t => page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t);
  await tab('awards'); await page.waitForTimeout(300);
  const setup = await page.evaluate(() => { const A = App, M = Model, S = Season, g = x => A.master.people.filter(p => M.isActive(p) && M.isClubber(p) && M.groupOf(M.room(p)) === x).map(p => p.x_ClubberID);
    const sp = g('Sparks'), tt = g('T&T'); A.season.awards = {}; A.season.given = {}; A.season.givenNoDate = {}; A.season.progress = {};
    S.addAward(A.season, '2026-10-21', sp[0], 'HG Red Jewel 1'); S.addAward(A.season, '2026-10-21', sp[0], 'Sparky Award Sculpture'); S.addAward(A.season, '2026-10-28', tt[0], 'Alpha Award Medallion');
    ['1', '2', '3', '4'].forEach(i => S.setProgress(A.season, sp[1], 'HG', 'GJ1.' + i, '2026-10-30')); ['1.1', '1.2', '1.3'].forEach(i => S.setProgress(A.season, tt[1], 'AoG', 'BE1.' + i, '2026-10-30'));
    A.touch(); return { sp, tt }; });
  await tab('awards'); await page.waitForTimeout(500);
  const sub = async id => { const w = /Hand|Ceremony/.test(id) ? 'hand' : 'announce'; await page.click('#awSubs button[data-awsub="' + w + '"]'); await page.waitForTimeout(150); };
  const h = async id => { await sub(id); return page.evaluate(i => { const e = document.querySelector('#' + i + ' h3'); return e ? e.textContent.trim() : ''; }, id); };
  const T = async id => { await sub(id); return page.textContent('#' + id); };
  await test('the tab is three lists, with one filter and sort bar: group (all by default), class, sort, and the night to announce on', async () => {
    assert(/Announce on/.test(await h('awSecAnnounce')) && /To hand out/.test(await h('awSecHand')) && /End-of-year awards/.test(await h('awSecCeremony')), 'Announce: to tell; Hand out: to hand out + end-of-year'); assert.strictEqual(await page.locator('#awSubs button').count(), 2);
    assert.strictEqual(await page.inputValue('#awGroup'), 'All'); assert.deepStrictEqual(await page.$$eval('#awSort option', o => o.map(x => x.value)), ['class', 'award', 'earned']); assert(/Announce on/.test(await page.textContent('#awDateWrap')));
  });
  await test('the night to announce on defaults to the next club night on or after today (and can be changed)', async () => {
    const r = await page.evaluate(() => { const t = App.today(), nights = [...document.querySelectorAll('#awDate option')].map(o => o.value), next = nights.find(d => d >= t) || nights[nights.length - 1]; return { chosen: document.querySelector('#awDate').value, next }; }); assert.strictEqual(r.chosen, r.next);
  });
  await test('To tell the group lists what is earned and not yet told (all groups)', async () => {
    const t = await T('awSecAnnounce'); assert(/Green Jewel 1/.test(t) && /Blue Emblem 1/.test(t), t.slice(0, 300)); await sub('awSecAnnounce'); assert((await page.locator('#awSecAnnounce tbody tr[data-award]').count()) >= 2, 'the two earned from Progress (and any Blue Jewels from attendance)');
  });
  await test('To hand out lists everything earned and not given, told to the group or not; the end-of-year awards are kept off it and shown under End-of-year awards, with the count to have ready', async () => {
    const hand = await T('awSecHand'), cer = await T('awSecCeremony');
    assert(/Red Jewel 1/.test(hand) && /Green Jewel 1/.test(hand) && /Blue Emblem 1/.test(hand) && !/Sparky|Alpha/.test(hand), 'earned, announced or not: ' + hand.slice(0, 400)); assert(/Sparky Award Sculpture/.test(cer) && /Alpha Award Medallion/.test(cer), cer.slice(0, 300)); assert(/1 &times; Sparky|1 × Sparky/.test(cer) || /To have ready/.test(cer));
  });
  await test('the group and class filter narrows every list; Sort changes the order', async () => {
    await page.selectOption('#awGroup', 'T&T'); await page.waitForTimeout(300); const cer = await T('awSecCeremony'), ann = await T('awSecAnnounce');
    assert(/Alpha/.test(cer) && !/Sparky/.test(cer), 'ceremony is T&T only'); assert(/Blue Emblem 1/.test(ann) && !/Green Jewel 1/.test(ann), 'To announce is T&T only');
    await page.selectOption('#awGroup', 'All'); await page.selectOption('#awSort', 'award'); await page.waitForTimeout(300);
    await sub('awSecAnnounce'); const order = await page.$$eval('#awSecAnnounce tbody tr td:nth-child(3)', c => c.map(x => x.textContent.trim())); assert.deepStrictEqual(order, order.slice().sort((a, b) => a.localeCompare(b)), 'sorted by award: ' + order); await page.selectOption('#awSort', 'class');
  });
  await test('the Type filter lists each award type with its count (book code and number dropped) and narrows every list', async () => {
    const opts = await page.$$eval('#awType option', o => o.map(x => x.textContent)); assert(/^All types \(\d+\)$/.test(opts[0]), opts[0]); assert(opts.some(x => /^Blue Emblem \(\d+\)$/.test(x)) && opts.some(x => /^Green Jewel \(\d+\)$/.test(x)), opts.join('|'));
    const n = +/\((\d+)\)/.exec(opts.find(x => /^Blue Emblem/.test(x)))[1];
    await page.selectOption('#awType', 'Blue Emblem'); await page.waitForTimeout(300);
    const hand = await T('awSecHand'), ann = await T('awSecAnnounce'); assert(/Blue Emblem/.test(hand) && !/Green Jewel|Red Jewel/.test(hand + ann), 'only Blue Emblem'); assert(n >= 1);
    await page.selectOption('#awType', ''); await page.waitForTimeout(200);
  });
  await test('no Given tick anywhere on the Awards tab: Given is ticked on Progress; and no history, move or hand-add controls', async () => {
    for (const w of ['announce', 'hand']) { await page.click('#awSubs button[data-awsub="' + w + '"]'); await page.waitForTimeout(150);
      assert.strictEqual(await page.locator('#awardsWrap input[data-given2], #awardsWrap input[data-given-nd]').count(), 0, w + ' page has no Given ticks');
      for (const gone of ['#awSecAnnounced', '#btnAwFix', '#awFixPanel', '#awHandKid', '#btnAwHand', '#btnAwSlide']) assert.strictEqual(await page.locator(gone).count(), 0, gone + ' should be gone'); }
  });
  await test('Hold keeps an award off the slide list and out of Mark all announced; releasing it puts it back; the badge ignores held awards', async () => {
    await sub('awSecAnnounce'); const before = await page.locator('#awSecAnnounce tbody tr[data-award]').count(), badge = async () => +(await page.textContent('#awSubs button[data-awsub="announce"] .badge') || 0);
    const b0 = await badge(); const row = page.locator('#awSecAnnounce tbody tr', { hasText: 'Blue Emblem 1' }); await row.locator('input[data-hold]').check(); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(i => Object.keys(App.season.held[i] || {}).length, setup.tt[1]), 1, 'the hold is saved in the season');
    assert.strictEqual(await page.locator('#awSecAnnounce tbody tr.held').count(), 1, 'the held row is dimmed and still listed'); assert.strictEqual(await page.locator('#awSecAnnounce tbody tr[data-award]').count(), before);
    assert.strictEqual(await badge(), b0 - 1, 'held awards are not counted'); assert(!/Blue Emblem 1/.test(await page.evaluate(() => Slides.buildSlides(App.season, App.master, document.querySelector('#awDate').value, { calendar: App.calendar }).slides.map(s => JSON.stringify(s.entries)).join())), 'held: not on the slides');
    await page.locator('#awSecAnnounce tbody tr.held input[data-hold]').click(); await page.waitForTimeout(300);      // click, not uncheck(): the row is redrawn by the click
    assert.strictEqual(await page.locator('#awSecAnnounce tbody tr.held').count(), 0, 'released'); assert.strictEqual(await badge(), b0, 'released awards are counted again'); assert(/Blue Emblem 1/.test(await page.evaluate(() => Slides.buildSlides(App.season, App.master, document.querySelector('#awDate').value, { calendar: App.calendar }).slides.map(s => JSON.stringify(s.entries)).join())), 'released: on the slides again');
  });
  await test('Mark all announced stamps only the unheld awards on the chosen night; the held one stays; announced awards leave the slides but stay on To hand out until Given', async () => {
    await sub('awSecAnnounce'); await page.locator('#awSecAnnounce tbody tr', { hasText: 'Blue Emblem 1' }).locator('input[data-hold]').check(); await page.waitForTimeout(300);
    await page.click('#btnAnnounce'); await page.waitForTimeout(400);
    assert.strictEqual(await page.locator('#awSecAnnounce tbody tr[data-award]').count(), 1, 'only the held one is left'); assert(/Blue Emblem 1/.test(await T('awSecAnnounce')) && !/Green Jewel 1/.test(await T('awSecAnnounce')), 'the others were announced');
    assert(/Green Jewel 1/.test(await T('awSecHand')) && /Blue Emblem 1/.test(await T('awSecHand')), 'announced or held, both still wait to be given');
    const night = await page.inputValue('#awDate'); assert(await page.evaluate(n => Object.keys(App.season.awards[n] || {}).length > 0, night), 'stamped on the chosen night');
    assert(!/Green Jewel 1/.test(await page.evaluate(() => Slides.buildSlides(App.season, App.master, document.querySelector('#awDate').value, { calendar: App.calendar }).slides.map(s => JSON.stringify(s.entries)).join())), 'announced: off the slides for good');
  });
  await test('the award lists are fixed: no "Award lists" button on the Awards tab or on Options', async () => {
    assert((await page.locator('#btnAwLists').count()) === 0, 'no button on the Awards tab'); assert(!/Award lists/.test(await page.textContent('#tab-awards')), 'no mention on the Awards tab');
  });
  await test('the ceremony report lists each end-of-year award with its children and a box to tick', async () => {
    await page.click('#btnAwCeremony').catch(() => {}); await page.waitForTimeout(500); if (!(await page.isVisible('#tab-reports'))) await tab('reports');
    await page.selectOption('#rSel', 'ceremony'); await page.selectOption('#oGroupSel', 'Sparks'); await page.waitForTimeout(400); const t = await page.textContent('#report'); assert(/End-of-year awards/.test(t) && /Sparky Award Sculpture/.test(t) && /to have ready/.test(t), t.slice(0, 300));
  });
  await test('no script errors', () => assert.deepStrictEqual(errs, []));
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
