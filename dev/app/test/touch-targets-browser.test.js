// Touch size on a phone (390px, touch): the sign-off date boxes, pickers and buttons on a child's Progress sheet are at least 44px tall.
// Born from review finding R4: two CSS rules pointed at a container (#tab-progress) that no longer exists, so the boxes were 25px.
// (test/mobile-audit.js is the wider look at every screen; it also flags the print-layout reports, which scroll sideways on a phone by design.)
// Usage: NODE_PATH=<dir with playwright> node test/touch-targets-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data');
const DATA = path.join(td, fs.readdirSync(td).filter(f => /TEST.*\.json$/.test(f)).sort().pop()), EXPORT = path.join(td, '20261028 -- demo-club-2026-27 TEST.csv');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!f.startsWith(app) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
(async () => {
  await new Promise(r => server.listen(0, r));
  const url = 'http://localhost:' + server.address().port + '/index.html', browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }), p = await ctx.newPage(); p.on('dialog', d => d.dismiss());
  await p.goto(url); await p.setInputFiles('#fileAny', [DATA, EXPORT]);
  await p.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('.tabs button[data-tab="person"]').click()); await p.waitForTimeout(250);
  const ids = await p.$$eval('#pePerson option', os => os.map(o => o.value));
  const measure = async limit => {
    let checked = 0, small = 0, sample = '', sheets = 0;
    for (const id of ids.slice(0, limit)) {
      await p.evaluate(i => App.showPerson(i), id); await p.waitForTimeout(100);
      const r = await p.evaluate(() => {
        const root = document.getElementById('progressWrap'); if (!root || root.hidden) return { n: 0, small: 0, sample: '', sheet: false };
        const els = [...root.querySelectorAll('input[type=date], select, .bar button, .todaybtn')].filter(e => e.offsetParent !== null);
        const bad = els.filter(e => e.getBoundingClientRect().height < 43.5), b = bad[0];
        return { n: els.length, small: bad.length, sheet: els.some(e => e.type === 'date'), sample: b ? b.tagName.toLowerCase() + (b.className ? '.' + String(b.className).split(' ')[0] : '') + ' ' + Math.round(b.getBoundingClientRect().height) + 'px' : '' };
      });
      checked += r.n; small += r.small; if (r.sheet) sheets++; if (r.small && !sample) sample = r.sample;
    }
    return { checked, small, sample, sheets };
  };
  await test('there are children with sign-off date boxes to measure (so the check cannot pass by measuring nothing)', async () => {
    const r = await measure(40); assert(r.sheets >= 5, 'only ' + r.sheets + ' Progress sheets with date boxes found'); assert(r.checked >= 100, 'only ' + r.checked + ' controls measured');
  });
  await test('every sign-off date box, picker and button on a child\'s Progress sheet is at least 44px tall on a phone', async () => {
    const r = await measure(40); assert.strictEqual(r.small, 0, r.small + ' of ' + r.checked + ' controls are under 44px (for example ' + r.sample + ')');
  });
  // ---- R12: the other phone targets: To do, name links, Uniforms, the Attendance Move button ----
  const openTab = async name => { await p.evaluate(n => document.querySelector('.tabs button[data-tab="' + n + '"]').click(), name); await p.waitForTimeout(250); };
  // Counts visible elements under rootSel matching sel, and how many are smaller than min ({ w?, h? }); sample names the first small one.
  const measureIn = (rootSel, sel, min, page) => (page || p).evaluate(([r, s, m]) => {
    const root = document.querySelector(r); if (!root) return { n: 0, small: 0, sample: 'no ' + r };
    const els = [...root.querySelectorAll(s)].filter(e => e.offsetParent !== null), small = els.filter(e => { const b = e.getBoundingClientRect(); return (m.w && b.width < m.w - 0.5) || (m.h && b.height < m.h - 0.5); }), b = small[0];
    return { n: els.length, small: small.length, sample: b ? b.tagName.toLowerCase() + (b.className ? '.' + String(b.className).split(' ')[0] : '') + ' ' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height) : '' };
  }, [rootSel, sel, min]);
  await test('To do: every text box, picker and button is at least 44px tall', async () => {
    await openTab('todo'); const r = await measureIn('#tab-todo', 'input[type=text], input[type=date], select, button', { h: 44 });
    assert(r.n >= 1, 'nothing on To do to measure'); assert.strictEqual(r.small, 0, r.small + ' of ' + r.n + ' under 44px (for example ' + r.sample + ')');
  });
  await test('To do and Uniforms: tick boxes sit in a tap area at least 44px tall', async () => {
    let n = 0, bad = '';
    for (const [tab, root] of [['todo', '#tab-todo'], ['uniforms', '#uniWrap']]) {
      await openTab(tab); const r = await p.evaluate(rs => { const out = []; document.querySelectorAll(rs + ' input[type=checkbox]').forEach(c => { if (c.offsetParent === null) return; const l = c.closest('label') || c; out.push(Math.round(l.getBoundingClientRect().height)); }); return out; }, root);
      n += r.length; r.filter(h => h < 43.5).forEach(h => { if (!bad) bad = tab + ' ' + h + 'px'; });
    }
    assert(n >= 1, 'no tick boxes found'); assert.strictEqual(bad, '', 'a tick box tap area is under 44px: ' + bad);
  });
  await test('To do: the Group by person / task radio labels are at least 44px tall', async () => {
    await openTab('todo'); const hs = await p.evaluate(() => [...document.querySelectorAll('#tab-todo input[name=tdView]')].map(r => Math.round((r.closest('label') || r).getBoundingClientRect().height)));
    assert.strictEqual(hs.length, 2, 'expected the two Group by radios'); assert(hs.every(h => h >= 43.5), 'a Group by radio tap area is under 44px: ' + hs.join(','));
  });
  await test('Color teams grid on a phone: a name takes two lines (first, then last indented) inside its column', async () => {
    await p.evaluate(() => App.showTab('teams')); await p.waitForSelector('#teamsWrap table.tg');
    const r = await p.evaluate(() => { const a = document.querySelector('#teamsWrap table.tg td > a[data-person]'), ln = a.querySelector('.tgln'), td = a.closest('td'); const ab = a.getBoundingClientRect(), rg = document.createRange(); rg.selectNodeContents(ln); const lb = rg.getBoundingClientRect(), tb = td.getBoundingClientRect();      /* the range is the last name's text itself, so the span's padding (the indent) shows */ return { stacked: lb.top > ab.top + 8, indented: lb.left > ab.left + 8, fits: ab.right <= tb.right + 0.5, text: a.textContent, wrap: document.getElementById('teamsWrap').getBoundingClientRect().left }; });
    assert(r.stacked, 'the last name is not on its own line'); assert(r.indented, 'the last name is not indented'); assert(r.fits, 'the name runs outside its column'); assert(/^\S+ \S/.test(r.text), 'the link text lost the space between first and last: ' + r.text);
  });
  await test('name links in lists are at least 44px tall', async () => {
    const need = { todo: ['#tab-todo', true], attend: ['#attendWrap', true], stats: ['#tab-stats', false], store: ['#tab-store', false] };
    for (const tab of Object.keys(need)) {
      await openTab(tab); const r = await measureIn(need[tab][0], 'td a[data-person], .todocard h3 a[data-person]', { h: 44 });
      if (need[tab][1]) assert(r.n >= 1, tab + ': no name links to measure'); assert.strictEqual(r.small, 0, tab + ': ' + r.small + ' of ' + r.n + ' name links under 44px (for example ' + r.sample + ')');
    }
  });
  await test('a name link inside a sentence keeps its line height', async () => {
    await openTab('games'); const r = await p.evaluate(() => [...document.querySelectorAll('#teamsWrap li a[data-person], #teamsWrap .bad a[data-person]')].filter(a => a.offsetParent !== null).map(a => a.getBoundingClientRect().height));
    if (!r.length) { console.log('       (no name links inside sentences on the TEST data: nothing to check)'); return; }
    assert(r.every(h => h < 30), 'a link in prose grew to ' + Math.max(...r) + 'px');
  });
  await test('Uniforms: date boxes, text boxes, Today buttons and the "no date" tick are at least 44px tall', async () => {
    await openTab('uniforms'); const r = await measureIn('#uniWrap', 'input[data-udate], input[type=text], .todaybtn, label.uov', { h: 44 });
    assert(r.n >= 1, 'nothing on Uniforms to measure'); assert.strictEqual(r.small, 0, r.small + ' of ' + r.n + ' under 44px (for example ' + r.sample + ')');
  });
  await test('Attendance: the Move button is at least 44 x 44', async () => {
    await openTab('attend'); const r = await measureIn('#attendWrap', 'table.att button.movebtn', { w: 44, h: 44 });
    assert(r.n >= 1, 'no Move buttons found'); assert.strictEqual(r.small, 0, r.small + ' of ' + r.n + ' under 44x44 (for example ' + r.sample + ')');
  });
  await test('tap areas in one Attendance row do not overlap', async () => {
    await openTab('attend');
    const bad = await p.evaluate(() => {
      const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5; let n = 0;
      for (const tr of [...document.querySelectorAll('#attendWrap table.att tbody tr')].slice(0, 10)) {
        const rs = [...tr.querySelectorAll('.movebtn, a[data-person], td.chk label')].filter(e => e.offsetParent !== null).map(e => e.getBoundingClientRect());
        for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (hit(rs[i], rs[j])) n++;
      } return n;
    });
    assert.strictEqual(bad, 0, bad + ' overlapping tap areas');
  });
  await test('no text box on To do or Uniforms makes iOS zoom (16px or larger)', async () => {
    for (const [tab, root] of [['todo', '#tab-todo'], ['uniforms', '#uniWrap']]) {
      await openTab(tab); const r = await p.evaluate(rs => [...document.querySelectorAll(rs + ' input[type=text], ' + rs + ' input[type=date], ' + rs + ' select')].filter(e => e.offsetParent !== null).map(e => parseFloat(getComputedStyle(e).fontSize)), root);
      assert(r.every(f => f >= 16), tab + ': a box has font size ' + Math.min(...r) + 'px');
    }
  });
  // Last of the phone checks: it sets a color by hand, which changes the data the checks above read.
  await test('Color teams grid: a color set by hand in an unlocked quarter is a dashed outline like a projection, and the text is readable in light and dark', async () => {
    await p.evaluate(() => App.showTab('teams')); await p.waitForSelector('#teamsWrap select.tgproj');
    const now = await p.$eval('#teamsWrap select.tgproj', s => s.value); await p.selectOption('#teamsWrap select.tgproj', now === 'Yellow' ? 'Red' : 'Yellow'); await p.waitForTimeout(300);      // a different color, so the change registers as a hand-set pin
    for (const scheme of ['light', 'dark']) {
      await p.emulateMedia({ colorScheme: scheme });
      const r = await p.evaluate(() => { const lum = c => { const m = c.match(/[\d.]+/g).map(Number), f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); }; const s = document.querySelector('#teamsWrap select.tgsel'), c = getComputedStyle(s); let bg = c.backgroundColor, el = s; while (/rgba\(.*, 0\)$/.test(bg) && el.parentElement) { el = el.parentElement; bg = getComputedStyle(el).backgroundColor; } const a = lum(c.color) + 0.05, b = lum(bg) + 0.05; return { dashed: c.borderTopStyle, proj: s.classList.contains('tgproj'), pin: !!s.parentElement.querySelector('.tgpin'), ratio: Math.max(a, b) / Math.min(a, b) }; });
      assert(r.proj && r.dashed === 'dashed', scheme + ': a hand-set color is not drawn as a dashed projection'); assert(r.pin, 'the pin mark is missing'); assert(r.ratio >= 4.5, scheme + ': text contrast ' + r.ratio.toFixed(1) + ' is under 4.5');
    }
    await p.emulateMedia({ colorScheme: 'light' });
  });
  await test('on a computer nothing changed', async () => {
    const c2 = await browser.newContext({ viewport: { width: 1280, height: 800 } }), q = await c2.newPage(); q.on('dialog', d => d.dismiss());
    await q.goto(url); await q.setInputFiles('#fileAny', [DATA, EXPORT]); await q.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent)); await q.waitForTimeout(300);
    const size = async (tab, sel) => { await q.evaluate(n => document.querySelector('.tabs button[data-tab="' + n + '"]').click(), tab); await q.waitForTimeout(250); return q.evaluate(s => { const e = [...document.querySelectorAll(s)].find(x => x.offsetParent !== null); if (!e) return null; const b = e.getBoundingClientRect(); return { w: b.width, h: b.height }; }, sel); };
    const link = await size('attend', '#attendWrap a[data-person]'), mv = await size('attend', 'button.movebtn'), ud = await size('uniforms', '#uniWrap input[data-udate]');
    assert(link && link.h < 30, 'a name link is ' + (link && link.h)); assert(mv && mv.w < 44, 'Move is ' + (mv && mv.w) + ' wide'); assert(ud && ud.h < 44, 'a date box is ' + (ud && ud.h)); await c2.close();
  });
  await browser.close(); server.close(); console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})().catch(e => { console.log('ERROR ' + e.message); process.exit(1); });
