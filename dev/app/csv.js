(this.AwanaVersions = this.AwanaVersions || {})['csv.js'] = '1.1.0';
// RFC 4180 CSV parse/serialize. Handles BOM, CRLF, quoted fields with commas/quotes/newlines.
(function (root) {
  function parse(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const rows = [];
    let row = [], field = '', i = 0, inQ = false;
    const n = text.length;
    while (i < n) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function quote(v) {
    v = v == null ? '' : String(v);
    return /[",\r\n]/.test(v) || /^\s|\s$/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  // Excel needs the BOM to read UTF-8; the parser strips it again on re-import.
  function serialize(rows, withBom) {
    return (withBom === false ? '' : '﻿') + rows.map(r => r.map(quote).join(',')).join('\r\n') + '\r\n';
  }

  // Header row + records, keyed by header name. Duplicate headers are suffixed so nothing is lost.
  function toRecords(rows) {
    if (!rows.length) return { cols: [], records: [] };
    const seen = {};
    const cols = rows[0].map(h => {
      h = h.trim();
      if (seen[h] == null) { seen[h] = 1; return h; }
      seen[h]++;
      return h + ' (' + seen[h] + ')';
    });
    const records = rows.slice(1).filter(r => r.some(v => v !== '')).map(r => {
      const o = {};
      cols.forEach((c, k) => { o[c] = r[k] == null ? '' : r[k]; });
      return o;
    });
    return { cols, records };
  }

  // The grid with nothing dropped (R17): the header exactly as written ([] for no rows), the data rows that have something in them as parsed (any length, so cells past the header stay),
  // and how many data rows were blank (every cell empty). toRecords stays for the calendar, colors and old master readers.
  function toTable(rows) {
    if (!rows.length) return { header: [], body: [], blankRows: 0 };
    const body = [], data = rows.slice(1); let blankRows = 0;
    data.forEach(r => { if (r.every(v => v === '')) blankRows++; else body.push(r); });
    return { header: rows[0], body, blankRows };
  }

  const api = { parse, serialize, toRecords, toTable };
  if (typeof module !== 'undefined') module.exports = api; else root.Csv = api;
})(this);
