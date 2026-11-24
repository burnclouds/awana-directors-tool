// Exercise the save queue and the real Drive adapter with an in-memory HTTP transport.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Drive = require('../drive.js'), Season = require('../season.js'), Calendar = require('../calendar.js');
const CalendarSafety = require('../calendar-safety.js'), DataMerge = require('../datamerge.js');

async function racingSave(when, moveHead = '') {
  const date = '2040-09-05', base = Season.blank('2040-41');
  base.calendar = [Object.assign(Calendar.blank(), { Date: date, Quarter: 'Q1' })];
  base.config.clubTitle = 'Base';
  const remote = Season.fromJson(Season.toJson(base));
  remote.attendance[date] = { child: { a: 1 } };
  remote.config.clubTitle = 'Other';
  const local = Season.fromJson(Season.toJson(base)), uploads = [], calls = [], reads = [];
  let revision = 'r1', heads = 0, ordinaryReviews = 0, calendarReviews = 0;
  const twice = when === 'two ignored conditions';
  const editAfterReview = when === 'changed plan';
  const ignore = twice || when === 'ignored condition';
  const conflict = !ignore && !editAfterReview && when !== 'no conflicts';
  const retained = new Set(), contents = new Map([['r1', base], ['r2', remote]]);
  function advanceHead() {
    const changed = Season.fromJson(Season.toJson(remote));
    changed.config.clubTagline = 'Updated';
    revision = 'r3';
    contents.set(revision, changed);
  }
  const env = {
    loadScript: async () => {},
    google: () => ({ accounts: { oauth2: { initTokenClient: options => ({
      requestAccessToken: () => options.callback({ access_token: 'fake', expires_in: 3600 })
    }) } } }),
    fetch: async (url, init) => {
      calls.push(url);
      if (url.includes('/upload/')) {
        if (revision === 'r1' && (when === 'during write' || ignore)) revision = 'r2'; // Another client commits during our first write.
        if (twice && revision === 'r3') {
          const concurrent = Season.fromJson(Season.toJson(contents.get(revision)));
          concurrent.config.clubTagline = 'Second writer';
          revision = 'r4';
          contents.set(revision, concurrent);
        }
        if (!ignore && init.headers['If-Match'] !== JSON.stringify(revision)) return new Response('{}', { status: 412 });
        const json = init.body.split('\r\n\r\n')[2].split('\r\n--')[0];
        uploads.push(Season.fromJson(json));
        revision = 'r' + (Number(revision.slice(1)) + 1);
        contents.set(revision, uploads.at(-1));
        return Response.json({ id: 'file', title: 'club.json', headRevisionId: revision });
      }
      const historical = /\/revisions\/(r\d+)/.exec(url)?.[1];
      if (historical && init.method === 'PATCH') { retained.add(historical); return Response.json({}); }
      if (url.includes('alt=media')) {
        if (historical) assert(retained.has(historical));
        reads.push(historical || revision);
        return new Response(Season.toJson(contents.get(historical || revision)));
      }
      if (url.includes('/revisions?')) return Response.json({ revisions: Array.from({ length: Number(revision.slice(1)) }, (_, i) => ({ id: 'r' + (i + 1) })) });
      if (url.includes('/v2/') && ++heads === 2 && (when === 'before write' || when === 'no conflicts' || editAfterReview)) revision = 'r2';
      return Response.json({ headRevisionId: revision, etag: JSON.stringify(revision) });
    }
  };
  const adapter = Drive.create({ clientId: 'fake', apiKey: 'fake' }, env);
  await adapter.connect();
  const element = { after() {}, addEventListener() {}, setAttribute() {}, removeAttribute() {}, style: { setProperty() {} },
    classList: { toggle() {}, add() {}, remove() {} } };
  element.parentElement = element;
  const App = { season: local, onRefresh: [], testFiles: () => [], editSeq: () => 1, today: () => date,
    mergeNames: () => ({}), flash() {}, openSeason() {},
    mergeScreen: async plan => {
      ordinaryReviews++;
      assert.equal(plan.conflicts.length, conflict ? 1 : 0);
      if (!conflict) return { choices: {} };
      return { choices: { [plan.conflicts[0].id]: { pick: 'other' } } };
    },
    reviewCalendar: async (mine, other, merged, impacts) => {
      calendarReviews++;
      if (editAfterReview && calendarReviews === 1) return null;
      if (calendarReviews === 1 && moveHead === 'after approval') advanceHead();
      assert.equal(uploads.length, ignore ? 1 : 0);
      assert.equal(merged.config.clubTitle, conflict ? 'Local' : 'Other');
      assert.deepEqual(impacts.map(i => i.date), [date]);
      return CalendarSafety.reviewedCalendar(merged, CalendarSafety.reviewDates(mine, other, impacts), { [date]: 'other' });
    }
  };
  const context = { App, Season, CalendarSafety, DataMerge, Drive: { create: () => adapter }, AwanaDriveConfig: {},
    document: { createElement: () => ({}), addEventListener() {}, getElementById: () => element }, setTimeout() {}, clearTimeout() {} };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(require.resolve('../app-drive.js'), 'utf8'), context);
  App.driveHandoff.set({ save: true, cur: { id: 'file', name: 'club.json', rev: 'r1' } });
  local.calendar = [];
  if (conflict) local.config.clubTitle = 'Local';
  const save = auto => App.driveSave.go('club.json', Season.toJson(local), 'application/json', { auto, seq: 1 });
  await assert.rejects(save(true), e => e.kind === 'calendar');
  assert.equal(uploads.length, ignore ? 1 : 0);
  assert.equal(App.driveSave.waiting().kind, 'calendar');
  assert.equal(calls.filter(url => url.includes('/upload/')).length, when === 'during write' || ignore ? 1 : 0);
  const count = calls.length;
  await assert.rejects(save(true), e => e.kind === 'calendar');
  assert.equal(calls.length, count, 'subsequent autosaves wait without network calls');
  if (moveHead === 'before manual') advanceHead();
  if (editAfterReview) {
    await assert.rejects(save(false), e => e.kind === 'calendar');
    local.config.clubTagline = 'Changed locally';
  }
  await save(false);
  assert.equal(ordinaryReviews, moveHead === 'after approval' || twice || editAfterReview ? 2 : 1);
  assert.equal(calendarReviews, moveHead === 'after approval' || editAfterReview ? 2 : 1);
  assert.deepEqual(reads, editAfterReview ? ['r2', 'r2', 'r2', 'r2'] : twice ? ['r2', 'r2', 'r2', 'r4'] : moveHead === 'after approval' ? ['r2', 'r2', 'r3', 'r3'] : ['r2', moveHead ? 'r3' : 'r2', moveHead ? 'r3' : 'r2'], 'auto, manual review, fresh merge after review');
  assert.equal(uploads.length, twice ? 3 : ignore ? 2 : 1);
  assert.deepEqual(uploads.at(-1).attendance, remote.attendance);
  assert.deepEqual(uploads.at(-1).calendar, remote.calendar);
  assert.equal(uploads.at(-1).config.clubTitle, conflict ? 'Local' : 'Other');
  if (editAfterReview) assert.equal(uploads.at(-1).config.clubTagline, 'Changed locally');
  if (twice) assert.equal(uploads.at(-1).config.clubTagline, 'Second writer');
  if (moveHead) assert.equal(uploads.at(-1).config.clubTagline, 'Updated');
  assert.equal(App.driveSave.waiting(), null);
}

test('a revision visible before upload blocks autosave without sending a body until review', () => racingSave('before write'));
test('a revision arriving during the conditional write survives in the first accepted upload', () => racingSave('during write'));

test('an ignored If-Match recovers the overwritten revision and saves the reviewed merge', () => racingSave('ignored condition'));
test('paused autosave still shows the manual summary with zero ordinary conflicts', () => racingSave('no conflicts'));
test('manual review opens for a new head after the autosave pause', () => racingSave('no conflicts', 'before manual'));
test('a head change after manual summary approval requires another summary and calendar review', () => racingSave('no conflicts', 'after approval'));
test('a second ignored condition during repair preserves both displaced edits', () => racingSave('two ignored conditions'));
test('a changed plan at the same revision requires a new summary after a cancelled calendar review', () => racingSave('changed plan'));

test('Drive save explanations preserve recovery messages and acknowledge uncertainty', () => {
  const element = { after() {}, addEventListener() {}, setAttribute() {}, removeAttribute() {},
    style: { setProperty() {} }, classList: { toggle() {}, add() {}, remove() {} } };
  element.parentElement = element;
  const messages = [], warning = 'The earlier save check for club.json could not be read. Reopen the file from Drive before saving.';
  const App = { onRefresh: [], flash: (message, level) => messages.push([message, level]) };
  const context = { App, Drive: { create: () => ({ configured: () => true, unreadableWarnings: () => [warning] }) }, AwanaDriveConfig: {},
    document: { createElement: () => ({}), addEventListener() {}, getElementById: () => element } };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(require.resolve('../app-drive.js'), 'utf8'), context);
  assert.deepEqual(messages, [[warning, 'warn']]);
  for (const kind of ['pending', 'lagging']) {
    assert.equal(App.driveSave.explain({ kind, message: 'Earlier save needs checking.' }), 'Earlier save needs checking.');
  }
  for (const kind of ['busy', 'offline']) {
    assert.doesNotMatch(App.driveSave.explain({ kind, pendingWrite: true }), /Nothing was changed/);
  }
});
