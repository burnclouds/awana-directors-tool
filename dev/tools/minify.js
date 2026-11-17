#!/usr/bin/env node
// Minifies one script of the app for deploy/ (called by make-deploy.sh):  node minify.js <in.js> <out.js>
// The first line (the version registration: (this.AwanaVersions = ...)['x.js'] = '1.2.3';) is kept exactly as written, because make-deploy.sh and the Debug tab read the
// version from it. Top-level names are not renamed (the scripts share globals such as Model, Season and App); everything inside a function is.
const fs = require('fs'), path = require('path');
let terser; try { terser = require(path.join(__dirname, '..', '..', 'node_modules', 'terser')); } catch (e) { console.error('terser is not installed: run "npm install" in the database folder first.'); process.exit(2); }
const [inp, out] = process.argv.slice(2), src = fs.readFileSync(inp, 'utf8'), nl = src.indexOf('\n'), first = nl < 0 ? src : src.slice(0, nl);
if (!/^\(this\.AwanaVersions = this\.AwanaVersions \|\| \{\}\)\['[^']+'\] = '[^']+';/.test(first)) { console.error(inp + ': line 1 is not the version registration'); process.exit(3); }
terser.minify(nl < 0 ? '' : src.slice(nl + 1), { compress: { passes: 2 }, mangle: true, format: { comments: false, preamble: first } }).then(r => {
  if (r.error) throw r.error;
  fs.writeFileSync(out, r.code + '\n');
}).catch(e => { console.error(inp + ': ' + e.message); process.exit(1); });
