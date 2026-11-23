(this.AwanaVersions = this.AwanaVersions || {})['app-calendar-maker.js'] = '1.2.0';
// Calendar maker owns a temporary form and preview. The live calendar changes only on Apply.
(function () {
  const App = window.App, C = window.Calendar, S = window.Season, Safety = window.CalendarSafety;
  const $ = id => document.getElementById(id), esc = App.esc;
  const panel = $('calMaker'), opener = $('btnCalMake');
  let file, preview, themeSource;

  function close() {
    file = preview = themeSource = undefined;
    panel.hidden = true;
    panel.innerHTML = '';
    opener.setAttribute('aria-expanded', 'false');
  }
  function breakRow(b) {
    b = b || {};
    return '<div class="bar" data-cal-break><label>Break name <input data-name value="' + esc(b.name || '') + '"></label>' +
      '<label>From <input type="date" data-from value="' + esc(b.from || '') + '"></label>' +
      '<label>Through <input type="date" data-to value="' + esc(b.to || '') + '"></label>' +
      '<button type="button" data-remove>Remove break</button></div>';
  }
  function defaultDates(day) {
    const nights = C.sort(C.nights(App.calendar).filter(r => S.isRealDate(r.Date)));
    const cutoff = App.season.config.carriedThrough;
    const current = S.isRealDate(cutoff) ? nights.filter(r => r.Date > cutoff) : nights;
    const dates = current.length ? current.map(row => row.Date) : C.shiftWeeks(nights.map(row => ({ Date: row.Date })), 52).map(row => row.Date);
    if (dates.length && (!S.isRealDate(cutoff) || dates[0] > cutoff)) return [dates[0], dates.at(-1)];
    const next = new Date(App.today() + 'T12:00:00Z');
    next.setUTCDate(next.getUTCDate() + (day - next.getUTCDay() + 7) % 7);
    return [next.toISOString().slice(0, 10), ''];
  }
  function open() {
    if (!App.season) { App.flash('Open or start a data file first.', 'warn'); return; }
    file = App.season;
    const cfg = file.config, day = Number.isInteger(cfg.clubDay) ? cfg.clubDay : 3;
    const [first, last] = defaultDates(day);
    const useSaved = Array.isArray(cfg.breaks) && (!cfg.breaks.length || cfg.breaks.some(b => b && b.from <= last && b.to >= first));
    const breaks = useSaved ? cfg.breaks : C.recommendBreaks(first, last);
    themeSource = Array.isArray(cfg.lastYearCalendar) ? C.archive(cfg.lastYearCalendar) :
      S.isRealDate(cfg.carriedThrough) ? C.archive(App.calendar.filter(row => row.Date <= cfg.carriedThrough)) : [];
    panel.innerHTML = '<h3 id="calMakerTitle">Make calendar</h3><form id="calMakerForm">' +
      '<div class="bar"><label>Club meets on <select name="weekday">' + C.DAYS.map((name, i) =>
        '<option value="' + i + '"' + (day === i ? ' selected' : '') + '>' + esc(name) + '</option>').join('') + '</select></label>' +
      '<label>First club night <input name="first" type="date" value="' + esc(first) + '" required></label>' +
      '<label>Last club night <input name="last" type="date" value="' + esc(last) + '" required></label></div>' +
      '<fieldset><legend>Planned breaks</legend><div id="calMakerBreaks">' + breaks.map(breakRow).join('') + '</div>' +
      '<div class="bar"><button type="button" data-add>Add break</button><button type="button" data-recommend>Suggest breaks</button>' +
      '<label><input name="easter" type="checkbox"' + (cfg.easterFlag === false ? '' : ' checked') + '> Flag Easter week</label></div></fieldset>' +
      '<fieldset><legend>Printed calendar and earlier themes</legend><div class="bar"><label>Optional subtitle <input name="tagline" value="' + esc(cfg.clubTagline || '') + '"></label></div>' +
      '<div class="bar"><label>Copy earlier themes <select name="themes"><option value="none">None</option><option value="order">By order of club nights</option><option value="month">By week of the month</option></select></label>' +
      '<label><input name="events" type="checkbox"> Include earlier events</label></div>' +
      '<div class="bar"><label>Use themes from another season file <input name="themeFile" type="file" accept=".json,application/json"></label>' +
      '<span id="calThemeSource" class="status">' + themeSource.length + ' earlier calendar rows available</span></div></fieldset>' +
      '<div class="bar"><button type="submit">Preview calendar</button><button type="button" data-close>Cancel</button></div>' +
      '<div id="calMakerNotice" role="status"></div></form><div id="calMakerPreview" hidden></div>';
    panel.hidden = false;
    opener.setAttribute('aria-expanded', 'true');
    $('calMakerForm').elements.first.focus();
  }
  opener.addEventListener('click', () => { if (panel.hidden) open(); else close(); });

  function inputs() {
    const f = $('calMakerForm').elements, day = Number(f.weekday.value), first = f.first.value, last = f.last.value;
    if (C.weekday(first) !== day || C.weekday(last) !== day) throw new Error('Choose first and last dates that fall on ' + C.DAYS[day] + '.');
    return { day, first, last, tagline: f.tagline.value.trim(), themes: f.themes.value, events: f.events.checked, easterFlag: f.easter.checked,
      breaks: [...panel.querySelectorAll('[data-cal-break]')].map(row => ({
        name: row.querySelector('[data-name]').value.trim(), from: row.querySelector('[data-from]').value, to: row.querySelector('[data-to]').value
      })) };
  }
  function previewList(title, items, display) {
    return items.length ? '<details><summary>' + esc(title) + ' (' + items.length + ')</summary><ul>' +
      items.map(item => '<li>' + esc(display(item)) + '</li>').join('') + '</ul></details>' : '';
  }
  const reasons = row => row.date + ' · ' + Object.keys(row.reasons).join(', ');
  function makeProposal(input) {
    const result = Safety.propose(file, App.calendar, input, App.today());
    const protectedDates = new Set(result.kept.filter(item => !item.reasons['existing calendar row']).map(item => item.date));
    const { rows, filled, events } = C.copyThemes(result.rows, themeSource, input.themes, input.events, input.first, input.last, protectedDates);
    return Object.assign(result, { rows, themeDates: filled, eventDates: events, lessonChanges: C.lessonChanges(App.calendar, rows, file.config) });
  }
  const lessonChange = ({ date, group, before, after }) => {
    const label = item => !item?.text ? 'No lesson' : item.text + (item.kind === 'missed' ? ' (skipped)' : '');
    return date + ' · ' + group + ' · ' + label(before) + ' → ' + label(after);
  };
  function showPreview(input) {
    const result = makeProposal(input);
    preview = { input, result };
    const box = $('calMakerPreview'), nights = [...new Set(C.nights(result.rows).map(row => row.Date))].sort();
    const quarterOptions = C.QUARTERS.slice(1).map(q => '<label>' + q + ' starts <select data-start="' + q + '">' +
      '<option value="">No start</option>' + nights.slice(1).map(d => '<option value="' + esc(d) + '"' +
        (result.starts[q] === d ? ' selected' : '') + '>' + esc(d) + '</option>').join('') + '</select></label>').join('');
    box.innerHTML = '<h4>Calendar preview</h4><div class="bar">' + quarterOptions + '</div><p>' +
      C.QUARTERS.map(q => q + ' ' + C.nights(result.rows, q).length).join(' · ') + ' club nights</p>' +
      (result.archived.length ? '<p>' + result.archived.length + ' dates from the closed season leave the active calendar.</p>' : '') +
      previewList('Dates to add', result.added, d => d) + previewList('Existing dates kept', result.kept, reasons) +
      previewList('Weekly lessons affected', result.lessonChanges, lessonChange) +
      previewList('Earlier themes to copy', result.themeDates, d => d) + previewList('Earlier events to copy. Verify dates', result.eventDates, d => d) +
      previewList('Dates to review in the existing file', result.existing, r => r.date + ' · ' + r.reason) +
      previewList('Changes that would affect recorded activity or locked quarters', result.blocks, reasons) +
      '<details><summary>View proposed dates</summary><div class="scroll"><table class="roster"><thead><tr><th>Date</th><th>Quarter</th><th>Schedule</th></tr></thead><tbody>' +
      result.rows.map(r => '<tr><td>' + esc(r.Date) + '</td><td>' + esc(r.Quarter || '') + '</td><td>' +
        esc([r.Type === 'Event' ? 'Event' : C.isNight(r) ? 'Club night' : 'No club', r.Holiday, r.Theme].filter(Boolean).join(' · ')) +
        '</td></tr>').join('') + '</tbody></table></div></details>' +
      '<p><button type="button" class="primary" data-apply' + (result.blocks.length ? ' disabled' : '') + '>Apply calendar</button></p>';
    box.hidden = false;
  }
  function showError(err) { $('calMakerNotice').textContent = err.message; }

  panel.addEventListener('submit', e => {
    e.preventDefault();
    if (file !== App.season) { close(); return; }
    $('calMakerNotice').textContent = '';
    $('calMakerPreview').hidden = true;
    try { showPreview(inputs()); } catch (err) { showError(err); }
  });
  panel.addEventListener('input', e => {
    if (!e.target.closest('#calMakerForm')) return;
    preview = undefined;
    $('calMakerPreview').hidden = true;
  });
  panel.addEventListener('change', async e => {
    if (e.target.name === 'themeFile') {
      const picked = e.target.files[0], current = file, box = e.target;
      if (picked) try {
        const prior = S.fromJson(await picked.text());
        if (current !== file || !box.isConnected || box.files[0] !== picked) return;
        themeSource = C.archive(prior.calendar || []);
        preview = undefined;
        $('calMakerPreview').hidden = true;
        $('calThemeSource').textContent = themeSource.length + ' earlier calendar rows available';
        $('calMakerNotice').textContent = '';
      } catch (err) { if (current === file && box.isConnected) showError(err); }
      return;
    }
    if (!e.target.hasAttribute('data-start') || !preview) return;
    const starts = Object.fromEntries([...panel.querySelectorAll('[data-start]')].map(t => [t.dataset.start, t.value]));
    $('calMakerNotice').textContent = '';
    try { showPreview(Object.assign({}, preview.input, { starts })); }
    catch (err) {
      e.target.value = preview.result.starts[e.target.dataset.start] || '';
      showError(err);
    }
  });
  panel.addEventListener('click', e => {
    const button = e.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-close')) { close(); opener.focus(); return; }
    if (button.hasAttribute('data-apply')) {
      const saved = preview, opened = file;
      if (!saved) return;
      App.commitScope(() => {
        if (App.season !== opened || file !== opened || preview !== saved) return;
        try {
          const fresh = makeProposal(saved.input);
          if (JSON.stringify(fresh) !== JSON.stringify(saved.result)) {
            showPreview(saved.input);
            $('calMakerNotice').textContent = 'The calendar or club records changed. Review the new preview before applying.';
            return;
          }
          if (fresh.blocks.length) return;
          const { day, breaks, easterFlag, tagline } = saved.input;
          const settings = { clubDay: day, breaks, easterFlag };
          if (tagline || opened.config.clubTagline !== undefined) settings.clubTagline = tagline;
          if (!opened.config.lastYearCalendar && fresh.archived.length) settings.lastYearCalendar = C.archive(fresh.archived);
          close();
          if (App.applyCalendarProposal(fresh.rows, settings)) App.done('Calendar applied. Use Undo to restore the previous calendar.');
          else App.flash('The calendar already matches this preview.', 'info');
          opener.focus();
        } catch (err) { if (!panel.hidden) showError(err); }
      });
      return;
    }
    if (button.hasAttribute('data-add')) $('calMakerBreaks').insertAdjacentHTML('beforeend', breakRow());
    else if (button.hasAttribute('data-remove')) button.closest('[data-cal-break]').remove();
    else if (button.hasAttribute('data-recommend')) {
      const f = $('calMakerForm').elements;
      $('calMakerBreaks').innerHTML = C.recommendBreaks(f.first.value, f.last.value).map(breakRow).join('');
    } else return;
    preview = undefined;
    $('calMakerPreview').hidden = true;
  });
  App.onRefresh.push(() => { if (file && file !== App.season) close(); });
})();
