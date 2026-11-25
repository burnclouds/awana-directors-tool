// Playtest data paths, using invented files in a temporary folder and a fake Drive.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { fileName, openLocal, openDrive } = require('../playtest/playtest.js');

const original = '{"invented":1}';
const edited = '{"invented":2}';
const baselineName = 'club.json';
const copyName = 'club-playtest.json';

async function local(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'awana-playtest-'));
  const read = name => fs.readFile(path.join(dir, name), 'utf8');
  const write = (name, text) => fs.writeFile(path.join(dir, name), text);
  const handle = name => ({
    name,
    isSameEntry: async other => other.name === name,
    getFile: async () => ({ text: async () => read(name) }),
    createWritable: async () => ({
      write: text => write(name, text),
      close: async () => {}
    })
  });
  const folder = {
    async getFileHandle(name, opts) {
      try { await fs.access(path.join(dir, name)); }
      catch (err) {
        if (err.code !== 'ENOENT') throw err;
        if (!opts?.create) throw Object.assign(err, { name: 'NotFoundError' });
        await write(name, '');
      }
      return handle(name);
    }
  };
  try {
    await write(baselineName, original);
    await run({ open: () => openLocal(folder, handle(baselineName)), read, write, names: () => fs.readdir(dir) });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function fakeDrive() {
  const parent = 'club-folder';
  const live = { id: 'original', name: baselineName, parents: [parent], driveId: 'shared-drive', text: original, revision: '1' };
  const files = new Map([[live.id, live]]);
  const writes = [], reads = [];
  const read = async id => { reads.push(id); return { ...files.get(id) }; };
  const drive = {
    async findPlaytestFile(name, folder, driveId) {
      assert.equal(folder, parent);
      assert.equal(driveId, live.driveId);
      return [...files.values()].find(f => f.name === name && f.parents.includes(folder));
    },
    read,
    meta: read,
    head: async id => ({ etag: '"current"', headRevisionId: files.get(id).revision }),
    async save(name, text, mime, folder) {
      writes.push(['create', name, folder]);
      const file = { id: 'copy', name, text, parents: [folder], revision: '1' };
      files.set(file.id, file);
      return { id: file.id, headRevisionId: file.revision };
    },
    async update(id, name, text, mime, etag) {
      assert.equal(etag, '"current"');
      writes.push(['update', id, name]);
      const file = files.get(id);
      Object.assign(file, { name, text, revision: '2' });
      return { id, headRevisionId: file.revision };
    }
  };
  return { open: () => openDrive(drive, live), files, live, writes, reads, parent };
}

async function loadScript(context, name, playtest) {
  const source = await fs.readFile(path.join(__dirname, '..', name), 'utf8');
  const channelSource = playtest
    ? source.replace(/\/\* PLAYTEST: (.*?) \*\//g, '$1')
    : source.replace(/^ *\/\/ BEGIN PLAYTEST\n[^]*?^ *\/\/ END PLAYTEST\n/gm, '').replace(/ \/\* PLAYTEST: .*? \*\//g, '');
  vm.runInContext(channelSource, context, { filename: name });
}

function appContext(storage, playtest) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id, hidden: true, options: [], listeners: {},
        addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
        setAttribute() {}, querySelectorAll: () => [], replaceChildren() {}, appendChild() {},
        classList: { add() {}, remove() {}, toggle() {} }, style: { setProperty() {} }
      });
    }
    return elements.get(id);
  }
  const context = vm.createContext({
    localStorage: storage,
    Model: require('../model.js'),
    Calendar: require('../calendar.js'),
    Reports: { esc: String, LIST: [], bundlesOf: () => [] },
    navigator: {},
    document: {
      getElementById: element, querySelector: element, querySelectorAll: () => [], createElement: () => ({ replaceChildren() {}, appendChild() {} }),
      documentElement: element('html'), body: { children: [] }, addEventListener() {}
    },
    MutationObserver: class { observe() {} },
    Element: class {},
    addEventListener() {}, setTimeout() {}, clearTimeout() {}, cancelAnimationFrame() {}, requestAnimationFrame() {}
  });
  if (playtest) context.Playtest = require('../playtest/playtest.js');
  context.window = context;
  return context;
}

let passed = 0, failed = 0;
async function test(name, run) {
  try { await run(); passed++; console.log('  ok   ' + name); }
  catch (err) { failed++; console.error('  FAIL ' + name, err); }
}

(async () => {
  await test('appends the playtest suffix once and only removes the final .json', () => {
    assert.equal(fileName('awana-2026-27.json'), 'awana-2026-27-playtest.json');
    assert.equal(fileName('x-playtest.json'), 'x-playtest.json');
    assert.equal(fileName('x.json.bak'), 'x.json.bak-playtest.json');
  });
  await test('local open without a sibling reads the original without creating or writing anything', () => local(async files => {
    const opened = await files.open();
    assert.equal(opened.name, copyName);
    assert.equal(await opened.text(), original);
    assert.deepEqual(await files.names(), [baselineName]);
    assert.equal(await files.read(baselineName), original);
  }));
  await test('local open prefers the sibling and only the sibling is changed on subsequent saves', () => local(async files => {
    const opened = await files.open();
    await opened.playtestSave(edited);
    assert.equal(await files.read(copyName), edited);
    const reopened = await files.open();
    assert.equal(await reopened.text(), edited);
    await reopened.playtestSave('{"invented":3}');
    assert.equal(await files.read(copyName), '{"invented":3}');
    assert.equal(await files.read(baselineName), original);
  }));
  await test('Drive fallback opens the original without a write and creates the copy in the same parent', async () => {
    const { open, files, writes, parent, live } = fakeDrive();
    files.set('elsewhere', { name: copyName, parents: ['other-folder'], text: 'wrong' });
    const opened = await open();
    assert.equal(opened.name, copyName);
    assert.equal(await opened.text(), original);
    assert.deepEqual(writes, []);
    await opened.playtestSave(edited);
    assert.deepEqual(writes, [['create', copyName, parent]]);
    assert.equal(live.text, original);
    assert.equal(files.get('copy').text, edited);
  });
  await test('Drive opens the sibling directly and updates its ID only', async () => {
    const { open, files, reads, writes, parent, live } = fakeDrive();
    files.set('copy', { id: 'copy', name: copyName, parents: [parent], text: edited, revision: '1' });
    const opened = await open();
    assert.deepEqual(reads, ['copy']);
    assert.equal(await opened.text(), edited);
    await opened.playtestSave('{"invented":3}');
    assert.deepEqual(writes, [['update', 'copy', copyName]]);
    assert.equal(live.text, original);
  });
  await test('Drive refuses to update the original ID if somebody renames it to the playtest name', async () => {
    const { open, live, writes } = fakeDrive();
    const opened = await open();
    live.name = copyName;
    await assert.rejects(() => opened.playtestSave(edited), /original Drive file was renamed/);
    assert.deepEqual(writes, []);
    assert.equal(live.text, original);
  });
  await test('Drive refuses to overwrite a playtest copy changed after open', async () => {
    const { open, files, writes, parent } = fakeDrive();
    files.set('copy', { id: 'copy', name: copyName, parents: [parent], text: original, revision: '1' });
    const opened = await open();
    files.get('copy').revision = '2';
    await assert.rejects(() => opened.playtestSave(edited), /playtest copy changed/);
    assert.deepEqual(writes, []);
  });

  await test('READABLE export preserves the playtest copy and App.download saves only to that copy', async () => {
    const Season = require('../season.js');
    const season = Season.blank('2026-27');
    const before = Season.toJson(season);
    const { open, files, writes, parent, live } = fakeDrive();
    live.text = before;
    files.set('copy', { id: 'copy', name: copyName, parents: [parent], text: before, revision: '1' });
    const context = appContext({ removeItem() {} }, true);
    await loadScript(context, 'app.js', true);
    const { App, document } = context;
    const messages = [];
    App.ask = { alert: message => messages.push(message) };
    App.openSeason = text => { App.season = Season.fromJson(text); return true; };
    await App.openFiles([await open()]);
    assert.equal(App.openedName, copyName);
    await loadScript(context, 'app-tools.js', true);

    const target = { id: 'dbgReadable', closest: () => null };
    for (const click of document.getElementById('debugWrap').listeners.click) await click({ target });
    assert.deepEqual(messages, ['READABLE export is disabled in playtest.']);
    assert.equal(files.get('copy').text, before);
    assert.deepEqual(writes, []);

    App.season.config.clubTitle = 'Invented Club';
    const after = Season.toJson(App.season);
    assert.equal(await App.download('awana-' + App.season.year + '.json', after, 'application/json', { auto: false }), true);
    assert.deepEqual(writes, [['update', 'copy', copyName]]);
    assert.deepEqual(writes.filter(([, id]) => id === live.id), []);
    assert.equal(files.get('copy').text, after);
    assert.equal(live.text, before);
  });

  await test('merge Export local copy is disabled in playtest and preserves the playtest copy', async () => {
    const Season = require('../season.js');
    const before = Season.toJson(Season.blank('2026-27'));
    const { open, files, writes, parent } = fakeDrive();
    files.set('copy', { id: 'copy', name: copyName, parents: [parent], text: before, revision: '1' });
    const context = appContext({ removeItem() {} }, true);
    context.Season = Season;
    context.CalendarSafety = require('../calendar-safety.js');
    await loadScript(context, 'app.js', true);
    const { App, document } = context;
    App.openSeason = text => { App.season = Season.fromJson(text); return true; };
    await App.openFiles([await open()]);
    App.season.config.clubTitle = 'Invented Club';
    App.snapshotJson = () => Season.toJson(App.season);

    const messages = [];
    const exportButton = {
      disabled: false,
      insertAdjacentText(position, message) { messages.push([position, message.trim()]); }
    };
    const panel = {
      setAttribute() {}, showModal() {}, close() {}, remove() {},
      querySelector: selector => selector === '[data-export]' ? exportButton : {},
      querySelectorAll: () => []
    };
    document.createElement = () => panel;
    document.body.appendChild = () => {};
    await loadScript(context, 'app-merge.js', true);
    const review = App.reviewCalendar(App.season, App.season, App.season, [], 'the other copy');
    assert.match(panel.innerHTML, /<button data-export>Export local copy<\/button>/);
    assert.equal(exportButton.disabled, true);
    assert.deepEqual(messages, [['afterend', 'Export is disabled in playtest.']]);
    assert.equal(files.get('copy').text, before);
    assert.deepEqual(writes, []);
    panel.oncancel({ preventDefault() {} });
    await review;
  });

  await test('each channel cleans up its own settings and writes only its own pending keys', async () => {
    const retired = ['awana.settings', 'awana-drive-style', 'awana-drive-keepname', 'awana-drive-dirs',
      'awana-updates', 'awana-autosave', 'awana-todo-view', 'awana-att-hold', 'awana-trail-folded'];
    const pending = 'awana-drive-pending';
    const keys = [...retired, pending, pending + '-corrupt'];
    for (const playtest of [true, false]) {
      const prefix = playtest ? 'playtest:' : '';
      const other = playtest ? '' : 'playtest:';
      const values = new Map(keys.flatMap(key => [[prefix + key, 'invalid'], [other + key, 'untouched']]));
      values.set(prefix + pending + '-corrupt', '[]');
      const reads = [];
      const storage = {
        getItem: key => { reads.push(key); return values.get(key) ?? null; },
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key)
      };
      const context = appContext(storage, playtest);
      await loadScript(context, 'app.js', playtest);
      await loadScript(context, 'drive.js', playtest);
      context.Drive.create({});
      assert.deepEqual(reads, [prefix + pending, prefix + pending + '-corrupt']);
      for (const key of retired) assert.equal(values.has(prefix + key), false, key);
      assert.equal(values.get(prefix + pending), '[]');
      assert.equal(JSON.parse(values.get(prefix + pending + '-corrupt'))[0].raw, 'invalid');
      for (const key of keys) assert.equal(values.get(other + key), 'untouched', key);
    }
  });

  console.log(passed + ' passed, ' + failed + ' failed');
  process.exitCode = failed ? 1 : 0;
})();
