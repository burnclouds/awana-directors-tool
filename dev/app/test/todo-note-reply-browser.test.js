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
  const id = await page.evaluate(() => App.addFlag({ kid: '', level: 'general', note: 'ask about the rank', tab: 'todo', trail: ['To do'] }));
  await page.evaluate(() => document.querySelector('.tabs button[data-tab="todo"]').click()); await page.waitForTimeout(400); await page.evaluate(() => App.tabs.todo()); await page.waitForTimeout(300);
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
  await test('no script errors', async () => { assert.strictEqual(errs.length, 0, errs.join(' | ')); });
  await browser.close(); server.close();
  console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
})();
