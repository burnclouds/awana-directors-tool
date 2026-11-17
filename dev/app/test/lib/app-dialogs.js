// Answering the app's own pop-ups (app-ask.js) from a Playwright test, the way a test answers a native dialog.
//   const { onAppDialog } = require('./lib/app-dialogs');
//   onAppDialog(page, async d => { d.type(); d.message(); d.defaultValue(); await d.accept(value?) / await d.dismiss(); });
// d.type() is 'alert', 'confirm', 'prompt' (a form with one field), 'form', 'choose' or 'typed'. accept() and dismiss() work through the real page (type into the field, press the button), so a test goes the same way a person does.
//   accept() on a 'choose' dialog presses its primary button (for "Unapplied changes" that is Apply and continue); dismiss() cancels it (Stay here).
// While the app still had native alert/confirm/prompt calls (UX-20 was built step by step), a native dialog is passed to the same handler, so a test that has not been changed keeps working.
// Call it BEFORE page.goto(). Usage in a test:  onAppDialog(page, d => d.accept());
// A test that loads THIS file answers its own dialogs and is left alone by pw-dialog-compat.js (which makes older tests' `page.on('dialog', ...)` handlers answer the app's dialogs too).
function makeDialog(page, detail) {
  const kind = detail.kind, one = kind === 'form' && detail.fields.length === 1;
  const clickBtn = id => page.evaluate(i => { const b = document.querySelector('#ask [data-ask="' + i + '"]'); if (!b) return false; b.click(); return true; }, id).catch(() => false);      /* the page may be closed by the time a late answer arrives */
  const d = {
    /* the native dialog each kind replaced: a choice is a confirm (accept = its primary button, dismiss = cancel), a typed phrase is a prompt, a one-field form is a prompt */
    type: () => one || kind === 'typed' ? 'prompt' : kind === 'choose' ? 'confirm' : kind, kind: () => kind, message: () => detail.message, title: () => detail.title, defaultValue: () => detail.defaultValue, fields: () => detail.fields, buttons: () => detail.buttons,
    fill: async (name, value) => { await page.evaluate(([n, v]) => { const el = document.querySelector('#ask [name="' + n + '"]'); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, [name, String(value)]); },
    press: id => clickBtn(id),
    accept: async value => {
      if (value !== undefined && one) await d.fill(detail.fields[0].name, value);
      if (value !== undefined && kind === 'typed') await page.evaluate(v => { const t = document.getElementById('askTyped'); t.value = v; t.dispatchEvent(new Event('input', { bubbles: true })); }, String(value));
      if (kind === 'choose') { await page.evaluate(() => { const b = document.querySelector('#ask .dlgbtns button.primary') || document.querySelector('#ask .dlgbtns button'); if (b) b.click(); }); return; }
      await clickBtn('ok');
    },
    dismiss: async () => { if (kind === 'choose') { await page.keyboard.press('Escape').catch(() => {}); return; } if (!(await clickBtn('cancel'))) await page.keyboard.press('Escape').catch(() => {}); }
  };
  return d;
}
function onAppDialog(page, handler) {
  page.on('dialog', d => handler(d));
  page.exposeBinding('__appAsk', async (source, detail) => { await handler(makeDialog(page, detail)); });
  page.addInitScript(() => { document.addEventListener('app-ask', e => { if (window.__appAsk) window.__appAsk(e.detail); }, true); });
}
module.exports = { onAppDialog, makeDialog };
