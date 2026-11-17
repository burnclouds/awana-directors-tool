// Visits every tab (and every report) on a phone-sized screen, light and dark, and lists anything that makes the page scroll sideways.
// Usage: NODE_PATH=<dir with playwright> node test/mobile-audit.js [outDir]    (screenshots go to outDir if given; uses ../../test-data)
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), outDir = process.argv[2];
const DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f))), EXPORT = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.csv$/.test(f)).sort()[0]);
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f)); });
// elements wider than the screen that are not inside something that scrolls on its own
const OVERFLOW = () => {
  const W = document.documentElement.clientWidth, bad = [];
  const scrolls = el => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  document.querySelectorAll('main *, .top *, .tabs, #testBanner, #splash *').forEach(el => {
    if (el.closest('[hidden]') || el.offsetParent === null) return; const r = el.getBoundingClientRect();
    if (r.width && r.right > W + 1 && !scrolls(el)) bad.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '')) + ' right=' + Math.round(r.right));
  });
  return { page: document.documentElement.scrollWidth - W, bad: [...new Set(bad)].slice(0, 6) };
};
(async () => {
  await new Promise(r => server.listen(0, r)); const url = 'http://localhost:' + server.address().port + '/index.html', browser = await chromium.launch();
  if (outDir) fs.mkdirSync(outDir, { recursive: true });
  let problems = 0;
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: scheme, hasTouch: true, isMobile: true }), p = await ctx.newPage(), errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.dismiss());
    await p.goto(url);
    const shot = async name => { if (outDir) await p.screenshot({ path: path.join(outDir, scheme + '-' + name + '.png'), fullPage: false }); };
    await shot('splash'); const sp = await p.evaluate(OVERFLOW); if (sp.page > 0 || sp.bad.length) { problems++; console.log(scheme, 'splash', JSON.stringify(sp)); }
    await p.setInputFiles('#fileAny', [DATA, EXPORT]); await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); await p.waitForTimeout(300);
    const tabs = await p.$$eval('.tabs button[data-tab]', bs => bs.map(b => b.dataset.tab));      // the More button has no tab of its own
    for (const t of tabs) {
      await p.evaluate(t => document.querySelector('.tabs button[data-tab="' + t + '"]').click(), t); await p.waitForTimeout(250);
      if (t === 'person') { await p.evaluate(() => { const s = document.querySelector('#tab-person select'); if (s && s.options.length > 1) { s.selectedIndex = 1; s.dispatchEvent(new Event('change', { bubbles: true })); } }); await p.waitForTimeout(200); }
      if (t === 'reports') {
        const opts = await p.$$eval('#rSel option', os => os.map(o => o.value).filter(Boolean)), sel = await p.$('#rSel');
        for (const v of opts) { await sel.selectOption(v); await p.waitForTimeout(150); const o = await p.evaluate(OVERFLOW); if (outDir) await p.locator('#report').screenshot({ path: path.join(outDir, scheme + '-reports-' + v + '.png') }).catch(() => {}); if (o.page > 0 || o.bad.length) { problems++; console.log(scheme, 'report', v, JSON.stringify(o)); } }
        continue;
      }
      await shot(t); const o = await p.evaluate(OVERFLOW);
      if (o.page > 0 || o.bad.length) { problems++; console.log(scheme, t, JSON.stringify(o)); }
    }
    if (errs.length) { problems++; console.log(scheme, 'errors', errs); }
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(problems ? problems + ' screens need work' : 'every screen fits a phone, light and dark'); process.exit(problems ? 1 : 0);
})();
