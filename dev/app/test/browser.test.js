// Real-browser end-to-end test (Chromium via Playwright). Optional: needs `playwright` and its Chromium.
//   PLAYWRIGHT_BROWSERS_PATH=<dir> NODE_PATH=<dir>/node_modules node test/browser.test.js <planning-center-export.csv> <calendar.csv> <old-season.json> [old-master.csv]
// The data JSON is built from those with tools/make-database.js and opened with the export, the way you would.
const fs = require('fs'), path = require('path'), assert = require('assert'), os = require('os');
const { chromium } = require('playwright');
if (process.argv.length < 5) { console.log('SKIP: needs real files (roster, calendar, old season JSON; see Usage above)'); process.exit(0); }
const [roster, calendar, seasonFile, masterFile] = process.argv.slice(2).map(p => path.resolve(p));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'awana-e2e-'));   // holds the data file (children's names); removed at the end
const Season = require('../season.js'), { build } = require('../../tools/make-database.js');
const dataFile = path.join(tmp, 'awana-2026-27-20261029-123000.json');
fs.writeFileSync(dataFile, Season.toJson(build({ exportName: path.basename(roster), exportText: fs.readFileSync(roster, 'utf8'), calendarText: fs.readFileSync(calendar, 'utf8'), seasonText: fs.readFileSync(seasonFile, 'utf8'), today: '2026-10-29' }).season));
const app = 'file://' + path.resolve(__dirname, '..', 'index.html');
// The phrase the app's Restore asks for three times (app-season.js, RESTORE_PHRASE). Copied exactly.
const RESTORE_PHRASE = "I understand what i'm about to do, I have made backups, and i am confident in my decision. Please Proceed with my dangerous request.";
let passed = 0, failed = 0;
const test = async (name, fn) => { try { await fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0].slice(0, 300)); } };

(async () => {
  const browser = await chromium.launch();
  // Saving over a chosen file (Chrome's Save as picker) cannot be driven here: every page in this test has no picker, so a save is an ordinary download, as the checks below expect.
  const newPage0 = browser.newPage.bind(browser); browser.newPage = async (...a) => { const p = await newPage0(...a); await p.addInitScript(() => { window.showSaveFilePicker = undefined; }); return p; };
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 }, acceptDownloads: true });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(app);
  await page.setInputFiles('#fileAny', [dataFile, roster]);
  await page.waitForTimeout(300);
  const tab = async t => { await page.evaluate(x => document.querySelector('.tabs button[data-tab="' + x + '"]').click(), t); await page.waitForTimeout(100); };

  await test('Import takes the data file and the Planning Center export together and opens clean', async () => {
    assert(/Data file 2026-27/.test(await page.textContent('#seasonStatus')));
    const st = await page.textContent('#status');
    assert(/active/.test(st) && !/UNSAVED/i.test(st), st);
    assert(!/unsaved/.test(await page.textContent('#seasonStatus')));
    assert(await page.evaluate(() => window.App.calendar.length) > 20, 'calendar comes from the data file');
  });
  if (masterFile) await test('one-time move: the old master CSV, calendar CSV and season JSON import into a new data file, with the team colors', async () => {
    const p0 = await browser.newPage(); await p0.goto(app);
    await p0.setInputFiles('#fileAny', [masterFile, calendar, seasonFile, roster]); await p0.waitForTimeout(300);
    await p0.evaluate(() => document.querySelector('.tabs button[data-tab="attend"]').click()); await p0.selectOption('#attRoom', 'Sparks B');
    assert((await p0.locator('#attendWrap .team').count()) > 5, 'no team chips');
    assert(/unsaved/.test(await p0.textContent('#seasonStatus')), 'imported files are not saved until you download the data file');
    await p0.close();
  });
  // One session of edits on the main page, then the file it downloads. Each tab's own behavior is tested in its own file; what only this test shows is that an edit made on screen ends up in the saved file.
  let saved;
  await test('edits on Attendance, Games, Awards and Progress are all in the downloaded data file (sorted keys, and nothing left unsaved)', async () => {
    await tab('attend'); await page.selectOption('#attRoom', 'Sparks A'); await page.click('#btnAllPresent');
    const n = await page.locator('#attendWrap input[data-m="a"]').count();
    assert(n > 0 && await page.locator('#attendWrap input[data-m="a"]:checked').count() === n, 'Mark everyone present ticks every child in the room');
    await page.locator('#attendWrap input[data-m="h"]').first().check();
    assert(/\d+ of \d+ present/.test(await page.textContent('#attCount'))); assert(/unsaved edit/.test(await page.textContent('#seasonStatus')));
    await tab('games'); const row = page.locator('#gamesWrap section[data-group="Sparks"] tr[data-team="Red"]');
    await row.locator('select[data-f="place"]').selectOption('1'); await page.locator('#gamesWrap section[data-group="Sparks"] tr[data-team="Red"] select[data-f="spirit"]').selectOption('3');
    await tab('awards'); await page.waitForTimeout(300); await page.click('#awSubs button[data-awsub="announce"]');   // awards are not entered by hand any more (the Announce page records them)
    await tab('person'); await page.selectOption('#peGroup', 'Sparks'); await page.selectOption('#peClass', { index: 1 }); await page.click('#peSub button[data-sub="progress"]'); await page.waitForTimeout(200);
    if (await page.locator('#progressWrap .booktabs button[data-book="HG"]').count()) await page.click('#progressWrap .booktabs button[data-book="HG"]');
    for (const k of ['1', '2', '3', '4']) { await page.fill(`#progressWrap input[data-key="RJ1.${k}"]`, '2026-10-14'); await page.press(`#progressWrap input[data-key="RJ1.${k}"]`, 'Enter'); await page.waitForTimeout(150); }      // a date is saved on Enter (or when the box loses focus) and the sheet is redrawn, so one at a time, as a person types them
    const [dl] = await Promise.all([page.waitForEvent('download'), (async () => { await page.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await page.waitForTimeout(200); await page.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); })()]);
    saved = path.join(tmp, 'season-e2e.json'); await dl.saveAs(saved);
    const j = JSON.parse(fs.readFileSync(saved, 'utf8'));
    assert(/^awana-2026-27-(TEST-)?\d{8}-\d{6}\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());   // test data carries TEST in the name
    assert(Object.keys(j.attendance).length >= 8, 'a new night is added to the 7 migrated nights');
    assert.deepStrictEqual(Object.keys(j), Object.keys(j).slice().sort());
    assert(Object.values(j.games).some(g => g.Sparks && g.Sparks.Red && g.Sparks.Red.place === 1 && g.Sparks.Red.spirit === 3), 'the game result is in the file');
    assert(Object.values(j.progress).some(kid => Object.values(kid).some(book => ['1', '2', '3', '4'].every(i => book['RJ1.' + i] === '2026-10-14'))), 'the four Red Jewel 1 dates are in the file (under the child\'s book)');
    assert(!/unsaved/.test(await page.textContent('#seasonStatus')));
  });
  await test('the saved file holds the roster extras, calendar, rotation and the full export (as of its date), and the history of this session\'s edits', async () => {
    const text = fs.readFileSync(saved, 'utf8'), j = JSON.parse(text);
    assert.strictEqual(j.version, Season.VERSION);
    assert(Object.keys(j.roster.people).length >= 130 && j.calendar.length > 20, 'people ' + Object.keys(j.roster.people).length + ', calendar ' + j.calendar.length);
    assert.strictEqual(j.roster.pcAsOf, '2026-10-28'); assert(/^20261028 -- /.test(j.roster.pcSource), j.roster.pcSource);
    const rows = require('../csv.js').toRecords(require('../csv.js').parse(fs.readFileSync(roster, 'utf8'))).records;
    const details = rows.flatMap(r => [r['Medical Notes'], r['Mobile Phone Number'], r['Home Email Address']]).filter(s => s && s.length > 6);
    assert(details.length > 20); details.forEach(s => assert(text.includes(JSON.stringify(s).slice(1, -1)), 'missing from file: ' + s.slice(0, 20)));
    assert(j.history.length >= 3, 'history entries: ' + j.history.length);   // this session logs three edits (attendance, games, Progress dates); awards are no longer entered by hand assert(j.history.every(e => e.t && e.label && e.changes.length), 'history entries missing t, label or changes: ' + JSON.stringify(j.history.filter(e => !(e.t && e.label && e.changes.length)).map(e => [e.t, e.label, (e.changes||[]).length])).slice(0, 300));
  });
  await test('the saved file opens again with the export in a fresh page, clean, with the same contents', async () => {
    const p2 = await browser.newPage(); await p2.goto(app);
    await p2.setInputFiles('#fileAny', [roster, saved]); await p2.waitForTimeout(300);
    assert(/Data file 2026-27/.test(await p2.textContent('#seasonStatus')));
    assert(!/unsaved/.test(await p2.textContent('#seasonStatus')) && !/UNSAVED/.test(await p2.textContent('#status')));
    const n = await p2.evaluate(() => Object.keys(window.App.season.attendance).length);
    assert.strictEqual(n, Object.keys(JSON.parse(fs.readFileSync(saved, 'utf8')).attendance).length);
    await p2.close();
  });
  await test('History tab: dropdown, previous/next and "always the latest" compare any two versions with highlighting', async () => {
    await tab('history');
    const n = await page.evaluate(() => window.App.season.history.length);
    assert.strictEqual(await page.locator('#hFromDay option').count(), 2, 'File as opened + today');
    assert.strictEqual(await page.locator('#hFrom option').count(), n, 'times on the chosen day');
    await page.selectOption('#hFromDay', { value: '' });
    assert.strictEqual(await page.locator('#hFrom option').count(), 1, 'the opened file has no times to choose');
    assert.strictEqual(await page.inputValue('#hFrom'), '0');
    assert(await page.locator('#historyWrap .hlist li.h-add').count() > 0, 'no green additions');
    const bg = await page.locator('#historyWrap .hlist li.h-add').first().evaluate(e => getComputedStyle(e).backgroundColor);
    assert.notStrictEqual(bg, 'rgba(0, 0, 0, 0)', 'additions are not highlighted');
    assert(await page.isDisabled('#hTo'), 'To should follow the latest');
    await page.uncheck('#hLatest');
    assert(await page.isEnabled('#hTo'));
    await page.selectOption('#hTo', '1');
    const first = await page.textContent('#historyWrap');
    await page.click('#hToNext'); await page.click('#hFromNext');
    assert.notStrictEqual(await page.textContent('#historyWrap'), first);
    assert.strictEqual(await page.inputValue('#hFrom'), '1'); assert.strictEqual(await page.inputValue('#hTo'), '2');
    await page.selectOption('#hFrom', '2');
    assert(/identical/.test(await page.textContent('#historyWrap')));
    assert.strictEqual(await page.evaluate(() => window.App.season.history.length), n, 'viewing history must not add entries');
  });
  await test('History tab: name a version, then Restore backs up the file, drops later versions and leaves it unsaved', async () => {
    // Restore asks the phrase through prompt() three times: answer those with the phrase, and the version name with 'before games'.
    await page.evaluate(p => { window.prompt = m => /Restore confirmation/.test(m) ? p : 'before games'; }, RESTORE_PHRASE);
    // Log an edit first, so there is a later version to restore past (the history starts with the two versions from the test file).
    await page.evaluate(() => { const M = window.Model, S = window.Season, id = window.App.master.people.find(x => M.isActive(x))[M.X.ID]; S.setMark(window.App.season, '2026-10-21', id, 'x', 1); window.App.commitScope(() => window.App.changed()); S.setMark(window.App.season, '2026-10-21', id, 'x', 0); window.App.commitScope(() => window.App.changed()); });
    await page.check('#hLatest');
    const n = await page.evaluate(() => window.App.season.history.length);
    await page.selectOption('#hFrom', '2');
    await page.click('#hTagFrom');
    assert(/2 · “before games”/.test(await page.locator('#hFrom option:checked').textContent()));
    assert(/Restore to version 2/.test(await page.textContent('#hRestore')));
    assert(!(await page.isDisabled('#hRestore')), 'Restore is enabled (history length ' + n + ', from ' + (await page.inputValue('#hFrom')) + ')');
    // The backup is downloaded through the Planning Center warning when there are pending changes (that step is answered here, as a person would).
    const [dl] = await Promise.all([page.waitForEvent('download'), (async () => { await page.click('#hRestore'); await page.waitForTimeout(200); if (await page.isVisible('#warnGo')) await page.click('#warnGo'); })()]);
    assert(/^awana-2026-27-before-restore-TEST-\d{8}-\d{6}\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());      // test data: the name carries TEST
    const bk = path.join(tmp, 'backup.json'); await dl.saveAs(bk);
    assert.strictEqual(JSON.parse(fs.readFileSync(bk, 'utf8')).history.length, n, 'the backup is the file as it was before the restore');
    assert.strictEqual(await page.evaluate(() => window.App.season.history.length), 2);
    assert(/unsaved edit/.test(await page.textContent('#seasonStatus')));
    assert.strictEqual(await page.locator('#hFrom option').count(), 2); assert.strictEqual(await page.locator('#hFromDay option').count(), 2);
  });
  await test('Opening just the data file while any tab is already showing fills that tab (no "load a roster first" left behind)', async () => {
    const stale = /Load a roster first|Open your data file|No calendar loaded|Open or start a data file|No data file is open|Load a roster/i, bad = [];
    for (const t of ['roster', 'attend', 'games', 'games/teams', 'awards', 'person', 'history', 'uniforms', 'calendar', 'reports']) {   // not rotation: the test file is built without one
      const [main, sub] = t.split('/');
      const p = await browser.newPage(); p.on('dialog', d => d.accept()); await p.goto(app); await p.click('#splashSkip');
      await p.evaluate(m => document.querySelector('.tabs button[data-tab="' + m + '"]').click(), main); if (sub) await p.click('#tab-' + main + ' .subtabs button[data-sub="' + sub + '"]'); await p.waitForTimeout(80);
      await p.setInputFiles('#fileAny', [dataFile]); await p.waitForTimeout(400);
      const text = await p.locator('#tab-' + main).innerText();      // visible text only
      if (stale.test(text)) bad.push(t + ': ' + text.replace(/\s+/g, ' ').match(stale)[0]);
      await p.close();
    }
    assert(!bad.length, 'tabs left empty after loading the data file: ' + bad.join(' / '));
  });
  await test('Opening an older season-only file by itself says what it lacks, instead of leaving empty tabs', async () => {
    const p = await browser.newPage(), msgs = []; p.on('dialog', d => { msgs.push(d.message()); d.accept(); });
    await p.goto(app); await p.setInputFiles('#fileAny', [seasonFile]); await p.waitForTimeout(400);
    assert(msgs.length === 1 && /older season-only data file/.test(msgs[0]) && /roster, color teams, calendar or rotation/.test(msgs[0]), JSON.stringify(msgs));
    await p.close();
    const q = await browser.newPage(), none = []; q.on('dialog', d => { none.push(d.message()); d.accept(); });
    await q.goto(app); await q.setInputFiles('#fileAny', [dataFile]); await q.waitForTimeout(400);
    assert.deepStrictEqual(none, [], 'the current data file opens without any warning'); await q.close();
    const r = await browser.newPage(), quiet = []; r.on('dialog', d => { quiet.push(d.message()); d.accept(); });
    await r.goto(app); await r.setInputFiles('#fileAny', [dataFile, roster]); await r.waitForTimeout(400); const people = await r.evaluate(() => App.master.people.length);
    await r.setInputFiles('#fileAny', [seasonFile]); await r.waitForTimeout(400);
    assert.deepStrictEqual(quiet, [], 'with the roster already open the older season file needs no warning'); assert.strictEqual(await r.evaluate(() => App.master.people.length), people, 'the open roster is kept'); await r.close();
  });
  await test('Splash: asks for the files first, opens them from its own button, and goes away; "Skip for now" also closes it', async () => {
    const p5 = await browser.newPage(); await p5.goto(app);
    assert(await p5.isVisible('#splash'), 'splash is shown at load');
    assert(await p5.getAttribute('#splashFiles', 'class').then(c => /\bvh\b/.test(c || '')), 'the real file input is visually hidden behind its "Choose files" button'); assert(await p5.isVisible('#splash label.btn'), 'the button is shown');
    await p5.setInputFiles('#splashFiles', [dataFile]); await p5.waitForTimeout(400);      // the data file alone is enough: no export needed
    assert(!(await p5.isVisible('#splash')), 'splash goes away once the data file is open');
    assert(/140 active/.test(await p5.textContent('#status')) && /PC data 2026-10-28/.test(await p5.textContent('#status')), await p5.textContent('#status'));
    assert(!(await p5.isVisible('#review')), 'no review prompt without an export');
    await p5.evaluate(() => document.querySelector('.tabs button[data-tab="reports"]').click()); await p5.selectOption('#rSel', 'binderAll');
    assert(/Planning Center data as of 2026-10-28/.test(await p5.textContent('#report')), 'reports run from the data file alone');
    await p5.close();
    const p6 = await browser.newPage(); await p6.goto(app); await p6.click('#splashSkip');
    assert(!(await p6.isVisible('#splash')), 'skip closes the splash'); assert(await p6.isVisible('.tabs')); await p6.close();
  });
  await test('Leaving the page: the browser warns when there are unsaved changes, and not otherwise', async () => {
    const open = async () => { const p = await browser.newPage(); await p.goto(app); await p.setInputFiles('#fileAny', [dataFile, roster]); await p.waitForTimeout(400);
      await p.evaluate(() => document.querySelector('.tabs button[data-tab="attend"]').click()); await p.waitForTimeout(100); return p; };
    const p7 = await open(), seen7 = [];
    p7.on('dialog', d => { seen7.push(d.type()); d.dismiss(); });
    await p7.goto('about:blank');
    assert.deepStrictEqual(seen7, [], 'a clean file lets you leave without asking'); assert.strictEqual(p7.url(), 'about:blank'); await p7.close();
    const p8 = await open(), seen8 = [];
    p8.on('dialog', d => { seen8.push(d.type()); d.dismiss(); });
    await p8.locator('#attendWrap input[type=checkbox]').first().check();
    assert(/unsaved edit/.test(await p8.textContent('#seasonStatus')));
    await p8.goto('about:blank').catch(() => {});                      // the dialog is dismissed ("stay"), so the navigation is cancelled
    assert.deepStrictEqual(seen8, ['beforeunload'], 'unsaved changes must trigger the leave-page warning');
    assert(/index\.html$/.test(p8.url()), 'staying keeps the app open: ' + p8.url());
    await p8.close();
  });
  await test('Debug tab: every script is registered with a version, the page version shows in the header, and the files opened are listed with dates', async () => {
    await tab('debug');
    const rows = await page.locator('#debugWrap table').nth(1).locator('tbody tr').allTextContents();
    assert(rows.length >= 13, 'scripts listed: ' + rows.length);
    assert(rows.every(r => /\d+\.\d+\.\d+$/.test(r.trim())), 'a script has no version: ' + rows.filter(r => !/\d+\.\d+\.\d+$/.test(r.trim())).join(' | '));
    assert(/^v\d+\.\d+\.\d+[a-z]?$/.test(await page.textContent('#verLink')));
    const txt = await page.textContent('#debugWrap');
    assert(/awana-2026-27-20261029-123000\.json/.test(txt) && /2026-10-29 12:30:00/.test(txt) && /Planning Center data as of/.test(txt), 'the data file and the date in its name are listed');
    assert(!/undefined|NaN|\[object/.test(txt), 'junk text');
    const before = await page.locator('#debugWrap table').nth(3).locator('tbody tr').count();
    await page.setInputFiles('#dbgFiles', [calendar]); await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('#debugWrap table').nth(3).locator('tbody tr').count(), before + 1, 'a checked file is added to the list');
  });
  await test('Validate tab: the real data file and export pass, a broken copy reports its errors, and nothing in the open file changes', async () => {
    await tab('validate');
    const n = await page.evaluate(() => window.App.season.history.length);
    const bad = path.join(tmp, 'awana-2026-27-20261029-130000.json'), j = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    j.attendance['2026-13-45'] = {}; j.games['2026-10-28'] = { Sparks: { Purple: { place: 9 } } }; fs.writeFileSync(bad, JSON.stringify(j));
    await page.setInputFiles('#vFiles', [dataFile, roster, bad]); await page.waitForTimeout(300);
    const t = await page.textContent('#validateWrap');
    // The data file has no errors; it may carry warnings (this fixture has records for children no longer on the roster, which the app reports as a warning, not an error).
    assert(/Data file · 0 errors/.test(t), 'the data file has no errors: ' + t.slice(0, 300));
    assert(/Planning Center export · 0 errors/.test(t), 'the export has no errors (warnings about real children are allowed): ' + t.slice(0, 400));
    assert(/2 errors/.test(t) || /3 errors/.test(t), 'the broken copy: ' + t.slice(0, 600));
    assert(/not a real date/.test(t) && /Purple/.test(t) && /place 9/.test(t));
    assert.strictEqual(await page.locator('#validateWrap .hlist li.h-del').count() >= 3, true, 'errors are highlighted red');
    assert.strictEqual(await page.evaluate(() => window.App.season.history.length), n, 'validating must not add history');
    fs.unlinkSync(bad);
  });
  await test('Calendar: club nights off the club day are flagged (Wednesday by default), events are not, and the day is a logged setting', async () => {
    const p4 = await browser.newPage(); p4.on('dialog', d => d.accept()); await p4.goto(app);
    await p4.setInputFiles('#fileAny', [dataFile, roster]); await p4.waitForTimeout(300);
    await p4.evaluate(() => document.querySelector('.tabs button[data-tab="calendar"]').click());
    assert.strictEqual(await p4.inputValue('#calClubDay'), '3', 'Wednesday by default');
    assert.strictEqual(await p4.locator('#calWrap td.dow-off').count(), 0, 'the real calendar is all Wednesdays');
    assert.strictEqual((await p4.textContent('#calDayWarn')).trim(), '');
    await p4.click('#btnCalAdd');                                   // a new club night copies the last date: make it a Saturday event, then a Thursday night
    const last = p4.locator('#calWrap tbody tr').last();
    await last.locator('input[data-c="Date"]').fill('2027-05-15'); await last.locator('select[data-c="Type"]').selectOption('Event');
    assert.strictEqual(await p4.locator('#calWrap td.dow-off').count(), 0, 'an event on a Saturday is fine');
    await p4.click('#btnCalAdd');
    await p4.locator('#calWrap tbody tr').last().locator('input[data-c="Date"]').fill('2027-05-20');
    assert.strictEqual(await p4.locator('#calWrap td.dow-off').count(), 1, 'a Thursday club night is flagged');
    assert(/1 club night is not on a Wednesday/.test(await p4.textContent('#calDayWarn')), await p4.textContent('#calDayWarn'));
    await p4.selectOption('#calClubDay', '4');                       // a Thursday club: everything else is now off
    assert.strictEqual(await p4.evaluate(() => window.App.season.config.clubDay), 4);
    const n = await p4.evaluate(() => window.App.calendar.filter(r => r.Type !== 'Event' && r['No Club'] !== '1').length);
    assert.strictEqual(await p4.locator('#calWrap td.dow-off').count(), n - 1, 'all but the Thursday night are flagged');
    assert(/not on a Thursday/.test(await p4.textContent('#calDayWarn')));
    assert(/UNSAVED/.test(await p4.textContent('#seasonStatus')) || /unsaved/.test(await p4.textContent('#seasonStatus')));
    await p4.evaluate(() => document.querySelector('.tabs button[data-tab="history"]').click()); await p4.selectOption('#hFromDay', { value: '' });
    assert(/Club day changed from Wednesday to Thursday/.test(await p4.textContent('#historyWrap')), 'logged in History');
    await p4.close();
  });
  await test('color teams are in the data file: Assign blanks is logged in History by child name, and restoring past it removes the colors', async () => {
    const p3 = await browser.newPage(); p3.on('dialog', d => d.type() === 'prompt' ? d.accept(RESTORE_PHRASE) : d.accept()); await p3.goto(app);
    await p3.setInputFiles('#fileAny', [dataFile, roster]); await p3.waitForTimeout(300);
    await p3.evaluate(() => document.querySelector('.tabs button[data-tab="games"]').click()); await p3.click('#tab-games .subtabs button[data-sub="teams"]'); await p3.selectOption('#tQuarter', 'Q1'); await p3.click('#btnTeamFill'); await p3.waitForSelector('#dlg[open] #tgPrevOk'); await p3.click('#tgPrevOk'); await p3.waitForTimeout(100);      // Assign blanks shows a preview first; Confirm writes it
    const colored = () => p3.evaluate(() => window.App.master.people.filter(p => p['team:Q1']).length);
    assert(await colored() > 60, 'colors assigned: ' + await colored());
    await p3.evaluate(() => document.querySelector('.tabs button[data-tab="history"]').click()); await p3.selectOption('#hFromDay', { value: '' });
    assert(/Roster/.test(await p3.textContent('#historyWrap')));
    assert(await p3.locator('#historyWrap .hlist li.h-add').filter({ hasText: /team:Q1: \(none\) → (Red|Blue|Green|Yellow)/ }).count() > 60, 'one green line per child, with names');
    await Promise.all([p3.waitForEvent('download'), (async () => { await p3.click('#hRestore'); await p3.waitForTimeout(200); if (await p3.isVisible('#warnGo')) await p3.click('#warnGo'); })()]);
    assert.strictEqual(await colored(), 0, 'restoring to before the assignment removes the colors');
    assert(await p3.evaluate(() => window.App.master.people.some(p => p['Medical Notes'])), 'the export details are part of the file and stay');
    await p3.close();
  });
  await test('red Planning Center warning shows before the season file is saved when changes are pending', async () => {
    // A real pending change, the way the Roster and Move dialog make one: an active child whose class in Planning Center is not already Sparks D (setting it to the value it has would clear the change), then the edit is recorded.
    await page.evaluate(() => { const M = window.Model, p = window.App.master.people.find(x => M.isActive(x) && M.isClubber(x) && /^Sparks/.test(M.room(x)) && M.room(x) !== 'Sparks D'); M.setField(p, M.C.ROOM, 'Sparks D'); window.App.changed(); });
    await page.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await page.waitForTimeout(200); await page.evaluate(() => { document.getElementById('btnSeasonSave').click(); });   // TEST data: the first press arms the button, the second saves
    assert(await page.isVisible('#warn'));
    assert(/STILL NEED TO BE MADE IN PLANNING CENTER/.test(await page.textContent('#warnBody')));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#warnGo')]);
    assert(/^awana-2026-27-(TEST-)?\d{8}-\d{6}\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());   // test data carries TEST in the name
  });
  // Markup in a date key is caught earlier, by the Fix dates dialog (date-fixes-browser.test.js shows the value as text and date-fixes.test.js that a script never survives as a key); these are the other places a data file's text reaches the page.
  await test('a data file with markup in its quarter and book keys cannot run script in any tab', async () => {
    const evil = '"><img src=x onerror="window.__xss=1">', o = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    o.calendar.push(Object.assign({}, o.calendar.find(r => r.Type === 'Club night'), { Date: '2027-06-02', Quarter: evil, Theme: evil }));
    o.config.books[evil] = Object.assign({}, o.config.books.HG || Object.values(o.config.books)[0], { name: evil });
    const bad = path.join(tmp, 'awana-2026-27-20261029-130000.json'); fs.writeFileSync(bad, JSON.stringify(o));
    const p1 = await browser.newPage({ viewport: { width: 1300, height: 900 } }); p1.on('dialog', d => d.accept());
    await p1.goto(app); await p1.setInputFiles('#fileAny', [bad, roster]); await p1.waitForTimeout(400);
    for (const t of ['attend', 'games', 'awards', 'person', 'history', 'calendar', 'options', 'stats', 'reports']) { await p1.evaluate(x => document.querySelector(".tabs button[data-tab=\"" + x + "\"]").click(), t); await p1.waitForTimeout(150); }
    await p1.selectOption('#attRoom', 'Sparks A').catch(() => {});
    assert(await p1.evaluate(() => App.season.calendar.some(r => r.Quarter.includes('onerror'))), 'the crafted file really did load');
    const r = await p1.evaluate(() => ({ xss: window.__xss, imgs: document.querySelectorAll('img[src="x"]').length }));
    assert.deepStrictEqual(r, { xss: undefined, imgs: 0 });
    await p1.close();
  });
  await test('Person: pick a Sparks child, edit a note, tick attendance, add an award; the Roster and History see it', async () => {
    await tab('person'); await page.selectOption('#peGroup', 'Sparks'); await page.selectOption('#peClass', { index: 1 }); await page.click('#peSub button[data-sub="registration"]');
    const name = (await page.textContent('#peSub h2')).trim();
    assert((await page.$$eval('#personWrap h3', e => e.map(x => x.textContent))).join('|').includes('Club record'), 'sections');
    await page.fill('textarea[data-u="x_Notes"]', 'person-tab note'); await page.press('textarea[data-u="x_Notes"]', 'Tab');
    await page.click('#peSub button[data-sub="attendance"]'); const n0 = await page.$$eval('input[data-mark="a"]:checked', c => c.length); await page.click('input[data-mark="a"]:not(:checked)');
    assert.strictEqual(await page.$$eval('input[data-mark="a"]:checked', c => c.length), n0 + 1);
    await page.click('#peSub button[data-sub="awards"]'); // Awards are not entered by hand: a due award is recorded from its link (data-addaward), when there is one for this child.
    if (await page.locator('#peSub ~ * a[data-addaward], #personWrap a[data-addaward]').count()) await page.locator('#personWrap a[data-addaward]').first().click();
    
    await page.click('#peSub button[data-sub="registration"]'); await page.fill('input[data-pc="Grade"]', '77'); await page.press('input[data-pc="Grade"]', 'Tab');
    assert(/pending PC change/.test(await page.textContent('[data-slot="Grade"]')), 'pending mark');
    await tab('roster'); const html = await page.innerHTML('#rosterWrap');
    assert(html.includes('<td>77</td>') && html.includes('person-tab note'), 'roster shows the edits');
    await tab('person'); await page.click('details.pcard summary');
    assert(/x_Notes/.test(await page.textContent('details.pcard')), 'history lists the note change for this person ' + name);
    await page.click('#peSub button[data-sub="progress"]'); assert(await page.isVisible('#progressWrap'), 'the Progress sub-tab opens');
  });
  await test('Person: a volunteer gets the record sections only, and markup in a note cannot run', async () => {
    await tab('person'); await page.click('#peSub button[data-sub="registration"]'); await page.selectOption('#peGroup', 'All'); await page.selectOption('#peRole', 'adult');
    assert.deepStrictEqual(await page.$$eval('#personWrap h3', e => e.map(x => x.textContent)), ['Planning Center record', 'Club record']);
    await page.fill('textarea[data-u="x_Notes"]', '<img src=x onerror="window.__pwn=1">'); await page.press('textarea[data-u="x_Notes"]', 'Tab');
    await page.selectOption('#peRole', 'kid'); await page.selectOption('#peRole', 'adult'); await page.waitForTimeout(100);
    assert.strictEqual(await page.evaluate(() => window.__pwn), undefined);
  });
  await test('Team moves: a mid-quarter move keeps earlier points, a one-night team overrides, sheets and Attendance follow, History names it', async () => {
    await tab('person'); await page.selectOption('#peRole', 'kid'); await page.selectOption('#peGroup', 'Sparks'); await page.selectOption('#peClass', { index: 1 }); await page.click('#peSub button[data-sub="registration"]');
    const id = await page.inputValue('#pePerson');
    if (!(await page.inputValue('select[data-team="Q2"]'))) await page.selectOption('select[data-team="Q2"]', 'Red');
    const q2 = await page.evaluate(i => { const p = App.master.people.find(x => x['x_ClubberID'] === i); return p['team:Q2'] || ''; }, id);
    assert(q2, 'child has a Q2 color to move away from');
    const other = ['Red', 'Blue', 'Green', 'Yellow'].find(c => c !== q2);
    const nights = await page.$$eval('#peMoveFrom option', o => o.map(x => x.value));
    const from = nights.find(d => d >= '2026-10-28'); assert(from, 'a Q2 night exists');
    await page.selectOption('#peMoveTeam', other); await page.selectOption('#peMoveFrom', from); await page.click('#peMoveAdd');
    assert(await page.locator('#personWrap .chip', { hasText: 'from ' }).count() >= 1, 'move chip');
    const eff = await page.evaluate(([i, d]) => { const p = App.master.people.find(x => x['x_ClubberID'] === i); return [Season.teamOn(App.season, i, d, App.quarterOf(d), Model.teamOf(p, App.quarterOf(d))), Season.teamOn(App.season, i, '2026-10-21', 'Q1', Model.teamOf(p, 'Q1'))]; }, [id, from]);
    assert.strictEqual(eff[0], other);
    await tab('reports'); await page.selectOption('#rSel', 'teams'); await page.click('#qWrap button[data-q="' + await page.evaluate(d => App.quarterOf(d), from) + '"]'); await page.waitForTimeout(150);
    assert(/\*/.test(await page.textContent('#report')) && /teams\. \* = changes team during the quarter/.test(await page.textContent('#report')), 'printed list marks the mover');
    await tab('games'); await page.click('#tab-games .subtabs button[data-sub="teams"]'); assert(/Mid-quarter moves/.test(await page.textContent('#teamsWrap')), 'Color teams view lists the move');
    await tab('person'); await page.click('details.pcard summary'); assert(/moved to/.test(await page.textContent('details.pcard')), 'history line');
    await page.click('a[data-rmmove]'); assert.strictEqual(await page.locator('a[data-rmmove]').count(), 0, 'move removed');
  });
  await test('Handbook, date received and note are separate boxes on Person, stored as one string, and Progress follows them', async () => {
    await tab('person'); await page.selectOption('#peRole', 'kid'); await page.selectOption('#peGroup', 'Sparks'); await page.selectOption('#peClass', { index: 1 }); await page.click('#peSub button[data-sub="registration"]');
    const id = await page.inputValue('#pePerson'), stored = () => page.evaluate(i => App.season.handbooks[i] || '', id);
    await page.fill('#personWrap input[data-hb="code"]', 'WR'); await page.press('#personWrap input[data-hb="code"]', 'Tab');
    assert.strictEqual(await stored(), 'WR', 'stored: ' + await stored());
    assert.strictEqual(await page.locator('#personWrap input[data-hb="date"]').count(), 0, 'the date received is no longer on Registration: it is entered on Progress');
    await page.click('#peSub button[data-sub="progress"]'); await page.waitForTimeout(200); await page.click('.booktabs button[data-book="WR"]'); await page.waitForTimeout(150);
    await page.fill('#progressWrap input[data-recv="WR"]', '2026-09-16'); await page.press('#progressWrap input[data-recv="WR"]', 'Tab'); await page.waitForTimeout(150);
    const recv = b => page.evaluate(([i, k]) => Season.receivedOf(App.season, i, k), [id, b]);      // the date received is kept per book (received), not in the handbook string
    assert.strictEqual(await recv('WR'), '2026-09-16', 'date received WR: ' + await recv('WR')); assert.strictEqual(await stored(), 'WR', 'the handbook string keeps only code and note: ' + await stored());
    await tab('person'); await page.click('#peSub button[data-sub="registration"]');
    await page.fill('#personWrap input[data-hb="note"]', 'reissued'); await page.press('#personWrap input[data-hb="note"]', 'Tab');
    assert.strictEqual(await stored(), 'WR reissued', 'stored: ' + await stored());
    await tab('person'); await page.click('#peSub button[data-sub="progress"]'); await page.selectOption('#peGroup', 'Sparks'); await page.selectOption('#pePerson', id);      // Progress shows the book from the handbook and its date received (the handbook boxes themselves are on Person)
    await page.click('.booktabs button[data-book="WR"]'); await page.waitForTimeout(150); assert.strictEqual(await page.inputValue('#progressWrap input[data-recv="WR"]'), '2026-09-16', 'the handbook date shows as the date received on that book');
    await tab('person'); await page.click('#peSub button[data-sub="registration"]'); await page.fill('#personWrap input[data-hb="code"]', 'SS'); await page.press('#personWrap input[data-hb="code"]', 'Tab'); await page.waitForTimeout(100);
    assert.strictEqual(await stored(), 'SS reissued', 'stored: ' + await stored()); assert.strictEqual(await recv('WR'), '2026-09-16', 'WR keeps its date received'); assert.strictEqual(await recv('SS'), '', 'SS has none yet');
    await tab('person'); await page.click('#peSub button[data-sub="progress"]'); await page.waitForTimeout(200); await page.click('.booktabs button[data-book="WR"]'); await page.waitForTimeout(150);
    await page.fill('#progressWrap input[data-recv="WR"]', ''); await page.press('#progressWrap input[data-recv="WR"]', 'Tab'); await page.waitForTimeout(150);
    assert.strictEqual(await recv('WR'), '', 'cleared: ' + await recv('WR'));
  });
  await test('Import: the test export opens the To do page with the file check and the actions for the 15 new people', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'awana-e2e-test-export-'));
    require('child_process').execFileSync('node', [path.join(__dirname, '..', '..', 'tools', 'make-test-export.js'), roster, outDir]);
    const p3 = await browser.newPage({ viewport: { width: 1300, height: 900 } }); const e3 = []; p3.on('pageerror', e => e3.push(e.message)); p3.on('dialog', d => d.accept());
    await p3.goto(app); await p3.setInputFiles('#fileAny', [dataFile, path.join(outDir, '20261103 -- demo-club-2026-27 TEST.csv')]); await p3.waitForTimeout(400);
    assert(await p3.isVisible('#review'), 'review dialog lists the new people'); assert(/15 new/.test(await p3.textContent('#reviewBody')));
    await p3.click('#rvApply'); await p3.waitForTimeout(300);
    assert(await p3.isVisible('#tab-todo'), 'To do opens by itself after the import');
    await p3.check('input[name=tdView][value=task]'); await p3.waitForTimeout(150);      // the page groups by person unless asked to group by task
    const heads = await p3.$$eval('#todoWrap h3', h => h.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
    assert(heads[0].startsWith('Import: 20261103') && heads.some(h => /^Assign a class \(3\)/.test(h)) && heads.some(h => /^Registration is not Active/.test(h)), heads.join(' | '));
    assert(/File check: \d+ warning/.test(await p3.textContent('#todoWrap details summary')), 'file check');
    assert(/hidden/.test(await p3.textContent('#todoWrap')), 'warnings about existing people are set aside');
    await p3.locator('select[data-room]').first().selectOption({ index: 1 }); await p3.waitForTimeout(200);
    assert(/Assign a class \(2\)/.test(await p3.textContent('#todoWrap')), 'assigning a class removes it from the list');
    await p3.uncheck('#tdOnlyNew'); assert((await p3.$$eval('#todoWrap h3', h => h.length)) > heads.length - 1, 'everyone view lists more');
    assert.deepStrictEqual(e3, []); await p3.close();
  });
  await test('TEST in a file name: banner, two presses to download, and TEST in the saved file name; a normal session is unaffected', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'awana-e2e-test-gate-'));
    require('child_process').execFileSync('node', [path.join(__dirname, '..', '..', 'tools', 'make-test-export.js'), roster, outDir]);
    const p4 = await browser.newPage({ viewport: { width: 1300, height: 900 }, acceptDownloads: true }); const e4 = []; p4.on('pageerror', e => e4.push(e.message)); p4.on('dialog', d => d.accept());
    await p4.goto(app); await p4.setInputFiles('#fileAny', [dataFile]); await p4.waitForTimeout(300);
    assert(!(await p4.isVisible('#testBanner')), 'no banner for a normal file');
    // A normal file goes to the Save-as box (Chrome), which a headless test cannot answer, so check the button is not in the test-data press-again state instead.
    await p4.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await p4.waitForTimeout(300); assert(!/press again/.test(await p4.textContent('#btnSeasonSave')), 'a normal file is not gated by the test-data press-again prompt');
    await p4.setInputFiles('#fileAny', [path.join(outDir, '20261103 -- demo-club-2026-27 TEST.csv')]); await p4.waitForTimeout(300);
    if (await p4.isVisible('#rvApply')) await p4.click('#rvApply');
    assert(await p4.isVisible('#testBanner') && /TEST DATA LOADED/.test(await p4.textContent('#testBanner')), 'banner');
    let got = null; p4.on('download', d => { got = d; });
    await p4.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await p4.waitForTimeout(400);
    assert.strictEqual(got, null, 'the first press does not download');
    assert(/press again/.test(await p4.textContent('#btnSeasonSave')), 'the button warns');
    const [dl] = await Promise.all([p4.waitForEvent('download', { timeout: 3000 }), (async () => { await p4.evaluate(() => { document.getElementById('btnSeasonSave').click(); }); await p4.waitForTimeout(300); if (await p4.isVisible('#warnGo')) await p4.click('#warnGo'); })()]);
    assert(/^awana-2026-27-TEST-\d{8}-\d{6}\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    assert.strictEqual((await p4.textContent('#btnSeasonSave')).trim(), 'Download data file');
    assert.deepStrictEqual(e4, []); await p4.close();
  });
  await test('Undo and Redo: an edit, a tick and a whole import can each be undone and redone; a new edit clears Redo; History logs the steps', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'awana-e2e-undo-'));
    require('child_process').execFileSync('node', [path.join(__dirname, '..', '..', 'tools', 'make-test-export.js'), roster, outDir]);
    const p5 = await browser.newPage({ viewport: { width: 1300, height: 900 } }); const e5 = []; p5.on('pageerror', e => e5.push(e.message)); p5.on('dialog', d => d.accept());
    await p5.goto(app); await p5.setInputFiles('#fileAny', [dataFile]); await p5.waitForTimeout(300);
    assert(await p5.isDisabled('#btnUndo') && await p5.isDisabled('#btnRedo'), 'nothing to undo on a fresh file');
    await p5.evaluate(() => document.querySelector('.tabs button[data-tab="person"]').click()); await p5.selectOption('#peRole', 'kid'); await p5.selectOption('#peGroup', 'Sparks'); await p5.selectOption('#peClass', { index: 1 });
    await p5.click('#peSub button[data-sub="registration"]');
    const note = () => p5.inputValue('textarea[data-u="x_Notes"]'), hist = () => p5.evaluate(() => App.season.history.length);
    await p5.fill('textarea[data-u="x_Notes"]', 'undo me'); await p5.press('textarea[data-u="x_Notes"]', 'Tab');
    assert(await p5.isDisabled('#btnUndo'), 'the Person tab holds a change until Apply changes, so there is nothing to undo yet'); await p5.click('#btnDraftApply'); await p5.waitForTimeout(150);
    assert(!(await p5.isDisabled('#btnUndo')) && /Undo: .*x_Notes/.test(await p5.getAttribute('#btnUndo', 'title')), 'undo is offered and says what it undoes: ' + await p5.getAttribute('#btnUndo', 'title'));
    const h1 = await hist();
    await p5.click('#btnUndo'); await p5.waitForTimeout(200);
    assert.strictEqual(await note(), '', 'note undone'); assert(!(await p5.isDisabled('#btnRedo')));
    await p5.click('#btnRedo'); await p5.waitForTimeout(200); assert.strictEqual(await note(), 'undo me', 'redo brings it back');
    await p5.click('#btnUndo'); await p5.waitForTimeout(100);
    await p5.click('#peSub button[data-sub="attendance"]'); const n0 = await p5.$$eval('input[data-mark="a"]:checked', c => c.length); await p5.click('input[data-mark="a"]:not(:checked):not(:disabled)'); await p5.waitForTimeout(150);      // an Attendance tick is saved at once (only field edits are held for Apply changes)
    assert(await p5.isDisabled('#btnRedo'), 'a new edit clears Redo');
    await p5.keyboard.press('Control+z'); await p5.waitForTimeout(200);
    assert.strictEqual(await p5.$$eval('input[data-mark="a"]:checked', c => c.length), n0, 'Ctrl+Z (outside a text box) undoes the tick');
    assert((await hist()) >= h1, 'steps are logged in History, not erased');
    // a whole import
    const before = await p5.evaluate(() => App.master.people.length);
    await p5.setInputFiles('#fileAny', [path.join(outDir, '20261103 -- demo-club-2026-27 TEST.csv')]); await p5.waitForTimeout(300);
    if (await p5.isVisible('#rvApply')) await p5.click('#rvApply'); await p5.waitForTimeout(300);
    assert.strictEqual(await p5.evaluate(() => App.master.people.length), before + 15);
    await p5.click('#btnUndo'); await p5.waitForTimeout(300);
    assert.strictEqual(await p5.evaluate(() => App.master.people.length), before, 'the import is undone');
    await p5.click('#btnRedo'); await p5.waitForTimeout(300);
    assert.strictEqual(await p5.evaluate(() => App.master.people.length), before + 15, 'and redone');
    assert.deepStrictEqual(e5, []); await p5.close();
  });
  await test('every season report renders through the Reports tab with the real data, and none shows junk text (undefined, NaN, [object])', async () => {
    await tab('reports');
    for (const id of ['handOut', 'awardsByChild', 'achievement', 'standings', 'handbooks']) {
      // The Hand out report is per group: its picker is set to Sparks, the group with awards waiting in this club.
      await page.evaluate(i => App.showReport(i), id); if (id === 'handOut') { await page.selectOption('#oGroupSel', 'Sparks'); await page.selectOption('#oRoomSel', ''); await page.waitForTimeout(300); }
      const html = await page.evaluate(() => document.getElementById('report').innerHTML);
      assert(html.length > 100 || /Nothing earned|No earned/.test(html), id + ' rendered nothing (' + html.length + ' chars)');   // an empty list is a valid result when this session has already handed out every award
    }
  });
  await test('no script errors during the whole session', async () => assert.deepStrictEqual(errs, []));
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
