// N44: on the To do tab a note can be edited, and a reply can be added to it; the reply shows under the note. Invented test club only.
// Usage: NODE_PATH=<dir with playwright> node test/todo-note-reply-browser.test.js
const assert = require('assert'), fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const app = path.join(__dirname, '..'), td = path.join(app, '..', 'test-data'), DATA = path.join(td, fs.readdirSync(td).find(f => /TEST.*\.json$/.test(f)));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const f = path.join(app, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html'); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch(), url = 'http://localhost:' + server.address().port + '/index.html';
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url); await page.setInputFiles('#splashFiles', [DATA]); await page.waitForFunction(() => /\d+ active/.test(document.getElementById('status').textContent));
  await page.evaluate(() => App.showTab('todo')); await page.waitForTimeout(500); assert.strictEqual(await page.evaluate(() => App.view()), 'todo', 'really on To do (the Roster tab holds edits as an unlogged draft)');
  const id = await page.evaluate(() => App.addFlag({ kid: '', level: 'general', note: 'ask about the rank', tab: 'todo', trail: ['To do'] }));
  await page.evaluate(() => App.tabs.todo()); await page.waitForTimeout(300);
  await test('a reply can be added to a note; it shows under the note with its author', async () => {
    await page.evaluate(i => document.querySelector('button[data-replyflag="' + i + '"]').click(), id); await page.waitForTimeout(150);
    await page.evaluate(() => { const t = document.querySelector('textarea[data-replytext]'); t.value = 'done on Tuesday\r\nthanks'; });
    await page.evaluate(i => document.querySelector('button[data-replysave="' + i + '"]').click(), id); await page.waitForTimeout(400);
    const shown = await page.evaluate(i => { const r = document.querySelector('tr[data-flag="' + i + '"]'); return r ? r.textContent.replace(/\s+/g, ' ') : ''; }, id);
    assert(/done on Tuesday thanks/.test(shown) && /Leader/.test(shown), 'reply not shown: ' + shown.slice(0, 200));
    assert.strictEqual(await page.evaluate(i => App.season.flags[i].replies && Object.values(App.season.flags[i].replies)[0].text, id), 'done on Tuesday\nthanks', 'the reply is not kept with LF line breaks');
  });
  await test('a note can be edited in place; the new text is saved and shown', async () => {
    await page.evaluate(i => document.querySelector('button[data-editnote="' + i + '"]').click(), id); await page.waitForTimeout(150);
    await page.evaluate(i => { const t = document.querySelector('textarea[data-noteedit="' + i + '"]'); t.value = 'ask about the rank\r\nnext Sunday'; }, id);
    await page.evaluate(i => document.querySelector('button[data-notesave="' + i + '"]').click(), id); await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(i => App.season.flags[i].note, id), 'ask about the rank\nnext Sunday');
  });
  // Review finding: replies written on the same day are shown in a fixed order (by reply id), not in whatever order the file's keys happen to be in after a merge or reload.
  await test('two replies on the same day show in reply-id order, whatever the key order in the file', async () => {
    const id2 = await page.evaluate(() => { const i = App.addFlag({ kid: '', level: 'general', note: 'second note', tab: 'todo', trail: ['To do'] }); App.season.flags[i].replies = { rb: { at: '2026-11-19', by: 'leader', text: 'REPLY-B-later' }, ra: { at: '2026-11-19', by: 'leader', text: 'REPLY-A-earlier' } }; App.tabs.todo(); return i; });
    await page.waitForTimeout(300);
    const shown = await page.evaluate(i => { const r = document.querySelector('tr[data-flag="' + i + '"]'); return r ? r.textContent.replace(/\s+/g, ' ') : ''; }, id2);
    assert(shown.includes('REPLY-A-earlier') && shown.includes('REPLY-B-later'), 'replies not shown: ' + shown.slice(0, 200)); assert(shown.indexOf('REPLY-A-earlier') < shown.indexOf('REPLY-B-later'), 'out of order: ' + shown.slice(0, 200));
  });
  // N49: the note and its replies are separate messages.
  const note2 = await page.evaluate(() => { const i = App.addFlag({ kid: '', level: 'general', note: 'line one\nline two', tab: 'todo', trail: ['To do'] }); const a = App.addFlagReply(i, 'REPLY-ONE', 'leader'), b = App.addFlagReply(i, 'REPLY-TWO', 'leader'); App.tabs.todo(); return { i, a, b }; });
  await page.waitForTimeout(300);
  await test('Edit shows only the note (with its line break), in a large box; the replies stay out of it and on screen', async () => {
    await page.evaluate(i => document.querySelector('button[data-editnote="' + i + '"]').click(), note2.i); await page.waitForTimeout(150);
    const m = await page.evaluate(i => { const ta = document.querySelector('textarea[data-noteedit="' + i + '"]'), row = ta.closest('tr'); return { value: ta.value, rows: ta.rows, rowText: row.textContent }; }, note2.i);
    assert.strictEqual(m.value, 'line one\nline two', 'the box holds: ' + JSON.stringify(m.value)); assert(m.rows >= 5, 'the box is ' + m.rows + ' rows'); assert(/REPLY-ONE/.test(m.rowText) && /REPLY-TWO/.test(m.rowText), 'the replies are still shown beside the editor');
    await page.evaluate(i => { const ta = document.querySelector('textarea[data-noteedit="' + i + '"]'); ta.value = 'line one\nline two\nline three'; document.querySelector('button[data-notesave="' + i + '"]').click(); }, note2.i); await page.waitForTimeout(300);
    const after = await page.evaluate(i => { const f = App.season.flags[i]; return { note: f.note, replies: Object.values(f.replies).map(r => r.text).sort() }; }, note2.i);
    assert.strictEqual(after.note, 'line one\nline two\nline three'); assert.deepStrictEqual(after.replies, ['REPLY-ONE', 'REPLY-TWO'], 'the replies were not touched');
  });
  for (const vw of [1280, 1999]) await test('the reply box keeps Save reply and Cancel on screen, below the box (window ' + vw + ' wide)', async () => {
    await page.setViewportSize({ width: vw, height: 1000 }); await page.waitForTimeout(150);
    await page.evaluate(i => document.querySelector('button[data-replyflag="' + i + '"]').click(), note2.i); await page.waitForTimeout(150);
    const m = await page.evaluate(() => { const ta = document.querySelector('textarea[data-replytext]'), b = document.querySelector('button[data-replysave]'), c = document.querySelector('button[data-replycancel]'), T = ta.getBoundingClientRect(), B = b.getBoundingClientRect(), C = c.getBoundingClientRect(); return { vw: innerWidth, bRight: B.right, cRight: C.right, bTop: B.top, tBottom: T.bottom, noScroll: document.documentElement.scrollWidth <= innerWidth + 1 }; });
    assert(m.bRight <= m.vw && m.cRight <= m.vw, 'buttons run to ' + Math.round(m.bRight) + ' / ' + Math.round(m.cRight) + ' of ' + m.vw); assert(m.bTop >= m.tBottom - 1, 'Save reply is not below the box'); assert(m.noScroll, 'the page scrolls sideways');
    await page.evaluate(() => document.querySelector('button[data-replycancel]').click()); await page.setViewportSize({ width: 1280, height: 900 });
  });
  await test('each reply has its own Edit and Remove: Edit changes only that reply, Remove takes only that one, Undo brings it back', async () => {
    await page.evaluate(([i, a]) => document.querySelector('button[data-editreply="' + i + '"][data-rid="' + a + '"]').click(), [note2.i, note2.a]); await page.waitForTimeout(150);
    assert.strictEqual(await page.evaluate(() => document.querySelector('textarea[data-replyedit]').value), 'REPLY-ONE', 'the reply editor holds only that reply');
    await page.evaluate(([i, a]) => { document.querySelector('textarea[data-replyedit]').value = 'REPLY-ONE edited'; document.querySelector('button[data-replyeditsave="' + i + '"][data-rid="' + a + '"]').click(); }, [note2.i, note2.a]); await page.waitForTimeout(300);
    let st = await page.evaluate(i => ({ note: App.season.flags[i].note, r: Object.values(App.season.flags[i].replies).map(r => r.text).sort() }), note2.i); assert.deepStrictEqual(st.r, ['REPLY-ONE edited', 'REPLY-TWO']); assert.strictEqual(st.note, 'line one\nline two\nline three');
    await page.evaluate(([i, b]) => document.querySelector('button[data-rmreply="' + i + '"][data-rid="' + b + '"]').click(), [note2.i, note2.b]); await page.waitForTimeout(300);
    st = await page.evaluate(i => Object.values(App.season.flags[i].replies).map(r => r.text), note2.i); assert.deepStrictEqual(st, ['REPLY-ONE edited'], 'only REPLY-TWO was removed');
    const undo = await page.evaluate(() => { const b = document.getElementById('btnUndo'); return { disabled: b.disabled, covered: (() => { const r = b.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e && e !== b && !b.contains(e) ? e.tagName + '.' + e.className + '#' + e.id : ''; })() }; }); assert.strictEqual(undo.disabled, false, 'Undo is disabled after a removal'); assert.strictEqual(undo.covered, '', 'Undo is covered by ' + undo.covered);
    await page.evaluate(() => document.getElementById('btnUndo').click()); await page.waitForTimeout(300);
    st = await page.evaluate(i => Object.values(App.season.flags[i].replies).map(r => r.text).sort(), note2.i); assert.deepStrictEqual(st, ['REPLY-ONE edited', 'REPLY-TWO'], 'Undo brings the reply back');
  });
  await test('no script errors', async () => { assert.strictEqual(errs.length, 0, errs.join(' | ')); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
