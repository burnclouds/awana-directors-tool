// Small UX fixes (UX-16, UX-21, UX-27, UX-30) in a real browser. Invented test club only; the clock is fixed on Monday 2026-11-16 so "last" and "next" are the same every day.
// Usage: NODE_PATH=<dir with playwright> node test/ux-small-fixes-browser.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const lum = rgb => { const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

(async () => {
  const browser = await chromium.launch(), url = 'file://' + path.join(app, 'index.html');
  const open = async (w, h, extra) => { const ctx = await browser.newContext(Object.assign({ viewport: { width: w, height: h || 900 } }, extra || {})), p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
    await p.clock.setFixedTime(new Date('2026-11-16T12:00:00')); await p.goto(url); await p.setInputFiles('#splashFiles', [DATA]); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); return { p, ctx, errs }; };
  const tab = (p, t) => p.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t);

  for (const w of [1280, 390]) {
    await test('UX-21 (' + w + '): the two hidden file inputs are not tab stops; the first Tab lands on Skip to content, and Enter moves focus to the page content', async () => {
      const { p, ctx } = await open(w);
      assert.strictEqual(await p.evaluate(() => ['fileMerge', 'fileAny'].map(i => document.getElementById(i).tabIndex).join()), '-1,-1');
      await p.evaluate(() => { document.activeElement && document.activeElement.blur(); const s = getSelection(), r = document.createRange(); s.removeAllRanges(); r.setStart(document.body, 0); r.collapse(true); s.addRange(r); }); await p.keyboard.press('Tab'); if (await p.evaluate(() => document.activeElement === document.body)) await p.keyboard.press('Tab');      /* a fresh page: the first press can land on the document itself, the next is the first real stop */
      assert.strictEqual(await p.evaluate(() => document.activeElement.id), 'skipLink', 'the first Tab stop is the skip link');
      assert(await p.evaluate(() => { const r = document.getElementById('skipLink').getBoundingClientRect(); return r.top >= 0 && r.width > 40; }), 'it is visible while focused');
      await p.keyboard.press('Enter'); await p.waitForTimeout(100); assert.strictEqual(await p.evaluate(() => document.activeElement.id), 'main', 'focus moved to <main>');
      const stops = []; for (let i = 0; i < 40; i++) { await p.keyboard.press('Tab'); stops.push(await p.evaluate(() => document.activeElement.id)); }
      assert(!stops.includes('fileMerge') && !stops.includes('fileAny'), 'the hidden inputs take no focus');
      await ctx.close();
    });
  }
  await test('UX-27a: the Awards heading has a space ("Announce on 11/18")', async () => {
    const { p, ctx } = await open(1280); await tab(p, 'awards'); await p.waitForTimeout(400);
    const t = await p.evaluate(() => document.getElementById('awSecAnnounce') ? document.getElementById('awSecAnnounce').querySelector('h3').textContent : ''); assert(/^Announce on \d+\/\d+ \(/.test(t), JSON.stringify(t)); await ctx.close();
  });
  await test('UX-27b: History never prints the raw mark key "g"', async () => {
    const { p, ctx } = await open(1280);
    const txt = await p.evaluate(() => { const s = App.season, id = Object.keys(s.roster.people)[0], d = Object.keys(s.attendance)[0]; const b = Season.snapshot(s); Season.setMark(s, d, 'zz_Test_Id', 'a', 1, 'Sparks'); Season.setMark(s, d, id, 'h', 1, 'Sparks'); return Season.diff(b, s).map(c => Season.describe(c, () => 'Kid')).join(' | '); });
    assert(!/\bg:/.test(txt) && !/, g\b/.test(txt), txt); await ctx.close();
  });
  await test('UX-27c: the same child on two Person sub-tabs is ONE place in Recent places', async () => {
    const { p, ctx } = await open(1280); const id = await p.evaluate(() => App.master.people.find(x => Model.isClubber(x) && Model.isActive(x))[Model.X.ID]);
    await p.evaluate(i => App.showPerson(i, { sub: 'progress' }), id); await p.waitForTimeout(250); await p.evaluate(i => App.showPerson(i, { sub: 'attendance' }), id); await p.waitForTimeout(250); await p.evaluate(i => App.showPerson(i, { sub: 'registration' }), id); await p.waitForTimeout(250);
    await tab(p, 'roster'); await p.waitForTimeout(200); await p.evaluate(i => App.showPerson(i, { sub: 'progress' }), id); await p.waitForTimeout(250);
    const same = await p.evaluate(i => App.trail.places().filter(x => x.key && x.key.indexOf(i) >= 0).length, id); assert(same <= 1, 'the child is listed ' + same + ' times'); await ctx.close();
  });
  await test('UX-27d: the phone menu badge says what it adds up (To do and awards)', async () => {
    const { p, ctx } = await open(390, 844); await p.waitForTimeout(500);
    const r = await p.evaluate(() => { const b = document.getElementById('tabMenuBadge'); return { n: b.textContent, title: b.title, label: b.getAttribute('aria-label') }; });
    if (r.n) assert(/\d+ to do, \d+ awards? to announce/.test(r.title) && r.title === r.label, JSON.stringify(r)); await ctx.close();
  });
  await test('UX-16: Attendance, Awards and Reports use the same night text, and Monday 11/16 shows "last" (11/11) and "next" (11/18)', async () => {
    const { p, ctx } = await open(1280);
    await tab(p, 'attend'); await p.waitForTimeout(300); const att = await p.$eval('#attDate', s => s.options[s.selectedIndex].textContent); assert(/^Wed 11\/11 \(Q\d\) · last/.test(att), att);
    await tab(p, 'awards'); await p.waitForTimeout(300); const aw = await p.$eval('#awDate', s => s.options[s.selectedIndex].textContent); assert(/^Wed 11\/18 \(Q\d\) · next/.test(aw), aw);
    await tab(p, 'reports'); await p.waitForTimeout(300); await p.evaluate(() => { const s = document.getElementById('rSel'), o = [...s.options].find(x => { const r = window.Reports && Reports.LIST.find(y => y.id === x.value); return r && (r.opts || []).includes('date'); }); if (o) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); } }); await p.waitForTimeout(300);
    const rep = await p.$$eval('#oDateSel option', o => o.map(x => ({ v: x.value, t: x.textContent }))); assert(rep.length > 0 && rep.every(x => /^\d{4}-\d{2}-\d{2}$/.test(x.v)), 'values stay ISO dates');
    const r11 = rep.find(x => x.v === '2026-11-11'); assert(r11 && /^Wed 11\/11 \(Q\d\)/.test(r11.t) && / · last/.test(r11.t), JSON.stringify(r11)); await ctx.close();
  });
  await test('UX-30 (390): a Roster checkbox has a 44px footprint (a 32px box with 6px around it)', async () => {
    const { p, ctx } = await open(390, 844, { hasTouch: true, isMobile: true }); await tab(p, 'roster'); await p.waitForTimeout(500);
    const r = await p.evaluate(() => { const e = [...document.querySelectorAll('main td > input[type=checkbox]')].find(x => x.offsetParent); if (!e) return null; const b = e.getBoundingClientRect(), cs = getComputedStyle(e); return { w: b.width, h: b.height, m: parseFloat(cs.marginLeft) + parseFloat(cs.marginRight) }; });
    assert(r, 'a roster checkbox'); assert(r.w >= 31.5 && r.h >= 31.5 && r.w + r.m >= 43.5, JSON.stringify(r)); await ctx.close();
  });
  await test('UX-30 (1280): the (i) icon is 24px; the Move button is full strength and 16px', async () => {
    const { p, ctx } = await open(1280); await tab(p, 'attend'); await p.waitForTimeout(300);
    const r = await p.evaluate(() => { const i = [...document.querySelectorAll('i.info')].find(x => x.offsetParent), m = document.querySelector('button.movebtn'); return { iw: i.getBoundingClientRect().width, mo: m ? getComputedStyle(m).opacity : '1', mf: m ? getComputedStyle(m).fontSize : '16px' }; });
    assert(Math.abs(r.iw - 24) < 1, 'info icon ' + r.iw); assert.strictEqual(r.mo, '1'); assert.strictEqual(r.mf, '16px'); await ctx.close();
  });
  for (const theme of ['light', 'dark']) {
    await test('UX-30 (' + theme + '): the muted "—" placeholder (.none) and placeholders have at least 4.5:1 contrast', async () => {
      const { p, ctx } = await open(1280, 900, { colorScheme: theme });
      const r = await p.evaluate(() => { const e = document.createElement('span'); e.className = 'none'; document.body.appendChild(e); const c = getComputedStyle(e).color, bg = getComputedStyle(document.body).backgroundColor, off = getComputedStyle(document.documentElement).getPropertyValue('--offtxt').trim(); e.remove(); return { c, bg, off }; });
      assert(ratio(r.c, r.bg) >= 4.5, theme + ' .none ' + r.c + ' on ' + r.bg + ' = ' + ratio(r.c, r.bg).toFixed(2)); await ctx.close();
    });
  }
  await browser.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
