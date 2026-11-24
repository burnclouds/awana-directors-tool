(this.AwanaVersions = this.AwanaVersions || {})['drive.js'] = '1.3.5';
// Optional Google Drive access, for people whose files are in Drive but who do not have the Drive folder on their computer.
// Nothing here runs until the person presses a Drive button, and Google's scripts are loaded then, not before. Only files the person
// picks (and files this app creates) are reachable: the scope is drive.file. save() always makes a NEW file; update() replaces the content of one file this app was given
// (Drive keeps the earlier versions as revisions). Nothing is ever deleted.
//   const d = Drive.create(config, env)    env is for tests: { fetch, loadScript, google, gapi }
//   d.configured()  d.preload()  d.pick('files'|'folder', { parent, title }) -> [{id,name,mimeType}]   parent = the Drive folder the picker opens in  d.read(id) -> {name,text,lastModified,parents}
//   d.save(name, textOrBytes, mime, folderId) -> {id,name,parents,headRevisionId}  d.meta(id) -> {id,name,parents}  d.disconnect()
//   d.head(id) -> {id,etag,headRevisionId}  d.update(id, name, text, mime, etag) -> same  d.revisions(id) -> [{id,modifiedTime,keepForever}] oldest first
//   d.readRevision(id, revisionId) -> text  d.pin(id, revisionId) keeps that revision forever (Drive otherwise drops unpinned ones after 30 days or 100 newer ones)
//   pick opts: parent (open the picker in this folder), selected (an id to have ticked when it opens), title
(function (root) {
  const SCOPE = 'https://www.googleapis.com/auth/drive.file', FILES = 'https://www.googleapis.com/drive/v3/files', UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  const GSI = 'https://accounts.google.com/gsi/client', GAPI = 'https://apis.google.com/js/api.js', FOLDER = 'application/vnd.google-apps.folder';

  // kind (N9 point 9): signin | folder | busy | offline | other. Set from the HTTP status or the cause; message stays the technical text for the log.
  class DriveError extends Error { constructor(msg, status, kind) { super(msg); this.name = 'DriveError'; this.status = status || 0; this.kind = kind || (status === 401 ? 'signin' : (status === 403 || status === 404) ? 'folder' : [429, 500, 502, 503, 504].includes(status) ? 'busy' : 'other'); } }

  const loading = new Map();
  const defaultLoad = src => {
    if (!loading.has(src)) loading.set(src, new Promise((ok, bad) => {
      const s = document.createElement('script'); s.src = src; s.async = true; s.onload = ok; s.onerror = () => { loading.delete(src); bad(new DriveError('Could not reach Google (' + src.split('/')[2] + '). Is this computer online?')); };
      document.head.appendChild(s);
    }));
    return loading.get(src);
  };

  function create(cfg, env) {
    env = env || {};
    const doFetch = env.fetch || ((u, i) => root.fetch(u, i)), loadScript = env.loadScript || defaultLoad, google = env.google || (() => root.google), gapi = env.gapi || (() => root.gapi);
    const now = env.now || Date.now;      // env.now: a test clock
    let token = null, expires = 0;
    const configured = () => !!(cfg && cfg.clientId && cfg.apiKey);
    const need = () => { if (!configured()) throw new DriveError('Google Drive is not set up in this copy of the app (see drive-config.js).'); };

    // Load Google's sign-in script ahead of the click that needs it, so the sign-in window opens straight from the person's click.
    async function preload() { need(); await loadScript(GSI); await loadScript(GAPI); }

    async function connect() {
      need();
      if (token && now() < expires - 60000) return token;
      await loadScript(GSI);
      return new Promise((ok, bad) => {
        const client = google().accounts.oauth2.initTokenClient({
          client_id: cfg.clientId, scope: SCOPE,
          callback: r => { if (r.error) bad(new DriveError(r.error_description || r.error)); else { token = r.access_token; expires = now() + (+r.expires_in || 3600) * 1000; ok(token); } },
          error_callback: e => bad(new DriveError('Sign-in did not finish' + (e && (e.message || e.type) ? ' (' + (e.message || e.type) + ')' : '') + '.', 0, 'signin')),
        });
        client.requestAccessToken({ prompt: '' });
      });
    }

    async function api(url, init) {
      const t = await connect(); let r; try { r = await doFetch(url, Object.assign({}, init, { headers: Object.assign({ Authorization: 'Bearer ' + t }, init && init.headers) })); } catch (e) { if (e instanceof TypeError) throw new DriveError('Could not reach Google Drive: the network request failed.', 0, 'offline'); throw e; }
      if (r.ok) return r;
      let why = ''; try { why = (await r.json()).error.message || ''; } catch (e) { /* no detail */ }
      if (r.status === 401) token = null;
      throw new DriveError('Google Drive said ' + r.status + (why ? ': ' + why : '') + '.', r.status);
    }

    // The person picks in Google's own window; the app only learns about what was picked. [] when cancelled.
    async function pick(kind, opts) {
      opts = opts || {};
      need();
      const t = await connect(); await loadScript(GAPI);
      await new Promise((ok, bad) => gapi().load('picker', { callback: ok, onerror: () => bad(new DriveError('Google\'s file picker would not load.')) }));
      const g = google().picker, folder = kind === 'folder';
      const view = folder ? new g.DocsView(g.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes(FOLDER) : new g.DocsView(g.ViewId.DOCS).setIncludeFolders(true);
      if (opts.parent && view.setParent) view.setParent(opts.parent);      // start in that folder (a folder the person has picked before is reachable)
      return new Promise(ok => {
        const b = new g.PickerBuilder().addView(view).setOAuthToken(t).setDeveloperKey(cfg.apiKey).setTitle(opts.title || (folder ? 'Choose the folder to save into' : 'Choose the files to import'))
          .setCallback(d => { if (d[g.Response.ACTION] === g.Action.PICKED) ok((d[g.Response.DOCUMENTS] || []).map(x => ({ id: x.id, name: x.name, mimeType: x.mimeType }))); else if (d[g.Response.ACTION] === g.Action.CANCEL) ok([]); });
        if (cfg.appId) b.setAppId(cfg.appId);
        if (opts.selected && b.setSelectedFileIds) b.setSelectedFileIds(opts.selected);
        if (!folder) b.enableFeature(g.Feature.MULTISELECT_ENABLED);
        b.build().setVisible(true);
      });
    }

    // A file's or folder's name and parent folders (only for what the person has picked or this app made).
    async function meta(id) { return (await api(FILES + '/' + encodeURIComponent(id) + '?supportsAllDrives=true&fields=id,name,parents')).json(); }

    async function readContent(id, revision) {
      const url = FILES + '/' + encodeURIComponent(id) + '?supportsAllDrives=true';
      const text = await (await api(url + '&alt=media', { cache: 'no-store' })).text();
      if (revision) {
        const after = await (await api(url + '&fields=headRevisionId', { cache: 'no-store' })).json();
        if (after.headRevisionId !== revision) throw Object.assign(new DriveError('The Drive file changed during the read. Try again.', 412), { readMismatch: true });
      }
      return text;
    }

    async function read(id) {
      const base = FILES + '/' + encodeURIComponent(id), q = '?supportsAllDrives=true';
      const meta = await (await api(base + q + '&fields=id,name,parents,modifiedTime,mimeType,headRevisionId')).json();
      if (/^application\/vnd\.google-apps\./.test(meta.mimeType || '')) throw new DriveError(meta.name + ' is a Google document, not a file. Download it as CSV (File, Download) and upload that to Drive, or open it from your computer.');
      const text = await readContent(id, /\.json$/i.test(meta.name) && meta.headRevisionId);
      return { id: meta.id, name: meta.name, text, lastModified: Date.parse(meta.modifiedTime) || Date.now(), parents: meta.parents || [], revision: meta.headRevisionId || '' };
    }

    // Always a new file (POST). folderId is where it goes; without one it lands in My Drive.
    // data is text (the data file) or bytes (a Blob, Uint8Array or ArrayBuffer: a slide PNG or a ZIP); bytes go up untouched.
    async function save(name, data, mime, folderId) {
      const b = 'gonk' + Math.random().toString(36).slice(2), meta = { name, mimeType: mime }, text = typeof data === 'string';
      if (folderId) meta.parents = [folderId];
      const head = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + b + '\r\nContent-Type: ' + mime + (text ? '; charset=UTF-8' : '') + '\r\n\r\n', tail = '\r\n--' + b + '--';
      const body = text ? head + data + tail : new Blob([head, data, tail]);
      const r = await api(UPLOAD + '?uploadType=multipart&supportsAllDrives=true&fields=id,name,parents,headRevisionId', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body });
      return r.json();
    }

    // Drive v2 exposes the file ETag alongside the head revision in one metadata response.
    const v2File = id => '/drive/v2/files/' + encodeURIComponent(id);
    async function head(id) {
      return (await api('https://www.googleapis.com' + v2File(id) + '?supportsAllDrives=true&fields=id,etag,headRevisionId', { cache: 'no-store' })).json();
    }

    async function update(id, name, data, mime, etag) {
      if (!/^"[^"]+"$/.test(etag)) throw new DriveError('Drive did not supply a strong file ETag. Save a local copy.');
      const b = 'gonk' + Math.random().toString(36).slice(2);
      const body = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify({ title: name }) +
        '\r\n--' + b + '\r\nContent-Type: ' + mime + '; charset=UTF-8\r\n\r\n' + data + '\r\n--' + b + '--';
      const result = await api('https://www.googleapis.com/upload' + v2File(id) + '?uploadType=multipart&supportsAllDrives=true&fields=id,title,headRevisionId', {
        method: 'PUT', headers: { 'Content-Type': 'multipart/related; boundary=' + b, 'If-Match': etag }, body
      });
      const file = await result.json();
      return { id: file.id, name: file.title, headRevisionId: file.headRevisionId };
    }

    const storageKey = 'awana-drive-pending', corruptKey = storageKey + '-corrupt';
    let storage, warnedAboutStorage = false, corruptChecks = [], preserveBlocked = false;
    const pendingWrites = new Map(), dirty = new Set();
    const validEntry = entry => Array.isArray(entry) && typeof entry[0] === 'string' &&
      entry[1] && typeof entry[1].base === 'string';
    const fileFromEntry = entry => ({
      id: typeof entry?.[0] === 'string' && entry[0] ? entry[0] : null,
      name: typeof entry?.[1]?.name === 'string' && entry[1].name ? entry[1].name : 'a file'
    });
    const parse = raw => { try { return JSON.parse(raw); } catch (err) { return undefined; } };
    function damagedFiles(raw, entries) {
      if (Array.isArray(entries)) return entries.filter(entry => !validEntry(entry)).map(fileFromEntry);
      // A truncated JSON array can still contain complete file IDs and names.
      const tuples = [...raw.matchAll(/\[\s*("(?:[^"\\]|\\.)*")\s*,([^]*?)(?=\[\s*"|$)/g)];
      const readNames = text => [...text.matchAll(/"name"\s*:\s*("(?:[^"\\]|\\.)*")/g)].map(([, name]) => parse(name));
      if (tuples.length) return tuples.map(([, id, body]) => fileFromEntry([parse(id), { name: readNames(body)[0] }]));
      const names = readNames(raw);
      return names.length ? names.map(name => fileFromEntry([null, { name }])) : [fileFromEntry()];
    }
    function writeCorrupt(checks) {
      if (!checks.length && storage.removeItem) storage.removeItem(corruptKey);
      else storage.setItem(corruptKey, JSON.stringify(checks));
      corruptChecks = checks;
    }
    function readPending() {
      const raw = storage.getItem(storageKey);
      const archiveRaw = storage.getItem(corruptKey);
      const entries = parse(raw ?? '[]');
      const valid = Array.isArray(entries) ? entries.filter(validEntry) : [];
      preserveBlocked = false;
      try {
        corruptChecks = JSON.parse(archiveRaw ?? '[]');
        if (!Array.isArray(corruptChecks)) throw new Error('Invalid save-check archive');
      } catch (err) {
        corruptChecks = [{ raw: archiveRaw, at: now(), files: [fileFromEntry()] }];
        preserveBlocked = true;
        return new Map(valid);
      }
      if (Array.isArray(entries) && entries.length === valid.length) return new Map(valid);
      // Keep the primary value intact if the archive cannot be written.
      const record = { raw, at: now(), files: damagedFiles(raw, entries) };
      const checks = corruptChecks.some(check => check.raw === raw) ? corruptChecks : corruptChecks.concat(record);
      const archived = checks === corruptChecks;
      corruptChecks = checks;
      try {
        if (!archived) writeCorrupt(checks);
        storage.setItem(storageKey, JSON.stringify(valid));
      } catch (err) {
        preserveBlocked = true;
      }
      return new Map(valid);
    }
    try {
      storage = env.storage || root.localStorage;
      if (storage) for (const [id, pending] of readPending() || []) pendingWrites.set(id, pending);
    } catch (err) {
      // Retry reading storage when the next save check runs.
    }
    function warnAboutStorage() {
      if (warnedAboutStorage) return;
      warnedAboutStorage = true;
      env.onStorageUnavailable?.('This browser will not keep save checks between reloads. Save a local copy before closing.');
    }
    function storedPending() {
      if (storage) {
        try {
          const next = readPending();
          if (dirty.size) {
            for (const id of dirty) {
              if (pendingWrites.has(id)) next.set(id, savedPending(pendingWrites.get(id)));
              else next.delete(id);
            }
            if (preserveBlocked) return next;
            if (!next.size && storage.removeItem) storage.removeItem(storageKey);
            else storage.setItem(storageKey, JSON.stringify([...next]));
            dirty.clear();
          }
          return next;
        } catch (err) {
          // Keep the memory changes, including deletions, until storage recovers.
        }
      }
      warnAboutStorage();
      return pendingWrites;
    }
    const wait = env.wait || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    async function fingerprint(body) {
      const subtle = (env.crypto ?? root.crypto)?.subtle;
      if (!subtle) return undefined;
      try {
        const digest = await subtle.digest('SHA-256', new TextEncoder().encode(body));
        return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      } catch (err) {
        return undefined;
      }
    }
    const savedPending = ({ base, written, name, digest, prior }) =>
      ({ base, written, name, digest, prior: prior ? savedPending(prior) : undefined });
    function setPending(id, pending) {
      if (pending) pendingWrites.set(id, pending); else pendingWrites.delete(id);
      dirty.add(id);
      storedPending();
    }
    const clearPending = id => {
      if (!pendingWrites.has(id)) return false;
      setPending(id);
      return true;
    };
    const matchesFile = (file, id, name) => file.id ? file.id === id : file.name === 'a file' || file.name === name;
    const needsReopen = (id, name) => corruptChecks.some(check => check.files.some(file => matchesFile(file, id, name)));
    const pendingFor = id => pendingWrites.has(id) ? JSON.parse(JSON.stringify(pendingWrites.get(id))) :
      needsReopen(id) ? { unreadable: true } : undefined;
    const unreadableMessage = name =>
      'The earlier save check for ' + name + ' could not be read. Reopen the file from Drive before saving.';
    const unreadableWarnings = () =>
      [...new Set(corruptChecks.flatMap(check => check.files.map(file => unreadableMessage(file.name))))];
    const unreadablePending = name => Object.assign(new DriveError(unreadableMessage(name), 0, 'pending'), { pendingWrite: true });
    function resolveCorrupt(id, name, checked) {
      if (!checked.length) return;
      // Re-read after the Drive check so a different tab's save or reopen is retained.
      readPending();
      if (preserveBlocked) throw unreadablePending(name);
      const remaining = corruptChecks.map(check => checked.some(prior => prior.raw === check.raw && prior.at === check.at)
        ? { ...check, files: check.files.filter(file => !matchesFile(file, id, name)) } : check);
      try { writeCorrupt(remaining.filter(check => check.files.length)); }
      catch (err) { throw unreadablePending(name); }
    }
    const pendingError = (pending, detail = '') => Object.assign(new DriveError(
      'A save of ' + pending.name + ' to Google Drive may not have finished. A save needs checking: reopen the file from Drive before saving again. Your changes are still here.' +
      (detail ? ' ' + detail : ''), 0, 'pending'), { pendingWrite: true });
    async function previousRevision(id, pending, head) {
      if (pending.previous) return pending.previous;
      if (pending.written === null && head === pending.base) return null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const chain = await revisions(id);
        const base = chain.findIndex(r => r.id === pending.base);
        const at = chain.findIndex(r => r.id === pending.written);
        if (pending.written !== null) {
          if (base < 0 && at < 0) throw pendingError(pending,
            'Cannot match the Drive v2 revision IDs to the v3 revision history. Save a local copy.');
          if (at > 0 && at > base) return pending.previous = chain[at - 1];
        } else {
          const end = chain.findIndex(r => r.id === head);
          if (base >= 0 && end > base) {
            const candidates = chain.slice(base + 1);
            if (candidates.length > 3) throw pendingError(pending);
            const unavailable = () => pendingError(pending,
              'The SHA-256 save fingerprint is unavailable, so this browser cannot verify the earlier save. Save a local copy.');
            if (pending.body === undefined && !pending.digest) throw unavailable();
            for (const [offset, revision] of candidates.entries()) {
              let text;
              try { text = await readPinned(id, revision); }
              catch (err) { throw pendingError(pending); }
              const digest = pending.body === undefined ? await fingerprint(text) : undefined;
              if (pending.body === undefined && !digest) throw unavailable();
              if (pending.body === undefined ? digest !== pending.digest : text !== pending.body) continue;
              Object.assign(pending, { written: revision.id, verifiedBody: text });
              return pending.previous = chain[base + offset];
            }
            return null;
          }
        }
        if (attempt < 2) await wait(1000);
      }
      throw Object.assign(new DriveError("Drive's version list for " + pending.name +
        ' has not caught up with the last save yet. Wait a moment and press Try again.', 0, 'lagging'), { pendingWrite: true });
    }
    async function verifyReopened(id, name = id) {
      const stored = storedPending().get(id);
      const checked = corruptChecks.filter(check => check.files.some(file => matchesFile(file, id, name)));
      if (!stored) {
        if (checked.length) {
          const latest = await head(id);
          if (!latest.headRevisionId) throw unreadablePending(name);
          resolveCorrupt(id, name, checked);
          return [];
        }
        return null;
      }
      const stamp = JSON.stringify(savedPending(stored));
      const local = pendingWrites.get(id);
      const pending = local && JSON.stringify(savedPending(local)) === stamp ? pendingFor(id) : stored;
      const latest = await head(id);
      if (!latest.headRevisionId) throw pendingError(pending, 'Drive did not identify the current revision.');
      const displaced = [];
      for (let entry = pending; entry; entry = entry.prior) {
        const previous = await previousRevision(id, entry, latest.headRevisionId);
        if (previous && previous.id !== entry.base) {
          await retain(id, previous);
          displaced.push(previous);
        }
      }
      const current = storedPending().get(id);
      if (current && JSON.stringify(savedPending(current)) !== stamp) {
        throw pendingError(current, 'Another save started while this one was being checked.');
      }
      setPending(id);
      resolveCorrupt(id, name, checked);
      return displaced;
    }
    async function updateMerged(id, name, prepare, sourceText) {
      const stored = storedPending().get(id);
      if (needsReopen(id, name)) throw unreadablePending(name);
      if (stored && !pendingWrites.has(id)) pendingWrites.set(id, stored);
      let changes = 0, reviewedRevision, recovered = pendingWrites.has(id);
      while (changes < 4) {
        let latest;
        try {
          latest = await head(id);
          if (!latest.headRevisionId) throw new DriveError('Drive did not identify the current revision.');
          if (reviewedRevision && reviewedRevision !== latest.headRevisionId && ++changes >= 4) break;
          reviewedRevision = null;
          let pending = pendingWrites.get(id), predecessor;
          while (pending) {
            predecessor = await previousRevision(id, pending, latest.headRevisionId);
            if (predecessor) {
              setPending(id, pending);
              break;
            }
            setPending(id, pending.prior);
            pending = pendingWrites.get(id);
          }
          if (pending && predecessor.id === pending.base) {
            const savedBody = pending.body ?? pending.verifiedBody ?? await readPinned(id, { id: pending.written });
            clearPending(id);
            if (pending.written === latest.headRevisionId &&
                (pending.body !== undefined ? pending.sourceText === sourceText : savedBody === sourceText)) {
              const result = { id, name: pending.name, headRevisionId: pending.written, recovered: true };
              if (sourceText !== undefined && savedBody !== sourceText) result.savedBody = savedBody;
              return result;
            }
            pending = undefined;
          }
          if (pending) {
            await retain(id, predecessor);
            if (pending.written !== latest.headRevisionId || pending.body === undefined ||
                (pending.repair && pending.repair.sourceText !== sourceText)) {
              throw pendingError(pending, 'The displaced revision from ' + (predecessor.modifiedTime || predecessor.id) +
                ' is kept in the file’s version history.');
            }
          }
          let remote;
          if (pending) {
            try { remote = await readRevision(id, predecessor.id); }
            catch (err) { throw pendingError(pending); }
          }
          const body = pending ? await prepare(predecessor.id, remote, pending.repair) : await prepare(latest.headRevisionId);
          if (body === null) {
            reviewedRevision = latest.headRevisionId;
            continue;
          }
          const digest = storage ? await fingerprint(body) : undefined;
          const checked = await head(id);
          if (checked.headRevisionId !== latest.headRevisionId || checked.etag !== latest.etag) {
            changes++;
            continue;
          }
          if (!/^"[^"]+"$/.test(latest.etag)) throw new DriveError('Drive did not supply a strong file ETag. Save a local copy.');
          const prior = pendingWrites.get(id);
          const repair = pending ? { base: pending.body, local: body, sourceText } : null;
          const writing = { base: latest.headRevisionId, written: null, body, repair, name, sourceText, digest, prior };
          setPending(id, writing);
          let up;
          try {
            up = await update(id, name, body, 'application/json', latest.etag);
          } catch (err) {
            if (err.status >= 400 && err.status < 500) {
              setPending(id, prior);
              err.pendingWrite = !!prior;
              throw err;
            }
            err.pendingWrite = true;
            recovered = true;
            changes++;
            continue;
          }
          if (up.headRevisionId) {
            writing.written = up.headRevisionId;
            setPending(id, writing);
            const previous = await previousRevision(id, writing);
            if (previous.id === latest.headRevisionId) {
              clearPending(id);
              return recovered || pending ? Object.assign(up, { recovered: true }) : up;
            }
            await retain(id, previous);
          }
          recovered = true;
          changes++;
        } catch (err) {
          if (err.status !== 412) {
            const pending = pendingWrites.get(id);
            if (pending && !['pending', 'lagging', 'calendar'].includes(err.kind) && !err.cancelled && !err.fileSwitched) {
              throw pendingError(pending);
            }
            throw err;
          }
          if (err.readMismatch && (await head(id)).headRevisionId === latest.headRevisionId) {
            throw new DriveError('Cannot match the Drive v2 and v3 head revision IDs. Save a local copy.');
          }
          changes++;
        }
      }
      if (pendingWrites.has(id)) throw pendingError(pendingWrites.get(id));
      throw new DriveError('the file keeps changing under you (someone else is saving at the same time). Try again in a moment.');
    }

    async function retain(id, revision) {
      if (revision.keepForever) return;
      await pin(id, revision.id);
      revision.keepForever = true;
    }
    async function readPinned(id, revision) {
      await retain(id, revision);
      return readRevision(id, revision.id);
    }

    // Revisions of a file, oldest first (Drive lists them that way).
    async function revisions(id) {
      const out = []; let page = '';
      do {
        const j = await (await api(FILES + '/' + encodeURIComponent(id) + '/revisions?pageSize=200&fields=nextPageToken,revisions(id,modifiedTime,keepForever)' + (page ? '&pageToken=' + encodeURIComponent(page) : ''))).json();
        out.push(...(j.revisions || [])); page = j.nextPageToken || '';
      } while (page);
      return out;
    }
    async function readRevision(id, rev) { return (await api(FILES + '/' + encodeURIComponent(id) + '/revisions/' + encodeURIComponent(rev) + '?alt=media')).text(); }
    async function pin(id, rev) { await api(FILES + '/' + encodeURIComponent(id) + '/revisions/' + encodeURIComponent(rev), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keepForever: true }) }); }

    function disconnect() {
      const t = token; token = null; expires = 0;
      try { if (t && google() && google().accounts) google().accounts.oauth2.revoke(t, () => {}); } catch (e) { /* already gone */ }
    }
    return { configured, preload, connect, pick, meta, read, readContent, save, head, update, updateMerged, clearPending, pendingFor, unreadableWarnings, verifyReopened, revisions, readRevision, pin, disconnect, connected: (marginMs) => !!token && now() < expires - (marginMs || 0) };
  }

  const api = { create, DriveError, SCOPE };
  if (typeof module !== 'undefined') module.exports = api; else root.Drive = api;
})(this);
