(this.AwanaVersions = this.AwanaVersions || {})['drive.js'] = '1.3.2';
// Optional Google Drive access, for people whose files are in Drive but who do not have the Drive folder on their computer.
// Nothing here runs until the person presses a Drive button, and Google's scripts are loaded then, not before. Only files the person
// picks (and files this app creates) are reachable: the scope is drive.file. save() always makes a NEW file; update() replaces the content of one file this app was given
// (Drive keeps the earlier versions as revisions). Nothing is ever deleted.
//   const d = Drive.create(config, env)    env is for tests: { fetch, loadScript, google, gapi }
//   d.configured()  d.preload()  d.pick('files'|'folder', { parent, title }) -> [{id,name,mimeType}]   parent = the Drive folder the picker opens in  d.read(id) -> {name,text,lastModified,parents}
//   d.save(name, textOrBytes, mime, folderId) -> {id,name,parents,headRevisionId}  d.meta(id) -> {id,name,parents}  d.disconnect()
//   d.head(id) -> {id,name,parents,modifiedTime,headRevisionId}  d.update(id, name, text, mime) -> same  d.revisions(id) -> [{id,modifiedTime,keepForever}] oldest first
//   d.readRevision(id, revisionId) -> text  d.pin(id, revisionId) keeps that revision forever (Drive otherwise drops unpinned ones after 30 days or 100 newer ones)
//   pick opts: parent (open the picker in this folder), selected (an id to have ticked when it opens), title
(function (root) {
  const SCOPE = 'https://www.googleapis.com/auth/drive.file', FILES = 'https://www.googleapis.com/drive/v3/files', UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  const GSI = 'https://accounts.google.com/gsi/client', GAPI = 'https://apis.google.com/js/api.js', FOLDER = 'application/vnd.google-apps.folder';

  class DriveError extends Error { constructor(msg, status) { super(msg); this.name = 'DriveError'; this.status = status || 0; } }

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
          error_callback: e => bad(new DriveError('Sign-in did not finish' + (e && (e.message || e.type) ? ' (' + (e.message || e.type) + ')' : '') + '.')),
        });
        client.requestAccessToken({ prompt: '' });
      });
    }

    async function api(url, init) {
      const t = await connect(), r = await doFetch(url, Object.assign({}, init, { headers: Object.assign({ Authorization: 'Bearer ' + t }, init && init.headers) }));
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

    async function read(id) {
      const base = FILES + '/' + encodeURIComponent(id), q = '?supportsAllDrives=true';
      const meta = await (await api(base + q + '&fields=id,name,parents,modifiedTime,mimeType,headRevisionId')).json();
      if (/^application\/vnd\.google-apps\./.test(meta.mimeType || '')) throw new DriveError(meta.name + ' is a Google document, not a file. Download it as CSV (File, Download) and upload that to Drive, or open it from your computer.');
      const text = await (await api(base + q + '&alt=media')).text();
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

    // The current revision of a file, without reading it: compare headRevisionId with the one you opened to learn whether someone saved since.
    async function head(id) { return (await api(FILES + '/' + encodeURIComponent(id) + '?supportsAllDrives=true&fields=id,name,parents,modifiedTime,headRevisionId')).json(); }

    // Replace the content of a file this app was given (a PATCH with a new name and body). Drive keeps the previous content as a revision.
    async function update(id, name, data, mime) {
      const b = 'gonk' + Math.random().toString(36).slice(2), head = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify({ name }) + '\r\n--' + b + '\r\nContent-Type: ' + mime + '; charset=UTF-8\r\n\r\n';
      const r = await api(UPLOAD + '/' + encodeURIComponent(id) + '?uploadType=multipart&supportsAllDrives=true&fields=id,name,parents,modifiedTime,headRevisionId', { method: 'PATCH', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: head + data + '\r\n--' + b + '--' });
      return r.json();
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
    return { configured, preload, connect, pick, meta, read, save, head, update, revisions, readRevision, pin, disconnect, connected: (marginMs) => !!token && now() < expires - (marginMs || 0) };
  }

  const api = { create, DriveError, SCOPE };
  if (typeof module !== 'undefined') module.exports = api; else root.Drive = api;
})(this);
