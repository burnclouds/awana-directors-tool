// N15 + N30 + N31 (1.51.16): the Emergency, Medical and Photos pages use the same column positions on every page of a kind, on screen and in print; a long note wraps inside its column.
// Three kinds: a Cubbies or Puggles class page (Name, Contact, Medical), a Sparks or T&T class page (Name, Color Team, Contact, Medical) and the everyone-by-name page (Name, Class, Color Team, Contact, Medical).
// The team shows as the colored cell with the color word in it; the longest class name stays on one line. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/emergency-widths-browser.test.js
const { open } = require('./lib/app-page'), assert = require('assert');
(async () => {
  const t = await open({ viewport: { width: 1280, height: 900 } }), page = t.page;
  await t.report('binderClass');
  const drawn = (id, room) => page.evaluate(([id, room]) => {
    const master = App.master;
    document.getElementById('report').innerHTML = Reports.LIST.find(r => r.id === id).render({ master, settings: { quarter: 'Q2' }, calendar: [], season: App.season, today: '2026-11-18', opts: { room } });
    const t = document.querySelector('#report table.emerg'), ths = [...t.querySelectorAll('thead th')].map(th => Math.round(th.getBoundingClientRect().left - t.getBoundingClientRect().left)), sw = [...t.querySelectorAll('td')].filter(td => td.scrollWidth > td.clientWidth + 4).length;
    return { left: ths, heads: [...t.querySelectorAll('thead th')].map(th => th.textContent), overflow: sw, layout: getComputedStyle(t).tableLayout, width: Math.round(t.getBoundingClientRect().width) };
  }, [id, room]);
  const rooms = await page.evaluate(() => [...new Set(App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p)).map(p => Model.room(p)))]);
  const noTeam = ['Puggles', 'Cubbies'].filter(r => rooms.includes(r)), team = rooms.filter(r => /^(Sparks|T&T)/.test(r)).slice(0, 4);

  for (const media of ['screen', 'print']) {
    await t.test('N15-1 (' + media + ') class pages of one kind have the same column positions: Cubbies and Puggles (3 columns), Sparks and T&T (4, with the Color Team)', async () => {
      assert(noTeam.length >= 2 && team.length >= 2, 'classes: ' + rooms.join(', '));
      const run = async () => { const out = { none: [], with: [] }; for (const r of noTeam) out.none.push(await drawn('binderClass', r)); for (const r of team) out.with.push(await drawn('binderClass', r)); return out; };
      const out = media === 'print' ? await t.printed(run) : await run();
      out.none.forEach((o, i) => { assert.strictEqual(o.layout, 'fixed'); assert.strictEqual(o.left.length, 3, noTeam[i] + ' columns'); assert.deepStrictEqual(o.left, out.none[0].left, noTeam[i] + ' positions'); assert.strictEqual(o.overflow, 0, noTeam[i] + ' clipped'); });
      out.with.forEach((o, i) => { assert.strictEqual(o.layout, 'fixed'); assert.strictEqual(o.left.length, 4, team[i] + ' columns'); assert(/Color Team/.test(o.heads[1]), team[i] + ' heading ' + o.heads[1]); assert.deepStrictEqual(o.left, out.with[0].left, team[i] + ' positions'); assert.strictEqual(o.overflow, 0, team[i] + ' clipped'); });
    });
  }
  await t.test('N15-2 the everyone-by-name page is fixed, has five columns with the Color Team after Class, and nothing is clipped', async () => {
    const o = await drawn('binderAll', ''); assert.strictEqual(o.layout, 'fixed'); assert.strictEqual(o.left.length, 5); assert(/^Name$/.test(o.heads[0]) && /^Class$/.test(o.heads[1]) && /Color Team/.test(o.heads[2]), o.heads.join('|')); assert.strictEqual(o.overflow, 0, 'clipped cells ' + o.overflow);
  });
  await t.test('N31 the longest class name is on ONE line in the Class column, and no name is broken in the middle of a word (screen and print)', async () => {
    const check = () => page.evaluate(() => {
      document.getElementById('report').innerHTML = Reports.LIST.find(r => r.id === 'binderAll').render({ master: App.master, settings: { quarter: 'Q2' }, calendar: [], season: App.season, today: '2026-11-18', opts: {} });
      const rows = [...document.querySelectorAll('#report table.emerg tbody tr')], lines = td => { const r = document.createRange(); r.selectNodeContents(td); return new Set([...r.getClientRects()].map(x => Math.round(x.top))).size; };
      const long = rows.filter(tr => /\((Group [AB])\)/.test(tr.cells[1].textContent)).map(tr => lines(tr.cells[1]));
      const broken = rows.filter(tr => { const td = tr.cells[0]; return td.scrollWidth > td.clientWidth + 1; }).length;
      return { n: long.length, maxLines: Math.max(0, ...long), broken };
    });
    const screen = await check(), print = await t.printed(check); [screen, print].forEach((r, i) => { assert(r.n > 0, 'T&T classes found'); assert.strictEqual(r.maxLines, 1, (i ? 'print' : 'screen') + ': the Class cell wraps to ' + r.maxLines + ' lines'); assert.strictEqual(r.broken, 0, 'a name is wider than its column'); });
  });
  await t.test('N30 the Color Team cell is the colored cell with the color word in it, and blank for a Cubbies child', async () => {
    const r = await page.evaluate(() => {
      const p = [...App.master.people].find(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === 'Sparks'), c = App.master.people.find(x => Model.isActive(x) && Model.isClubber(x) && Model.groupOf(Model.room(x)) === 'Cubbies');
      const html = q => Reports.LIST.find(r => r.id === 'binderAll').render({ master: App.master, settings: { quarter: q }, calendar: [], season: App.season, today: '2026-11-18', opts: {} });
      const d = document.createElement('div'), cellOf = (h, f) => { d.innerHTML = h; const tr = [...d.querySelectorAll('tbody tr')].find(t => t.cells[0].textContent.startsWith(Model.eff(p === f ? p : f, Model.C.LAST) + ', ' + Model.eff(f, Model.C.FIRST))); return tr ? tr.cells[2] : null; };
      const sp = cellOf(html('Q2'), p), cu = cellOf(html('Q2'), c);
      return { teamQ2: Model.teamOf(p, 'Q2'), spText: sp && sp.textContent.trim(), spCls: sp && sp.innerHTML, cuText: cu && cu.textContent.trim() };
    });
    assert(r.teamQ2, 'the test Sparks child has a Q2 team'); assert(r.spText.startsWith(r.teamQ2), 'the color word is the cell text: ' + r.spText + ' vs ' + r.teamQ2); assert(/team-/.test(r.spCls), 'and the cell is colored'); assert.strictEqual(r.cuText, '', 'Cubbies: blank');
  });
  await t.test('N15-3 an emergency contact name wraps inside its column (the name span may wrap, the phone stays whole)', async () => {
    const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'style.css'), 'utf8');
    assert(/table\.grid\.emerg \.nw\.nm \{ white-space:normal/.test(css), 'name wraps'); assert(!/table\.grid\.emerg \.nw \{/.test(css), 'phones are not made wrappable');
  });
  await t.test('N15-4 still one PDF page per class (portrait letter), and the page count of everyone by name is unchanged by the new column', async () => {
    await t.report('binderClass'); const buf = await t.pdf(), boxes = [...buf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map(m => [Math.round(m[1]), Math.round(m[2])]);
    const sheets = await page.evaluate(() => document.querySelectorAll('#report .sheet').length); assert.strictEqual(boxes.length, sheets, 'pages ' + boxes.length + ' vs sheets ' + sheets); boxes.forEach(b => assert.deepStrictEqual(b, [612, 792]));
    await t.report('binderAll'); const all = await t.pdf(); const n = [...all.toString('latin1').matchAll(/\/Type\s*\/Page[^s]/g)].length; assert(n >= 1 && n <= 8, 'everyone by name pages ' + n);
  });
  await t.done();
})();
