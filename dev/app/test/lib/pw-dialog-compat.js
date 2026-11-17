// Loaded into every test process by dev/tools/run-tests.sh (NODE_OPTIONS=--require). Playwright answers a native alert/confirm/prompt through page.on('dialog', handler); most older tests were written that way.
// The app now asks in its own dialog (app-ask.js). This makes the SAME handler answer the app's dialogs: d.type(), d.message(), d.defaultValue(), d.accept(value?), d.dismiss() work as before.
//   * A page with no 'dialog' handler gets its app dialogs dismissed (as Playwright dismisses native ones nobody listens for).
//   * A test that loads test/lib/app-dialogs.js drives the dialogs itself and is left alone.
//   * Tests with no Playwright are unaffected (the require below fails quietly).
// Set AWANA_DIALOG_COMPAT=off to switch it off.
if (process.env.AWANA_DIALOG_COMPAT !== 'off') {
  let pw = null; try { pw = require('playwright'); } catch (e) { pw = null; }
  if (pw && pw.chromium && !pw.chromium.__awanaCompat) {
    const path = require('path'), { makeDialog } = require('./app-dialogs');
    const fs = require('fs'); let mainText = null;      /* read when first needed: require.main is not set yet while this file is preloaded */
    const ownTest = () => { if (mainText === null) { try { mainText = process.argv[1] ? fs.readFileSync(process.argv[1], 'utf8') : ''; } catch (e) { mainText = ''; } } return /lib\/app-dialogs/.test(mainText); };      /* the test file itself loads the helper: it answers the app's dialogs, leave it alone */
    const wrapPage = page => {
      if (!page || page.__awanaCompat || ownTest()) return page; page.__awanaCompat = true;
      const handlers = [], on = page.on.bind(page), off = page.removeAllListeners.bind(page);
      page.on = (ev, fn) => { if (ev === 'dialog') handlers.push(fn); return on(ev, fn); };
      page.removeAllListeners = ev => { if (ev === 'dialog' || ev === undefined) handlers.length = 0; return off(ev); };
      page.exposeBinding('__appAsk', async (source, detail) => { const d = makeDialog(page, detail); if (!handlers.length) { await d.dismiss(); return; } for (const h of handlers.slice()) await h(d); });
      page.addInitScript(() => { document.addEventListener('app-ask', e => { if (window.__appAsk) window.__appAsk(e.detail); }, true); });
      return page;
    };
    const wrapContext = ctx => { if (!ctx || ctx.__awanaCompat) return ctx; ctx.__awanaCompat = true; const np = ctx.newPage.bind(ctx); ctx.newPage = async (...a) => wrapPage(await np(...a)); return ctx; };
    const wrapBrowser = b => {
      const nc = b.newContext.bind(b), npg = b.newPage.bind(b);
      b.newContext = async (...a) => wrapContext(await nc(...a)); b.newPage = async (...a) => { const p = await npg(...a); wrapContext(p.context()); return wrapPage(p); };
      return b;
    };
    const launch = pw.chromium.launch.bind(pw.chromium); pw.chromium.launch = async (...a) => wrapBrowser(await launch(...a)); pw.chromium.__awanaCompat = true;
  }
}
