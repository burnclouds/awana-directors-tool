(this.AwanaVersions = this.AwanaVersions || {})['catalog.js'] = '1.16.1';
// Defaults for a new season file: award lists, slide exclusions, book codes, jewel thresholds and the
// progress-record templates (from the Sparks and T&T Achievement Record forms and the Weekly Awards workbook).
// Everything here is copied into the season file, so each season can edit its own lists.
(function (root) {
  const range = (a, b, prefix) => { const o = []; for (let i = a; i <= b; i++) o.push((prefix || '') + i); return o; };
  const sub = (n, count) => range(1, count).map(i => n + '.' + i);

  function awardLists() {
    const sparks = ['Flight 3:16'].concat([].concat(...['HG', 'WR', 'SS'].map(k => range(1, 4, k + ' Blue Jewel '))),
      ['HG Green Emblem', 'WR Blue Emblem', 'SS Red Emblem', 'HG Pilot Wing', 'WR Pilot Wing', 'SS Pilot Wing'],
      [].concat(...['HG', 'WR', 'SS'].map(k => [1, 2, 3, 4].reduce((a, n) => a.concat([k + ' Red Jewel ' + n, k + ' Green Jewel ' + n]), []))),
      ['HG Review Emblem - Green', 'WR Review Emblem - Blue', 'SS Review Emblem - Red',
        '1st Book Award Medallion Date', '1st Book Award Medallion', '2nd Book Award Medallion Date', '2nd Book Award Medallion',
        'SS 3rd Book Date', 'Sparky Award Sculpture', 'Recognition Certificate']);
    // T&T: Start Zone is done once; everything else is per book, so its award names carry the book code ("AoG Blue Emblem 1"): a child who does a second book earns them again.
    const tntBooks = ['AoG', 'DoG', 'GiA', 'EoG'];
    const tnt = [].concat(...tntBooks.map(k => [].concat(
      ['Blue', 'Red', 'Green', 'Yellow'].map(c => k + ' ' + c + ' Emblem 1'), ['Blue', 'Red', 'Green', 'Yellow'].map(c => k + ' ' + c + ' Emblem 2'),
      ['Blue', 'Red', 'Green', 'Yellow'].map(c => k + ' Discovery Award ' + c + ' Emblem'),
      range(1, 4, k + ' Silver '), [k + ' Extra Credit Silver Emblem'], range(1, 4, k + ' Gold '), [k + ' Extra Credit Gold Emblem'])),
      ['Alpha Award Medallion Date', 'Alpha Award Medallion', 'Excellence Award Medallion Date', 'Excellence Award Medallion',
        'Challenge Book Award Medallion Date', 'Challenge Book Award Medallion', 'Timothy Trophy Award Date', 'Timothy Trophy Award', 'Certificate of Award']);
    return {
      Puggles: ['Participation Certificate'],
      Cubbies: ['Appleseed Trail Emblem Date', 'Appleseed Trail Emblem', 'Honeycomb Trail Emblem Date', 'Honeycomb Trail Emblem', 'Cubbies Recognition Certificate'],
      Sparks: sparks,
      'T&T': tnt,
    };
  }

  function sparksTemplate() {
    const jewels = [];
    [1, 2, 3, 4].forEach(n => {
      // items 1-4 earn the jewel (the day the last one is dated is the earned date); review 5-8 do not count toward it, only toward the book's Review Emblem
      jewels.push({ key: 'RJ' + n, label: 'Red Jewel ' + n, items: ['1', '2', '3', '4'], review: ['5', '6', '7', '8'], awards: n === 1 ? ['{book} Pilot Wing', '{book} Red Jewel 1'] : ['{book} Red Jewel ' + n] });
      jewels.push({ key: 'GJ' + n, label: 'Green Jewel ' + n, items: ['1', '2', '3', '4'], review: ['5', '6', '7', '8'], awards: ['{book} Green Jewel ' + n] });
    });
    return {
      common: [{ key: 'FLT', label: 'Flight 3:16 Booklet', items: range(1, 6), awards: ['Flight 3:16'] }],
      perBook: [{ key: 'R', label: 'Rank', items: range(1, 8), awards: ['{book} {emblem} Emblem'] }].concat(jewels),
      // Earned when every section and every review of the eight jewel blocks in the book is dated (Rank has no reviews and is not part of it).
      bookReview: { label: 'Book Review', awards: ['{book} Review Emblem - {emblem}'] },
    };
  }

  // T&T: four books (AoG, DoG, GiA, EoG) of four units each. Start Zone is done once (common); the emblem blocks of the units and the Silver / Gold extra credit are per book.
  function tntTemplate() {
    const b = (key, label, items) => ({ key, label, items, awards: ['{book} ' + label] });
    // Start Zone is one block of two sections (1 and 2). Nothing is given for it: finishing it is how a child earns the book.
    const common = [{ key: 'SZ', label: 'Start Zone', items: ['1', '2'], awards: [] }];
    const perBook = [['BE1', 'Blue Emblem 1', ['1.1', '1.2', '1.3']], ['RE1', 'Red Emblem 1', ['1.4', '1.5', '1.6']],
      ['GE1', 'Green Emblem 1', ['2.1', '2.2', '2.3', '2.4']], ['YE1', 'Yellow Emblem 1', ['2.5', '2.6', '2.7', '2.8']],
      ['BE2', 'Blue Emblem 2', ['3.1', '3.2', '3.3', '3.4']], ['RE2', 'Red Emblem 2', ['3.5', '3.6', '3.7', '3.8']],
      ['GE2', 'Green Emblem 2', ['4.1', '4.2', '4.3', '4.4']], ['YE2', 'Yellow Emblem 2', ['4.5', '4.6', '4.7', '4.8']]]
      .map(x => b(x[0], x[1], x[2]));
    [['SV', 'Silver'], ['GD', 'Gold']].forEach(([p, name]) => [1, 2, 3, 4].forEach(u => perBook.push(b(p + u, name + ' ' + u, sub(u, u === 1 ? 5 : 7)))));
    return { common, perBook };
  }
  // Cubbies: two handbooks (AppleSeed, HoneyComb), each 26 Bear Hugs: the Trail (Bear Hugs 1-2), then six units of four. Apple Acres, the entrance booklet (Bear Hugs A and B), is done once and has no award.
  // The Trail earns the Trail Emblem; each unit earns an apple emblem for the vest, Green for units 1, 3, 5 and Red for 2, 4, 6. detail 'unit' (the standard) is one box per block (8 in all); 'section' is one box per Bear Hug (28).
  function cubbiesTemplate(detail) {
    const bySection = detail === 'section', blk = (key, label, secs, awards) => ({ key, label, items: bySection ? secs : ['1'], awards, single: !bySection });
    const common = [blk('AA', 'Apple Acres', ['A', 'B'], [])], perBook = [blk('TR', 'Trail', ['1', '2'], ['{book} Trail Emblem'])];
    [1, 2, 3, 4, 5, 6].forEach(u => perBook.push(blk('U' + u, 'Unit ' + u, range(3 + 4 * (u - 1), 6 + 4 * (u - 1)), ['{book} Unit ' + u + ' ' + (u % 2 ? 'Green' : 'Red') + ' Apple Emblem'])));
    return { common, perBook };
  }
  // The awards for finishing books, by how many books the child has finished (any order): Sparks 3 books, T&T 4. A book is finished when every section of its core blocks is dated
  // (Sparks: Rank and the eight jewels, reviews not included; T&T: the emblem blocks, not Silver / Gold) or when it is ticked as finished before (another club, no records).
  const completionAwards = () => ({ Cubbies: ['AppleSeed Book Award Medallion', 'HoneyComb Book Award Medallion'], Sparks: ['1st Book Award Medallion', '2nd Book Award Medallion', 'Sparky Award Sculpture'], 'T&T': ['Alpha Award Medallion', 'Excellence Award Medallion', 'Challenge Book Award Medallion', 'Timothy Trophy Award'] });

  function defaultConfig() {
    return {
      clubDay: 3,                                        // 0 = Sunday … 3 = Wednesday … 6 = Saturday; calendar club nights on another day are flagged
      blueJewelWeeks: [6, 12, 19, 27],                   // paper Sparks record says 27; the old Sheet used 31 (see later-fixes list)
      placePoints: { 1: 3, 2: 2, 3: 1, 4: 0 },
      teamOrder: ['Red', 'Yellow', 'Green', 'Blue'],      // the order the team colors are listed in on every screen (Options tab); Season.teamOrder repairs anything that is not the four colors once each
      // Save and update settings (plan item 1): they travel with the shared file. saveStyleDrive: 'inplace' = one Drive file kept up to date, 'dated' = a new dated file each save;
      // saveStyleLocal: 'single' = one file saved over where the browser allows, 'dated' = a new file each time. autoUpdate / autoSave: the update check and auto-save timers.
      saveStyleDrive: 'inplace', saveStyleLocal: 'single', autoUpdate: { on: true, minutes: 10 }, autoSave: { on: false, minutes: 5 },
      drivePinDays: 30,                                 // Google Drive keeps unpinned versions of a file for 30 days: with one file updated in place, the app keeps one version forever every this many days (0 = never)
      sparksBooks: 'sequence',                           // how Sparks use their books: 'sequence' = each child works through HG, WR, SS in turn at their own pace (Awana's standard); 'together' = all Sparks use one book this year (the All Together method)
      yearBook: { Cubbies: '', Sparks: '', 'T&T': '' },   // this year's book for the groups that all use one book together (a key of books, e.g. AO): Cubbies and T&T always, Sparks only when sparksBooks is 'together'. Offered in the handbook box of a child who has none; a new season clears it
      // Awana store points (store.js): each child's year-end points = weighted earnings, kept between min and max; method: direct | top | range; programs = who takes part (Puggles and Cubbies do not at our club)
      store: { min: 15, max: 200, method: 'direct', programs: ['Sparks', 'T&T'], weights: { attendance: 1, handbook: 1, participation: 1, extra: 1, place: 1, spirit: 1, awards: 1, sections: 0 } },
      driveDirs: { club: null, slides: null },      // Google Drive folders shared by everyone using the file: the club files folder (where the picker opens and data files go) and where slides go ({ id, name, parent }). An older file's open / data folders are folded into club on open.
      todoIgnored: [],                                   // To do items accepted as they are (kept so they stay hidden next week)
      teamsOk: { repeats: [], uneven: [] },              // color team warnings accepted for good: children allowed a repeated color, quarters allowed uneven teams
      awardLists: awardLists(),
      exclude: { Sparks: ['Flight 3:16'] },
      // group = whose handbook it is (Sparks books get a tab on the Progress screen); codes are matched on their first two letters, so AoG is AO.
      books: { HG: { name: 'Hangglider', emblem: 'Green', group: 'Sparks' }, WR: { name: 'Wingrunner', emblem: 'Blue', group: 'Sparks' }, SS: { name: 'SkyStormer', emblem: 'Red', group: 'Sparks' },
        HC: { name: 'HoneyComb', emblem: 'Red', group: 'Cubbies' }, AS: { name: 'Appleseed', emblem: 'Green', group: 'Cubbies' },
        AoG: { name: 'Agents of Grace', emblem: '', group: 'T&T' }, DoG: { name: 'Discovery of Grace', emblem: '', group: 'T&T' }, GiA: { name: 'Grace in Action', emblem: '', group: 'T&T' }, EoG: { name: 'Evidence of Grace', emblem: '', group: 'T&T' } },
      completion: completionAwards(),
      // Awards announced when earned but presented at the end-of-year ceremony: they leave the weekly hand-out list and show on the ceremony list instead.
      endOfYear: { Puggles: ['Participation Certificate'], Cubbies: ['AppleSeed Book Award Medallion', 'HoneyComb Book Award Medallion', 'Cubbies Recognition Certificate'], Sparks: ['1st Book Award Medallion', '2nd Book Award Medallion', 'Sparky Award Sculpture', 'Recognition Certificate'], 'T&T': ['Alpha Award Medallion', 'Excellence Award Medallion', 'Challenge Book Award Medallion', 'Timothy Trophy Award', 'Certificate of Award'] },
      progress: { Cubbies: cubbiesTemplate('unit'), Sparks: sparksTemplate(), 'T&T': tntTemplate() },
    };
  }

  // The book a typed handbook code names: the code itself in any capitals (AOG = AoG), else a code of 2 or 3 letters that starts like only one book (AO or AOG for AoG, the way older files
  // wrote it). Returns the book's key in the list, or '' when no book matches.
  function bookKeyOf(books, code) {
    const t = String(code == null ? '' : code).trim(), list = Object.keys(books || {});
    if (!/^[A-Za-z]{2,3}$/.test(t)) return '';
    const exact = list.find(k => k.toLowerCase() === t.toLowerCase()); if (exact) return exact;
    const like = list.filter(k => k.slice(0, 2).toLowerCase() === t.slice(0, 2).toLowerCase());
    return like.length === 1 ? like[0] : '';
  }
  const api = { defaultConfig, sparksTemplate, tntTemplate, cubbiesTemplate, bookKeyOf };
  if (typeof module !== 'undefined') module.exports = api; else root.Catalog = api;
})(this);
