(this.AwanaVersions = this.AwanaVersions || {})['app-ask.js'] = '1.1.1';
// The app's own pop-ups (UX-20): one dialog, used instead of the browser's alert, confirm and prompt, so every question looks and works the same (phone layout, keyboard, focus, Esc) and a typed value gets a proper field.
//   App.ask.alert(message, { title, ok })                           -> Promise<void>
//   App.ask.confirm(message, { title, ok, cancel, danger, list })   -> Promise<boolean>
//   App.ask.choose(message, { title, buttons: [{ id, label, primary, danger }], cancel })   -> Promise<id>
//   App.ask.form({ title, message, ok, cancel, fields: [{ name, label, type: text|date|number|select|textarea, value, options: [[value, label]], required, min, max, step, pattern, maxlength, placeholder, hint, validate, showIf: { name, values } }], preview(values), validate(values) })   -> Promise<{ name: value } | null>
//   App.ask.typed(phrase, { title, message, ok })                  -> Promise<boolean>   (OK is enabled only when the typed text matches exactly)
//   App.done(message, { undo })                                       -> a short message with an Undo button, for an action Undo can reverse (do it first, then offer Undo)
// Calls made while the dialog is open wait their turn. A message is plain text ("\n" kept). Esc cancels. Every opening is announced with a 'app-ask' event so a test can answer it like a native dialog.
(function () {
  const App = window.App, esc = App.esc, $ = id => document.getElementById(id);
  const queue = []; let current = null;
  const TITLE = { alert: 'Please note', confirm: 'Are you sure?', choose: 'Choose', typed: 'Please confirm', form: '' };
  const CANCEL = { alert: () => undefined, confirm: () => false, choose: o => o.cancel, typed: () => false, form: () => null };
  const attr = (k, v) => v === undefined || v === null || v === '' || v === false ? '' : ' ' + k + (v === true ? '' : '="' + esc(String(v)) + '"');
  function fieldHtml(f, i) {
    const id = 'askF' + i, common = attr('name', f.name) + attr('required', f.required) + attr('placeholder', f.placeholder) + ' aria-describedby="askErr' + i + '"';
    let ctl;
    if (f.type === 'select') ctl = '<select id="' + id + '"' + common + '>' + (f.options || []).map(o => '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(f.value) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
    else if (f.type === 'textarea') ctl = '<textarea id="' + id + '" rows="3"' + common + '>' + esc(f.value || '') + '</textarea>';
    else ctl = '<input id="' + id + '" type="' + esc(f.type || 'text') + '"' + common + attr('value', f.value) + attr('min', f.min) + attr('max', f.max) + attr('step', f.step) + attr('pattern', f.pattern) + attr('maxlength', f.maxlength) + (f.type === 'number' ? ' inputmode="numeric"' : '') + ' autocomplete="off">';
    return '<p class="askfield"' + (f.showIf ? ' data-showif="' + esc(f.showIf.name + ':' + f.showIf.values.join(',')) + '"' : '') + '><label for="' + id + '">' + esc(f.label || f.name) + '</label>' + ctl + (f.hint ? '<small class="status">' + esc(f.hint) + '</small>' : '') + '<span class="askerr" id="askErr' + i + '" role="alert"></span></p>';
  }
  function show(req) {
    const d = $('ask'), o = req.opts || {}, kind = req.kind, title = o.title || TITLE[kind] || '', opener = document.activeElement; current = { req, opener, done: false };
    d.dataset.kind = kind; d.setAttribute('role', kind === 'form' || kind === 'typed' ? 'dialog' : 'alertdialog'); d.setAttribute('aria-labelledby', 'askTitle'); if (o.message) d.setAttribute('aria-describedby', 'askMsg'); else d.removeAttribute('aria-describedby');
    const btn = (id, label, cls) => '<button type="' + (id === 'ok' ? 'submit' : 'button') + '" data-ask="' + esc(id) + '"' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(label) + '</button>';
    let buttons;
    if (kind === 'alert') buttons = btn('ok', o.ok || 'OK', 'primary');
    else if (kind === 'choose') buttons = (o.buttons || []).map(b => btn(b.id, b.label, (b.primary ? 'primary ' : '') + (b.danger ? 'danger' : '')).replace('type="submit"', 'type="button"')).join('');
    else buttons = btn('cancel', o.cancel || 'Cancel') + btn('ok', o.ok || 'OK', 'primary' + (o.danger ? ' danger' : ''));
    const fields = kind === 'form' ? (o.fields || []).map(fieldHtml).join('') : kind === 'typed' ? '<p class="askfield"><label for="askTyped">Type <b>' + esc(req.phrase) + '</b> to confirm</label><input id="askTyped" type="text" autocomplete="off" autocapitalize="off"></p>' : '';
    d.innerHTML = '<form method="dialog" id="askForm" novalidate><h3 id="askTitle" style="margin-top:0">' + esc(title) + '</h3>' + (o.message ? '<p id="askMsg" class="askmsg">' + esc(o.message) + '</p>' : '') + (o.list ? '<ul class="asklist">' + o.list.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') + fields + (kind === 'form' && o.preview ? '<p class="status askpreview" id="askPreview" aria-live="polite"></p>' : '') + (kind === 'form' ? '<p class="askerr" id="askFormErr" role="alert"></p>' : '') + '<div class="dlgbtns">' + buttons + '</div></form>';
    if (kind === 'form') wire(d.querySelector('#askForm'), o);
    document.dispatchEvent(new CustomEvent('app-ask', { detail: { kind, title, message: o.message || '', phrase: req.phrase || '', fields: (o.fields || []).map(f => ({ name: f.name, label: f.label, type: f.type || 'text', value: f.value })), defaultValue: kind === 'form' && (o.fields || []).length === 1 ? String((o.fields[0].value) == null ? '' : o.fields[0].value) : '', buttons: (o.buttons || []).map(b => b.id) } }));
    if (!d.open) d.showModal();
    const first = kind === 'form' ? d.querySelector('input,select,textarea') : kind === 'typed' ? $('askTyped') : o.danger ? d.querySelector('[data-ask="cancel"]') : d.querySelector('.primary') || d.querySelector('button');
    if (first) first.focus({ preventScroll: true });
    if (kind === 'typed') { const ok = d.querySelector('[data-ask="ok"]'), t = $('askTyped'); ok.disabled = true; t.addEventListener('input', () => { ok.disabled = t.value !== req.phrase; }); }
  }
  function finish(value) {
    if (!current || current.done) return; current.done = true; const d = $('ask'), c = current; current = null;
    d.close(); d.innerHTML = ''; if (c.opener && c.opener.isConnected && c.opener !== document.body) c.opener.focus({ preventScroll: true });
    c.req.resolve(value); next();
  }
  function next() { if (!current && queue.length) show(queue.shift()); }
  function ask(kind, opts, extra) { return new Promise(resolve => { const req = Object.assign({ kind, opts: opts || {}, resolve }, extra || {}); if (current) queue.push(req); else show(req); }); }
  /* Fields with showIf show only for some choice of another field; a hidden field is not checked and comes back as ''. o.preview(values) is a live line under the fields. */
  function raw(form, name) { const el = form.querySelector('[name="' + name + '"]'); return el ? el.value : ''; }
  function wire(form, o) {
    const fields = o.fields || [], refresh = () => {
      fields.forEach((f, i) => { if (f.showIf) form.querySelector('#askF' + i).closest('.askfield').hidden = !f.showIf.values.includes(raw(form, f.showIf.name)); });
      const pv = form.querySelector('#askPreview'); if (pv && o.preview) { const v = {}; fields.forEach((f, i) => { const el = form.querySelector('#askF' + i); v[f.name] = el.closest('.askfield').hidden ? '' : el.value; }); pv.textContent = o.preview(v) || ''; }
    };
    form.addEventListener('input', refresh); form.addEventListener('change', refresh); refresh();
  }
  function validate(form, fields, o) {
    const out = {}; let bad = null; const ff = form.querySelector('#askFormErr'); if (ff) ff.textContent = '';
    fields.forEach((f, i) => {
      const el = form.querySelector('#askF' + i), err = form.querySelector('#askErr' + i); let v = el.value; if (f.type === 'number' && v !== '') v = Number(v);
      if (el.closest('.askfield').hidden) { out[f.name] = ''; err.textContent = ''; return; }
      let msg = '';
      if (f.required && String(el.value).trim() === '') msg = (f.label || f.name) + ' is needed.';
      else if (el.value !== '' && f.pattern && !new RegExp('^(?:' + f.pattern + ')$').test(el.value)) msg = f.hint || (f.label || f.name) + ' is not in the right form.';
      else if (f.type === 'number' && el.value !== '' && (Number.isNaN(v) || (f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max))) msg = (f.label || f.name) + ' must be a number' + (f.min !== undefined ? ' from ' + f.min : '') + (f.max !== undefined ? ' to ' + f.max : '') + '.';
      else if (f.type === 'date' && el.value !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(el.value)) msg = 'Choose a date.';
      out[f.name] = v; if (!msg && f.validate) msg = f.validate(v, out) || '';
      err.textContent = msg; el.setAttribute('aria-invalid', msg ? 'true' : 'false'); if (msg && !bad) bad = el;
    });
    if (bad) { bad.focus(); return null; }
    const w = o && o.validate ? o.validate(out) : '';      /* a check across the whole form: a message, or { name, message } to put it under one field */
    if (w) { const msg = typeof w === 'string' ? w : w.message, at = typeof w === 'object' ? fields.findIndex(f => f.name === w.name) : -1; if (at >= 0) { const el = form.querySelector('#askF' + at); form.querySelector('#askErr' + at).textContent = msg; el.setAttribute('aria-invalid', 'true'); el.focus(); } else if (ff) ff.textContent = msg; return null; }
    return out;
  }
  document.addEventListener('submit', e => {
    if (e.target.id !== 'askForm' || !current) return; e.preventDefault();
    const r = current.req;
    if (r.kind === 'form') { const v = validate(e.target, r.opts.fields || [], r.opts); if (v) finish(v); return; }
    if (r.kind === 'typed') { if ($('askTyped').value === r.phrase) finish(true); return; }
    finish(r.kind === 'alert' ? undefined : true);
  });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('#ask [data-ask]'); if (!b || !current) return; const id = b.dataset.ask, r = current.req;
    if (r.kind === 'choose') { finish(id); return; }
    if (id === 'cancel') finish(CANCEL[r.kind](r.opts));
  });
  document.addEventListener('cancel', e => { if (e.target && e.target.id === 'ask' && current) { e.preventDefault(); finish(CANCEL[current.req.kind](current.req.opts)); } }, true);
  App.ask = {
    alert: (message, o) => ask('alert', Object.assign({}, o, { message })),
    confirm: (message, o) => ask('confirm', Object.assign({}, o, { message })),
    choose: (message, o) => ask('choose', Object.assign({}, o, { message })),
    form: o => ask('form', o),
    typed: (phrase, o) => ask('typed', o, { phrase })
  };
  // "Do it, then offer Undo": for an action Undo can reverse. The Undo button is the top bar's Undo, and goes away when something else has been changed since.
  let doneTimer = 0, doneWatch = 0;
  App.done = (message, o) => {
    /* on a tab that stages its changes (Roster, Calendar, Color teams: Apply or Discard) the way back is Discard, not Undo: the message says so and shows no Undo button */
    const staged = !!(App.draftPending && App.draftPending()); if (staged) message += ' (Apply to keep it, or Discard.)';
    const withUndo = (!o || o.undo !== false) && !staged; let f = $('doneFlash');
    if (!f) { f = document.createElement('div'); f.id = 'doneFlash'; f.className = 'flash doneflash'; f.setAttribute('role', 'status'); document.body.appendChild(f); }
    /* a fingerprint of the newest History entry: entries made close together in the same area are merged, so the length alone would not show a new change */
    const print = () => { const h = App.season && App.season.history; if (!h || !h.length) return ''; const l = h[h.length - 1]; return h.length + '|' + l.t + '|' + (l.changes ? l.changes.length : 0); }, mark = print();
    f.innerHTML = '<span>' + esc(message) + '</span>' + (withUndo ? ' <button type="button" id="doneUndo">Undo</button>' : '') + ' <button type="button" id="doneClose" aria-label="Dismiss">&times;</button>'; f.hidden = false;
    const hide = () => { f.hidden = true; clearTimeout(doneTimer); clearInterval(doneWatch); };
    f.querySelector('#doneClose').onclick = hide; const u = f.querySelector('#doneUndo'); if (u) u.onclick = () => { const b = $('btnUndo'); if (b && !b.disabled) b.click(); hide(); };
    clearTimeout(doneTimer); clearInterval(doneWatch); doneTimer = setTimeout(hide, 12000);
    if (u) doneWatch = setInterval(() => { if (print() !== mark) u.remove(); }, 400);
  };
})();
