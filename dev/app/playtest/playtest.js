(this.AwanaVersions = this.AwanaVersions || {})['playtest.js'] = '1.0.0';
(function (root) {
  'use strict';

  const isDataName = name => /\.json(?:\.bak)?$/i.test(name);
  const fileName = name => name.endsWith('-playtest.json') ? name : name.replace(/\.json$/i, '') + '-playtest.json';

  async function openLocal(folder, original) {
    const name = fileName(original.name);
    let handle = original;
    if (name !== original.name) {
      try { handle = await folder.getFileHandle(name); }
      catch (err) { if (err.name !== 'NotFoundError') throw err; }
    }
    const file = await handle.getFile();
    return { name, lastModified: file.lastModified, text: () => file.text(), playtestSave: (text, backupName) => saveLocal(folder, backupName || name, text, name === original.name ? null : original) };
  }

  async function saveLocal(folder, name, text, original) {
    if (name !== fileName(name)) throw new Error('A playtest filename is required.');
    const handle = await folder.getFileHandle(name, { create: true });
    if (handle.name !== name || (original && await handle.isSameEntry(original))) throw new Error('Choose a separate playtest file.');
    const writer = await handle.createWritable({ mode: 'exclusive' });
    try { await writer.write(text); await writer.close(); }
    catch (err) { await writer.abort().catch(() => {}); throw err; }
    return true;
  }

  async function openDrive(drive, file, readFile = () => drive.read(file.id)) {
    const name = fileName(file.name), parent = file.parents[0];
    if (!parent) throw new Error('Google Drive did not provide the parent folder for ' + file.name + '.');
    const originalId = name === file.name ? null : file.id;
    const find = async name => {
      const sibling = await drive.findPlaytestFile(name, parent, file.driveId);
      if (sibling && sibling.id === originalId) throw new Error('The original Drive file was renamed. Open it again before saving.');
      return sibling;
    };
    const copy = originalId && await find(name);
    const opened = copy ? await drive.read(copy.id) : await readFile();
    if (opened.name !== (copy ? name : file.name) || !opened.parents.includes(parent)) throw new Error('The playtest file moved or was renamed. Open it again.');
    let revision = opened.name === name ? opened.revision : null;
    let copyId = opened.name === name ? opened.id : null;
    return {
      id: opened.id, name, lastModified: opened.lastModified, text: async () => opened.text,
      playtestSave: async (text, backupName, auto) => {
        if (auto && !drive.connected(300000)) throw new Error('Press Save to sign in to Google again.');
        const target = backupName || name;
        if (target !== fileName(target)) throw new Error('A playtest filename is required.');
        const sibling = await find(target);
        if (copyId && !backupName && sibling?.id !== copyId) throw new Error('The playtest copy moved or was renamed. Open it again before saving.');
        let saved;
        if (sibling) {
          const head = await drive.head(sibling.id);
          const current = await drive.meta(sibling.id);
          if (current.name !== target || !current.parents?.includes(parent) ||
              (!backupName && (!revision || revision !== head.headRevisionId))) {
            throw new Error('The playtest copy changed. Open it again before saving.');
          }
          saved = await drive.update(sibling.id, target, text, 'application/json', head.etag);
        } else {
          saved = await drive.save(target, text, 'application/json', parent);
        }
        if (!backupName) { copyId = saved.id; revision = saved.headRevisionId; }
        return true;
      }
    };
  }

  const api = { isDataName, fileName, openLocal, saveLocal, openDrive };
  if (typeof module !== 'undefined') module.exports = api;
  else {
    if (root.AwanaBuildChannel !== 'playtest') throw new Error('The playtest build channel is missing.');
    root.Playtest = api;
  }
})(this);
