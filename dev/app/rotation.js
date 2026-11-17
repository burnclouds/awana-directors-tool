(this.AwanaVersions = this.AwanaVersions || {})['rotation.js'] = '1.0.0';
// Nightly rotation: a time-by-group grid kept as its own CSV (first row = group names, first column = time slot).
// A blank cell continues the cell above it, which is how a group that stays in one place all night is shown.
(function (root) {
  const Csv = root.Csv || (typeof require !== 'undefined' ? require('./csv.js') : null);

  function load(text) {
    const rows = Csv.parse(text).filter(r => r.some(v => v !== ''));
    if (rows.length < 2 || rows[0][0] !== 'Time') throw new Error('Not a rotation CSV: first header cell must be "Time".');
    const w = Math.max(...rows.map(r => r.length));
    return rows.map(r => Array.from({ length: w }, (_, i) => r[i] || ''));
  }
  const toCsv = grid => Csv.serialize(grid, true);
  const blank = () => [['Time', 'Group 1'], ['6:30 - 6:45', '']];

  const api = { load, toCsv, blank };
  if (typeof module !== 'undefined') module.exports = api; else root.Rotation = api;
})(this);
