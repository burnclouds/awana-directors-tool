// Rewrites the "Which option when" part of the manual (section 5 of app/index.html, between the guide:start and guide:end markers) from the notes in app/info.js,
// so the manual and the (i) buttons say the same thing. Run after editing info.js: node dev/tools/sync-guide.js   (test/info.test.js fails when the two differ)
const fs = require('fs'), path = require('path'), file = path.join(__dirname, '..', 'app', 'index.html'), Info = require('../app/info.js');
const s = fs.readFileSync(file, 'utf8'), a = s.indexOf('<!-- guide:start -->'), b = s.indexOf('<!-- guide:end -->');
if (a < 0 || b < a) { console.error('guide markers not found in index.html'); process.exit(1); }
const out = s.slice(0, a + '<!-- guide:start -->'.length) + Info.guideHtml() + s.slice(b);
fs.writeFileSync(file, out); console.log(out === s ? 'guide already up to date' : 'guide rewritten');
