// N51 (Mike, 2026-11-20): "These kinds of headers are not necessary on any printable". What may print under a report's title is a FACT (the printed date, when the Planning Center data is from, a tally, the club year,
// a caution, the legend for a symbol that is on the page); an explanation of the report or of how to read it stays on the screen only (a <span class="noprint">). Reads every report's HTML on the invented TEST club.
// Usage: node test/print-no-explanations.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const Season = require('../season.js'), M = require('../model.js'), Reports = require('../reports.js'); require('../reports-season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).filter(f => /TEST.*\.json$/.test(f)).sort().pop();
const s = Season.fromJson(fs.readFileSync(path.join(dir, file), 'utf8')), master = M.fromRoster(s.roster);
const render = (r, opts) => r.render({ master, settings: { quarter: 'Q2', club: 'AWANA Club 26-27', dates: '' }, calendar: s.calendar, season: s, opts: opts || {} });
const entity = t => t.replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#\d+;|&\w+;/g, ' ');
// the lines that print under a title: every <p class="sub"> with the screen-only spans taken out
const printedSubs = html => [...html.matchAll(/<p class="sub">([\s\S]*?)<\/p>/g)].map(m => entity(m[1].replace(/<span class="noprint">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()).filter(Boolean);
// what is a fact, not an explanation
const FACT = [/^Printed \d\d\/\d\d\/\d\d/, /^Planning Center data as of \d{4}-\d\d-\d\d/, /^(Q\d teams\.|Teams as of [\d\/-]+\.)( \* = changes team[^.]*\.)?/, /^† The phone number is/, /^Still to order: \d+/, /^\d+ books? finished; \d+ end-of-year/, /^20\d\d-\d\d$/, /^[A-Za-z0-9 &()-]+ · Club year 20\d\d-\d\d$/, /^AWANA Club [\d-]+$/, /^AWANA Club [\d-]+ · For leaders only: do not hand this page to parents( \u00b7 data through [\d\/]+)?$/];
test('every line printed under a report title is a fact (printed date, data date, tally, club year, caution, symbol legend), on every report', () => {
  const bad = []; Reports.LIST.forEach(r => { let html = ''; try { html = render(r); } catch (e) { return; } printedSubs(html).forEach(t => { const parts = t.split(' · ').length > 1 && !FACT.some(f => f.test(t)) ? t.split(' · ') : [t]; parts.forEach(p => { if (!FACT.some(f => f.test(p.trim()))) bad.push(r.id + ': "' + p.slice(0, 90) + '"'); }); }); });
  assert.deepStrictEqual([...new Set(bad)], [], 'explanations that print: ' + [...new Set(bad)].join(' | '));
});
['attendDates:One row per child', 'standings:Rank 1 = best average place', 'ceremony:Earned and not yet given', 'pcChanges:Made here as pending changes', 'paceWatch:pace = core sections signed per night attended'].forEach(x => {
  const [id, phrase] = x.split(':');
  test(id + ': "' + phrase + '..." is not printed, but is still on the screen', () => {
    const html = render(Reports.LIST.find(r => r.id === id)); assert(html.includes(phrase), 'the text is gone from the screen too'); assert(!printedSubs(html).some(t => t.includes(phrase)), 'it prints');
  });
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
