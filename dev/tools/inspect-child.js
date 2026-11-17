// Read-only: where is one child's progress in a data file, as stored and as this version of the app reads it?
// Usage: node dev/tools/inspect-child.js "<data file>.json" Penner_Judah      (any part of the Unique ID; nothing is written)
const fs = require('fs'), path = require('path'), S = require(path.join(__dirname, '..', 'app', 'season.js'));
const [file, part] = process.argv.slice(2); if (!file || !part) { console.log('Usage: node dev/tools/inspect-child.js <file.json> <part of the child\'s Unique ID>'); process.exit(1); }
const text = fs.readFileSync(file, 'utf8'), raw = JSON.parse(text), now = S.fromJson(text), re = new RegExp(part, 'i');
const ids = [...new Set(Object.keys(raw.progress || {}).concat(Object.keys((raw.roster || {}).people || {})))].filter(i => re.test(i));
console.log('file format version', raw.version, '| club year', raw.year, '| matches:', ids.join(', ') || 'none');
const tpl = c => { const t = (c.config.progress || {}); return Object.keys(t).map(g => g + ': common ' + (t[g].common || []).length + ' blocks, per-book ' + (t[g].perBook || []).length).join(' ; '); };
console.log('template in the file :', tpl(raw)); console.log('template as read now :', tpl(now));
console.log('books in the file    :', Object.keys((raw.config || {}).books || {}).map(k => k + '(' + (raw.config.books[k].group || '?') + ')').join(' '));
ids.forEach(id => {
  const show = o => Object.keys(o || {}).map(b => b + ': ' + Object.keys(o[b]).length + ' dates').join(' | ') || '(none)';
  console.log('\n' + id); console.log(' handbook (file)   :', (raw.handbooks || {})[id] || '(none)');
  console.log(' progress, as stored:', show((raw.progress || {})[id])); console.log(' progress, read now :', show(now.progress[id]));
  const keys = b => Object.keys(((raw.progress || {})[id] || {})[b] || {}); Object.keys((raw.progress || {})[id] || {}).forEach(b => console.log('   stored ' + b + ' keys:', keys(b).slice(0, 12).join(', ') + (keys(b).length > 12 ? ' …' : '')));
});
