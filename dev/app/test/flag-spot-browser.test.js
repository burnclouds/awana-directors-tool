// N20 (1.51.16): a flag made with Flag or Bug is tied to the view it was made in (the child, the Person sub-tab, the book, the night, the class) and shows only there.
// Reported: flagging one child's "Date received" box lit every child's. Invented test club only; no real names.
// Usage: NODE_PATH=<dir with playwright> node test/flag-spot-browser.test.js
const { open } = require('./lib/app-page'), assert = require('assert');
(async () => {
  const t = await open({ viewport: { width: 1300, height: 800 } }), page = t.page;
  const ids = await page.evaluate(() => {
    const X = Model.X, act = App.master.people.filter(p => Model.isActive(p)), sparks = act.filter(p => Model.isClubber(p) && Model.groupOf(Model.room(p)) === 'Sparks');
    const room = Model.room(sparks[0]), same = sparks.filter(p => Model.room(p) === room), other = sparks.find(p => Model.room(p) !== room), vol = act.find(p => Model.isVolunteer(p));
    return { a: same[0][X.ID], b: same[1][X.ID], c: other ? other[X.ID] : null, vol: vol ? vol[X.ID] : null, room };
  });
  assert(ids.a && ids.b && ids.vol, JSON.stringify(ids));
  const show = (id, sub) => page.evaluate(([i, s]) => App.showPerson(i, s ? { sub: s } : undefined), [id, sub]);
  const settle = () => page.waitForTimeout(350);
  const marks = async () => { await settle(); return page.locator('#flagLayer .flagbtn:visible').count(); };
  // flag the element the way the Flag button does: its captured spot, saved through App.addFlag
  const flagEl = (sel, note, extra) => page.evaluate(([s, n, ex]) => { const el = document.querySelector(s), i = App.flagTrail.infoOf(el); return App.addFlag(Object.assign({}, i.scope, { level: 'element', kid: i.kid || undefined, tab: App.tab, trail: i.trail, label: i.label, rowIndex: i.rowIndex, note: n }, ex || {})); }, [sel, note, extra]);
  const RECV = '#progressWrap [data-recv]';

  await t.test('N20-0 reproduction: flag child A\'s Date received box through the real Flag button; it shows on A and not on child B', async () => {
    await show(ids.a, 'progress'); await page.waitForSelector(RECV); await page.click('#btnFlagMode'); await page.click(RECV);
    await page.fill('#flNote', 'received date looks wrong'); await page.click('#flSave'); await settle();
    const f = await page.evaluate(() => Season.flagList(App.season).filter(x => x.level === 'element').map(x => ({ kid: x.kid, sub: x.sub, book: x.book })));
    assert.strictEqual(f.length, 1); assert.strictEqual(f[0].kid, ids.a, 'the flag names the child'); assert.strictEqual(f[0].sub, 'progress'); assert(f[0].book, 'and the book tab: ' + JSON.stringify(f[0]));
    assert.strictEqual(await marks(), 1, 'on A');
    await show(ids.b, 'progress'); await page.waitForSelector(RECV); assert.strictEqual(await marks(), 0, 'not on B');
    await show(ids.a, 'progress'); await page.waitForSelector(RECV); assert.strictEqual(await marks(), 1, 'and again on A');
  });
  await t.test('N20-1 the same box on another child in another class shows nothing', async () => {
    if (!ids.c) return; await show(ids.c, 'progress'); await page.waitForSelector(RECV); assert.strictEqual(await marks(), 0);
  });
  await t.test('N20-2 another book tab of the same child shows nothing; back on the first book it shows again', async () => {
    await show(ids.a, 'progress'); await page.waitForSelector(RECV);
    const books = await page.$$eval('#progressWrap button[data-book]', b => b.map(x => x.dataset.book)), flagged = await page.evaluate(() => Season.flagList(App.season).find(x => x.level === 'element').book);
    const other = books.find(b => b !== flagged); if (!other) return;
    await page.click('#progressWrap button[data-book="' + other + '"]'); await page.waitForSelector(RECV); assert.strictEqual(await marks(), 0, 'book ' + other);
    await page.click('#progressWrap button[data-book="' + flagged + '"]'); await page.waitForSelector(RECV); assert.strictEqual(await marks(), 1, 'book ' + flagged);
  });
  await t.test('N20-3 another sub-tab: a Registration field flag shows on Registration only', async () => {
    await show(ids.a, 'registration'); await page.waitForSelector('#personWrap input, #personWrap select, #personWrap textarea');
    const sel = await page.evaluate(() => { const el = [...document.querySelectorAll('#personWrap input[type=text], #personWrap input:not([type]), #personWrap textarea')].find(e => e.offsetParent); el.setAttribute('data-ftest', '1'); return '[data-ftest="1"]'; });
    await flagEl(sel, 'registration note'); assert.strictEqual(await marks(), 1, 'on Registration');
    await page.click('#peSub button[data-sub="attendance"]'); assert.strictEqual(await marks(), 0, 'not on Attendance'); await page.click('#peSub button[data-sub="registration"]'); assert.strictEqual(await marks(), 1, 'back');
  });
  await t.test('N20-4 a flag made on a volunteer\'s fallback Registration page still shows after the leader clicks Registration themselves', async () => {
    await show(ids.vol); await page.waitForFunction(() => document.querySelector('#peSub button.on') && document.querySelector('#peSub button.on').textContent === 'Registration');
    const sel = await page.evaluate(() => { const el = [...document.querySelectorAll('#personWrap input[type=text], #personWrap input:not([type]), #personWrap textarea')].find(e => e.offsetParent); el.setAttribute('data-ftest', '2'); return '[data-ftest="2"]'; });
    const id = await flagEl(sel, 'volunteer note'); const sub = await page.evaluate(i => App.season.flags[i].sub, id); assert.strictEqual(sub, 'registration', 'stored what is SHOWN, not the remembered sub-tab');
    assert.strictEqual(await marks(), 1); await page.click('#peSub button[data-sub="registration"]'); assert.strictEqual(await marks(), 1, 'still there after an explicit click');
  });
  await t.test('N20-5 attendance: another night and another class show nothing', async () => {
    const nights = await page.evaluate(() => Calendar.nights(App.season.calendar, 'Q2').map(r => r.Date));
    await page.evaluate(([d, r]) => { App.places.attend.set({ date: d, room: r }); App.showTab('attend'); }, [nights[0], ids.room]); await page.waitForSelector('#attendWrap tbody tr[data-id] input[type=checkbox]');
    await flagEl('#attendWrap tbody tr[data-id] input[type=checkbox]', 'cell note'); assert.strictEqual(await marks(), 1, 'same night and class');
    await page.evaluate(([d, r]) => { App.places.attend.set({ date: d, room: r }); App.showTab('attend'); }, [nights[1], ids.room]); await page.waitForSelector('#attendWrap tbody tr[data-id]'); assert.strictEqual(await marks(), 0, 'another night');
    const other = await page.evaluate(r => { const rooms = [...new Set(App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p)).map(p => Model.room(p)))]; return rooms.find(x => x !== r); }, ids.room);
    await page.evaluate(([d, r]) => { App.places.attend.set({ date: d, room: r }); App.showTab('attend'); }, [nights[0], other]); await page.waitForSelector('#attendWrap tbody tr[data-id]'); assert.strictEqual(await marks(), 0, 'another class');
  });
  await t.test('N20-6 a bug report carries the same scope fields', async () => {
    await show(ids.a, 'progress'); await page.waitForSelector(RECV);
    const id = await page.evaluate(sel => { const el = document.querySelector(sel), i = App.flagTrail.infoOf(el); return App.addFlag(Object.assign({}, i.scope, { level: 'bug', kid: i.kid || undefined, tab: App.tab, trail: i.trail, label: i.label, rowIndex: i.rowIndex, note: 'bug here' })); }, RECV);
    const f = await page.evaluate(i => App.season.flags[i], id); assert.strictEqual(f.kid, ids.a); assert.strictEqual(f.sub, 'progress');
  });
  await t.test('N20-7 the flag dialog lists an existing note only on the child it was made on', async () => {
    await show(ids.a, 'progress'); await page.waitForSelector(RECV); await page.click('#btnFlagMode'); await page.click(RECV); await page.waitForSelector('#dlg[open]');
    assert((await page.textContent('#dlg')).includes('received date looks wrong'), 'on A'); await page.click('#flCancel'); await page.keyboard.press('Escape');      // Close keeps flag mode on; Esc leaves it
    await show(ids.b, 'progress'); await page.waitForSelector(RECV); await page.click('#btnFlagMode'); await page.click(RECV); await page.waitForSelector('#dlg[open]');
    assert(!(await page.textContent('#dlg')).includes('received date looks wrong'), 'not on B'); await page.click('#flCancel'); await page.keyboard.press('Escape');
  });
  await t.test('N20-8 Go opens the child, the sub-tab and the book the flag was made on, from anywhere', async () => {
    const f = await page.evaluate(() => Season.flagList(App.season).find(x => x.level === 'element' && x.sub === 'progress'));
    await show(ids.b, 'attendance'); await page.evaluate(x => App.goElement(x), f); await page.waitForTimeout(700);
    const now = await page.evaluate(() => ({ tab: App.tab, id: App.places.person.get().state.id, sub: App.personSub(), book: App.sheets.book() }));
    assert.strictEqual(now.tab, 'person'); assert.strictEqual(now.id, ids.a); assert.strictEqual(now.sub, 'progress'); assert.strictEqual(now.book, f.book);
    assert.strictEqual(await marks(), 1, 'and the yellow flag is on screen');
  });
  await t.test('N20-9 a flag made before this (no child, no sub) still shows on every child, and Go still opens its tab', async () => {
    const id = await page.evaluate(() => { const el = document.querySelector('#progressWrap [data-recv]'), i = App.flagTrail.infoOf(el); return App.addFlag({ level: 'element', tab: 'person', trail: i.trail, label: i.label, rowIndex: i.rowIndex, note: 'an old loose flag' }); });
    await show(ids.b, 'progress'); await page.waitForSelector(RECV); assert((await marks()) >= 1, 'on B (as before)');
    await page.evaluate(() => App.showTab('roster')); await page.evaluate(i => App.goElement(Season.flagList(App.season).find(x => x.id === i)), id); await page.waitForTimeout(600);
    assert.strictEqual(await page.evaluate(() => App.tab), 'person');
  });
  await t.test('N20-10 an old Uniforms-style flag that names a child (tr data-id) shows on that child\'s row only', async () => {
    await page.evaluate(() => App.showTab('uniforms')); await page.waitForSelector('#uniWrap tbody tr[data-id]');
    const first = await page.evaluate(() => { const tr = document.querySelector('#uniWrap tbody tr[data-id]'), el = tr.querySelector('input'), i = App.flagTrail.infoOf(el); return { kid: tr.dataset.id, f: App.addFlag({ level: 'element', kid: tr.dataset.id, tab: 'uniforms', trail: i.trail, label: i.label, rowIndex: i.rowIndex, note: 'uniform note' }) }; });
    await settle(); const where = await page.evaluate(k => { const b = document.querySelector('#flagLayer .flagbtn:not([hidden])'); if (!b) return null; const r = b.getBoundingClientRect(); const rows = [...document.querySelectorAll('#uniWrap tbody tr[data-id]')]; const hit = rows.find(tr => { const q = tr.getBoundingClientRect(); return r.top + 10 >= q.top - 2 && r.top + 10 <= q.bottom + 2; }); return hit ? hit.dataset.id : null; }, first.kid);
    assert.strictEqual(where, first.kid, 'the marker is on the flagged child\'s row');
  });
  await t.test('N20-11 FlagTrail.scopeOk and find (node-level rules)', async () => {
    const r = await page.evaluate(() => ({ a: FlagTrail.scopeOk({}, { kid: 'x' }), b: FlagTrail.scopeOk({ kid: 'x' }, { kid: 'x' }), c: FlagTrail.scopeOk({ kid: 'x' }, { kid: 'y' }), d: FlagTrail.scopeOk({ kid: 'x', sub: 'progress' }, { kid: 'x' }), e: FlagTrail.find({ trail: ['A'], rowIndex: 0, kid: 'x' }, [{ trail: ['A'], rowIndex: 0, kid: 'y' }, { trail: ['A'], rowIndex: 1, kid: 'x' }]) }));
    assert.strictEqual(r.a, true); assert.strictEqual(r.b, true); assert.strictEqual(r.c, false); assert.strictEqual(r.d, false); assert.strictEqual(r.e.kid, 'x', 'the child\'s own element wins over a position match');
  });
  await t.done();
})();
