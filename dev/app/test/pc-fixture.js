// A deliberately odd Planning Center export for tests (R17): the invented 20261103 TEST export plus the things a real export can do that the app has to keep.
// Helper, not a test (no .test.js in the name). Invented data only.
//   PcFixture.build(text) -> text      PcFixture.grid(text) -> { header, rows }
//   PcFixture.NOBODY: the registration id of the row that has no name, so it belongs to nobody on the roster.
const Csv = require('../csv.js');
const NOBODY = '7999001', SNACK = 'Favourite Snack TEST';

function build(text) {
  const rows = Csv.parse(text).filter(r => r.some(c => c !== '')), header = rows[0].slice(), body = rows.slice(1).map(r => r.slice());
  const col = n => header.indexOf(n);
  const grade = col('Grade'), selection = col('Selection'), home = col('Home Phone Number');
  if (grade < 0 || selection < 0 || home < 0) throw new Error('the TEST export lacks a column the fixture needs');
  header[grade] = ' Grade';                                                  // a leading space in the header
  const width0 = header.length;
  header.push(SNACK, 'Selection', '', 'x_Notes');                            // a new column, a repeated header, a blank header, a column named like a club column
  body.forEach((r, i) => {
    while (r.length < width0) r.push('');
    r.push(i === 1 || i === 2 || i === 3 ? 'Zebracakes ' + i : '', r[selection], i === 2 ? 'x' : '', i === 0 ? 'from the export' : '');
  });
  body[5][home] = '   ';                                                    // a value of only spaces
  const width = header.length;
  body.splice(8, 0, new Array(width).fill(''));                              // one fully blank row in the middle
  body[10].push('extra1', 'extra2');                                         // a row with two cells past the header
  const nobody = new Array(width).fill(''); nobody[header.indexOf('Registration ID')] = NOBODY; nobody[selection] = 'Clubber'; nobody[header.indexOf('Assignment Area: Classes')] = 'Sparks A'; nobody[width - 4] = 'NobodySnack';
  body.push(nobody);                                                         // a registration with no name
  return Csv.serialize([header].concat(body));
}

// The grid the text says: the header as written, and every data row padded to the widest row (a blank row stays as a row of empty cells).
function grid(text) {
  const rows = Csv.parse(text), header = rows[0], data = rows.slice(1);
  const width = Math.max(header.length, ...data.map(r => r.length));
  return { header, rows: data.map(r => r.concat(new Array(width - r.length).fill(''))) };
}

module.exports = { build, grid, NOBODY, SNACK };
