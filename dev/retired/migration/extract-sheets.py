#!/usr/bin/env python3
"""One-time migration helper: read the two Google Sheets as downloaded xlsx files and print the records as JSON.

usage: python3 -I extract-sheets.py <26-27 Attendance Sheets.xlsx> <26-27 Weekly Awards.xlsx> > records.json

Reads only; standard library only. Everything is keyed by Unique ID (never row position) and by date
(from the date header rows), so the result does not depend on how the Sheet happened to be laid out.
Then run build-season.js to turn records.json into the season file.
"""
import sys, re, json, html, zipfile, datetime
import xml.etree.ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
EPOCH = datetime.date(1899, 12, 30)

def colnum(s):
    n = 0
    for ch in s: n = n * 26 + ord(ch) - 64
    return n

def colname(n):
    s = ''
    while n: n, r = divmod(n - 1, 26); s = chr(65 + r) + s
    return s

def load(path, name):
    z = zipfile.ZipFile(path)
    ss = [''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)]
    rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    for s in ET.fromstring(z.read('xl/workbook.xml')).find('m:sheets', NS):
        if html.unescape(s.get('name')) != name: continue
        t = rels[s.get('{%s}id' % NS['r'])]
        t = t if t.startswith('xl/') else 'xl/' + t.lstrip('/')
        cells = {}
        for c in ET.fromstring(z.read(t)).iter('{%s}c' % NS['m']):
            v = c.find('m:v', NS)
            if v is None: continue
            cells[c.get('r')] = ss[int(v.text)] if c.get('t') == 's' else v.text
        return cells
    raise SystemExit('no sheet named ' + name)

def iso(serial):
    try: return (EPOCH + datetime.timedelta(days=int(float(serial)))).isoformat()
    except (TypeError, ValueError): return None

def is_one(v): return v is not None and v != '' and float(v) == 1

def main(master_path, awards_path):
    out = {'attendance': {}, 'handbooks': {}, 'games': {}, 'awards': {}, 'notes': []}

    # ---- All Clubbers Attendance: Unique ID in B, week blocks of six columns from P, dates in row 7
    c = load(master_path, 'All Clubbers Attendance')
    rows = [r for r in range(9, 203) if c.get('B%d' % r)]
    last = max(colnum(re.match(r'[A-Z]+', k).group()) for k in c)
    n = colnum('P')
    weeks = 0
    while n <= last:
        head, date = c.get(colname(n) + '8'), iso(c.get(colname(n) + '7'))
        if head == 'Attendance' and date and c.get(colname(n) + '7', '').replace('.', '').isdigit():
            weeks += 1
            night = {}
            for r in rows:
                m = {}
                for off, key in enumerate('ahpx'):
                    if is_one(c.get('%s%d' % (colname(n + off), r))): m[key] = 1
                if m: night[c['B%d' % r]] = m
            if night: out['attendance'][date] = night
            n += 6
        else:
            n += 1
    out['notes'].append('week blocks read: %d, nights with marks: %d' % (weeks, len(out['attendance'])))
    for r in rows:
        hb = (c.get('J%d' % r) or '').strip()
        if hb.endswith('.0'): hb = hb[:-2]
        if hb: out['handbooks'][c['B%d' % r]] = hb

    # ---- Games Points: group, team, date, type, value (F)
    g = load(master_path, 'Games Points')
    count = 0
    for r in range(10, 600):
        grp, team, d, typ, val = g.get('A%d' % r), g.get('B%d' % r), iso(g.get('C%d' % r)), g.get('E%d' % r), g.get('F%d' % r)
        if not (grp and team and d and typ and val not in (None, '')): continue
        grp = 'T&T' if grp == 'TnT' else grp
        rec = out['games'].setdefault(d, {}).setdefault(grp, {}).setdefault(team, {})
        rec['place' if typ == 'Place' else 'spirit'] = int(float(val))
        count += 1
    out['notes'].append('game values read: %d' % count)

    # ---- Awards Earned each week: Unique ID in A, dates in row 7 from column L, awards as comma-separated text
    a = load(awards_path, 'Awards Earned each week')
    cols = [(k, iso(a[k + '7'])) for k in (colname(i) for i in range(colnum('L'), colnum('AU') + 1)) if a.get(k + '7') and iso(a[k + '7'])]
    total = 0
    for r in range(8, 262):
        uid = a.get('A%d' % r)
        if not uid: continue
        for k, d in cols:
            v = a.get('%s%d' % (k, r))
            if not v: continue
            for award in [x.strip() for x in v.split(',') if x.strip()]:
                lst = out['awards'].setdefault(d, {}).setdefault(uid, [])
                if award not in lst: lst.append(award); total += 1
    out['notes'].append('award entries read: %d' % total)
    json.dump(out, sys.stdout, indent=1, sort_keys=True, ensure_ascii=False)

if __name__ == '__main__':
    if len(sys.argv) != 3: raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
