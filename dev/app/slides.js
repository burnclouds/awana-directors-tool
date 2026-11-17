(this.AwanaVersions = this.AwanaVersions || {})['slides.js'] = '1.5.0';
// Weekly "Awards Earned" slide images (1920x1080 PNG), drawn from the awards recorded for one club night.
// buildSlides() turns the season file into slide models (pure, testable in node); render() draws one model on a canvas; makeZip() bundles PNGs.
// Ported from the standalone AWANA Awards Slide Generator, minus its own roster and award entry: the names come from the roster,
// the awards from the Awards tab, and Adult Memorization from the small list kept in the data file (season.adults[date] = [{ n, a }]).
(function (root) {
  const M = root.Model || require('./model.js');
  const Season = root.Season || require('./season.js');

  const FONT = 'Poppins, system-ui, sans-serif', W = 1920, H = 1080;
  const ICON = {
    header: ['M32 6 L58 46 L32 36 L6 46 Z', 'M32 6 L32 36'],
    hangGlider: ['M6 40 L32 12 L58 40 L32 30 Z', 'M32 30 L32 52'],
    wingRunner: ['M8 32 C 8 20, 20 14, 32 20 C 44 14, 56 20, 56 32 C 44 26, 34 30, 32 38 C 30 30, 20 26, 8 32 Z'],
    skyStormer: ['M32 6 C 42 16, 44 32, 38 46 L 32 58 L 26 46 C 20 32, 22 16, 32 6 Z', 'M26 42 L 14 50 L 22 38', 'M38 42 L 50 50 L 42 38'],
    tt: ['M32 6 L54 16 V32 C54 46, 44 54, 32 58 C20 54, 10 46, 10 32 V16 Z', 'M23 32 L29 38 L41 24'],
    cubbies: ['M32 22 C 26 16, 10 16, 10 34 C 10 48, 20 58, 26 58 C 29 58, 30 56, 32 56 C 34 56, 35 58, 38 58 C 44 58, 54 48, 54 34 C 54 16, 38 16, 32 22 Z', 'M32 22 C 32 16, 30 11, 27 8', 'M34 15 C 36 8, 44 6, 49 8 C 47 14, 40 17, 34 15 Z'],
    adult: ['M32 16 C 24 10, 14 10, 6 12 V 52 C 14 50, 24 50, 32 56 C 40 50, 50 50, 58 52 V 12 C 50 10, 40 10, 32 16 Z', 'M32 16 L32 56'],
  };

  // 'multi' = three club columns (Sparks, one per handbook); 'single' = one club with three entry columns.
  // Puggles have no slide. 'book' is the handbook code that puts a Sparks child in that column.
  const SLIDES = [
    { id: 'cubbies', group: 'Cubbies', subtitle: 'Cubbies', type: 'single', file: 'Awards Earned - Cubbies.png',
      club: { title: 'Cubbies', sub: 'Preschool', color: '#B85400', tint: '#FBEFE3', icon: 'cubbies' } },
    { id: 'sparks', group: 'Sparks', subtitle: 'Sparks', type: 'multi', file: 'Awards Earned - Sparks.png', clubs: [
      { key: 'HG', title: 'Hang Glider', sub: 'Sparks · Book 1', color: '#2E7D32', tint: '#EAF3EA', icon: 'hangGlider' },
      { key: 'WR', title: 'Wing Runner', sub: 'Sparks · Book 2', color: '#1565C0', tint: '#E9F0FA', icon: 'wingRunner' },
      { key: 'SS', title: 'Sky Stormer', sub: 'Sparks · Book 3', color: '#C62828', tint: '#FBEAEA', icon: 'skyStormer' },
    ] },
    { id: 'tt', group: 'T&T', subtitle: 'T&T', type: 'single', file: 'Awards Earned - TandT.png',
      club: { title: 'T&T', sub: 'Truth & Training', color: '#00695C', tint: '#E6F2F0', icon: 'tt' } },
    { id: 'adult', group: 'Adults', subtitle: 'Adult Memorization', type: 'single', file: 'Awards Earned - Adult Memorization.png',
      club: { title: 'Adult Memorization', sub: 'Leaders & Parents', color: '#5E35B1', tint: '#F0EBFA', icon: 'adult' } },
  ];

  // ---------- model: what goes on each slide ----------
  const nameOf = p => { const f = M.eff(p, M.C.FIRST), l = M.eff(p, M.C.LAST); return (f + (l ? ' ' + l[0] + '.' : '')).trim(); };

  // Recorded award names -> the wording the slides have always used. A season can override or extend this in config.slideNames
  // ({ "recorded name": "slide wording" }); anything not matched keeps the name as recorded.
  // The book code on a jewel or a T&T emblem name is left off a slide: the slide's column (Sparks) or the whole slide (T&T) already says which book.
  const PLAIN = a => { const m = /^[A-Za-z]{2,3} ((?:Red|Green|Blue) Jewel [1-4]|(?:Blue|Red|Green|Yellow) Emblem [12]|Discovery Award .+ Emblem|(?:Silver|Gold) [1-4]|Extra Credit (?:Silver|Gold) Emblem)$/.exec(a); return m ? m[1] : a; };
  function slideWording(season, recorded) {
    const over = (season.config && season.config.slideNames) || {}, books = (season.config && season.config.books) || {};
    const color = code => (books[code] && books[code].emblem) || code;
    const origOf = {}; recorded.forEach(o => { origOf[PLAIN(o)] = o; });
    const ov = a => over[origOf[a]] !== undefined ? over[origOf[a]] : over[a];      // an override may be keyed by the recorded name or the plain one
    const left = recorded.map(PLAIN), out = [];
    left.slice().forEach(a => {
      if (ov(a) !== undefined) return;
      const w = /^([A-Z]{2}) Pilot Wing$/.exec(a);
      if (!w) return;
      const jewel = left.indexOf('Red Jewel 1');
      left.splice(left.indexOf(a), 1);
      if (jewel >= 0 && over['Red Jewel 1'] === undefined) { left.splice(left.indexOf('Red Jewel 1'), 1); out.push(color(w[1]) + ' Wings & Red Jewel 1'); } else out.push(color(w[1]) + ' Wings');
    });
    left.forEach(a => {
      if (ov(a) !== undefined) { out.push(ov(a)); return; }
      const e = /^[A-Z]{2} (\w+) Emblem$/.exec(a);
      out.push(e ? e[1] + ' Rank' : a);
    });
    return out;
  }

  // Which Sparks column: the handbook code on file, else the book an award names, else Hang Glider (with a warning).
  function sparksColumn(season, id, results) {
    const code = Season.childBook(season, id);      // worked out for Sparks (the book they are in), else the handbook
    if (['HG', 'WR', 'SS'].includes(code)) return { key: code };
    const named = results.map(a => /^(HG|WR|SS)\b/.exec(a)).find(Boolean);
    return named ? { key: named[1] } : { key: 'HG', guessed: true };
  }

  const byName = (a, b) => a.n.localeCompare(b.n) || a.a.localeCompare(b.a);

  // -> { slides: [ { id, group, subtitle, type, file, club|clubs, entries: { <column key>: [{ n, a }] }, count } ], warnings: [text] }
  // The slides show what is earned and not yet announced and not held (Season.slidePending); date is only the title of the Adult Memorization night. opts.calendar defaults to the season's;
  // opts.pending replaces how a child's pending awards are worked out (tests only).
  function buildSlides(season, master, date, opts) {
    opts = opts || {};
    const warnings = [], slides = [];
    SLIDES.forEach(def => {
      const s = Object.assign({}, def), keys = def.type === 'multi' ? def.clubs.map(c => c.key) : [def.id];
      s.entries = {}; keys.forEach(k => { s.entries[k] = []; });
      if (def.id === 'adult') {
        ((season.adults || {})[date] || []).forEach(e => { if (e && e.n && e.a) s.entries.adult.push({ n: String(e.n), a: String(e.a) }); });
      } else {
        const kids = master.people.filter(p => M.isActive(p) && M.isClubber(p) && M.groupOf(M.room(p)) === def.group);
        const byId = new Map(kids.map(p => [p[M.X.ID], p]));
        Season.slidePending(season, def.group, kids.map(p => p[M.X.ID]), opts.calendar || season.calendar || [], opts.pending).forEach(r => {
          const p = byId.get(r.id), col = def.type === 'multi' ? sparksColumn(season, r.id, r.results) : { key: def.id };
          if (col.guessed) warnings.push(nameOf(p) + ' has no Sparks handbook on file, so the awards went in the Hang Glider column. Set the handbook on the child\'s Person tab.');
          slideWording(season, r.results).forEach(a => s.entries[col.key].push({ n: nameOf(p), a }));
        });
      }
      keys.forEach(k => s.entries[k].sort(byName));
      s.count = keys.reduce((t, k) => t + s.entries[k].length, 0);
      slides.push(s);
    });
    slides.forEach(s => { const n = hiddenCount(s); if (n) warnings.push('The ' + s.subtitle + ' slide has more awards than fit on one picture, even at the smallest text: ' + n + ' entr' + (n === 1 ? 'y is' : 'ies are') + ' left off it (the picture says so in red). Announce those from the Awards tab, or hold some until next week.'); });
    return { slides, warnings };
  }

  // ---------- fitting text to the slide (pure: the caller supplies measure(text, fontPx) -> width, so node can test it) ----------
  // Text starts at 24px and shrinks one pixel at a time to 13px (the smallest that reads on a TV). If it still does not fit, what fits is kept and the
  // column ends with a red "+ N more not shown" line, so nothing runs off the bottom of the 1080px slide unannounced; buildSlides also adds a warning.
  const GAP = 1.55, FS_MAX = 24, FS_MIN = 13, BOTTOM = 30, TOP_MULTI = 296 + 40 + 22 + 12 + 8 + 26, TOP_SINGLE = 296 + 44 + 22 + 12 + 8 + 26;
  const entryText = it => it.n + '  —  ' + it.a;
  const approxMeasure = (t, fs) => t.length * fs * 0.6;      // stand-in for the canvas when none is at hand (about Poppins 600; errs wide)
  function wrapText(text, maxWidth, fs, measure) {
    if (measure(text, fs) <= maxWidth) return [text];
    const lines = []; let cur = '';
    text.split(' ').forEach(w => { const t = cur ? cur + ' ' + w : w; if (measure(t, fs) > maxWidth && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    return lines;
  }
  const moreLine = n => '+ ' + n + ' more not shown';
  // Keeps whole entries while they fit in maxLines (leaving a line for the marker once something is cut); -> { lines, hidden }
  function clip(groups, maxLines) {
    const total = groups.reduce((t, g) => t + g.length, 0);
    if (total <= maxLines) return { lines: [].concat(...groups), hidden: 0 };
    const lines = []; let k = 0;
    while (k < groups.length && lines.length + groups[k].length <= maxLines - 1) { groups[k].forEach(l => lines.push(l)); k++; }
    return { lines: lines.concat([moreLine(groups.length - k)]), hidden: groups.length - k };
  }
  function fitColumn(items, maxWidth, availH, measure) {
    const build = f => items.map(it => wrapText(entryText(it), maxWidth, f, measure)), count = g => g.reduce((t, l) => t + l.length, 0);
    let fs = FS_MAX, groups = build(fs);
    while (count(groups) * fs * GAP > availH && fs > FS_MIN) { fs--; groups = build(fs); }
    const c = clip(groups, Math.floor(availH / (fs * GAP)));
    return { lines: c.lines, fs, gap: GAP, hidden: c.hidden };
  }
  // One club, three entry columns filled in order; only the last column can run out of room.
  function fitColumns(items, maxWidth, availH, measure) {
    const colsFor = fs => {
      const out = [[], [], []], maxLines = Math.floor(availH / (fs * GAP)), used = [0, 0, 0]; let col = 0;
      items.forEach(it => { const ls = wrapText(entryText(it), maxWidth, fs, measure); if (used[col] + ls.length > maxLines && col < 2) col++; out[col].push(ls); used[col] += ls.length; });
      return { out, maxLines, overflow: used[2] > maxLines };
    };
    let fs = FS_MAX, res = colsFor(fs);
    while (res.overflow && fs > FS_MIN) { fs--; res = colsFor(fs); }
    const last = clip(res.out[2], res.maxLines);
    return { out: [[].concat(...res.out[0]), [].concat(...res.out[1]), last.lines], fs, hidden: last.hidden };
  }
  // How many entries do not fit on a slide model (estimated with approxMeasure unless a measure is given): 0 when everything fits.
  function hiddenCount(slide, measure) {
    measure = measure || approxMeasure;
    if (slide.type === 'multi') return slide.clubs.reduce((t, c) => t + fitColumn(slide.entries[c.key], W / 3 - 88 - 0, H - BOTTOM - TOP_MULTI, measure).hidden, 0);
    return fitColumns(slide.entries[slide.id], (W - 72) / 3 - 72, H - BOTTOM - TOP_SINGLE, measure).hidden;
  }

  // ---------- drawing (browser: needs a canvas context and the Poppins font) ----------
  // '2026-27' -> '2026 – 2027'
  const yearLabel = y => { const m = /^(\d{4})-(\d{2})$/.exec(y || ''); return m ? m[1] + ' – ' + m[1].slice(0, 2) + m[2] : String(y || '').replace('-', ' – '); };
  const hexToRgba = (hex, a) => { const h = hex.replace('#', ''); return 'rgba(' + parseInt(h.substr(0, 2), 16) + ',' + parseInt(h.substr(2, 2), 16) + ',' + parseInt(h.substr(4, 2), 16) + ',' + a + ')'; };

  function painter(ctx, year) {
    const drawIcon = (kind, cx, cy, size, color) => {
      ctx.save(); ctx.translate(cx - size / 2, cy - size / 2); ctx.scale(size / 64, size / 64);
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ICON[kind].forEach(d => ctx.stroke(new Path2D(d)));
      ctx.restore();
    };
    const spaced = (text, x, y, px) => { ctx.letterSpacing = px + 'px'; ctx.fillText(text, x, y); ctx.letterSpacing = '0px'; };
    const measure = (t, fs) => { ctx.font = '600 ' + fs + 'px ' + FONT; return ctx.measureText(t).width; };
    const fit = (items, maxWidth, availH) => fitColumn(items, maxWidth, availH, measure);
    function drawLines(f, x, top) {
      ctx.fillStyle = '#2A2A2A'; ctx.font = '600 ' + f.fs + 'px ' + FONT; ctx.textBaseline = 'alphabetic';
      let y = top + f.fs; f.lines.forEach((l, i) => { ctx.fillStyle = f.hidden && i === f.lines.length - 1 ? '#B00020' : '#2A2A2A'; ctx.fillText(l, x, y); y += f.fs * f.gap; });      // the "more not shown" line is red
    }
    function drawFrame(subtitle) {
      ctx.fillStyle = '#F7F5EE'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#1B2540'; ctx.fillRect(0, 0, W, 168);
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = '#FAF9F5';
      ctx.font = '800 58px ' + FONT; ctx.letterSpacing = '1px';
      const tw = ctx.measureText('Awards Earned').width;
      ctx.fillText('Awards Earned', 72, 84); ctx.letterSpacing = '0px';
      const dx = 72 + tw + 28;
      ctx.fillStyle = 'rgba(250,249,245,0.25)'; ctx.fillRect(dx, 56, 2, 56);
      ctx.fillStyle = 'rgba(250,249,245,0.85)'; ctx.font = '600 40px ' + FONT; ctx.fillText(subtitle, dx + 2 + 28, 84);
      const label = yearLabel(year) + ' Club Year';
      ctx.font = '600 20px ' + FONT;
      const yw = ctx.measureText(label).width, yx = W - 72 - yw;
      ctx.fillStyle = 'rgba(250,249,245,0.75)'; ctx.fillText(label, yx, 84);
      ctx.fillStyle = 'rgba(250,249,245,0.25)'; ctx.fillRect(yx - 18 - 2, 60, 2, 48);
      drawIcon('header', yx - 18 - 2 - 18 - 28, 84, 56, '#FAF9F5');
    }
    function colHeader(x, w, c, pad, iconSize, titlePx, subPx) {
      ctx.fillStyle = c.color; ctx.fillRect(x, 168, w, 128);
      drawIcon(c.icon, x + pad + iconSize / 2, 232, iconSize, '#FAF9F5');
      const tx = x + pad + iconSize + (iconSize === 60 ? 24 : 20);
      ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#FAF9F5'; ctx.font = '800 ' + titlePx + 'px ' + FONT;
      ctx.fillText(c.title, tx, 232 + titlePx * 0.1);
      ctx.fillStyle = 'rgba(250,249,245,0.85)'; ctx.font = '600 ' + subPx + 'px ' + FONT;
      spaced(c.sub.toUpperCase(), tx, 232 + titlePx * 0.1 + subPx + 8, 2);
    }
    function colLabel(x, y, c) { ctx.fillStyle = c.color; ctx.font = '600 15px ' + FONT; ctx.textBaseline = 'alphabetic'; spaced('NAME : EARNED', x, y, 2); }
    function dashed(x1, x2, y, color, alpha, vertical) {
      ctx.save(); ctx.strokeStyle = hexToRgba(color, alpha); ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath();
      if (vertical) { ctx.moveTo(x1, x2); ctx.lineTo(x1, y); } else { ctx.moveTo(x1, y); ctx.lineTo(x2, y); }
      ctx.stroke(); ctx.restore();
    }
    function drawMulti(s) {
      const colW = W / 3;
      s.clubs.forEach((c, i) => {
        const x0 = i * colW;
        colHeader(x0, colW, c, 44, 52, 32, 15);
        ctx.fillStyle = c.tint; ctx.fillRect(x0, 296, colW, H - 296);
        if (i < 2) { ctx.fillStyle = '#E7E3D6'; ctx.fillRect(x0 + colW - 2, 168, 2, H - 168); }
        ctx.save(); ctx.beginPath(); ctx.rect(x0, 296, colW, H - 296); ctx.clip(); ctx.globalAlpha = 0.08;
        drawIcon(c.icon, x0 + colW - 44 - 110, H - 40 - 110, 220, c.color); ctx.restore();
        const px = x0 + 44, rule = 296 + 40 + 22 + 12 + 8;
        colLabel(px, 296 + 40 + 16, c);
        dashed(px, x0 + colW - 44, rule, c.color, 0.35);
        const top = rule + 26;
        drawLines(fit(s.entries[c.key], colW - 88, H - 30 - top), px, top);
      });
    }
    function drawSingle(s) {
      const c = s.club;
      colHeader(0, W, c, 72, 60, 38, 16);
      ctx.fillStyle = c.tint; ctx.fillRect(0, 296, W, H - 296);
      ctx.save(); ctx.globalAlpha = 0.07; drawIcon(c.icon, W - 72 - 160, H - 44 - 160, 320, c.color); ctx.restore();
      const inner = W - 72, cw = inner / 3, rule = 296 + 44 + 22 + 12 + 8, top = TOP_SINGLE;
      const res = fitColumns(s.entries[s.id], cw - 72, H - 30 - top, measure);
      for (let i = 0; i < 3; i++) {
        const x0 = 36 + i * cw, px = x0 + 36;
        if (i < 2) dashed(x0 + cw, 296 + 44, 296 + 44 + (H - 296 - 88), c.color, 0.25, true);
        colLabel(px, 296 + 44 + 16, c);
        dashed(px, x0 + cw - 36, rule, c.color, 0.35);
        drawLines({ lines: res.out[i], fs: res.fs, gap: GAP, hidden: i === 2 && res.hidden > 0 }, px, top);
      }
    }
    return function draw(s) {
      drawFrame(s.subtitle);
      if (s.type === 'multi') drawMulti(s); else drawSingle(s);
      ctx.fillStyle = '#000';                       // 5px black border compensates for TV overscan
      ctx.fillRect(0, 0, W, 5); ctx.fillRect(0, H - 5, W, 5); ctx.fillRect(0, 0, 5, H); ctx.fillRect(W - 5, 0, 5, H);
    };
  }

  // Poppins is embedded in fonts.css; canvas text silently falls back if it has not loaded, so wait for every weight used.
  const fontsReady = () => (typeof document !== 'undefined' && document.fonts && document.fonts.load)
    ? Promise.all(['400', '600', '700', '800'].map(w => document.fonts.load(w + ' 20px Poppins'))) : Promise.resolve();

  function render(canvas, slide, year) {
    canvas.width = W; canvas.height = H;
    painter(canvas.getContext('2d'), year || '')(slide);
  }
  const toBlob = canvas => new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

  // ---------- ZIP (stored, no compression: PNGs are already compressed) ----------
  const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = -1; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  function makeZip(files) {
    const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
    files.forEach(f => {
      const nameB = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, nameB.length, true);
      parts.push(lh.buffer, nameB, f.data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
      ch.setUint16(28, nameB.length, true); ch.setUint32(42, offset, true);
      central.push(ch.buffer, nameB);
      offset += 30 + nameB.length + size;
    });
    const cdSize = central.reduce((t, p) => t + (p.byteLength || p.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end.buffer]), { type: 'application/zip' });
  }

  const api = { SLIDES, W, H, GAP, FS_MIN, BOTTOM, TOP_MULTI, TOP_SINGLE, fitColumn, fitColumns, hiddenCount, approxMeasure, buildSlides, slideWording, nameOf, yearLabel, render, toBlob, fontsReady, makeZip, crc32 };
  if (typeof module !== 'undefined') module.exports = api; else root.Slides = api;
})(this);
